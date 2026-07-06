/**
 * Notification data-access + Notification_Service wiring (task 24; Requirements
 * 18.1–18.5, 17.5, 17.8).
 *
 * Bridges the pure {@link createNotificationService} retry core to a concrete
 * email transport and the persisted Order rows:
 *
 *   - {@link createEmailSender} builds a {@link NotificationSender} that sends
 *     via the Resend HTTP API when `RESEND_API_KEY` and `FROM_EMAIL` are set,
 *     and otherwise logs to the console (dev / no-keys). No SDK is added — a
 *     small `fetch` wrapper keeps the dependency surface minimal.
 *   - A {@link FailureSink} records terminal delivery failures to the AuditLog
 *     (best-effort) and the console for monitoring (Req 18.5), never altering
 *     order status.
 *   - {@link sendOrderConfirmationForOrder} / {@link sendShipmentNotificationForOrder}
 *     load an order, project it to a {@link NotifiableOrder} (recipient email
 *     from the address snapshot), and dispatch the confirmation / shipment
 *     notification.
 *
 * Everything degrades gracefully: with no email keys the sender logs instead of
 * calling the network; with no DB the helpers no-op. Nothing here throws into
 * the order/payment flow (Req 18.4, 18.5).
 */

import {
  createNotificationService,
  type FailureSink,
  type NotifiableOrder,
  type NotificationMessage,
  type NotificationSender,
  type SendResult,
  type TerminalFailure,
  type Notification_Service,
} from '@/services/notification';
import { config } from '@/services/config';

/** Resend transactional-email HTTP endpoint. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Human-readable subject + body for a message, kept simple and text-only. */
function renderEmail(message: NotificationMessage): {
  subject: string;
  text: string;
} {
  if (message.kind === 'ORDER_CONFIRMATION') {
    return {
      subject: `Order confirmed — ${message.orderId}`,
      text: [
        'Thanks for your order!',
        '',
        `Your order ${message.orderId} is confirmed and payment received.`,
        'We will email you tracking details once it ships.',
      ].join('\n'),
    };
  }
  // SHIPMENT: include the recorded tracking id and URL (Req 18.2, 17.5).
  const lines = [
    'Your order has shipped!',
    '',
    `Order ${message.orderId} is on its way.`,
  ];
  if (message.trackingId !== undefined) {
    lines.push(`Tracking ID: ${message.trackingId}`);
  }
  if (message.trackingUrl !== undefined) {
    lines.push(`Track it here: ${message.trackingUrl}`);
  }
  return { subject: `Your order has shipped — ${message.orderId}`, text: lines.join('\n') };
}

/**
 * Build the email {@link NotificationSender}. Uses Resend over `fetch` when
 * `RESEND_API_KEY` and `FROM_EMAIL` are configured; otherwise logs the message
 * to the console so development and keyless builds work without a provider.
 */
export function createEmailSender(): NotificationSender {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
  const fromEmail = (process.env.FROM_EMAIL ?? '').trim();
  const configured = apiKey.length > 0 && fromEmail.length > 0;

  return {
    async send(message: NotificationMessage): Promise<SendResult> {
      const { subject, text } = renderEmail(message);

      if (!configured) {
        // Dev / no-keys fallback: log instead of sending. Treated as success so
        // the order flow is never blocked and no retries pile up (Req 18.4).
        // eslint-disable-next-line no-console
        console.info(
          `[notification] (dev, no RESEND_API_KEY/FROM_EMAIL) EMAIL to ${message.to}: ${subject}`,
        );
        return { ok: true, detail: 'logged (email provider not configured)' };
      }

      try {
        const response = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: message.to,
            subject,
            text,
          }),
        });
        if (!response.ok) {
          const detail = `Resend responded ${response.status}`;
          return { ok: false, detail };
        }
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * A {@link FailureSink} that records terminal notification failures to the
 * AuditLog for monitoring (Req 18.5) and always logs to the console. Recording
 * is best-effort and never throws or alters order status.
 */
