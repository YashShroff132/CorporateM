/**
 * AI_Engine — AI Design Auto-Generation Engine (task 17.1 scope).
 *
 * This module owns generation-parameter validation and the Claude API call that
 * produces candidate slogans. It implements the following slice of Requirement 12:
 *
 * - Accept generation parameters: tier ∈ {SAFE, DIRECT, VERY_DIRECT}, collection,
 *   count 1..20, tone, and garment or color (Req 12.1).
 * - Reject requests whose count is outside 1..20, whose tier is unknown, or whose
 *   collection does not exist, returning an error naming the invalid parameter
 *   (Req 12.2).
 * - On a valid request, ask Claude for candidate slogans using a system prompt
 *   that encodes the brand voice, tier definitions, moderation policy, and
 *   slogan-bank few-shot examples (Req 12.3).
 * - Require the response to be structured JSON validated against a Zod schema
 *   (Req 12.4); on schema-validation failure, retry EXACTLY once with a repair
 *   instruction, and if it still fails, fail the run and persist nothing (Req 12.5).
 * - Fail the run (persisting nothing) if Claude does not respond within 60 seconds
 *   or returns an error (Req 12.6).
 * - Read the Claude model identifier from configuration, never hardcoded (Req 12.8).
 *
 * Out of scope for this task (implemented elsewhere):
 * - De-duplication, run token/cost auditing, and per-admin rate limiting (task 17.2,
 *   Req 12.7, 12.9, 12.10).
 * - Moderation of candidates (Moderation_Gate, task 18) and draft/review creation
 *   (task 20).
 *
 * The whole capability sits behind the `aiStudio` feature flag, which defaults to
 * disabled (Req 22.2); {@link AI_Engine.generate} refuses to run when it is off.
 *
 * The Anthropic Claude API is abstracted behind {@link ClaudeClient} so the logic
 * is fully testable without network access or real API keys. Nothing is persisted
 * by this module, so "persist no slogans on failure" is satisfied structurally:
 * candidates are only ever returned to the caller on success.
 */

import { z } from 'zod';
import { type Result, ok, err } from '../lib/result';
import { type Config_Service, config as defaultConfig } from './config';
import { TIERS, type Tier } from './catalog';

// ---------------------------------------------------------------------------
// Parameter bounds (Req 12.1, 12.2)
// ---------------------------------------------------------------------------

export const GEN_COUNT_MIN = 1;
export const GEN_COUNT_MAX = 20;

/** Hard ceiling on how long a generation run may wait on Claude (Req 12.6). */
export const CLAUDE_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Generation parameters (Req 12.1)
// ---------------------------------------------------------------------------

