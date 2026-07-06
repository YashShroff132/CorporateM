# Implementation Plan: Corporate Cult E-Commerce

## Overview

This plan converts the design into incremental, test-backed coding steps on the locked stack (Next.js App Router + React + TypeScript, Tailwind, PostgreSQL + Prisma, Auth.js, Razorpay, S3/R2 + Cloudinary, Anthropic Claude, GSAP/Framer/Three.js, Zod). Work begins with the pure correctness cores (money, config, data models, validation) and builds outward through catalog, shop, cart, auth, checkout, payments, invoicing, orders, admin, the AI pipeline, POD seams, shipping, notifications, SEO, growth, legal, security, performance, and DevOps. Each property from the design is turned into a single fast-check property test placed next to the code it validates. Property and unit test sub-tasks are marked optional with `*`; core implementation tasks are never optional.

Property tests use **fast-check** (min 100 iterations) and are tagged:
`// Feature: corporate-cult-ecommerce, Property {number}: {property_text}`

## Tasks

- [x] 1. Bootstrap project, tooling, and shared foundations
  - [x] 1.1 Initialize Next.js (App Router) + TypeScript + Tailwind project and tooling
    - Scaffold the app, configure TypeScript strict mode, Tailwind, ESLint/Prettier
    - Add Vitest/Jest test runner and fast-check as a dev dependency
    - Create the service-module directory layout (services, lib, middleware, prisma)
    - _Requirements: 25.1_

  - [x] 1.2 Implement the Money module (paise arithmetic core)
    - Implement branded `Paise` type, `makePaise`, `add`, `sub`, `applyRatePercentHalfUp`, `toINRString` returning `Result` values
    - Enforce integer-only, range 0..9,999,999,999, half-up rounding, no floating point
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6_

  - [x]* 1.3 Write property tests for the Money module
    - **Property 1: Integer-paise closure and half-up rounding** â€” Validates: Requirements 26.1, 26.2, 26.3, 26.6, 7.6, 1.9
    - **Property 2: INR display derivation** â€” Validates: Requirements 26.5, 9.7
    - Provide `paiseArb` arbitrary (in-range, out-of-range, non-integer)

  - [x] 1.4 Implement Config_Service and feature-flag registry
    - Read brand config, feature flags (all default disabled), GST rate/GSTIN/HSN, shipping thresholds, COD limits, moderation thresholds, Claude model id, timezone, rate limits from env/seed
    - Implement `validateStartup()` that fails fast identifying missing brand config
    - _Requirements: 22.1, 22.2, 22.5, 22.6, 22.7, 9.1, 9.6, 17.2, 12.8_

  - [x]* 1.5 Write property tests for Config_Service startup and flags
    - **Property 76: Startup config validation** â€” Validates: Requirements 22.6
    - _Requirements: 22.6_

- [x] 2. Define the data layer (Prisma schema + repositories)
  - [x] 2.1 Author the Prisma schema and initial migration
    - Define all enums and models (Product, Variant, Collection, User, WishlistItem, Cart, CartLine, Otp, Order, Invoice, Coupon, Design, BlankTemplate, SloganBankEntry, AuditLog, ConsentEvent, NewsletterSub)
    - Make all money columns `Int` paise; add uniqueness constraints for slug, SKU, invoice number, newsletter email, wishlist, variant tuple, seed keys
    - Run Prisma Migrate to create the versioned migration file
    - _Requirements: 25.2, 1.1, 1.2, 1.7, 1.9, 1.10, 5.6, 9.5, 16.4, 16.5, 26.1_

- [x] 3. Catalog service and taxonomy
  - [x] 3.1 Implement Catalog_Service create/read/transition logic
    - Implement `createProduct` (unique slug 1..200, one tier, one collection), `createVariant` (unique SKU 1..64), value-range guards via Money module, `transitionStatus`
    - Implement `getPublishedForDisplay` returning only PUBLISHED products
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_

  - [x]* 3.2 Write property tests for Catalog_Service
    - **Property 3: Unique-key insertion rejects duplicates and preserves state** â€” Validates: Requirements 1.4, 1.5, 1.11, 1.12
    - **Property 4: Customer-facing catalog returns only PUBLISHED** â€” Validates: Requirements 1.8
    - Provide `productArb` / `variantArb` arbitraries

