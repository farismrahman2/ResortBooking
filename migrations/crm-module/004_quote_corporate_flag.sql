-- ============================================================================
-- Corporate-booking flag on quotes + bookings.
--
-- Lets the agent mark a quote as corporate at creation time (Square Pharma
-- offsite, BRAC training, bank conference). Three columns:
--   is_corporate         BOOLEAN  — drives badges, filters, analytics buckets
--   company_name         TEXT     — what the guest/staff sees on the quote
--   corporate_account_id UUID     — optional FK to crm_accounts when the
--                                   company already exists in CRM; lets
--                                   corporate analytics align across modules
--
-- CHECK constraint: is_corporate=true requires a non-empty company_name.
-- Partial indexes on the true rows only (skip retail bookings, which are the
-- majority).
--
-- One-shot backfill: every existing booking with source_module='crm_handoff'
-- is corporate by definition — set is_corporate, copy the linked
-- opportunity → account's company_name and id.
-- ============================================================================

-- 1. Columns
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS is_corporate          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_name          TEXT,
  ADD COLUMN IF NOT EXISTS corporate_account_id  UUID REFERENCES crm_accounts(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_corporate          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_name          TEXT,
  ADD COLUMN IF NOT EXISTS corporate_account_id  UUID REFERENCES crm_accounts(id) ON DELETE SET NULL;

-- 2. CHECK constraints — corporate rows must have a company name
ALTER TABLE quotes   DROP CONSTRAINT IF EXISTS quotes_corporate_needs_name;
ALTER TABLE quotes   ADD  CONSTRAINT quotes_corporate_needs_name
  CHECK (is_corporate = false OR (company_name IS NOT NULL AND length(trim(company_name)) > 0));
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_corporate_needs_name;
ALTER TABLE bookings ADD  CONSTRAINT bookings_corporate_needs_name
  CHECK (is_corporate = false OR (company_name IS NOT NULL AND length(trim(company_name)) > 0));

-- 3. Partial indexes — only corporate rows, since most bookings are retail
CREATE INDEX IF NOT EXISTS idx_bookings_is_corporate
  ON bookings(is_corporate) WHERE is_corporate = true;
CREATE INDEX IF NOT EXISTS idx_quotes_is_corporate
  ON quotes(is_corporate)   WHERE is_corporate = true;

-- 4. Backfill from CRM handoffs. For bookings created by lib/actions/crm.ts::
--    markWon, source_module='crm_handoff' and source_id=opportunity.id. The
--    opportunity carries the account_id which carries the company_name.
UPDATE bookings b
   SET is_corporate         = true,
       company_name         = a.company_name,
       corporate_account_id = a.id
  FROM crm_opportunities o
  JOIN crm_accounts      a ON a.id = o.account_id
 WHERE b.source_module = 'crm_handoff'
   AND b.source_id::uuid = o.id
   AND b.is_corporate = false;

-- Sanity check — should equal the count of crm_handoff bookings
SELECT
  (SELECT COUNT(*) FROM bookings WHERE is_corporate = true)                AS corporate_bookings,
  (SELECT COUNT(*) FROM bookings WHERE source_module = 'crm_handoff')      AS crm_handoff_bookings;
