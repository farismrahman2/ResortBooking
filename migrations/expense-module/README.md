# Expense Module — Migrations

Run these in order in the **Supabase SQL editor**:

| File | Purpose | Notes |
|---|---|---|
| `000_extend_entity_type_enum.sql` | Adds `'expense'` to the `entity_type` enum | **Run alone.** Postgres requires `ALTER TYPE … ADD VALUE` to commit before the new value is usable. |
| `001_expense_schema.sql` | Creates all six tables, indexes, triggers, RLS policies | Run after 000. |
| `002_seed_categories_and_payees.sql` | Seeds default categories, payees, recurring templates | Idempotent — safe to re-run. |

After all three are committed, the app's expense pages (`/expenses/*`) will work.

## Storage bucket (Phase 3)

Phase 3 also requires a Supabase Storage bucket. In the Supabase Dashboard:

1. **Storage → Create bucket** → name: `expense-receipts` → **Private** (not public).
2. Run the four storage RLS policies from spec section 4 / Migration C.

Phase 1 doesn't need the bucket — it's not used until receipts ship.
