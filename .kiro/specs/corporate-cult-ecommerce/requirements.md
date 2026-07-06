# Requirements Document

## Introduction

Corporate Cult is a Gen-Z streetwear e-commerce platform selling corporate-humor T-shirts to the India market. The platform turns "corporate suffering" into wearable protest through a tiered "bravery" product system, a signature scroll-driven homepage narrative, and an AI-assisted design engine that generates and moderates slogans before human approval.

This document captures the FULL product scope across all phases (Phase 0 foundations, Phase 1 MVP, Phase 2 growth + AI Studio, Phase 3 scale + Print-on-Demand). Phase 1 (MVP) is the priority; all capabilities beyond MVP are gated behind feature flags but specified here for completeness.

The technology stack is locked: Next.js (App Router) + React + TypeScript, Tailwind CSS, PostgreSQL + Prisma, Auth.js, Razorpay payments (INR/GST), S3/R2 + Cloudinary storage, Anthropic Claude API for slogan generation, and GSAP/Framer Motion/Three.js for the scroll narrative.

Design principles reflected throughout these requirements:
- All monetary values are stored and computed as integer paise; currency is INR at launch.
- Owner-supplied values (brand name, pricing, GST rates, GSTIN, legal text, POD provider, slogan bank) are treated as configurable or feature-flagged, never hardcoded.
- Every AI-generated slogan passes an automated moderation gate and a mandatory human approval step before publication.
- The site is mobile-first and fully shoppable with animations disabled.
- No secret is committed to source control.

## Glossary

- **Platform**: The complete Corporate Cult e-commerce system (frontend, backend, admin).
- **Catalog_Service**: The component responsible for storing, indexing, and serving products, collections, and variants.
- **Shop_UI**: The customer-facing catalog browsing interface (faceted filtering, sorting, pagination).
- **PDP**: Product Detail Page; the page presenting a single product with variants and purchase actions.
- **Narrative_Homepage**: The scroll-driven "university → corporate" homepage experience.
- **Cart_Service**: The component managing guest and user carts, including merge-on-login.
- **Auth_Service**: The authentication and session component built on Auth.js (email + phone OTP).
- **Checkout_Service**: The component orchestrating address capture, shipping selection, tax computation, and payment.
- **Payment_Service**: The component integrating Razorpay order creation, signature verification, and webhook handling.
- **Invoice_Service**: The component generating GST-compliant invoices.
- **Order_Service**: The component managing order lifecycle, status transitions, and fulfillment routing.
- **Admin_Panel**: The role-gated administrative interface.
- **AI_Engine**: The AI Design Auto-Generation Engine (slogan generation, moderation, mockup rendering, draft creation).
- **Moderation_Gate**: The automated content-policy enforcement component within the AI_Engine.
- **Mockup_Renderer**: The server-side component that composites slogan text onto blank-tee templates.
- **Review_Queue**: The admin interface where AI-generated drafts await human approval.
- **Fulfillment_Provider**: The adapter interface abstracting self-fulfillment and Print-on-Demand (POD).
- **Shipping_Service**: The component computing shipping rates and serviceability (manual at launch, aggregator later).
- **Notification_Service**: The component sending email, SMS, and WhatsApp messages.
- **Config_Service**: The component providing brand configuration, feature flags, tax settings, and shipping rules.
- **Tier**: A product bravery classification; one of SAFE ("Safe for Standup"), DIRECT ("Reply All"), or VERY_DIRECT ("Notice Period Energy").
- **Collection**: A themed grouping of products (e.g., "WFH vs WFO", "Operator").
- **Variant**: A purchasable SKU defined by product × color × size × fit.
- **Blank_Template**: A reusable garment mockup base with a defined print area used for compositing designs.
- **Design**: The output of the AI_Engine: a slogan plus rendered mockup, prior to becoming a published product.
- **Paise**: The integer subunit of INR used for all monetary storage and computation (1 INR = 100 paise).
- **Feature_Flag**: A configurable toggle controlling availability of a non-MVP capability.
- **Guest**: An unauthenticated visitor.
- **Customer**: An authenticated user with the CUSTOMER role.
- **Admin**: An authenticated user with the ADMIN role.
- **Owner_Input**: A value that must be supplied by the business owner and is not hardcoded.
- **DPDP**: India's Digital Personal Data Protection Act.
- **HSN**: Harmonized System of Nomenclature code used for GST classification.

## Requirements

### Requirement 1: Product Catalog and Taxonomy

**User Story:** As a merchandiser, I want products organized by bravery tier and themed collections, so that customers can discover shirts that match how boldly they want to broadcast their opinions.

#### Acceptance Criteria

1. THE Catalog_Service SHALL store each product with exactly one Tier value from the set {SAFE, DIRECT, VERY_DIRECT}.
2. THE Catalog_Service SHALL associate each product with exactly one Collection.
3. THE Catalog_Service SHALL support the "Operator" Collection and the themed collections defined in the seed data.
4. THE Catalog_Service SHALL store each product with a slug that is unique across all products and consists of between 1 and 200 characters.
5. THE Catalog_Service SHALL store each variant with a SKU that is unique across all variants and consists of between 1 and 64 characters.
6. THE Catalog_Service SHALL store each variant with a color attribute, a size attribute, and a fit attribute.
7. THE Catalog_Service SHALL store each product with a status from the set {DRAFT, PENDING_REVIEW, PUBLISHED, ARCHIVED}.
8. WHEN a customer-facing request retrieves products for display, THE Catalog_Service SHALL return only products with status PUBLISHED.
9. THE Catalog_Service SHALL store each product base price and each variant price override as an integer paise value greater than or equal to 0 and less than or equal to 99,999,999 paise.
10. THE Catalog_Service SHALL store the stock quantity for each variant as an integer greater than or equal to 0 and less than or equal to 1,000,000.
11. IF an attempt to store a product would result in a slug that duplicates an existing product's slug, THEN THE Catalog_Service SHALL reject the operation, retain the existing product unchanged, and return an error indicating the slug is already in use.
12. IF an attempt to store a variant would result in a SKU that duplicates an existing variant's SKU, THEN THE Catalog_Service SHALL reject the operation, retain the existing variant unchanged, and return an error indicating the SKU is already in use.