- [x] 4. Faceted shop browsing
  - [x] 4.1 Implement ShopQueryParser (parse/encode) and filter application
    - Parse tier/collection/color/size/price-range/sort/page from URLSearchParams, discarding malformed/out-of-range params, default sort newest
    - Implement `encode` round-trippable with `parse`; apply AND-combined filters; paginate 24/page
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.8_

  - [x]* 4.2 Write property tests for shop query and filtering
    - **Property 5: Shop query encode/parse round trip** â€” Validates: Requirements 2.3
    - **Property 6: Invalid shop parameters are ignored** â€” Validates: Requirements 2.6
    - **Property 7: Filters combine with AND** â€” Validates: Requirements 2.5
    - **Property 8: Pagination page-size invariant** â€” Validates: Requirements 2.8
    - Provide `shopQueryArb` arbitrary

  - [x] 4.3 Implement SSR shop/collection pages with empty state and canonical/rel links
    - Render first page server-side for a shop URL, emit canonical + rel prev/next, collection landing pages, empty-state message retaining filter controls
    - _Requirements: 2.4, 2.7, 2.9, 2.10, 19.1_

  - [x]* 4.4 Write unit tests for shop page defaults and empty state
    - Test default sort = newest and empty-state message rendering
    - _Requirements: 2.2, 2.7_

- [x] 5. Product Detail Page
  - [x] 5.1 Implement PDP variant availability and purchase-action logic
    - Enable add-to-cart/buy-now iff variant stock > 0; reject incomplete selection and prompt for remaining options
    - Render tier badge, spicy indicator for VERY_DIRECT, size guide, cross-sell (Owner_Input count), trust row
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.10, 3.11_

  - [x] 5.2 Implement PDP structured data and share asset
    - Emit Product/Offer JSON-LD, AggregateRating JSON-LD when an approved review exists, Instagram Story share asset with unavailable messaging
    - _Requirements: 3.8, 3.9, 3.12, 3.13_

  - [x]* 5.3 Write property tests for PDP behavior
    - **Property 9: Variant availability tracks stock** â€” Validates: Requirements 3.4
    - **Property 10: Incomplete variant selection is rejected** â€” Validates: Requirements 3.11
    - **Property 11: Structured-data and tier-badge emission** â€” Validates: Requirements 3.2, 3.8, 3.13

- [x] 6. Signature scroll narrative homepage
  - [x] 6.1 Implement homepage narrative with graceful degradation
    - Render narrative acts in fixed order; server-render static readable fallbacks for no-JS, reduced-motion, low-end device, and library-load-timeout
    - Code-split GSAP/Three.js loaded after FCP; disable 3D scene per device descriptor
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 4.10_

  - [x] 6.2 Wire featured products to shoppable links and no-JS add-to-cart
    - Make every featured product reachable via standard shop/PDP link with functional add-to-cart without JS
    - _Requirements: 4.8, 4.9_

  - [ ]* 6.3 Write property tests for homepage degradation
    - **Property 12: Homepage degradation decision** â€” Validates: Requirements 4.2, 4.3, 4.7, 4.10
    - **Property 13: Featured products are shoppable** â€” Validates: Requirements 4.8, 4.9
    - Provide `envDescriptorArb` arbitrary

- [~] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Cart and wishlist
  - [x] 8.1 Implement Cart_Service line, merge, and revalidation logic
    - Constrain line qty to integer 1..99; guest (session) and user carts; merge-on-login summing matching variants capped at stock; checkout revalidation removing zero-stock lines and reducing over-stock lines with notices
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8, 5.9_

  - [x]* 8.2 Write property tests for cart logic
    - **Property 14: Cart line quantity bounds** â€” Validates: Requirements 5.1, 5.2
    - **Property 15: Guest-to-user cart merge sums and caps at stock** â€” Validates: Requirements 5.3
    - **Property 16: Checkout stock revalidation** â€” Validates: Requirements 5.4, 5.8
    - Provide `cartArb` + `stockMapArb` arbitraries

  - [x] 8.3 Implement wishlist with idempotent entries and guest gating
    - Add/remove wishlist items for authenticated users with at most one entry per product; prompt guests to sign in
    - _Requirements: 5.6, 5.7_

  - [x]* 8.4 Write property test for wishlist idempotence
    - **Property 17: Wishlist entry idempotence** â€” Validates: Requirements 5.6

