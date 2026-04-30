# Checkout — Supabase Migrations

Run after the auth-roles migration.

| # | File | What it does |
|---|---|---|
| 0 | `000_create_checkout_tables.sql` | Creates `charge_categories` (seeded with food/beverage/damage/service/misc), `charge_items` (catalog), `checkouts` (one per booking), `checkout_charges`, `checkout_payments`. Extends `bookings.status` to allow `checked_out` (handles both CHECK and ENUM cases). |

After running:

```sql
SELECT slug FROM charge_categories ORDER BY display_order;   -- 5 rows
```