### Requirement 2: Faceted Shop Browsing

**User Story:** As a shopper, I want to filter and sort the catalog and share the resulting view via its URL, so that I can quickly find shirts and send links to friends.

#### Acceptance Criteria

1. THE Shop_UI SHALL provide filtering by tier, by collection, by color, by size, and by price range, where the price range is bounded between 0 and 999,999 INR.
2. THE Shop_UI SHALL provide sorting by newest, by price ascending, by price descending, and by best-selling, and SHALL default to sorting by newest when no sort selection is present in the URL.
3. WHEN a shopper applies a filter or sort, THE Shop_UI SHALL encode the active filter and sort selections in the page URL.
4. WHEN the Platform receives a request for a shop URL containing filter and sort parameters, THE Shop_UI SHALL render on the server the first page of PUBLISHED products matching the active filter and sort selections.
5. THE Shop_UI SHALL combine multiple active filters using logical AND, returning only products that satisfy every active filter.
6. IF a shop URL contains an unrecognized, malformed, or out-of-range filter or sort parameter, THEN THE Shop_UI SHALL ignore that parameter and render results using the remaining valid parameters.
7. WHEN filters match no products, THE Shop_UI SHALL display an empty-state message indicating no matching products and retain the active filter controls.
8. THE Shop_UI SHALL paginate catalog results at 24 products per page and emit canonical and rel prev/next links for each page.
9. WHEN a shopper opens a collection landing URL, THE Shop_UI SHALL display products belonging to that Collection.
10. THE Shop_UI SHALL render the first page of catalog results within the Core Web Vitals budgets defined in Requirement 24.

### Requirement 3: Product Detail Page

**User Story:** As a shopper, I want a rich product page with variant selection, sizing help, and shareable assets, so that I can confidently choose and buy the right shirt.

#### Acceptance Criteria

1. THE PDP SHALL display the product slogan, tier badge, and collection tag.
2. WHERE a product Tier equals VERY_DIRECT, THE PDP SHALL display a spicy indicator.
3. THE PDP SHALL provide color and size variant pickers presenting all colors and sizes offered for the product.
4. WHEN a shopper selects a variant combination whose stock quantity is 0, THE PDP SHALL display that combination as unavailable and disable the add-to-cart and buy-now actions for that combination.
5. THE PDP SHALL provide a size guide presenting chest and length measurements in centimeters for each offered size.
6. THE PDP SHALL provide add-to-cart, buy-now, and add-to-wishlist actions.
7. THE PDP SHALL display up to the Owner_Input-configured number of cross-sell products from the same Collection, excluding the current product.
8. THE PDP SHALL emit Product and Offer JSON-LD structured data.
9. WHEN a shopper requests the Instagram Story share asset for a product, THE PDP SHALL provide a pre-rendered story image for that product.
10. THE PDP SHALL display a trust row stating COD availability, the Owner_Input-configured returns window, secure Razorpay checkout, and the Owner_Input-configured dispatch time.
11. IF a shopper triggers add-to-cart or buy-now before selecting a complete variant combination, THEN THE PDP SHALL reject the action and prompt the shopper to select the remaining variant options.
12. IF the Instagram Story share asset for a product is not available, THEN THE PDP SHALL display a message indicating the share asset is unavailable.
13. WHERE a product has at least one approved review, THE PDP SHALL emit AggregateRating JSON-LD structured data.

### Requirement 4: Signature Scroll Narrative Homepage

**User Story:** As a first-time visitor, I want an immersive scroll story that takes me from university optimism into corporate reality, so that I understand and connect with the brand.

#### Acceptance Criteria

1. WHEN a visitor loads the homepage, THE Narrative_Homepage SHALL present the narrative acts in the fixed order: hook, university, descent, corporate reality, rebellion, footer call-to-action.
2. WHILE the visitor's browser reports prefers-reduced-motion set to reduce, THE Narrative_Homepage SHALL render static, non-animated sections in place of scroll-driven animations.
3. WHERE JavaScript is disabled, THE Narrative_Homepage SHALL render all narrative text content as readable static content.
4. THE Narrative_Homepage SHALL achieve a Largest Contentful Paint of less than 2.5 seconds on a simulated 4G connection.
5. THE Narrative_Homepage SHALL limit the JavaScript executed before hydration for the hero section to at most 200 kilobytes gzipped.
6. THE Narrative_Homepage SHALL code-split the GSAP and Three.js libraries and load them after the First Contentful Paint event.
7. WHERE the visitor's browser reports device memory below 4 gigabytes, fewer than 4 logical processor cores, an effective connection type slower than 4g, or prefers-reduced-motion set to reduce, THE Narrative_Homepage SHALL disable the Three.js 3D scene and render a static image in its place.
8. THE Narrative_Homepage SHALL make every product featured in the narrative reachable through the standard shop catalog.
9. WHERE JavaScript is disabled, THE Narrative_Homepage SHALL keep every featured product's detail-page link and add-to-cart action functional.
10. IF the GSAP or Three.js libraries fail to load within 5 seconds, THEN THE Narrative_Homepage SHALL render the static, non-animated sections in place of the scroll-driven animations.

### Requirement 5: Cart and Wishlist

**User Story:** As a shopper, I want my cart and wishlist to persist and follow me across guest and logged-in sessions, so that I don't lose my selections.

#### Acceptance Criteria