- [x] 9. Authentication and accounts
  - [x] 9.1 Implement Auth_Service OTP issuance and verification
    - Validate 10-digit Indian mobile; issue 6-digit OTP with 5-minute expiry; verify correct code establishes session; record failed attempts; invalidate after 5 wrong; reject expired
    - Store session in httpOnly secure cookie; default role CUSTOMER; support email auth
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x]* 9.2 Write property tests for OTP lifecycle
    - **Property 18: Indian mobile validation for OTP** â€” Validates: Requirements 6.2
    - **Property 19: OTP issuance format and expiry** â€” Validates: Requirements 6.3
    - **Property 20: OTP verification lifecycle** â€” Validates: Requirements 6.4, 6.5, 6.6, 6.7
    - Provide `phoneArb` arbitrary

  - [x] 9.3 Implement account dashboard views
    - Present user orders, addresses, wishlist, profile; show order status and tracking when recorded
    - _Requirements: 6.10, 6.11_

- [x] 10. Rate limiting core (shared)
  - [x] 10.1 Implement per-identifier rate limiter with rolling windows and min-interval
    - Enforce configured max per rolling window per identifier, reject excess without processing, enforce min inter-request interval; wire OTP spacing (â‰¥30s, â‰¤3/10min)
    - _Requirements: 6.12, 6.13, 11.10, 11.11, 12.10, 23.7, 23.10_

  - [ ]* 10.2 Write property test for rate limiting
    - **Property 21: Rate limiting per identifier** â€” Validates: Requirements 6.12, 6.13, 11.10, 11.11, 12.10, 23.7, 23.10
    - Provide `requestSequenceArb` arbitrary

- [x] 11. Checkout service
  - [x] 11.1 Implement pincode autofill and contact validation
    - Autofill city/state for valid serviceable 6-digit pincode; reject invalid/unrecognized leaving fields empty; validate guest email + 10-digit mobile retaining prior details on error
    - _Requirements: 7.1, 7.2, 7.9, 7.10, 7.8_

  - [x] 11.2 Implement order pricing, coupon application, and price snapshots
    - Compute subtotal/discount/shipping/tax/total in integer paise; apply coupon flooring total at 0 paise; reject expired/inactive/below-minimum coupons leaving total unchanged; record per-line price snapshots on order
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x]* 11.3 Write property tests for checkout logic
    - **Property 22: Pincode autofill correctness** â€” Validates: Requirements 7.2, 7.10
    - **Property 23: Coupon application floors total at zero and never increases it** â€” Validates: Requirements 7.4
    - **Property 24: Invalid coupon leaves total unchanged** â€” Validates: Requirements 7.5
    - **Property 25: Order price snapshots match source prices** â€” Validates: Requirements 7.7
    - **Property 26: Contact validation on guest checkout** â€” Validates: Requirements 7.1, 7.9
    - Provide `pincodeArb` / `emailArb` arbitraries

- [x] 12. Payments
  - [x] 12.1 Implement Payment_Service Razorpay integration and verification
    - Create Razorpay order with amount == order total paise; UPI-first option ordering; server-side signature verification leaving order unpaid on failure; store payment identifiers/method; never store credentials
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 8.9, 8.10_

  - [x] 12.2 Implement idempotent webhook handling and COD gating
    - Verify webhook signature as authoritative status; idempotent re-application; COD eligibility iff serviceable and within configured min..max
    - _Requirements: 8.5, 8.6, 8.8_

  - [x]* 12.3 Write property tests for payments
    - **Property 27: Razorpay order amount equals order total** â€” Validates: Requirements 8.1
    - **Property 28: Payment signature verification** â€” Validates: Requirements 8.3, 8.4
    - **Property 29: Webhook idempotence** â€” Validates: Requirements 8.5, 8.6
    - **Property 30: COD eligibility predicate** â€” Validates: Requirements 8.8
    - **Property 31: No payment credentials stored** â€” Validates: Requirements 8.9

  - [x]* 12.4 Write integration test for payment + webhook flow
    - Test Razorpay order creation and verified-webhook state application using test keys
    - _Requirements: 8.1, 8.3, 8.5_

