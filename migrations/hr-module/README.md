# HR Module — Supabase Migrations

Run these in the Supabase SQL Editor in order. Each is idempotent.

| # | File | What it does |
|---|---|---|
| 0 | `000_create_hr_tables.sql` | Creates the 10 HR tables (employees, salary_structures, leave_types + balances, attendance, salary_adjustments, loans, service_charge_payouts, payroll_runs, payroll_run_lines), seeds 4 default leave types, enables RLS, and extends the `history_log.entity_type` CHECK constraint to allow `employee`, `payroll_run`, `loan`. |

**Pre-requisite**: the expense module migrations (`migrations/expense-module/`) must already have been run, because the HR module references `expense_payees`, `expenses`, and `history_log`.

After running, verify:

```sql
SELECT * FROM leave_types;            -- 4 seed rows
SELECT count(*) FROM employees;       -- 0 (empty)
```