1. THE Cart_Service SHALL allow a guest to add variants to a cart identified by a session identifier, and SHALL constrain each cart line quantity to an integer from 1 to 99 inclusive.
2. THE Cart_Service SHALL allow a customer to add variants to a cart associated with the user account, and SHALL constrain each cart line quantity to an integer from 1 to 99 inclusive.
3. WHEN a guest with a non-empty cart logs in, THE Cart_Service SHALL merge the guest cart items into the user cart by summing the quantities of matching variants and capping each merged line quantity at the available stock for that variant.
4. WHEN a variant quantity in a cart line exceeds the available stock at checkout and the available stock is greater than zero, THE Cart_Service SHALL reduce the cart line quantity to the available stock and display a notification to the shopper indicating the adjusted quantity.
5. THE Cart_Service SHALL recompute cart line prices from current server-side variant prices at checkout.
6. WHERE a user is authenticated, THE Platform SHALL allow the user to add products to and remove products from a wishlist, and SHALL store at most one wishlist entry per product per user.
7. WHEN a guest attempts a wishlist action, THE Platform SHALL prompt the guest to sign in.
8. WHEN a cart line's variant has zero available stock at checkout, THE Cart_Service SHALL remove that line from the cart and display a notification to the shopper indicating the removal.
9. THE Cart_Service SHALL retain a guest cart associated with its session identifier for at least 30 days from the cart's last update.

### Requirement 6: Authentication and Accounts

**User Story:** As an India-based user, I want to sign in with my phone number or email, so that I can create an account and track my orders.

#### Acceptance Criteria

1. THE Auth_Service SHALL support authentication by email and authentication by phone one-time password.
2. IF a user requests a phone one-time password for a value that is not a valid 10-digit Indian mobile number, THEN THE Auth_Service SHALL reject the request and display an error indicating an invalid phone number.
3. WHEN a user requests a phone one-time password for a valid 10-digit Indian mobile number, THE Auth_Service SHALL generate a 6-digit numeric one-time password that expires 5 minutes after issuance and send it to the supplied phone number.
4. WHEN a user submits the correct one-time password within 5 minutes of its issuance, THE Auth_Service SHALL establish an authenticated session.
5. IF a user submits an incorrect one-time password, THEN THE Auth_Service SHALL reject the attempt, record the failed attempt, and display an error indicating the one-time password is incorrect, retaining any remaining attempts.
6. IF a user submits an incorrect one-time password 5 times for a single issued one-time password, THEN THE Auth_Service SHALL invalidate that one-time password and require the user to request a new one.
7. IF a user submits a one-time password more than 5 minutes after its issuance, THEN THE Auth_Service SHALL reject the attempt and display an error indicating the one-time password has expired.
8. THE Auth_Service SHALL store the session in an httpOnly secure cookie.
9. THE Auth_Service SHALL assign each user a role from the set {CUSTOMER, ADMIN}, defaulting to CUSTOMER.
10. THE Platform SHALL provide an account dashboard presenting the user's orders, addresses, wishlist, and profile.
11. WHEN a customer opens an order in the account dashboard, THE Order_Service SHALL display the order status, and SHALL display tracking information when tracking information is recorded on the order.
12. THE Auth_Service SHALL limit one-time password requests to at most 3 per phone number within any 10-minute window and SHALL enforce a minimum interval of 30 seconds between consecutive one-time password requests for the same phone number.
13. IF one-time password requests or authentication attempts for a single identifier exceed the configured rate limit, THEN THE Auth_Service SHALL reject the excess requests and display an error indicating too many attempts.

### Requirement 7: Checkout

**User Story:** As a shopper, I want a clear checkout that captures my address, shows costs, and lets me pay without forcing account creation, so that I can complete my purchase quickly.

#### Acceptance Criteria

1. THE Checkout_Service SHALL allow a Guest to complete checkout without requiring account creation by capturing a valid email address and a valid 10-digit Indian mobile number.
2. WHEN a shopper enters a valid 6-digit pincode during address entry that matches a known serviceable pincode, THE Checkout_Service SHALL populate the city and state associated with that pincode.
3. THE Checkout_Service SHALL present the order subtotal, discount, shipping charge, tax, and total as separate line items before payment.
4. WHEN a shopper applies a valid coupon code, THE Checkout_Service SHALL apply the corresponding discount to the order and SHALL cap the discount so that the resulting order total is not less than 0 paise.
5. IF a shopper applies a coupon code that is expired, inactive, or below its minimum subtotal, THEN THE Checkout_Service SHALL reject the coupon, leave the order total unchanged, and display an error indicating the reason for rejection.
6. THE Checkout_Service SHALL compute all monetary amounts in integer paise.
7. WHEN a shopper completes checkout, THE Order_Service SHALL create an order recording price snapshots for each line item.
8. THE Checkout_Service SHALL offer account creation after a successful guest purchase.
9. IF a Guest submits an email address that is not a valid email format or a phone number that is not a valid 10-digit Indian mobile number, THEN THE Checkout_Service SHALL reject the submission, retain the previously entered checkout details, and display an error indicating which field is invalid.
10. IF a shopper enters a pincode that is not a valid 6-digit number or does not match any known pincode, THEN THE Checkout_Service SHALL reject the pincode, leave the city and state fields empty, and display an error indicating the pincode is invalid or unrecognized.

### Requirement 8: Payments

**User Story:** As an India-based buyer, I want UPI-first Razorpay payments plus COD, with payments verified securely, so that I can pay how I prefer and trust the transaction.

#### Acceptance Criteria