- [x] 13. GST-compliant invoicing
  - [x] 13.1 Implement Invoice_Service tax computation and generation
    - GST rate config bounds 0..28 (reject out-of-range, retain prior); per-line half-up integer-paise GST; CGST/SGST vs IGST by state; unique invoice number; INR display from paise; generate on paid-and-no-existing-invoice
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x]* 13.2 Write property tests for invoicing
    - **Property 32: GST rate configuration bounds** â€” Validates: Requirements 9.1, 9.2
    - **Property 33: Per-line GST computation is half-up integer paise** â€” Validates: Requirements 9.3
    - **Property 34: Tax breakup by delivery state** â€” Validates: Requirements 9.4
    - **Property 35: Invoice generation on paid is idempotent** â€” Validates: Requirements 9.8

  - [x]* 13.3 Write unit test for invoice content fields
    - Assert GSTIN, HSN, and legal entity fields present on generated invoice
    - _Requirements: 9.5, 9.6_

- [x] 14. Order management
  - [x] 14.1 Implement Order_Service state machine and transitions
    - Enforce allowed transition set; SHIPPED requires non-empty tracking id+url from PAID|FULFILLING; refund transitions to REFUNDED only on gateway success; store address + line snapshots; default fulfillment mode SELF
    - _Requirements: 10.1, 10.2, 10.4, 10.7, 10.8, 10.9, 10.10, 10.11_

  - [x] 14.2 Implement admin order filtering and CSV export
    - Filter by status and inclusive creation-date range; export one CSV row per order with id, status, total, creation date, customer contact
    - _Requirements: 10.5, 10.6_

  - [x]* 14.3 Write property tests for order management
    - **Property 36: Order status transitions honor the allowed set** â€” Validates: Requirements 10.11
    - **Property 37: Shipping requires tracking and valid source status** â€” Validates: Requirements 10.2, 10.9
    - **Property 38: Refund transition depends on gateway outcome** â€” Validates: Requirements 10.7, 10.10
    - **Property 39: Order CSV export row fidelity** â€” Validates: Requirements 10.6
    - **Property 40: Order filtering correctness** â€” Validates: Requirements 10.5
    - Provide `orderArb` + `transitionArb` arbitraries

- [~] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Admin panel and audit logging
  - [x] 16.1 Implement admin authorization gate and immutable audit logging
    - Reject non-ADMIN requests on admin routes with no CRUD and no content disclosure; write one immutable audit entry per create/update/delete (actor, action, entity type, entity id, timestamp)
    - _Requirements: 11.1, 11.2_

  - [x] 16.2 Implement admin dashboard aggregation
    - Compute current-day (store timezone) revenue, order count, top products by units, low-stock alerts at/below threshold, PENDING_REVIEW count
    - _Requirements: 11.3_

  - [x] 16.3 Implement admin CRUD surfaces
    - CRUD for products/variants (stock, price, images, tier, collection, SEO), collections, coupons, blank templates; manage narrative/FAQ/policy content; edit shipping/GST/brand config/feature flags; admin rate limiting
    - _Requirements: 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11_

  - [ ]* 16.4 Write property tests for admin panel
    - **Property 41: Admin authorization gate** â€” Validates: Requirements 11.1
    - **Property 42: Immutable audit logging of mutations** â€” Validates: Requirements 11.2, 13.7
    - **Property 43: Dashboard aggregation correctness** â€” Validates: Requirements 11.3

  - [ ]* 16.5 Write unit tests for admin CRUD provisions
    - Verify CRUD operations exist for products, collections, coupons, templates
    - _Requirements: 11.4, 11.5, 11.6, 11.7_

- [ ] 17. AI slogan generation engine
  - [x] 17.1 Implement AI_Engine parameter validation and Claude call
    - Validate count 1..20, known tier, existing collection; build brand/tier/policy/few-shot system prompt; read model id from config; require structured JSON validated against schema with exactly one repair retry; 60s timeout; persist nothing on failure
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.8_

  - [x] 17.2 Implement slogan de-duplication and run auditing
    - Dedupe by case-insensitive whitespace-normalized text OR embedding cosine â‰¥ 0.9; record token usage and cost to audit log; enforce â‰¤10 runs/admin/60min
    - _Requirements: 12.7, 12.9, 12.10_

  - [ ]* 17.3 Write property tests for AI_Engine
    - **Property 44: Generation parameter validation** â€” Validates: Requirements 12.1, 12.2
    - **Property 45: Claude response schema validation with single repair retry** â€” Validates: Requirements 12.4, 12.5
    - **Property 46: Generation failure persists nothing** â€” Validates: Requirements 12.6
    - **Property 47: Slogan de-duplication** â€” Validates: Requirements 12.7
    - **Property 48: Configured model and cost auditing** â€” Validates: Requirements 12.8, 12.9
    - Provide `sloganArb` arbitrary