export function createAuditFailureSink(): FailureSink {
  return {
    record(failure: TerminalFailure): void {
      // eslint-disable-next-line no-console
      console.error('[notification] terminal delivery failure', failure);
      // Best-effort AuditLog write; fire-and-forget so it never blocks or throws.
      void (async () => {
        try {
          const { getPrisma } = await import('@/lib/prisma');
          const prisma = getPrisma();
          await prisma.auditLog.create({
            data: {
              actorId: 'system',
              actionType: 'NOTIFICATION_DELIVERY_FAILURE',
              entityType: 'Order',
              entityId: failure.orderId,
              detail: {
                kind: failure.kind,
                channel: failure.channel,
                to: failure.to,
                attempts: failure.attempts,
                detail: failure.detail ?? null,
              },
            },
          });
        } catch {
          // Monitoring is best-effort; ignore persistence failures (Req 18.5).
        }
      })();
    },
  };
}

/** Shared Notification_Service bound to the email sender + audit failure sink. */
const notificationService: Notification_Service = createNotificationService({
  config,
  senders: {
    email: createEmailSender(),
    // WhatsApp is behind the `whatsapp` flag; no sender is wired yet, so the
    // service leaves that channel dormant even if the flag is toggled on
    // (Req 18.3, 17.8). See createWhatsappSenderStub below.
    whatsapp: undefined,
  },
  failureSink: createAuditFailureSink(),
});

/**
 * Flag-gated WhatsApp sender stub (Req 18.3, 17.8). Not wired into the service:
 * WhatsApp delivery is intentionally left unimplemented. When a provider is
 * chosen later, implement this and pass it as `senders.whatsapp` guarded by the
 * `whatsapp` flag. Kept here to document the seam without enabling it.
 */
export function createWhatsappSenderStub(): NotificationSender {
  return {
    async send(message: NotificationMessage): Promise<SendResult> {
      return {
        ok: false,
        detail: `WhatsApp delivery not implemented for ${message.orderId}`,
      };
    },
  };
}

/** Extract a recipient email from a persisted order's address snapshot JSON. */
function emailFromAddressSnapshot(snapshot: unknown): string | null {
  if (snapshot === null || typeof snapshot !== 'object') return null;
  const email = (snapshot as { email?: unknown }).email;
  return typeof email === 'string' && email.trim().length > 0 ? email.trim() : null;
}

/** Extract a recipient phone from a persisted order's address snapshot JSON. */
function phoneFromAddressSnapshot(snapshot: unknown): string | null {
  if (snapshot === null || typeof snapshot !== 'object') return null;
  const phone = (snapshot as { phone?: unknown }).phone;
  return typeof phone === 'string' && phone.trim().length > 0 ? phone.trim() : null;
}

/** Load an order and project it to a {@link NotifiableOrder}, or null. */
async function loadNotifiableOrder(orderId: string): Promise<NotifiableOrder | null> {
  try {
    const { getPrisma } = await import('@/lib/prisma');
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        addressSnapshot: true,
        trackingId: true,
        trackingUrl: true,
      },
    });
    if (order === null) return null;
    return {
      id: order.id,
      email: emailFromAddressSnapshot(order.addressSnapshot),
      phone: phoneFromAddressSnapshot(order.addressSnapshot),
      trackingId: order.trackingId,
      trackingUrl: order.trackingUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Send the order confirmation for an order that has transitioned to PAID
 * (Req 18.1, 10.3). Loads the order, projects the recipient email from the
 * address snapshot, and dispatches through the retry core. Never throws — a
 * missing order / DB / email provider degrades to a no-op or logged send so the
 * payment flow is never blocked (Req 18.4, 18.5).
 */
export async function sendOrderConfirmationForOrder(orderId: string): Promise<void> {
  try {
    const order = await loadNotifiableOrder(orderId);
    if (order === null) return;
    await notificationService.sendOrderConfirmation(order);
  } catch {
    // Notifications must never disturb the order flow.
  }
}

/**
 * Send the shipment notification for an order that has transitioned to SHIPPED
 * (Req 18.2, 17.5), relaying the recorded tracking id and URL. Never throws.
 */
export async function sendShipmentNotificationForOrder(orderId: string): Promise<void> {
  try {
    const order = await loadNotifiableOrder(orderId);
    if (order === null) return;
    await notificationService.sendShipmentNotification(order);
  } catch {
    // Notifications must never disturb the order flow.
  }
}