1. WHEN a shopper initiates payment, THE Payment_Service SHALL create a Razorpay order with the amount equal to the order total expressed in integer paise before opening Razorpay Checkout.
2. THE Payment_Service SHALL present UPI as the top-ranked payment option, followed by cards, netbanking, and wallets.
3. WHEN the Payment_Service receives a payment success callback, THE Payment_Service SHALL verify the Razorpay signature on the server before marking the order paid.
4. IF the Razorpay signature verification fails, THEN THE Payment_Service SHALL reject the payment, leave the order in an unpaid state, and display an error indicating the payment could not be verified.
5. WHEN the Payment_Service receives a Razorpay webhook, THE Payment_Service SHALL verify the webhook signature and treat the verified webhook as the authoritative payment status.
6. WHEN the Payment_Service processes a webhook for an order whose status has already been applied, THE Payment_Service SHALL make no additional state change (idempotent handling).
7. THE Payment_Service SHALL store the Razorpay order identifier, payment identifier, signature, and payment method for each paid order.
8. WHERE COD is requested, THE Checkout_Service SHALL offer COD only when the delivery pincode is serviceable and the order value is greater than or equal to the configured COD minimum and less than or equal to the configured COD maximum.
9. THE Payment_Service SHALL NOT store card or UPI credentials.
10. IF creating the Razorpay order fails, THEN THE Payment_Service SHALL leave the order in an unpaid state and display an error indicating that payment could not be initiated.

### Requirement 9: GST-Compliant Invoicing

**User Story:** As a finance owner, I want GST-compliant invoices with configurable rates and HSN codes, so that the business meets India tax requirements.

#### Acceptance Criteria

1. THE Config_Service SHALL store GST rate configuration as an Owner_Input value between 0 and 28 percent that is editable in the Admin_Panel.
2. IF an admin submits a GST rate outside the range 0 to 28 percent, THEN THE Config_Service SHALL reject the change, retain the previous rate, and display an error indicating the rate is out of range.
3. THE Invoice_Service SHALL compute GST per order line item using the configured rate, in integer paise, rounding half up to the nearest paise.
4. WHERE the delivery address is within the seller's state, THE Invoice_Service SHALL present the tax breakup as CGST and SGST; WHERE the delivery address is in a different state, THE Invoice_Service SHALL present the tax breakup as IGST.
5. THE Invoice_Service SHALL generate an invoice containing the seller GSTIN, the HSN code for garments, and the tax breakup, with a unique invoice number.
6. THE Invoice_Service SHALL store the seller GSTIN as a 15-character value, and the legal entity name and address, as Owner_Input values.
7. THE Invoice_Service SHALL express all invoice monetary amounts in INR derived from stored paise values by dividing by 100 and presenting two decimal places.
8. WHEN an order is marked paid and no invoice already exists for that order, THE Invoice_Service SHALL generate the invoice for that order.

### Requirement 10: Order Management

**User Story:** As an admin, I want to view, update, and fulfill orders with tracking, so that I can operate the store.

#### Acceptance Criteria

1. THE Order_Service SHALL represent each order with a status from the set {CREATED, PAID, FULFILLING, SHIPPED, DELIVERED, CANCELLED, REFUNDED}.
2. WHEN an admin marks an order shipped and provides a non-empty tracking identifier and tracking URL, THE Order_Service SHALL record the tracking information and transition the order to SHIPPED, provided the order is in status PAID or FULFILLING.
3. WHEN an order transitions to PAID, THE Notification_Service SHALL send an order confirmation to the customer within 60 seconds.
4. THE Order_Service SHALL store an address snapshot and per-item price snapshots on each order.
5. THE Admin_Panel SHALL allow admins to filter orders by any status in the set {CREATED, PAID, FULFILLING, SHIPPED, DELIVERED, CANCELLED, REFUNDED} and by an inclusive creation-date range.
6. THE Admin_Panel SHALL allow admins to export the filtered orders as a CSV file containing one row per order with the order identifier, status, total, creation date, and customer contact.
7. WHEN an admin issues a refund for a PAID order, THE Payment_Service SHALL request the full-amount refund through Razorpay and, on success, THE Order_Service SHALL transition the order to REFUNDED.
8. THE Order_Service SHALL associate each order with a fulfillment mode from the set {SELF, POD}, defaulting to SELF.
9. IF an admin attempts to mark an order shipped without a tracking identifier or tracking URL, THEN THE Order_Service SHALL reject the action, leave the order status unchanged, and display an error indicating tracking information is required.
10. IF a refund request to Razorpay fails, THEN THE Order_Service SHALL leave the order status unchanged and display an error indicating the refund could not be completed.
11. IF a requested order status transition is not permitted from the order's current status, THEN THE Order_Service SHALL reject the transition and leave the order status unchanged.

### Requirement 11: Admin Panel

**User Story:** As the store owner, I want a role-gated, audit-logged admin panel to manage the entire store, so that only authorized staff can make changes and every change is traceable.

#### Acceptance Criteria

1. IF a request to any Admin_Panel route originates from a user whose role is not ADMIN, THEN THE Admin_Panel SHALL reject the request, perform no create, read, update, or delete operation, return an authorization error, and disclose no protected resource content.
2. WHEN an admin performs a create, update, or delete action, THE Admin_Panel SHALL write an immutable audit log entry recording the actor identifier, action type, entity type, entity identifier, and timestamp.
3. THE Admin_Panel SHALL provide a dashboard displaying, for the current calendar day in the Owner_Input store timezone, the revenue in INR, the order count, the top products ranked by units sold up to an Owner_Input count, the low-stock alerts for variants at or below the Owner_Input low-stock threshold, and the count of products in status PENDING_REVIEW.
4. THE Admin_Panel SHALL provide create, read, update, and delete operations for products and variants, including stock, price, images, tier, collection, and SEO fields.
5. THE Admin_Panel SHALL provide create, read, update, and delete operations for collections, including hero images and sort order.
6. THE Admin_Panel SHALL provide create, read, update, and delete operations for coupons, including usage statistics.
7. THE Admin_Panel SHALL provide create, read, update, and delete operations for blank templates, including mockup upload and print-area definition.
8. THE Admin_Panel SHALL provide management of homepage narrative content, FAQ content, and policy content.
9. THE Admin_Panel SHALL provide editing of shipping rules, GST configuration, brand configuration, and feature flags.
10. THE Admin_Panel SHALL rate-limit admin endpoints to an Owner_Input maximum number of requests per minute per admin, separate from customer endpoint rate limits.
11. IF admin requests exceed the configured admin rate limit, THEN THE Admin_Panel SHALL reject the excess requests and return an error indicating the rate limit has been exceeded.