- [x] 18. Content moderation gate
  - [x] 18.1 Implement Moderation_Gate evaluation and routing
    - Evaluate every candidate before Review_Queue; AUTO_REJECT for prohibited categories/real-entity defamation/score â‰¥ auto-reject; NEEDS_REVIEW for band or VERY_DIRECT; ADMIT otherwise; never publish; record decisions; 30s timeout withholds
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11_

  - [ ]* 18.2 Write property tests for moderation gate
    - **Property 49: Moderation routing is exhaustive and never publishes** â€” Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.8
    - **Property 50: Moderation outcome consequences** â€” Validates: Requirements 13.9, 13.10, 13.11

- [x] 19. Mockup rendering
  - [x] 19.1 Implement Mockup_Renderer template selection and text fit
    - Select Blank_Template by garment+color or error; auto-fit font 12..144 pt with line breaks strictly within print area; error when unfittable at 12pt; â‰¥2 layout presets per tier incl. monospace for Operator
    - _Requirements: 14.1, 14.2, 14.3, 14.6, 14.7, 14.8_

  - [x] 19.2 Implement preview rendering and storage
    - Produce â‰¥1000px preview + hi-res placeholder reference; store to object storage and record URL on Design and Product; record no URL and return error on storage failure
    - _Requirements: 14.4, 14.5, 14.9_

  - [x]* 19.3 Write property tests for mockup renderer
    - **Property 51: Mockup text fits within print area** â€” Validates: Requirements 14.2, 14.3
    - **Property 52: Unfittable slogan errors without preview** â€” Validates: Requirements 14.8
    - **Property 53: Template selection matches request or errors** â€” Validates: Requirements 14.1, 14.7
    - **Property 54: Preview storage records URL only on success** â€” Validates: Requirements 14.4, 14.5, 14.9

- [ ] 20. AI draft creation and review queue
  - [x] 20.1 Implement draft creation and review queue actions
    - Create Design + Product (PENDING_REVIEW, aiGenerated true, default variants) on gate-approved rendered slogan; per-item approveâ†’PUBLISHED, edit, regenerate (keeps PENDING_REVIEW), rejectâ†’ARCHIVED; bulk-approve â‰¤100 SAFE PENDING_REVIEW; block publish without approval; guard status precondition
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10_

  - [ ]* 20.2 Write property tests for draft/review queue
    - **Property 55: AI draft creation shape** â€” Validates: Requirements 15.1
    - **Property 56: Draft approval and rejection transitions** â€” Validates: Requirements 15.4, 15.5, 15.7, 15.10
    - **Property 57: Bulk approve eligibility and cap** â€” Validates: Requirements 15.6
    - **Property 58: Mockup regeneration preserves review status** â€” Validates: Requirements 15.8, 15.9

  - [ ]* 20.3 Write end-to-end test for generate â†’ moderate â†’ render â†’ review â†’ publish
    - Exercise the full AI pipeline with mocked external effects
    - _Requirements: 12.3, 13.1, 14.5, 15.4_

- [~] 21. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Print-on-Demand seams
  - [x] 22.1 Implement Fulfillment_Provider interface, self impl, and POD stub
    - Define adapter interface; active self-fulfillment implementation; POD stub returning "not configured" with no network call; store POD variant/order id fields defaulting unset
    - _Requirements: 16.1, 16.2, 16.3, 16.5_

  - [x] 22.2 Implement Order_Service fulfillment routing
    - Route SELF when POD flag disabled or product mode SELF; when flag enabled + mode POD + paid + no POD order id, create POD order and record returned id; on POD failure leave id unset, order paid, record error
    - _Requirements: 16.6, 16.7, 16.8, 16.9_

  - [ ]* 22.3 Write property tests for POD seams
    - **Property 59: POD stub returns not-configured without network** â€” Validates: Requirements 16.1, 16.2, 16.3
    - **Property 60: Fulfillment routing decision** â€” Validates: Requirements 16.6, 16.7, 16.8
    - **Property 61: POD order creation failure handling** â€” Validates: Requirements 16.9

