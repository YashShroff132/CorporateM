/**
 * Notification_Service — send-on-transition messaging with bounded retries.
 *
 * Scope (task 24.1; Requirements 17.5, 17.8, 18.1–18.5):
 * - When an order is confirmed as PAID, send an order confirmation email to the
 *   order's captured email address within 60 seconds (Req 18.1).
 * - When an order transitions to SHIPPED, send a shipment notification carrying
 *   the recorded tracking identifier and tracking URL by email within 60
 *   seconds (Req 18.2, 17.5).
 * - WHERE the `whatsapp` feature flag is enabled, additionally send the
 *   confirmation and shipment notifications by WhatsApp to the order's captured
 *   10-digit Indian mobile number (Req 18.3, 17.8). The flag defaults to
 *   disabled (Config_Service), so WhatsApp is dormant unless explicitly enabled.
 * - IF a delivery attempt fails, retry up to the Owner_Input maximum retry count
 *   (Req 18.4).
 * - IF delivery still fails after the maximum retries, record the terminal
 *   failure for monitoring WITHOUT altering the order status (Req 18.5).
 *
 * Design tenets honored here (see design.md "Layering and separation of
 * concerns"): all external effects (email/WhatsApp transport, failure sink) are
 * isolated behind injectable interfaces so the retry logic is a pure,
 * deterministic core that can be unit- and property-tested with no network.
 * This module never mutates order state; it only reads the fields it needs and
 * reports terminal failures to the injected {@link FailureSink}.
 */

import { type Config_Service } from './config';

// ---------------------------------------------------------------------------
// Message model
// ---------------------------------------------------------------------------

/** The kind of transition-driven notification being sent. */
export type NotificationKind = 'ORDER_CONFIRMATION' | 'SHIPMENT';

/** The transport channel a message is delivered over. */
export type NotificationChannel = 'EMAIL' | 'WHATSAPP';

/**
 * The minimal projection of an order the Notification_Service needs. Kept
 * decoupled from the Order_Service `Order` type so notifications can be
 * dispatched from a webhook, a job, or a test without constructing a full order.
 */
export interface NotifiableOrder {
  readonly id: string;
  /** Captured email address the confirmation/shipment email is sent to (Req 18.1). */
  readonly email: string | null | undefined;
  /** Captured 10-digit Indian mobile for WhatsApp delivery (Req 18.3). */
  readonly phone: string | null | undefined;
  /** Tracking identifier, present once the order has shipped (Req 18.2). */
  readonly trackingId?: string | null;
  /** Tracking URL, present once the order has shipped (Req 18.2). */
  readonly trackingUrl?: string | null;
}

/** A fully-resolved message ready to hand to a channel sender. */
export interface NotificationMessage {
  readonly kind: NotificationKind;
  readonly channel: NotificationChannel;
  readonly orderId: string;
  /** Destination address: an email address or a phone number. */
  readonly to: string;
  /** For shipment messages, the tracking info to relay (Req 18.2). */
  readonly trackingId?: string;
  readonly trackingUrl?: string;
}

// ---------------------------------------------------------------------------
// Injectable transport + monitoring seams
// ---------------------------------------------------------------------------

/**
 * A channel transport. Implementations perform the real network delivery; the
 * retry core only observes success/failure, so tests can supply deterministic
 * fakes (e.g. "fail the first N attempts"). A thrown error is treated the same
 * as a returned failure.
 */
export interface NotificationSender {
  send(message: NotificationMessage): Promise<SendResult>;
}

/** The outcome of a single delivery attempt. */
export interface SendResult {
  readonly ok: boolean;
  /** Optional provider detail, surfaced in the terminal-failure record. */
  readonly detail?: string;
}

/** A terminal delivery failure recorded for monitoring (Req 18.5). */
export interface TerminalFailure {
  readonly kind: NotificationKind;
  readonly channel: NotificationChannel;
  readonly orderId: string;
  readonly to: string;
  /** Total number of attempts made (initial attempt + retries). */
  readonly attempts: number;
  /** Provider detail from the final failed attempt, if any. */
  readonly detail?: string;
}

/**
 * Sink that records terminal notification failures for monitoring (Req 18.5).
 * Recording is best-effort and MUST NOT alter order status; the default
 * implementation logs to the console.
 */
export interface FailureSink {
  record(failure: TerminalFailure): void;
}

/** The set of channel senders the service delivers through. */
export interface NotificationSenders {
  readonly email: NotificationSender;
  /** Optional; only invoked when the `whatsapp` flag is enabled (Req 18.3). */
  readonly whatsapp?: NotificationSender;
}

// ---------------------------------------------------------------------------
// Delivery result reporting
// ---------------------------------------------------------------------------

/** The result of attempting to deliver a single message across its retries. */
export interface DeliveryOutcome {
  readonly channel: NotificationChannel;
  readonly kind: NotificationKind;
  /** True when a delivery attempt eventually succeeded. */
  readonly delivered: boolean;
  /** Number of attempts made (initial + retries), always >= 1. */
  readonly attempts: number;
}