### Requirement 12: AI Slogan Generation

**User Story:** As an admin, I want to generate original on-brand slogans with one click, so that I can ship new designs faster than competitors.

#### Acceptance Criteria

1. THE AI_Engine SHALL accept generation parameters including tier from the set {SAFE, DIRECT, VERY_DIRECT}, collection, count between 1 and 20, tone, and garment or color.
2. IF a generation request contains a count outside 1 to 20, an unknown tier, or a nonexistent collection, THEN THE AI_Engine SHALL reject the request and display an error indicating the invalid parameter.
3. WHEN an admin submits a valid generation request, THE AI_Engine SHALL request candidate slogans from the Claude API using a system prompt encoding the brand voice, tier definitions, moderation policy, and slogan-bank few-shot examples.
4. THE AI_Engine SHALL require candidate slogans to be returned as structured JSON and SHALL validate the response against a schema.
5. IF the Claude API response fails schema validation, THEN THE AI_Engine SHALL retry exactly once with a repair instruction, and IF validation fails again THEN THE AI_Engine SHALL reject the run, persist no slogans, and display an error.
6. IF the Claude API does not respond within 60 seconds or returns an error, THEN THE AI_Engine SHALL fail the run, persist no slogans, and display an error indicating generation could not be completed.
7. THE AI_Engine SHALL de-duplicate generated slogans against existing stored slogans using case-insensitive whitespace-normalized text comparison and an embedding cosine similarity threshold of at least 0.9.
8. THE AI_Engine SHALL read the Claude model identifier from configuration rather than a hardcoded value.
9. WHEN a generation run completes, THE AI_Engine SHALL record the token usage and cost for that run to the audit log.
10. THE AI_Engine SHALL rate-limit slogan-generation requests to at most 10 per admin within any 60-minute window, and IF the limit is exceeded THEN THE AI_Engine SHALL reject the request and display an error indicating too many requests.

### Requirement 13: Content Moderation Gate

**User Story:** As a brand owner, I want every slogan checked against a strict content policy, so that prohibited content never reaches customers.

#### Acceptance Criteria

1. WHEN the AI_Engine produces a candidate slogan, THE Moderation_Gate SHALL evaluate the slogan against the content policy before the slogan can enter the Review_Queue.
2. IF a slogan contains hate content, slurs, or targeting of a protected class, THEN THE Moderation_Gate SHALL auto-reject the slogan.
3. IF a slogan names or defames a real company, brand, or identifiable individual, THEN THE Moderation_Gate SHALL auto-reject the slogan.
4. IF a slogan contains sexual content, harassment, threats, self-harm content, or illegal-activity content, THEN THE Moderation_Gate SHALL auto-reject the slogan.
5. IF the moderation evaluation assigns a slogan a policy-violation confidence score greater than or equal to the Owner_Input review threshold and less than the Owner_Input auto-reject threshold, where both thresholds are values between 0.0 and 1.0 inclusive and the review threshold is less than the auto-reject threshold, THEN THE Moderation_Gate SHALL flag the slogan for human review and SHALL NOT auto-publish the slogan.
6. WHERE a slogan Tier equals VERY_DIRECT, THE Moderation_Gate SHALL route the slogan to human review regardless of automated outcome.
7. THE Moderation_Gate SHALL record each moderation decision, including the slogan, outcome, and reason, to the audit log.
8. THE Moderation_Gate SHALL NOT allow any slogan to be published without a human approval action.
9. WHEN the Moderation_Gate auto-rejects a slogan, THE Moderation_Gate SHALL exclude the slogan from the Review_Queue, prevent the slogan from being published, and record the rejection reason to the audit log.
10. WHEN the Moderation_Gate completes evaluation of a slogan and the slogan is neither auto-rejected nor flagged for human review, THE Moderation_Gate SHALL admit the slogan to the Review_Queue.
11. IF the Moderation_Gate does not complete evaluation of a slogan within 30 seconds or the evaluation fails, THEN THE Moderation_Gate SHALL withhold the slogan from the Review_Queue, prevent the slogan from being published, and record the evaluation failure to the audit log.

### Requirement 14: Mockup Rendering

**User Story:** As an admin, I want slogans automatically rendered onto blank-tee mockups, so that I can preview and publish designs without manual graphic work.

#### Acceptance Criteria

1. WHEN a slogan passes the Moderation_Gate, THE Mockup_Renderer SHALL select the Blank_Template whose garment attribute and color attribute match the requested garment and color.
2. THE Mockup_Renderer SHALL composite the slogan text onto the selected Blank_Template entirely within the print-area boundaries defined by the template's print-area configuration, with no rendered text extending beyond those boundaries.
3. THE Mockup_Renderer SHALL auto-fit the slogan text by selecting a font size between 12 and 144 points and inserting line breaks so that the rendered text fits entirely within the defined print area.
4. THE Mockup_Renderer SHALL produce a web preview image measuring at least 1000 pixels on its longest edge and SHALL record a placeholder reference for a high-resolution print-ready file to be generated at a later step.
5. WHEN a mockup is rendered, THE Mockup_Renderer SHALL store the rendered preview image in object storage and record the resulting storage URL on the associated Design and Product.
6. THE Mockup_Renderer SHALL provide at least two layout presets per Tier, including a monospace preset for the Operator Collection.
7. IF no Blank_Template matches the requested garment and color, THEN THE Mockup_Renderer SHALL render no mockup, persist no preview image, and return an error indicating that no matching template is available.
8. IF the slogan text cannot fit within the defined print area at the minimum font size of 12 points, THEN THE Mockup_Renderer SHALL produce no preview image and return an error indicating the slogan is too long for the print area.
9. IF storing a rendered preview image in object storage fails, THEN THE Mockup_Renderer SHALL record no storage URL on the Design or Product and return an error indicating the preview could not be stored.

