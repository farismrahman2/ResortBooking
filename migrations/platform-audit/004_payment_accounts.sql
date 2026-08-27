-- ─────────────────────────────────────────────────────────────────────────────
-- Platform audit · 004 — WHERE the money landed
--
-- "৳1,069,679 by card" cannot be matched against a statement. A bank statement
-- is per ACCOUNT: this card slip settled into the City Bank POS account, that
-- transfer hit the Brac current account, that bKash payment landed in the
-- merchant wallet. Method alone can never reconcile; destination account can.
--
-- Every payment — advance instalment, checkout payment, coffee-shop tender —
-- now names the account it landed in, plus (for cards) the last four digits
-- for dispute lookups. Combined with the reference/slip number and the guest
-- on the booking, each line in the transaction report can be ticked off
-- against one line on one statement.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. The resort's own accounts, wallets and terminals
CREATE TABLE IF NOT EXISTS payment_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  /** Which tender normally lands here — drives the default selection. */
  method        TEXT NOT NULL CHECK (method IN
                  ('cash','bkash','nagad','rocket','card','bank_transfer','other')),
  /** Bank/wallet identity: account number, wallet number, terminal ID. */
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

-- 2. Starter accounts — rename them in Settings → Payment accounts, and add
--    one row per real bank account / POS terminal you hold.
INSERT INTO payment_accounts (display_name, method, notes, display_order) VALUES
  ('Cash Drawer',           'cash',          'Physical cash taken at the desk', 10),
  ('bKash Merchant',        'bkash',         'Rename with the merchant number', 20),
  ('Card / POS Terminal',   'card',          'Rename with the acquiring bank + terminal ID', 30),
  ('Bank Account',          'bank_transfer', 'Rename with the bank + account number', 40)
ON CONFLICT DO NOTHING;

-- 3. Every payment names its destination
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

-- 4. Backfill history to the single seeded account for each method. Safe while
--    there is exactly one account per method (true right after this runs);
--    reassign afterwards if a payment actually landed somewhere else.
UPDATE booking_advance_payments p SET account_id = a.id
FROM payment_accounts a WHERE a.method = p.method AND p.account_id IS NULL;
UPDATE checkout_payments p SET account_id = a.id
FROM payment_accounts a WHERE a.method = p.method AND p.account_id IS NULL;
UPDATE coffee_shop_sale_payments p SET account_id = a.id
FROM payment_accounts a WHERE a.method = p.method AND p.account_id IS NULL;