/** The aggregate result of dispatching all messages for a transition. */
export interface DispatchResult {
  readonly orderId: string;
  readonly outcomes: readonly DeliveryOutcome[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface Notification_Service {
  /**
   * Send the order confirmation on the PAID transition (Req 18.1, 18.3).
   * Resolves once all channel deliveries have been attempted (with retries);
   * terminal failures are recorded and never throw.
   */
  sendOrderConfirmation(order: NotifiableOrder): Promise<DispatchResult>;
  /**
   * Send the shipment notification on the SHIPPED transition (Req 18.2, 17.5,
   * 17.8, 18.3), relaying the recorded tracking id and URL.
   */
  sendShipmentNotification(order: NotifiableOrder): Promise<DispatchResult>;
}

/** Dependencies injected into the Notification_Service. */
export interface NotificationDeps {
  readonly config: Pick<Config_Service, 'isEnabled' | 'notificationMaxRetries'>;
  readonly senders: NotificationSenders;
  /** Defaults to a console-logging sink when omitted. */
  readonly failureSink?: FailureSink;
}

/** Default failure sink: logs terminal failures for monitoring (Req 18.5). */
const consoleFailureSink: FailureSink = {
  record(failure: TerminalFailure): void {
    // eslint-disable-next-line no-console
    console.error('[Notification_Service] terminal delivery failure', failure);
  },
};

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Attempt to deliver a single message, retrying up to `maxRetries` times after
 * the initial attempt (Req 18.4). A sender that throws is treated as a failed
 * attempt. On terminal failure the outcome records the total attempt count and
 * the failure is reported to the sink (Req 18.5); this never alters order state.
 */
async function deliverWithRetry(
  sender: NotificationSender,
  message: NotificationMessage,
  maxRetries: number,
  failureSink: FailureSink,
): Promise<DeliveryOutcome> {
  // Total attempts = 1 initial + up to maxRetries retries.
  const maxAttempts = Math.max(0, maxRetries) + 1;
  let attempts = 0;
  let lastDetail: string | undefined;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const result = await sender.send(message);
      if (result.ok) {
        return {
          channel: message.channel,
          kind: message.kind,
          delivered: true,
          attempts,
        };
      }
      lastDetail = result.detail;
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
    }
  }

  // Terminal failure: record for monitoring without touching order status.
  failureSink.record({
    kind: message.kind,
    channel: message.channel,
    orderId: message.orderId,
    to: message.to,
    attempts,
    detail: lastDetail,
  });

  return {
    channel: message.channel,
    kind: message.kind,
    delivered: false,
    attempts,
  };
}

/**
 * Create a Notification_Service. External transports and the monitoring sink
 * are injected so the send/retry logic is fully testable without network.
 */
export function createNotificationService(
  deps: NotificationDeps,
): Notification_Service {
  const { config, senders } = deps;
  const failureSink = deps.failureSink ?? consoleFailureSink;

  async function dispatch(
    order: NotifiableOrder,
    kind: NotificationKind,
  ): Promise<DispatchResult> {
    const maxRetries = config.notificationMaxRetries();
    const whatsappEnabled = config.isEnabled('whatsapp');
    const outcomes: DeliveryOutcome[] = [];

    // Build the shipment-specific tracking payload once (Req 18.2).
    const trackingId =
      kind === 'SHIPMENT' && isNonEmpty(order.trackingId)
        ? order.trackingId
        : undefined;
    const trackingUrl =
      kind === 'SHIPMENT' && isNonEmpty(order.trackingUrl)
        ? order.trackingUrl
        : undefined;

    // Email channel is always attempted when an email address is present
    // (Req 18.1, 18.2, 17.5).
    if (isNonEmpty(order.email)) {
      const message: NotificationMessage = {
        kind,
        channel: 'EMAIL',
        orderId: order.id,
        to: order.email,
        trackingId,
        trackingUrl,
      };
      outcomes.push(
        await deliverWithRetry(senders.email, message, maxRetries, failureSink),
      );
    }

    // WhatsApp channel only when the feature flag is enabled and a sender and
    // destination number are available (Req 18.3, 17.8).
    if (whatsappEnabled && senders.whatsapp !== undefined && isNonEmpty(order.phone)) {
      const message: NotificationMessage = {
        kind,
        channel: 'WHATSAPP',
        orderId: order.id,
        to: order.phone,
        trackingId,
        trackingUrl,
      };
      outcomes.push(
        await deliverWithRetry(
          senders.whatsapp,
          message,
          maxRetries,
          failureSink,
        ),
      );
    }

    return { orderId: order.id, outcomes };
  }

  return {
    sendOrderConfirmation(order: NotifiableOrder): Promise<DispatchResult> {
      return dispatch(order, 'ORDER_CONFIRMATION');
    },
    sendShipmentNotification(order: NotifiableOrder): Promise<DispatchResult> {
      return dispatch(order, 'SHIPMENT');
    },
  };
}