### Requirement 15: AI Draft Creation and Review Queue

**User Story:** As an admin, I want AI-generated designs to arrive as drafts I can approve, edit, regenerate, or reject, so that I retain full editorial control.

#### Acceptance Criteria

1. WHEN a mockup is rendered for an approved-by-gate slogan, THE AI_Engine SHALL create a Design and a Product with status PENDING_REVIEW and the aiGenerated flag set true, along with default variants covering the Owner_Input default color, size, and fit combinations.
2. THE Review_Queue SHALL display each pending draft with its slogan, tier, mockup preview, and the risk flags recorded by the Moderation_Gate.
3. THE Review_Queue SHALL provide per-item actions to approve and publish, edit, regenerate the mockup, and reject.
4. WHEN an admin approves a draft whose product is in status PENDING_REVIEW, THE Catalog_Service SHALL transition the corresponding product to PUBLISHED.
5. WHEN an admin rejects a draft whose product is in status PENDING_REVIEW, THE Catalog_Service SHALL transition the corresponding product to ARCHIVED.
6. WHERE drafts have Tier SAFE and status PENDING_REVIEW, THE Review_Queue SHALL provide a bulk-approve action operating on at most 100 drafts per action.
7. THE Review_Queue SHALL prevent publication of any product still in status PENDING_REVIEW without an approval action.
8. WHEN an admin regenerates the mockup for a draft, THE Mockup_Renderer SHALL produce a new preview image and THE Review_Queue SHALL display the updated preview while keeping the product in status PENDING_REVIEW.
9. IF regenerating a draft's mockup fails, THEN THE Review_Queue SHALL retain the existing preview, keep the product in status PENDING_REVIEW, and display an error indicating the regeneration could not be completed.
10. IF an admin attempts to approve or reject a draft whose product is not in status PENDING_REVIEW, THEN THE Catalog_Service SHALL reject the action and leave the product status unchanged.

### Requirement 16: Print-on-Demand Seams

**User Story:** As an engineer, I want dormant POD seams built now behind an adapter, so that a POD provider can be wired later with a configuration change rather than a rewrite.

#### Acceptance Criteria

1. THE Platform SHALL define a Fulfillment_Provider adapter interface exposing product creation, order creation, shipping-rate retrieval, tracking retrieval, and webhook handling.
2. THE Platform SHALL provide an active self-fulfillment implementation of the Fulfillment_Provider interface.
3. THE Platform SHALL provide a stubbed POD implementation of the Fulfillment_Provider interface that makes no external network call and returns a "not configured" response for each operation.
4. THE Catalog_Service SHALL store a fulfillment mode of SELF or POD per product, defaulting to SELF.
5. THE Catalog_Service SHALL store a POD variant identifier field on each variant and a POD order identifier field on each order, each defaulting to unset.
6. WHERE the POD feature flag is disabled, THE Order_Service SHALL route all fulfillment through the self-fulfillment implementation.
7. WHERE the POD feature flag is enabled and a product's fulfillment mode is SELF, THE Order_Service SHALL route that product's fulfillment through the self-fulfillment implementation.
8. WHEN the POD feature flag is enabled, a product's fulfillment mode is POD, its order transitions to paid, and the order has no POD order identifier, THE Order_Service SHALL create the corresponding POD order through the POD implementation and record the returned POD order identifier on the order.
9. IF POD order creation fails, THEN THE Order_Service SHALL leave the POD order identifier unset, leave the order in the paid state, and record an error indicating the POD order could not be created.

### Requirement 17: Shipping and Serviceability

**User Story:** As a shopper, I want accurate shipping charges and confirmation that my pincode is serviceable, so that I know delivery cost and feasibility before paying.

#### Acceptance Criteria

1. WHEN an order subtotal in integer paise is below the configured free-shipping threshold, THE Shipping_Service SHALL apply the configured flat shipping charge; WHEN the order subtotal is greater than or equal to the threshold, THE Shipping_Service SHALL apply a zero shipping charge.
2. THE Config_Service SHALL store the free-shipping threshold and the flat shipping charge as Owner_Input integer paise values between 0 and 99,999,999 paise, editable in the Admin_Panel.
3. WHEN a shopper enters a valid 6-digit delivery pincode at checkout, THE Shipping_Service SHALL indicate within 3 seconds whether that pincode is serviceable.
4. WHERE the shipping-aggregator feature flag is enabled, THE Shipping_Service SHALL retrieve shipping rates and serviceability from the configured aggregator.
5. WHEN an order transitions to SHIPPED, THE Notification_Service SHALL send the tracking information to the customer by email within 60 seconds.
6. IF a delivery pincode is not serviceable, THEN THE Checkout_Service SHALL prevent progression to payment and display a message indicating the pincode is not serviceable.
7. IF the shipping aggregator does not respond within 10 seconds or returns an error, THEN THE Shipping_Service SHALL fall back to the configured flat shipping charge and the locally configured serviceable-pincode list.
8. WHERE the WhatsApp notification feature flag is enabled, WHEN an order transitions to SHIPPED, THE Notification_Service SHALL also send the tracking information by WhatsApp within 60 seconds.

### Requirement 18: Notifications

**User Story:** As a customer, I want timely order and account notifications, so that I stay informed about my purchases.

#### Acceptance Criteria

