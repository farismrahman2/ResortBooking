-- ─────────────────────────────────────────────────────────────────────────────
-- Platform audit · 005 — Garden Centre's REAL accounts, wallets and terminals
--
-- Two bank accounts (EBL, Brac) and three POS card machines (EBL, UCB, City
-- Bank). From here on a card payment or a bank transfer must name which one it
-- landed in — "৳50,000 by card" can't be matched against a statement, but
-- "৳50,000 on the UCB POS" can.
--
-- Self-contained: safe to run whether or not 004 has been applied. If 004 never
-- ran, this creates the table and the payment columns too.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table + payment columns (no-ops if 004 already ran) ─────────────────────
CREATE TABLE IF NOT EXISTS payment_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  method        TEXT NOT NULL CHECK (method IN
                  ('cash','bkash','nagad','rocket','card','bank_transfer','other')),
  account_ref   TEXT,
  bank_name     TEXT,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_method ON payment_accounts(method) WHERE is_active;

ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='payment_accounts' AND policyname='p_payment_accounts_auth'
  ) THEN
    CREATE POLICY p_payment_accounts_auth ON payment_accounts
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE booking_advance_payments
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL;
ALTER TABLE checkout_payments
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_last4 TEXT;
ALTER TABLE coffee_shop_sale_payments
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_last4 TEXT;

CREATE INDEX IF NOT EXISTS idx_adv_payments_account ON booking_advance_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_co_payments_account  ON checkout_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_cs_payments_account  ON coffee_shop_sale_payments(account_id);

-- 2. "Where does an advance of this tender go?" ──────────────────────────────
--    Advances by bank transfer are always EBL, so the app resolves the
--    destination itself rather than asking the agent. One default per tender.
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS is_advance_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_accounts_advance_default
  ON payment_accounts(method) WHERE is_advance_default;

-- 3. Re-point 004's generic starters before inserting the real ones ──────────
--    'Bank Account' becomes EBL: every bank transfer taken so far was EBL, and
--    renaming in place keeps the payments already attached to it.
UPDATE payment_accounts
   SET display_name = 'EBL Bank',
       bank_name    = 'Eastern Bank PLC',
       notes        = 'Main current account. Advances by bank transfer land here.',
       display_order = 30
 WHERE display_name = 'Bank Account' AND method = 'bank_transfer';

--    The generic card row can't be assumed to be any one of the three machines,
--    so it is retired rather than renamed. Historic card payments keep pointing
--    at it and show up as "POS — unassigned" in the transaction report, where
--    accounts can reassign them terminal by terminal.
UPDATE payment_accounts
   SET display_name = 'POS — unassigned (historic)',
       is_active    = false,
       notes        = 'Card payments recorded before the three terminals were separated. Reassign from the Payment Transactions report.',
       display_order = 900
 WHERE display_name = 'Card / POS Terminal' AND method = 'card';

UPDATE payment_accounts SET display_order = 10 WHERE display_name = 'Cash Drawer';
UPDATE payment_accounts SET display_order = 20 WHERE display_name = 'bKash Merchant';

-- 4. The real accounts ───────────────────────────────────────────────────────
--    Insert-where-missing so re-running this file changes nothing. Fill in the
--    account / terminal numbers in Settings → Payment accounts.
INSERT INTO payment_accounts (display_name, method, bank_name, notes, display_order)
SELECT v.display_name, v.method, v.bank_name, v.notes, v.display_order
  FROM (VALUES
    ('Cash Drawer',    'cash',          NULL,                          'Physical cash taken at the desk',        10),
    ('bKash Merchant', 'bkash',         'bKash',                       'Add the merchant number in Settings',    20),
    ('EBL Bank',       'bank_transfer', 'Eastern Bank PLC',            'Advances by bank transfer land here',     30),
    ('Brac Bank',      'bank_transfer', 'BRAC Bank PLC',               NULL,                                      40),
    ('EBL POS',        'card',          'Eastern Bank PLC',            'Card terminal — add the terminal ID',     50),
    ('UCB POS',        'card',          'United Commercial Bank PLC',  'Card terminal — add the terminal ID',     60),
    ('City Bank POS',  'card',          'City Bank PLC',               'Card terminal — add the terminal ID',     70)
  ) AS v(display_name, method, bank_name, notes, display_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM payment_accounts p
    WHERE lower(p.display_name) = lower(v.display_name) AND p.method = v.method
 );

-- 5. Advance destinations: bank transfer → EBL, bKash → the merchant wallet ──
UPDATE payment_accounts SET is_advance_default = false
 WHERE is_advance_default AND method IN ('bank_transfer', 'bkash');

UPDATE payment_accounts SET is_advance_default = true
 WHERE method = 'bank_transfer' AND display_name = 'EBL Bank';
UPDATE payment_accounts SET is_advance_default = true
 WHERE method = 'bkash' AND display_name = 'bKash Merchant';

-- 6. Backfill history for the tenders that have exactly one destination ──────
--    Cash and bKash have one home each, so their unassigned payments can be
--    attributed safely. Card and bank transfer are deliberately NOT backfilled
--    beyond what step 3 preserved — guessing which of three terminals took a
--    payment would put a wrong line on a statement, which is worse than a
--    blank one.
UPDATE booking_advance_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE a.method = p.method AND p.account_id IS NULL
   AND p.method IN ('cash', 'bkash', 'nagad', 'rocket')
   AND (SELECT count(*) FROM payment_accounts x WHERE x.method = p.method AND x.is_active) = 1;

UPDATE checkout_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE a.method = p.method AND p.account_id IS NULL
   AND p.method IN ('cash', 'bkash', 'nagad', 'rocket')
   AND (SELECT count(*) FROM payment_accounts x WHERE x.method = p.method AND x.is_active) = 1;

UPDATE coffee_shop_sale_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE a.method = p.method AND p.account_id IS NULL
   AND p.method IN ('cash', 'bkash', 'nagad', 'rocket')
   AND (SELECT count(*) FROM payment_accounts x WHERE x.method = p.method AND x.is_active) = 1;

--    Advances by bank transfer are always EBL — historic ones included.
UPDATE booking_advance_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE a.method = 'bank_transfer' AND a.display_name = 'EBL Bank'
   AND p.method = 'bank_transfer' AND p.account_id IS NULL;
