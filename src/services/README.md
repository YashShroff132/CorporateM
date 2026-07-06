# Services

Server-side domain service modules. Each service owns a clear interface and
delegates external effects to the persistence/integration layer.

Planned modules (per design.md):

- `Catalog_Service` — products, collections, variants, statuses, tiers
- `Cart_Service` — guest/user carts, merge-on-login, checkout revalidation
- `Auth_Service` — email + phone OTP authentication
- `Checkout_Service` — address, totals, coupon application, snapshots
- `Payment_Service` — Razorpay order creation, signature/webhook verification
- `Invoice_Service` — GST-compliant invoicing
- `Order_Service` — order lifecycle state machine, fulfillment routing
- `AI_Engine` — slogan generation, dedup, run auditing
- `Moderation_Gate` — automated content-policy enforcement
- `Mockup_Renderer` — template selection, text fit, preview rendering
- `Shipping_Service` — charge, serviceability, aggregator fallback
- `Notification_Service` — email/WhatsApp send-on-transition
- `Config_Service` — brand config, feature flags, tax/shipping settings