1. WHEN an order is confirmed as paid, THE Notification_Service SHALL send an order confirmation email to the order's captured email address within 60 seconds.
2. WHEN an order status transitions to SHIPPED, THE Notification_Service SHALL send a shipment notification containing the recorded tracking identifier and tracking URL within 60 seconds.
3. WHERE the WhatsApp notification feature flag is enabled, THE Notification_Service SHALL send the confirmation and shipment notifications by WhatsApp to the order's captured 10-digit Indian mobile number in addition to email.
4. IF a notification delivery attempt fails, THEN THE Notification_Service SHALL retry the delivery up to the Owner_Input maximum retry count.
5. IF a notification delivery still fails after the maximum retries, THEN THE Notification_Service SHALL record the terminal failure for monitoring without altering the order status.

### Requirement 19: SEO and Analytics

**User Story:** As a growth owner, I want strong SEO and funnel analytics, so that the store attracts organic traffic and I can measure conversion.

#### Acceptance Criteria

1. THE Platform SHALL render catalog and product pages such that the initial HTML response contains the rendered page content, using server-side rendering or incremental static regeneration.
2. THE Platform SHALL emit for catalog, collection, and product pages a page title of 1 to 60 characters, a meta description of 1 to 160 characters, and a canonical URL resolving to the absolute page URL.
3. THE Platform SHALL generate an XML sitemap covering only PUBLISHED products and active collections, excluding non-published items.
4. THE Platform SHALL integrate GA4 and PostHog for event and funnel tracking on the homepage, catalog, collection, and product pages.
5. WHEN a shopper views a product, adds to cart, begins checkout, or completes payment, THE Platform SHALL emit the corresponding analytics event to both GA4 and PostHog within 2 seconds.
6. THE Platform SHALL emit Open Graph metadata for catalog, collection, and product pages.
7. WHEN a product's or collection's publish state changes, THE Platform SHALL regenerate the XML sitemap within 300 seconds.
8. IF an analytics provider is unavailable, THEN THE Platform SHALL continue to serve the page and complete the shopper action without blocking on analytics delivery.

### Requirement 20: Growth Loops

**User Story:** As a growth owner, I want built-in referral, team-pack, newsletter, and abandoned-cart mechanics, so that the store grows through its customers.

#### Acceptance Criteria

1. WHEN a visitor submits a valid email address to subscribe to the newsletter, THE Platform SHALL record the subscription and its source and display a subscription confirmation.
2. WHERE the referral feature flag is enabled, WHEN a Customer requests a referral link, THE Platform SHALL issue a unique, single-use discount code valid for the recipient's first paid order.
3. THE Platform SHALL provide a team-pack purchase option that, WHEN the ordered quantity is at or above the Owner_Input-configured minimum, applies the Owner_Input-configured team-pack discount, capped so the order total is not less than 0 paise.
4. WHERE the abandoned-cart feature flag is enabled AND a cart with a captured contact remains unpaid past the Owner_Input-configured interval, THE Notification_Service SHALL send an abandoned-cart reminder to the captured contact, up to the Owner_Input-configured maximum number of reminders.
5. IF a visitor submits an email address that is not a valid email format to the newsletter, THEN THE Platform SHALL reject the submission and display an error indicating the email is invalid.
6. IF an email address is already subscribed to the newsletter, THEN THE Platform SHALL not create a duplicate subscription and SHALL display a confirmation that the address is subscribed.
7. WHEN a cart with a pending abandoned-cart reminder becomes paid or empty, THE Notification_Service SHALL cancel any further abandoned-cart reminders for that cart.

### Requirement 21: Legal and Compliance Pages

**User Story:** As a compliance owner, I want DPDP-aligned policy pages published as templates marked for legal review, so that the store meets India regulatory expectations without fabricating binding legal text.

#### Acceptance Criteria

1. THE Platform SHALL publish a privacy policy page, a terms of service page, a returns and refunds page, a shipping policy page, and a cookie notice page, and SHALL make each of these pages reachable from the site footer navigation on every page.
2. THE Platform SHALL display on each policy page a visible notice indicating the page is pending legal review, and SHALL continue to display that notice until the Owner_Input legal-approval marker for that page is set.
3. WHEN the Platform collects personal data from a user, THE Platform SHALL require an explicit affirmative consent action that is not pre-selected, SHALL state the purpose of collection at the point of consent, and SHALL record the consent event with a timestamp before collecting the data.
4. WHERE a user has previously granted consent for personal data collection, THE Platform SHALL provide a mechanism for that user to withdraw the consent.
5. THE Platform SHALL publish on the contact page the grievance officer's name, the grievance officer's email address, and the maximum time within which grievances are acknowledged, each sourced from Owner_Input values.
6. IF the Owner_Input legal text required for a policy page is not provided, THEN THE Platform SHALL render a clearly identifiable placeholder marker in place of the missing text, SHALL NOT generate binding legal language, and SHALL retain the pending-legal-review notice on that page.

### Requirement 22: Configuration and Feature Flags

**User Story:** As the owner, I want brand identity and every non-MVP capability controlled by configuration and feature flags, so that scope can expand safely without code changes.

#### Acceptance Criteria

1. THE Config_Service SHALL source the brand name of 1 to 100 characters, the logo, and the color tokens from configuration rather than hardcoded literals.
2. THE Config_Service SHALL provide a boolean feature flag, each defaulting to disabled, controlling the AI Studio, reviews, homepage 3D scene, POD, shipping aggregator, WhatsApp notifications, referral, and abandoned-cart capabilities.
3. WHERE a capability's feature flag is disabled, THE Platform SHALL omit that capability's entry points from the customer and admin interfaces.
4. IF a direct request targets a capability whose feature flag is disabled, THEN THE Platform SHALL reject the request, perform no action, and disclose no capability content.
5. THE Config_Service SHALL treat the slogan bank as seed data loaded at database seed time.
6. WHEN the Platform starts, THE Config_Service SHALL validate that the required brand configuration is present, and IF it is absent THEN THE Config_Service SHALL fail startup with an error identifying the missing configuration.
7. WHEN a feature flag value changes, THE Platform SHALL apply the new value within 60 seconds.

