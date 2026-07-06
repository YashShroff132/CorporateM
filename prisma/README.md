# Prisma

Database schema, migrations, and seed script.

- `schema.prisma` — data models (all money columns are `Int` paise)
- `migrations/` — version-controlled Prisma Migrate files
- `seed.ts` — idempotent loader for slogan bank and blank templates (added in task 30.1)

## Data layer (task 2.1)

The schema defines all enums and models: `Product`, `Variant`, `Collection`,
`Review`, `User`, `Address`, `WishlistItem`, `Cart`, `CartLine`, `Otp`, `Order`,
`Invoice`, `Coupon`, `Design`, `BlankTemplate`, `SloganBankEntry`, `AuditLog`,
`ConsentEvent`, `NewsletterSub`.

Invariants encoded:

- All monetary columns are `Int` paise (Req 26.1, 1.9).
- Uniqueness constraints: product `slug`, variant `sku`, `Invoice.invoiceNumber`,
  `NewsletterSub.email`, `(userId, productId)` wishlist, `(productId, color, size, fit)`
  variant tuple, and seed keys (`SloganBankEntry.text`, `(garment, color, preset)`).
- POD identifier fields default unset (Req 16.5); `AuditLog` is append-only (Req 11.2).

### Initial migration

The versioned migration lives in `migrations/<timestamp>_init/migration.sql`
alongside `migrations/migration_lock.toml` (provider `postgresql`).

It was generated without a live database using:

```
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

Because it is produced directly from `schema.prisma`, it reproduces the schema
exactly. `prisma validate` passes and `prisma generate` produces the client.

To apply the migration against a real database (records it in `_prisma_migrations`):

```
npx prisma migrate deploy      # apply committed migrations in order
# or, during local development:
npx prisma migrate dev
```
