# Auth & Roles — Supabase Migrations

Run in the Supabase SQL Editor in order. Idempotent.

| # | File | What it does |
|---|---|---|
| 0 | `000_create_roles_and_permissions.sql` | Creates `roles`, `modules`, `role_permissions`, `user_profiles`. Seeds 4 roles (admin / manager / front_desk / accountant), 6 modules (bookings / checkout / expenses / hr / reports / settings), and a sensible default permission matrix. Extends `history_log.entity_type` CHECK to allow `user`, `role`, `checkout`, `charge_item`. Backfills existing `auth.users` rows into `user_profiles` with the admin role. |

After running, verify:

```sql
SELECT slug, display_name FROM roles ORDER BY display_order;       -- 4 rows
SELECT slug, display_name FROM modules ORDER BY display_order;     -- 6 rows
SELECT count(*) FROM role_permissions;                             -- 24 rows (4 × 6)
SELECT email, role_id FROM user_profiles;                          -- 1+ rows (your admin)
```
