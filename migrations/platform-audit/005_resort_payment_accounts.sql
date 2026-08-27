-- ─────────────────────────────────────────────────────────────────────────────
-- Platform audit · 005 — Garden Centre's REAL accounts, wallets and terminals
--
-- Two bank accounts (EBL, Brac) and three POS card machines (EBL, UCB, City
-- Bank). From here on a card payment or a bank transfer must name which one it
-- landed in — "৳50,000 by card" can't be matched against a statement, but
-- "৳50,000 on the City Bank POS" can.
--
-- Historic payments are attributed from the `reference` field, where the desk
-- has been typing the machine / bank name all along ("EBL", "City Bank",
-- "BRAC BANK PLC"). Anything that doesn't name one is left unassigned rather
-- than guessed at — a wrong line on a statement is worse than a blank one.
--
-- Safe to re-run: every step is idempotent.
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

-- Payment tables get their account link. Guarded so a project missing one of
-- these tables still runs the rest of the file.
DO $$ BEGIN
  IF to_regclass('public.booking_advance_payments') IS NOT NULL THEN
    ALTER TABLE booking_advance_payments
      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_adv_payments_account ON booking_advance_payments(account_id);
  END IF;
  IF to_regclass('public.checkout_payments') IS NOT NULL THEN
    ALTER TABLE checkout_payments
      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS card_last4 TEXT;
    CREATE INDEX IF NOT EXISTS idx_co_payments_account ON checkout_payments(account_id);
  END IF;
  IF to_regclass('public.coffee_shop_sale_payments') IS NOT NULL THEN
    ALTER TABLE coffee_shop_sale_payments
      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS card_last4 TEXT;
    CREATE INDEX IF NOT EXISTS idx_cs_payments_account ON coffee_shop_sale_payments(account_id);
  END IF;
END $$;

-- 2. "Where does an advance of this tender go?" ──────────────────────────────
--    Advances by bank transfer are always EBL, so the app resolves the
--    destination itself rather than asking the agent. One default per tender.
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS is_advance_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_accounts_advance_default
  ON payment_accounts(method) WHERE is_advance_default;

-- 3. The real accounts ───────────────────────────────────────────────────────
--    Insert-where-missing, so re-running changes nothing. Put the account and
--    terminal numbers in Settings → Payment accounts afterwards.
INSERT INTO payment_accounts (display_name, method, bank_name, notes, display_order)
SELECT v.display_name, v.method, v.bank_name, v.notes, v.display_order
  FROM (VALUES
    ('Cash Drawer',    'cash',          NULL,                         'Physical cash taken at the desk',     10),
    ('bKash Merchant', 'bkash',         'bKash',                      'Add the merchant number in Settings', 20),
    ('EBL Bank',       'bank_transfer', 'Eastern Bank PLC',           'Advances by bank transfer land here', 30),
    ('Brac Bank',      'bank_transfer', 'BRAC Bank PLC',              NULL,                                  40),
    ('EBL POS',        'card',          'Eastern Bank PLC',           'Card terminal — add the terminal ID', 50),
    ('UCB POS',        'card',          'United Commercial Bank PLC', 'Card terminal — add the terminal ID', 60),
    ('City Bank POS',  'card',          'City Bank PLC',              'Card terminal — add the terminal ID', 70)
  ) AS v(display_name, method, bank_name, notes, display_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM payment_accounts p
    WHERE lower(p.display_name) = lower(v.display_name) AND p.method = v.method
 );

-- Keep the two starters 004 created at the top of the list.
UPDATE payment_accounts SET display_order = 10 WHERE display_name = 'Cash Drawer';
UPDATE payment_accounts SET display_order = 20 WHERE display_name = 'bKash Merchant';

-- 4. Advance destinations: bank transfer → EBL, bKash → the merchant wallet ──
UPDATE payment_accounts SET is_advance_default = false
 WHERE is_advance_default AND method IN ('bank_transfer', 'bkash');

UPDATE payment_accounts SET is_advance_default = true
 WHERE method = 'bank_transfer' AND display_name = 'EBL Bank';
UPDATE payment_accounts SET is_advance_default = true
 WHERE method = 'bkash' AND display_name = 'bKash Merchant';

-- 5. Attribute history from what the desk already wrote in `reference` ───────
--    Card payments carry "EBL" / "City Bank" / "city"; bank transfers carry
--    "EBL" / "BRAC BANK PLC". Matching on that is evidence, not a guess.
--    Anything with a blank or unrecognised reference is deliberately skipped.
UPDATE checkout_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE p.method = 'card' AND a.display_name = 'EBL POS'
   AND p.reference ILIKE '%ebl%';

UPDATE checkout_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE p.method = 'card' AND a.display_name = 'City Bank POS'
   AND p.reference ILIKE '%city%';

UPDATE checkout_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE p.method = 'card' AND a.display_name = 'UCB POS'
   AND (p.reference ILIKE '%ucb%' OR p.reference ILIKE '%united commercial%');

UPDATE checkout_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE p.method = 'bank_transfer' AND a.display_name = 'EBL Bank'
   AND p.reference ILIKE '%ebl%';

UPDATE checkout_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE p.method = 'bank_transfer' AND a.display_name = 'Brac Bank'
   AND p.reference ILIKE '%brac%';

--    Advances by bank transfer are always EBL — historic ones included.
UPDATE booking_advance_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE p.method = 'bank_transfer' AND a.display_name = 'EBL Bank'
   AND p.account_id IS NULL;

--    Cash and the mobile wallets have one home each, so those are unambiguous.
UPDATE checkout_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE a.method = p.method AND p.account_id IS NULL
   AND p.method IN ('cash','bkash','nagad','rocket')
   AND (SELECT count(*) FROM payment_accounts x WHERE x.method = p.method AND x.is_active) = 1;

UPDATE booking_advance_payments p SET account_id = a.id
  FROM payment_accounts a
 WHERE a.method = p.method AND p.account_id IS NULL
   AND p.method IN ('cash','bkash','nagad','rocket')
   AND (SELECT count(*) FROM payment_accounts x WHERE x.method = p.method AND x.is_active) = 1;

DO $$ BEGIN
  IF to_regclass('public.coffee_shop_sale_payments') IS NOT NULL THEN
    UPDATE coffee_shop_sale_payments p SET account_id = a.id
      FROM payment_accounts a
     WHERE a.method = p.method AND p.account_id IS NULL
       AND p.method IN ('cash','bkash','nagad','rocket')
       AND (SELECT count(*) FROM payment_accounts x WHERE x.method = p.method AND x.is_active) = 1;
  END IF;
END $$;

-- 6. Retire 004's generic rows ───────────────────────────────────────────────
--    Whatever step 5 could attribute has already moved off them; what is left
--    is the payments whose reference named nothing. Those keep a home so the
--    money is never lost, under a name that says exactly what they are, and
--    the row is deactivated so it can't be picked for anything new.
UPDATE payment_accounts
   SET display_name = 'POS — unassigned (historic)',
       is_active    = false,
       notes        = 'Card payments taken before the three terminals were separated, whose reference did not name a machine. Reassign from the Payment Transactions report.',
       display_order = 900
 WHERE display_name = 'Card / POS Terminal' AND method = 'card';

UPDATE payment_accounts
   SET display_name = 'Bank — unassigned (historic)',
       is_active    = false,
       notes        = 'Bank transfers taken before EBL and Brac were separated, whose reference did not name a bank. Reassign from the Payment Transactions report.',
       display_order = 910
 WHERE display_name = 'Bank Account' AND method = 'bank_transfer';
