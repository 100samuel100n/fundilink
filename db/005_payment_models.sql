-- =========================================================================
-- 005: real M-Pesa + the two payment models
--   Model 1 "escrow": customer pays the platform in-app, platform pays the professional out (B2C) after confirmation.
--   Model 2 "direct": customer pays the professional on site; commission is taken from the professional's prepaid wallet.
-- Safe to re-run.
-- =========================================================================

-- ---- payment intents: more purposes, receipts, failure reasons, frozen split ----
ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_purpose_check;
ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_purpose_check
  CHECK (purpose IN ('booking','milestone','subscription','activation','equipment_deposit','wallet_topup','addon'));
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS provider_receipt text;          -- e.g. the M-Pesa receipt number RCK7XYZ123
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS phone text;                      -- 2547XXXXXXXX that was prompted
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS result_code int;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS split jsonb;                     -- {gross,net,revenue,tax} frozen when paid; refunds use this
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS payment_intents_pending ON payment_intents (status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS payment_intents_booking ON payment_intents (booking_id, purpose, status);

-- ---- bookings: which model, and how a direct job was paid ----
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'escrow' CHECK (payment_mode IN ('escrow','direct'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS direct_method text CHECK (direct_method IN ('cash','mpesa'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_charged_at timestamptz;       -- direct jobs: when the wallet was debited
CREATE INDEX IF NOT EXISTS bookings_mode ON bookings (payment_mode, status);

-- the customer's proof of payment to the professional on direct jobs
CREATE TABLE IF NOT EXISTS direct_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  recorded_by uuid NOT NULL REFERENCES users(id),
  method text NOT NULL CHECK (method IN ('cash','mpesa')),
  amount bigint NOT NULL CHECK (amount > 0),
  reference text,                                   -- M-Pesa receipt the professional received, when paid by M-Pesa
  recorded_at timestamptz NOT NULL DEFAULT now(),
  customer_confirmed_at timestamptz
);

-- ---- professionals: which models they offer ----
ALTER TABLE professional_profiles ADD COLUMN IF NOT EXISTS accepts_direct_payment boolean NOT NULL DEFAULT true;
ALTER TABLE professional_profiles ADD COLUMN IF NOT EXISTS accepts_escrow_payment boolean NOT NULL DEFAULT true;

-- ---- add-ons (extra work during a job) ----
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','withdrawn'));
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS extra_total bigint;               -- what the customer pays for the extra work
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS extra_commission bigint;
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS extra_net bigint;
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'none' CHECK (payment_status IN ('none','due','paid'));
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS payment_intent_id uuid REFERENCES payment_intents(id);
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS evidence_keys text[] NOT NULL DEFAULT '{}';
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE quotation_revisions ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '3 hours');
ALTER TABLE booking_items ADD COLUMN IF NOT EXISTS revision_id uuid REFERENCES quotation_revisions(id);
-- existing rows: keep their history coherent
UPDATE quotation_revisions SET status = COALESCE(customer_decision, 'pending') WHERE status = 'pending' AND customer_decision IS NOT NULL;
CREATE INDEX IF NOT EXISTS quotation_revisions_booking ON quotation_revisions (booking_id, status);
ALTER TABLE booking_attachments DROP CONSTRAINT IF EXISTS booking_attachments_purpose_check;
ALTER TABLE booking_attachments ADD CONSTRAINT booking_attachments_purpose_check CHECK (purpose IN ('problem','completion_evidence','quotation','other','addon_evidence'));

-- ---- settlements and refunds are now asynchronous (B2C and reversal results arrive by callback) ----
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS provider_receipt text;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS provider_ref text;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS provider_receipt text;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS system_initiated boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS settlements_provider_ref ON settlements (provider_ref);
CREATE INDEX IF NOT EXISTS refunds_provider_ref ON refunds (provider_ref);

-- ---- wallet reads are by ledger account ----
CREATE INDEX IF NOT EXISTS ledger_entries_account_tx ON ledger_entries (account, transaction_id);

-- ---- platform settings (all amounts in cents) ----
INSERT INTO platform_settings (key, value) VALUES
  ('payments.escrow_enabled', 'true'),
  ('payments.direct_enabled', 'true'),
  ('wallet.min_topup_minor', '10000'),          -- KSh 100
  ('wallet.max_topup_minor', '25000000'),       -- KSh 250,000 (M-Pesa per-transaction limit)
  ('wallet.min_balance_minor', '0'),            -- balance a pro must keep AFTER a job's commission to accept direct jobs
  ('wallet.low_balance_alert_minor', '50000'),  -- KSh 500: nudge to top up
  ('addon.expiry_minutes', '180')
ON CONFLICT (key) DO NOTHING;