/** Raw, untrusted generation request as received from the admin surface. */
export interface GenParams {
  readonly tier: Tier;
  /** Collection id/slug the slogans are being generated for. */
  readonly collection: string;
  /** Number of candidate slogans to request; must be an integer 1..20. */
  readonly count: number;
  /** Free-form tone hint (e.g. "deadpan", "sarcastic"). */
  readonly tone: string;
  /** Garment type or color descriptor the design targets. */
  readonly garmentOrColor: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Discriminated error describing why a generation request/run was rejected. */
export type AIError =
  | { readonly kind: 'INVALID_TIER'; readonly message: string }
  | { readonly kind: 'INVALID_COUNT'; readonly message: string }
  | { readonly kind: 'COLLECTION_NOT_FOUND'; readonly message: string }
  | { readonly kind: 'MISSING_FIELD'; readonly message: string }
  | { readonly kind: 'FEATURE_DISABLED'; readonly message: string }
  | { readonly kind: 'MISSING_CONFIG'; readonly message: string }
  | { readonly kind: 'TIMEOUT'; readonly message: string }
  | { readonly kind: 'API_ERROR'; readonly message: string }
  | { readonly kind: 'SCHEMA_VALIDATION_FAILED'; readonly message: string };

// ---------------------------------------------------------------------------
// Structured response schema (Req 12.4)
// ---------------------------------------------------------------------------

/**
 * Zod schema the Claude response must satisfy (Req 12.4). Claude is instructed to
 * return a JSON object of the shape `{ "slogans": [{ "text": "..." }, ...] }`.
 * Each slogan text must be a non-empty, trimmed string.
 */
export const sloganResponseSchema = z.object({
  slogans: z
    .array(
      z.object({
        text: z
          .string()
          .trim()
          .min(1, 'slogan text must be a non-empty string'),
      }),
    )
    .min(1, 'response must contain at least one slogan'),
});

export type SloganResponse = z.infer<typeof sloganResponseSchema>;

/** A validated candidate slogan produced by the engine. */
export interface Slogan {
  readonly text: string;
  readonly tier: Tier;
  readonly collection: string;
}

// ---------------------------------------------------------------------------
// Injectable Claude client (abstracts the Anthropic API)
// ---------------------------------------------------------------------------

/** A single message in a Claude request (user or assistant turn). */
export interface ClaudeMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** Request payload sent to the Claude client. */
export interface ClaudeRequest {
  /** Model identifier read from configuration (Req 12.8). */
  readonly model: string;
  /** System prompt encoding brand voice, tiers, policy, and few-shot (Req 12.3). */
  readonly system: string;
  /** Conversation turns; includes the repair instruction on retry (Req 12.5). */
  readonly messages: readonly ClaudeMessage[];
  /** Upper bound on output tokens for the completion. */
  readonly maxTokens: number;
}

/** The subset of a Claude completion this module relies on. */
export interface ClaudeResponse {
  /** The model's text output, expected to be a JSON document (Req 12.4). */
  readonly text: string;
}

/**
 * Abstraction over the Anthropic Claude API so the AI_Engine can be exercised
 * without live network access or real API keys. The production implementation
 * performs an authenticated POST to the Anthropic Messages API; tests inject a
 * fake. Implementations should reject (throw) on any non-success response or
 * transport error so the service can fail the run and persist nothing (Req 12.6).
 */
export interface ClaudeClient {
  complete(req: ClaudeRequest): Promise<ClaudeResponse>;
}

// ---------------------------------------------------------------------------
// Few-shot slogan-bank provider (Req 12.3)
// ---------------------------------------------------------------------------

/** A slogan-bank example used as few-shot guidance in the system prompt. */
export interface SloganBankExample {
  readonly text: string;
  readonly tier: Tier;
}

/**
 * Supplies slogan-bank few-shot examples for the system prompt. Injected so the
 * examples can come from seed data / the database without coupling this module
 * to persistence. When omitted, the engine proceeds with no few-shot examples.
 */
export type SloganBankProvider = (tier: Tier) => readonly SloganBankExample[];

/**
 * Resolves whether a collection exists (Req 12.2). Injected so this pure logic
 * module does not depend on the Catalog persistence layer directly.
 */
export type CollectionExists = (collection: string) => boolean;

// ---------------------------------------------------------------------------
// System-prompt construction (Req 12.3)
// ---------------------------------------------------------------------------

/** Human-readable tier definitions encoded into the system prompt (Req 12.3). */
const TIER_DEFINITIONS: Record<Tier, string> = {
  SAFE: 'SAFE ("Safe for Standup") — light, universally shareable corporate humor with no bite.',
  DIRECT:
    'DIRECT ("Reply All") — pointed, clearly opinionated corporate humor that still reads as playful.',
  VERY_DIRECT:
    'VERY_DIRECT ("Notice Period Energy") — bold, spicy, unapologetic corporate protest humor.',
};

/**
 * Build the system prompt encoding brand voice, tier definitions, the moderation
 * policy, and slogan-bank few-shot examples (Req 12.3). Kept pure and exported so
 * it can be unit-tested directly.
 */
const DEFAULT_FEW_SHOTS: Record<Tier, string[]> = {
  SAFE: [
    "Per my last email.",
    "This could have been an email.",
    "Circle back later.",
    "Reply all survivor.",
    "Powered by coffee and bad posture."
  ],
  DIRECT: [
    "work from home",
    "Master of operations. Mostly just operating the coffee machine.",
    "My only KPI is staying awake until 5 PM.",
    "Still operating under the assumption I know what I'm doing."
  ],
  VERY_DIRECT: [
    "Ladki nahi work from home chahiye",
    "Serving notice period energy.",
    "I am the attrition problem.",
    "Currently operating at 110%... illusion.",
    "Burn the org chart."
  ]
};

export function buildSystemPrompt(
  params: GenParams,
  brandName: string,
  fewShot: readonly SloganBankExample[],
): string {
  const brand = brandName.trim().length > 0 ? brandName.trim() : 'Corporate Cult';

  const finalFewShot = fewShot.length > 0
    ? fewShot
    : (DEFAULT_FEW_SHOTS[params.tier] || []).map(text => ({ text, tier: params.tier }));

  const fewShotBlock = finalFewShot.map((e) => `- [${e.tier}] ${e.text}`).join('\n');

  return [
    `You are the slogan copywriter for ${brand}, a Gen-Z streetwear brand that turns`,
    `"corporate suffering" into wearable protest humor for the India market.`,
    '',
    'BRAND VOICE:',
    '- Witty, self-aware, Gen-Z corporate humor; original and on-brand.',
    '- Never generic motivational fluff; every line has a point of view.',
    '',
    'TIER DEFINITIONS:',
    Object.values(TIER_DEFINITIONS)
      .map((d) => `- ${d}`)
      .join('\n'),
    '',
    `TARGET TIER FOR THIS REQUEST: ${params.tier}`,
    `- ${TIER_DEFINITIONS[params.tier]}`,
    '',
    'MODERATION POLICY (candidates violating any rule will be rejected — do not produce them):',
    '- No hate content, slurs, or targeting of a protected class.',
    '- Do not name or defame any real company, brand, or identifiable individual.',
    '- No sexual content, harassment, threats, self-harm, or illegal-activity content.',
    '',
    'SLOGAN-BANK FEW-SHOT EXAMPLES (match this style, do not copy verbatim):',
    fewShotBlock,
    '',
    'OUTPUT FORMAT:',
    '- Respond with ONLY a JSON object, no prose, no markdown fences.',
    '- Shape: {"slogans":[{"text":"..."}]}',
    `- Produce exactly ${params.count} distinct slogan(s).`,
    `- Tone: ${params.tone}. Design target: ${params.garmentOrColor}.`,
  ].join('\n');
}

/** Build the initial user message that requests the candidate slogans. */
function buildUserMessage(params: GenParams): string {
  return [
    `Generate ${params.count} ${params.tier} slogan(s) for the "${params.collection}" collection.`,
    `Tone: ${params.tone}. Design target: ${params.garmentOrColor}.`,
    'Return only the JSON object described in the system prompt.',
  ].join(' ');
}

/**
 * The repair instruction appended on the single retry after a schema-validation
 * failure (Req 12.5).
 */
export function buildRepairInstruction(validationMessage: string): string {
  return [
    'Your previous response did not match the required JSON schema.',
    `Validation error: ${validationMessage}.`,
    'Respond again with ONLY a JSON object of the shape {"slogans":[{"text":"..."}]}',
    'containing non-empty slogan strings, and no other text or markdown.',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Response parsing / validation (Req 12.4)
// ---------------------------------------------------------------------------

/**
 * Parse a Claude text response as JSON and validate it against the schema.
 * Returns a `Result` so the caller can drive the single repair retry (Req 12.5).
 * Tolerates a JSON object embedded in surrounding text by extracting the first
 * balanced `{...}` span before validation.
 */
export function parseAndValidate(
  text: string,
): Result<SloganResponse, AIError> {
  const jsonText = extractJsonObject(text);
  if (jsonText === null) {
    return err({
      kind: 'SCHEMA_VALIDATION_FAILED',
      message: 'response did not contain a JSON object',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (cause) {
    return err({
      kind: 'SCHEMA_VALIDATION_FAILED',
      message:
        cause instanceof Error
          ? `response was not valid JSON: ${cause.message}`
          : 'response was not valid JSON',
    });
  }

  const validated = sloganResponseSchema.safeParse(parsed);
  if (!validated.success) {
    return err({
      kind: 'SCHEMA_VALIDATION_FAILED',
      message: validated.error.issues.map((i) => i.message).join('; '),
    });
  }
  return ok(validated.data);
}

/**
 * Extract the first balanced JSON object substring from arbitrary text. Returns
 * `null` when no balanced object is present. This keeps parsing resilient to a
 * model that wraps JSON in prose or markdown fences.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Timeout helper (Req 12.6)
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout. Resolves to the promise's value on success,
 * or rejects with a distinctive timeout marker after `timeoutMs`.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}

/** Marker error used to distinguish a timeout from a general API error. */
class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude API did not respond within ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface AI_EngineOptions {
  /** Resolves whether a collection exists; required for Req 12.2 collection checks. */
  readonly collectionExists?: CollectionExists;
  /** Supplies slogan-bank few-shot examples for the system prompt (Req 12.3). */
  readonly sloganBank?: SloganBankProvider;
  /** Overridable timeout for the Claude call; defaults to 60s (Req 12.6). */
  readonly timeoutMs?: number;
  /** Max output tokens requested from Claude. */
  readonly maxTokens?: number;
}

export interface AI_Engine {
  /**
   * Validate generation parameters (Req 12.1, 12.2). Returns the parameters
   * unchanged on success, or an `AIError` naming the invalid parameter.
   */
  validateParams(p: GenParams): Result<GenParams, AIError>;
  /**
   * Run a generation: validate params, call Claude with a brand/tier/policy/
   * few-shot system prompt (Req 12.3), and require structured JSON validated
   * against the schema with exactly one repair retry (Req 12.4, 12.5). Fails the
   * run — persisting nothing — on timeout or API error (Req 12.6). Refuses to run
   * when the `aiStudio` feature flag is disabled (Req 22.2).
   */
  generate(p: GenParams): Promise<Result<Slogan[], AIError>>;
}

/**
 * Create an AI_Engine bound to a Claude client and Config_Service. The model id
 * is read lazily from config on each run (Req 12.8); no slogans are persisted by
 * this module, so failed runs inherently leave nothing behind (Req 12.5, 12.6).
 */
export function createAIEngine(
  claude: ClaudeClient,
  cfg: Config_Service = defaultConfig,
  options: AI_EngineOptions = {},
): AI_Engine {
  const collectionExists = options.collectionExists;
  const sloganBank = options.sloganBank ?? (() => []);
  const timeoutMs = options.timeoutMs ?? CLAUDE_TIMEOUT_MS;
  const maxTokens = options.maxTokens ?? 1024;

  function validateParams(p: GenParams): Result<GenParams, AIError> {
    // Tier must be one of the known tiers (Req 12.1, 12.2).
    if (!TIERS.includes(p.tier)) {
      return err({
        kind: 'INVALID_TIER',
        message: `Tier must be one of ${TIERS.join(', ')}, received ${String(p.tier)}`,
      });
    }

    // Count must be an integer within 1..20 (Req 12.1, 12.2).
    if (
      !Number.isInteger(p.count) ||
      p.count < GEN_COUNT_MIN ||
      p.count > GEN_COUNT_MAX
    ) {
      return err({
        kind: 'INVALID_COUNT',
        message: `Count must be an integer ${GEN_COUNT_MIN}..${GEN_COUNT_MAX}, received ${String(p.count)}`,
      });
    }

    // Collection must be supplied and must exist (Req 12.1, 12.2).
    if (p.collection.trim().length === 0) {
      return err({ kind: 'MISSING_FIELD', message: 'Collection is required' });
    }
    if (collectionExists !== undefined && !collectionExists(p.collection)) {
      return err({
        kind: 'COLLECTION_NOT_FOUND',
        message: `Collection "${p.collection}" does not exist`,
      });
    }

    // Tone and garment/color are part of the accepted parameter set (Req 12.1).
    if (p.tone.trim().length === 0) {
      return err({ kind: 'MISSING_FIELD', message: 'Tone is required' });
    }
    if (p.garmentOrColor.trim().length === 0) {
      return err({
        kind: 'MISSING_FIELD',
        message: 'Garment or color is required',
      });
    }

    return ok(p);
  }

  async function callClaude(
    model: string,
    system: string,
    messages: ClaudeMessage[],
  ): Promise<{ rawText: string; result: Result<SloganResponse, AIError> }> {
    let response: ClaudeResponse;
    try {
      response = await withTimeout(
        claude.complete({ model, system, messages, maxTokens }),
        timeoutMs,
      );
    } catch (cause) {
      // Timeout or transport/API error fails the run and persists nothing (Req 12.6).
      if (cause instanceof TimeoutError) {
        return { rawText: '', result: err({ kind: 'TIMEOUT', message: cause.message }) };
      }
      return {
        rawText: '',
        result: err({
          kind: 'API_ERROR',
          message:
            cause instanceof Error
              ? `Claude API error: ${cause.message}`
              : 'Claude API error',
        }),
      };
    }
    return {
      rawText: response.text,
      result: parseAndValidate(response.text),
    };
  }

  async function generate(
    p: GenParams,
  ): Promise<Result<Slogan[], AIError>> {
    // The AI Studio capability is gated behind a feature flag defaulting to
    // disabled (Req 22.2); refuse to run when it is off.
    if (!cfg.isEnabled('aiStudio')) {
      return err({
        kind: 'FEATURE_DISABLED',
        message: 'AI Studio is not enabled',
      });
    }

    const validation = validateParams(p);
    if (!validation.ok) return validation;

    // Model id comes from configuration, never hardcoded (Req 12.8).
    const model = cfg.claudeModelId();
    if (model.trim().length === 0) {
      return err({
        kind: 'MISSING_CONFIG',
        message: 'Claude model id is not configured',
      });
    }

    const system = buildSystemPrompt(p, cfg.brand().name, sloganBank(p.tier));
    const messages: ClaudeMessage[] = [
      { role: 'user', content: buildUserMessage(p) },
    ];

    // First attempt.
    const first = await callClaude(model, system, messages);
    if (first.result.ok) {
      return ok(toSlogans(first.result.value, p));
    }
    // Timeout / API errors are terminal — do not retry (Req 12.6).
    if (first.result.error.kind !== 'SCHEMA_VALIDATION_FAILED') {
      return err(first.result.error);
    }

    // Exactly one repair retry on schema-validation failure (Req 12.5).
    const repairMessages: ClaudeMessage[] = [
      ...messages,
      { role: 'assistant', content: first.rawText },
      { role: 'user', content: buildRepairInstruction(first.result.error.message) },
    ];
    const second = await callClaude(model, system, repairMessages);
    if (second.result.ok) {
      return ok(toSlogans(second.result.value, p));
    }
    // Second failure ends the run, persisting nothing (Req 12.5).
    return err(second.result.error);
  }

  return { validateParams, generate };
}

/** Map a validated response into candidate {@link Slogan} records. */
function toSlogans(response: SloganResponse, p: GenParams): Slogan[] {
  return response.slogans.map((s) => ({
    text: s.text,
    tier: p.tier,
    collection: p.collection,
  }));
}

/**
 * Production {@link ClaudeClient} performing an authenticated POST to the
 * Anthropic Messages API or the Gemini Developer API (Google AI Studio).
 * The API key is read from the environment and used only for the outbound
 * request — never persisted. Non-2xx responses throw so the service fails the
 * run and persists nothing (Req 12.6).
 */
export function createClaudeClient(
  env: Record<string, string | undefined> = process.env,
): ClaudeClient {
  const MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
  const API_VERSION = '2023-06-01';
  return {
    async complete(req: ClaudeRequest): Promise<ClaudeResponse> {
      const geminiKey = env.GEMINI_API_KEY?.trim();
      const claudeKey = env.ANTHROPIC_API_KEY?.trim();

      // If Gemini Key is present and Claude Key is NOT present (or explicitly using gemini in model id)
      if (
        geminiKey !== undefined &&
        geminiKey.length > 0 &&
        (claudeKey === undefined ||
          claudeKey.length === 0 ||
          req.model.toLowerCase().includes('gemini'))
      ) {
        let geminiModel = req.model.toLowerCase().includes('gemini')
          ? req.model
          : 'gemini-2.5-flash';
        if (geminiModel.includes('gemini-1.5-flash')) {
          geminiModel = 'gemini-2.5-flash';
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

        // Map roles: Claude has 'user' | 'assistant'. Gemini requires 'user' | 'model'.
        const contents = req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

        const body = {
          contents,
          systemInstruction: {
            parts: [{ text: req.system }],
          },
          generationConfig: {
            maxOutputTokens: req.maxTokens,
            responseMimeType: 'application/json',
          },
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_NONE',
            },
          ],
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(
            `Gemini API responded with status ${response.status}: ${errText}`,
          );
        }

        const data = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return { text };
      }

      // Fallback/Default to Claude Client
      const apiKey = claudeKey;
      if (apiKey === undefined || apiKey.length === 0) {
        throw new Error(
          'No API key configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)',
        );
      }
      const response = await fetch(MESSAGES_ENDPOINT, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: req.model,
          system: req.system,
          max_tokens: req.maxTokens,
          messages: req.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Anthropic Messages API responded with status ${response.status}`,
        );
      }
      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('');
      return { text };
    },
  };
}

// ---------------------------------------------------------------------------
// De-duplication (Req 12.7) — pure helpers
// ---------------------------------------------------------------------------

/**
 * Normalize slogan text for case-insensitive, whitespace-collapsed equality
 * (Req 12.7). Trims, lowercases, and collapses internal runs of whitespace to a
 * single space so that "  Reply   ALL " and "reply all" compare equal.
 */
export function normalizeSloganText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * True when two slogans are textual duplicates under the normalization rule
 * (Req 12.7).
 */
export function isTextDuplicate(a: string, b: string): boolean {
  return normalizeSloganText(a) === normalizeSloganText(b);
}

/**
 * Cosine similarity between two equal-length embedding vectors, in `[-1, 1]`.
 * Returns 0 when either vector is empty, has zero magnitude, or the lengths
 * differ — a defensive default so a malformed embedding never falsely flags a
 * duplicate. Kept pure: callers precompute embeddings and pass them in so no
 * network/model access leaks into this logic (Req 12.7).
 */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** The embedding cosine-similarity threshold at/above which two slogans are duplicates (Req 12.7). */
export const DEDUPE_COSINE_THRESHOLD = 0.9;

/** A stored slogan with an optional precomputed embedding for similarity checks. */
export interface ExistingSlogan {
  readonly text: string;
  /** Optional precomputed embedding vector; when present enables cosine dedupe. */
  readonly embedding?: readonly number[];
}

/** A candidate slogan with an optional precomputed embedding. */
export interface DedupeCandidate {
  readonly text: string;
  readonly embedding?: readonly number[];
}

/**
 * A hook that provides a precomputed embedding for a slogan string, or
 * `undefined` when none is available. Injected so embeddings can be computed by
 * an out-of-band step (or omitted entirely) without coupling this pure logic to
 * an embedding model (Req 12.7).
 */
export type EmbeddingProvider = (text: string) => readonly number[] | undefined;

/**
 * Decide whether `candidate` duplicates any slogan in `existing` (Req 12.7).
 *
 * A candidate is a duplicate when EITHER:
 * - its normalized text equals an existing slogan's normalized text, OR
 * - a precomputed embedding is available for both and their cosine similarity
 *   is at or above {@link DEDUPE_COSINE_THRESHOLD} (default 0.9).
 *
 * Embeddings are supplied on the candidate/existing records or resolved via the
 * optional {@link EmbeddingProvider}; when no embedding is available for a pair
 * the comparison falls back to text equality alone. Pure and total.
 */
export function isDuplicateSlogan(
  candidate: DedupeCandidate,
  existing: readonly ExistingSlogan[],
  embed?: EmbeddingProvider,
  cosineThreshold: number = DEDUPE_COSINE_THRESHOLD,
): boolean {
  const candidateEmbedding = candidate.embedding ?? embed?.(candidate.text);
  for (const other of existing) {
    if (isTextDuplicate(candidate.text, other.text)) return true;
    const otherEmbedding = other.embedding ?? embed?.(other.text);
    if (candidateEmbedding !== undefined && otherEmbedding !== undefined) {
      if (cosineSimilarity(candidateEmbedding, otherEmbedding) >= cosineThreshold) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Filter `candidates` down to those that are neither duplicates of an existing
 * slogan nor of an earlier candidate in the same batch (Req 12.7). Order is
 * preserved and the accepted set is internally de-duplicated too.
 */
export function dedupeCandidates(
  candidates: readonly DedupeCandidate[],
  existing: readonly ExistingSlogan[],
  embed?: EmbeddingProvider,
  cosineThreshold: number = DEDUPE_COSINE_THRESHOLD,
): DedupeCandidate[] {
  const accepted: DedupeCandidate[] = [];
  for (const candidate of candidates) {
    const against: ExistingSlogan[] = [...existing, ...accepted];
    if (!isDuplicateSlogan(candidate, against, embed, cosineThreshold)) {
      accepted.push(candidate);
    }
  }
  return accepted;
}

// ---------------------------------------------------------------------------
// Run auditing (Req 12.9) — token usage + cost record shape
// ---------------------------------------------------------------------------

/** Token usage reported for a completed generation run. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * The audit record shape for a completed generation run (Req 12.9). Cost is an
 * integer paise value so it shares the money representation used across the
 * platform (no floating-point money). `estimateRunCostPaise` derives it from
 * per-million-token rates.
 */
export interface GenerationRunAudit {
  readonly tier: Tier;
  readonly collection: string;
  readonly model: string;
  readonly requestedCount: number;
  readonly producedCount: number;
  readonly usage: TokenUsage;
  /** Total run cost in integer paise (Req 12.9, money is integer paise). */
  readonly costPaise: number;
}

/** Per-million-token pricing (in paise) used to estimate a run's cost. */
export interface TokenPricingPaise {
  readonly inputPerMillionPaise: number;
  readonly outputPerMillionPaise: number;
}

/**
 * Estimate a run's cost in integer paise from token usage and per-million-token
 * pricing (Req 12.9). Rounds to the nearest paise so the stored cost is always
 * an integer. Pure.
 */
export function estimateRunCostPaise(
  usage: TokenUsage,
  pricing: TokenPricingPaise,
): number {
  const input = (usage.inputTokens / 1_000_000) * pricing.inputPerMillionPaise;
  const output = (usage.outputTokens / 1_000_000) * pricing.outputPerMillionPaise;
  return Math.max(0, Math.round(input + output));
}
