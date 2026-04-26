# Expense Module — Migrations

Run these in order in the **Supabase SQL editor**:

| File | Purpose | Notes |
|---|---|---|
| `000_extend_entity_type_enum.sql` | Allows `'expense'` as a value in `history_log.entity_type` (drops the existing CHECK constraint and recreates it with `'expense'` added) | Despite the file name, `entity_type` is a TEXT column with a CHECK constraint, not a Postgres ENUM. The migration is idempotent. |
| `001_expense_schema.sql` | Creates all six tables, indexes, triggers, RLS policies | Run after 000. |
| `002_seed_categories_and_payees.sql` | Seeds default categories, payees, recurring templates | Idempotent — safe to re-run. |
| `003_expense_pivot_rpc.sql` | Adds the `get_expense_daily_pivot` RPC used by the monthly report and analytics queries | Phase 2. Safe to run any time. |
| `004_storage_bucket.sql` | RLS policies for the `expense-receipts` Storage bucket | Phase 3. **First create the bucket in the Supabase Dashboard (Storage → New bucket → name `expense-receipts` → Private), then run this SQL.** |

After 000–002 are committed, the Phase 1 pages (`/expenses`, `/expenses/new`, `/expenses/bulk`, `/expenses/categories`, `/expenses/payees`) will work. Run 003 to enable `/expenses/report` and `/expenses/analytics`. Run 004 + create the Storage bucket to enable receipt uploads on expense detail pages and the `/expenses/budgets`, `/expenses/recurring`, `/expenses/drafts` pages.

## Storage bucket (Phase 3)

Phase 3 also requires a Supabase Storage bucket. In the Supabase Dashboard:

1. **Storage → Create bucket** → name: `expense-receipts` → **Private** (not public).
2. Run the four storage RLS policies from spec section 4 / Migration C.

Phase 1 doesn't need the bucket — it's not used until receipts ship.
