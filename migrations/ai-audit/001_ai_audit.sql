-- ─────────────────────────────────────────────────────────────────────────────
-- AI audit · 001 — reports written by the AI audit agents
--
-- One row per run: the daily checker (rule findings + a short AI summary),
-- the weekly operations & cost analyst and the monthly business report (both
-- sent through the Message Batches API; status 'pending' until collected).
--
-- Holds revenue and costs, so it is readable by NO logged-in user — RLS on,
-- no policies — only the server (service role), after checking the caller is
-- the super admin (Settings → AI audit). One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_audit_reports (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent          TEXT         NOT NULL CHECK (agent IN ('daily', 'weekly', 'monthly')),
  period_start   DATE         NOT NULL,
  period_end     DATE         NOT NULL,
  status         TEXT         NOT NULL DEFAULT 'done' CHECK (status IN ('pending', 'done', 'failed')),
  findings       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  report         TEXT,
  error          TEXT,
  model          TEXT,
  batch_id       TEXT,
  input_tokens   INTEGER      NOT NULL DEFAULT 0,
  output_tokens  INTEGER      NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(10,5) NOT NULL DEFAULT 0,
  triggered_by   TEXT         NOT NULL DEFAULT 'cron',     -- 'cron' | 'manual'
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_audit_reports_agent_created ON ai_audit_reports (agent, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_audit_reports_pending ON ai_audit_reports (status) WHERE status = 'pending';

ALTER TABLE ai_audit_reports ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: authenticated users can neither read nor write.

-- One-off run tokens for triggering /api/cron/ai-audit by hand (sha256 of the
-- token; deleted when used). Server only, like the reports.
CREATE TABLE IF NOT EXISTS ai_audit_run_tokens (
  token_hash  TEXT         PRIMARY KEY,
  expires_at  TIMESTAMPTZ  NOT NULL
);
ALTER TABLE ai_audit_run_tokens ENABLE ROW LEVEL SECURITY;