- [ ] 23. Shipping and serviceability
  - [x] 23.1 Implement Shipping_Service charge, serviceability, and aggregator fallback
    - Flat charge below free-shipping threshold, zero at/above; pincode serviceability within 3s; block payment for non-serviceable pincode; aggregator behind flag with 10s-timeout fallback to flat rate + local pincode list
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.6, 17.7_

  - [ ]* 23.2 Write property tests for shipping
    - **Property 62: Shipping charge threshold** â€” Validates: Requirements 17.1
    - **Property 63: Non-serviceable pincode blocks payment** â€” Validates: Requirements 17.6
    - **Property 64: Shipping aggregator fallback** â€” Validates: Requirements 17.7

- [ ] 24. Notifications
  - [x] 24.1 Implement Notification_Service send-on-transition and retry logic
    - Send confirmation email on paid and tracking email on shipped within 60s; WhatsApp behind flag; retry up to Owner_Input max; record terminal failure without altering order status
    - _Requirements: 17.5, 17.8, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ]* 24.2 Write property test for notification retry bound
    - **Property 65: Notification retry bound and order invariance** â€” Validates: Requirements 18.4, 18.5

  - [ ]* 24.3 Write integration test for send-on-transition timing
    - Verify confirmation/shipment notifications dispatched within 60s of transition
    - _Requirements: 18.1, 18.2_

- [ ] 25. SEO and analytics
  - [x] 25.1 Implement SEO metadata, sitemap, and Open Graph/JSON-LD
    - Emit title 1..60, description 1..160, absolute canonical; generate sitemap of PUBLISHED products + active collections only, regenerated within 300s of publish-state change; Open Graph metadata
    - _Requirements: 19.1, 19.2, 19.3, 19.6, 19.7_

  - [x] 25.2 Implement GA4 + PostHog event dispatch (non-blocking)
    - Emit view/add-to-cart/begin-checkout/payment events to both providers within 2s; never block page/action on analytics failure
    - _Requirements: 19.4, 19.5, 19.8_

  - [ ]* 25.3 Write property tests for SEO and analytics
    - **Property 66: SEO metadata bounds** â€” Validates: Requirements 19.2
    - **Property 67: Sitemap includes only published items** â€” Validates: Requirements 19.3
    - **Property 68: Analytics failure is non-blocking** â€” Validates: Requirements 19.8

- [ ] 26. Growth loops
  - [x] 26.1 Implement newsletter, referral, team-pack, and abandoned-cart mechanics
    - Newsletter subscribe idempotent with source + confirmation, reject invalid email; referral single-use code behind flag; team-pack discount at/above min quantity floored at 0 paise; abandoned-cart reminders behind flag bounded by max with cancellation on paid/empty
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [ ]* 26.2 Write property tests for growth loops
    - **Property 69: Newsletter subscription idempotence** â€” Validates: Requirements 20.1, 20.5, 20.6
    - **Property 70: Referral code single use** â€” Validates: Requirements 20.2
    - **Property 71: Team-pack discount condition and floor** â€” Validates: Requirements 20.3
    - **Property 72: Abandoned-cart reminder bound and cancellation** â€” Validates: Requirements 20.4, 20.7

- [x] 27. Legal and compliance pages
  - [x] 27.1 Implement policy pages, consent capture, and grievance content
    - Publish privacy/terms/returns/shipping/cookie pages reachable from footer; pending-legal-review notice until approval marker set; placeholder markers for missing legal text; explicit non-pre-selected consent recording purpose + timestamp before collection with withdrawal mechanism; grievance officer contact
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6_

  - [ ]* 27.2 Write property tests for legal/compliance
    - **Property 73: Policy page legal-review notice and placeholders** â€” Validates: Requirements 21.2, 21.6
    - **Property 74: Consent precedes personal-data collection** â€” Validates: Requirements 21.3

- [ ] 28. Security middleware and feature-flag gating
  - [x] 28.1 Implement middleware: Zod validation, CSRF, security headers, flag gating
    - Zod-validate every body/form/webhook before processing/persistence with field-level errors; CSRF protection on state-changing requests; CSP/HSTS/X-Frame-Options/Referrer-Policy headers; omit and reject disabled-flag capabilities disclosing no content
    - _Requirements: 22.3, 22.4, 23.1, 23.2, 23.4, 23.5, 23.6, 23.8, 23.9_

  - [ ]* 28.2 Write property tests for security and gating
    - **Property 75: Disabled feature flags gate capabilities** â€” Validates: Requirements 22.2, 22.3, 22.4
    - **Property 77: Schema validation before persistence** â€” Validates: Requirements 23.1, 23.2
    - **Property 78: CSRF protection on state-changing requests** â€” Validates: Requirements 23.6, 23.9

  - [ ]* 28.3 Write smoke tests for security headers and secret hygiene
    - Assert required header directives present and secrets absent from source control
    - _Requirements: 23.3, 23.4, 23.5_