### Requirement 23: Security

**User Story:** As a security owner, I want input validation, secret hygiene, security headers, and rate limiting enforced everywhere, so that the platform and customer data are protected.

#### Acceptance Criteria

1. THE Platform SHALL validate every API request body, form submission, and webhook payload against a Zod schema before performing any processing or persistence on that input.
2. IF an input fails schema validation, THEN THE Platform SHALL reject the request before performing any processing, make no change to stored data, and return an error response indicating that the input failed validation and identifying the field or fields that are invalid.
3. THE Platform SHALL read all secrets from environment variables and SHALL NOT store secret values in source control.
4. THE Platform SHALL send a Content Security Policy header that allowlists the GSAP, Three.js, Razorpay, and analytics origins.
5. THE Platform SHALL send on every response an HSTS header with a max-age of at least 31,536,000 seconds, an X-Frame-Options header that denies framing by cross-origin sites, and a Referrer-Policy header.
6. THE Platform SHALL apply CSRF protection to every state-changing request.
7. THE Platform SHALL rate-limit authentication endpoints, one-time-password endpoints, and AI-generation endpoints to at most an Owner_Input maximum number of requests per identifier within an Owner_Input rolling time window, measured per source identifier.
8. THE Platform SHALL execute database queries through parameterized Prisma operations.
9. IF a state-changing request is missing a valid CSRF token, THEN THE Platform SHALL reject the request, make no state change, and return an error indicating the request failed CSRF validation.
10. IF requests to a rate-limited endpoint exceed the configured maximum for an identifier within the configured window, THEN THE Platform SHALL reject the excess requests, perform no processing for those requests, and return an error indicating too many requests.

### Requirement 24: Performance and Monitoring

**User Story:** As a performance owner, I want Core Web Vitals budgets met and errors monitored, so that the store is fast and reliable.

#### Acceptance Criteria

1. WHEN the homepage, catalog, or product page is measured at the 75th percentile of collected samples on a simulated 4G connection (1.6 Mbps downlink, 150 ms round-trip latency), THE Platform SHALL achieve a Largest Contentful Paint of less than 2.5 seconds.
2. WHEN the homepage, catalog, or product page is measured at the 75th percentile of collected samples on a simulated 4G connection (1.6 Mbps downlink, 150 ms round-trip latency), THE Platform SHALL achieve a Cumulative Layout Shift of less than 0.1.
3. WHEN the homepage, catalog, or product page is measured at the 75th percentile of collected samples on a simulated 4G connection (1.6 Mbps downlink, 150 ms round-trip latency), THE Platform SHALL achieve an Interaction to Next Paint of less than 200 milliseconds.
4. THE Platform SHALL serve all content images in AVIF or WebP format with explicit width and height attributes set on every image element.
5. WHEN a browser requests an image in a format it does not support, THE Platform SHALL serve a fallback image in a format the browser accepts.
6. WHEN a runtime error occurs in client-side or server-side code, THE Platform SHALL report the error to Sentry within 10 seconds, including the error type, stack trace, and request context.
7. IF reporting a runtime error to Sentry fails, THEN THE Platform SHALL retry delivery up to 3 times and SHALL NOT interrupt or block the user-facing request in progress.
8. WHEN a mobile Lighthouse audit is run on the homepage, catalog, or product page, THE Platform SHALL achieve a score of at least 90 in each of the performance, SEO, and accessibility categories.

### Requirement 25: DevOps, Migrations, and Testing

**User Story:** As an engineer, I want distinct environments, CI/CD, versioned migrations, seed data, and layered tests, so that changes ship safely and repeatably.

#### Acceptance Criteria

1. THE Platform SHALL provide distinct local, staging, and production environments, each using its own dedicated database instance and secret set, with no non-production environment sharing a database or secret with production.
2. THE Platform SHALL apply all database schema changes exclusively through version-controlled Prisma Migrate migration files, applied in recorded order per environment.
3. THE Platform SHALL provide a seed script that loads the slogan bank and blank templates.
4. WHEN a pull request is opened or updated, THE CI pipeline SHALL run linting, type checking, unit tests, end-to-end tests, and a Prisma migration check that verifies the committed migrations reproduce the current schema and detects un-migrated schema drift, and SHALL report a pass or fail outcome.
5. THE CI pipeline SHALL use Razorpay test keys for all non-production payment tests and SHALL NOT use production Razorpay keys in any non-production environment.
6. THE test suite SHALL include unit tests for pricing and tax computation, integration tests for payment and webhook handling, end-to-end tests for the browse-to-paid flow, and moderation-gate tests that verify prohibited slogans are blocked.
7. IF any CI check fails, THEN THE CI pipeline SHALL block merging of the pull request and report the failing check.
8. WHEN the seed script is run more than once against the same database, THE seed script SHALL not create duplicate slogan-bank or blank-template records.

### Requirement 26: Money and Currency Integrity

**User Story:** As a finance owner, I want all money handled as integer paise in INR, so that rounding errors and currency ambiguity never corrupt orders or invoices.

#### Acceptance Criteria

1. THE Platform SHALL store every monetary value as an integer paise amount between 0 and 9,999,999,999 inclusive.
2. THE Platform SHALL perform every monetary computation using integer paise arithmetic without floating-point representation.
3. WHEN a monetary computation produces a non-integer paise result, THE Platform SHALL round the result to the nearest paise, rounding halves up.
4. THE Platform SHALL set the currency of every order to INR at launch.
5. WHEN the Platform displays a monetary value, THE Platform SHALL divide the stored paise value by 100 and present exactly two decimal places without altering the stored value.
6. IF an attempt is made to store a monetary value that is not an integer or is outside the range 0 to 9,999,999,999 paise, THEN THE Platform SHALL reject the write, retain the prior value, and return an error indicating the monetary value is invalid.