- [ ] 29. Performance and monitoring
  - [x] 29.1 Implement responsive image pipeline and Sentry reporting
    - Serve AVIF/WebP with explicit width/height and format fallback; report runtime errors to Sentry within 10s with type/stack/context; retry Sentry delivery â‰¤3 times without blocking the request
    - _Requirements: 24.4, 24.5, 24.6, 24.7_

  - [ ]* 29.2 Write property tests for images and error reporting
    - **Property 79: Image format and dimensions** â€” Validates: Requirements 24.4, 24.5
    - **Property 80: Error reporting retry is bounded and non-blocking** â€” Validates: Requirements 24.7

- [ ] 30. DevOps, migrations, seed, and CI
  - [x] 30.1 Implement idempotent seed script for slogan bank and blank templates
    - Load slogan bank and blank templates; running multiple times creates no duplicates
    - _Requirements: 25.3, 25.8_

  - [ ]* 30.2 Write property test for seed idempotence
    - **Property 81: Seed script idempotence** â€” Validates: Requirements 25.8

  - [x] 30.3 Configure CI pipeline and environment separation
    - CI runs lint, type check, unit tests (incl. property tests), e2e tests, Prisma migration drift check; use Razorpay test keys only; block merge on any failing check; distinct local/staging/production databases and secrets
    - _Requirements: 25.1, 25.2, 25.4, 25.5, 25.7_

  - [ ]* 30.4 Write end-to-end test for browse-to-paid flow
    - Exercise browse â†’ PDP â†’ cart â†’ checkout â†’ paid using test keys and mocks
    - _Requirements: 25.6_

- [~] 31. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (property, unit, integration, e2e, and smoke tests) and can be skipped for a faster MVP.
- Each task references specific requirements for traceability; every one of the 81 design properties is implemented as a single fast-check property test (min 100 iterations) placed next to the code it validates.
- Checkpoints ensure incremental validation at natural boundaries.
- Property tests validate universal correctness properties; unit/integration/e2e/smoke tests cover concrete examples, external wiring, flows, and one-time configuration.
- Non-MVP capabilities (AI Studio, reviews, homepage 3D, POD, shipping aggregator, WhatsApp, referral, abandoned cart) are built behind feature flags defaulting to disabled.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "1.5", "2.1", "10.1"] },
    { "id": 3, "tasks": ["3.1", "9.1", "10.2", "11.1", "13.1"] },
    { "id": 4, "tasks": ["3.2", "4.1", "5.1", "8.1", "9.2", "11.2", "12.1", "13.2", "13.3", "14.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "5.2", "8.2", "8.3", "9.3", "11.3", "12.2", "14.2"] },
    { "id": 6, "tasks": ["4.4", "5.3", "6.1", "8.4", "12.3", "12.4", "14.3", "16.1"] },
    { "id": 7, "tasks": ["6.2", "16.2", "17.1", "18.1", "19.1"] },
    { "id": 8, "tasks": ["6.3", "16.3", "17.2", "18.2", "19.2"] },
    { "id": 9, "tasks": ["16.4", "16.5", "17.3", "19.3", "20.1"] },
    { "id": 10, "tasks": ["20.2", "20.3", "22.1"] },
    { "id": 11, "tasks": ["22.2", "23.1"] },
    { "id": 12, "tasks": ["22.3", "23.2", "24.1"] },
    { "id": 13, "tasks": ["24.2", "24.3", "25.1"] },
    { "id": 14, "tasks": ["25.2", "25.3", "26.1"] },
    { "id": 15, "tasks": ["26.2", "27.1", "28.1"] },
    { "id": 16, "tasks": ["27.2", "28.2", "28.3", "29.1"] },
    { "id": 17, "tasks": ["29.2", "30.1", "30.3"] },
    { "id": 18, "tasks": ["30.2", "30.4"] }
  ]
}
```
