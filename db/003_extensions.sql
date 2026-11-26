-- =========================================================================
-- 002 extensions: closes blueprint gaps (support, CMS, warranties, equipment rental,
-- loyalty, coupons, team assignment, masked calls, WhatsApp, locations, subscription billing).
-- Safe to re-run.
-- =========================================================================

-- payment intents can now pay for things other than bookings
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'booking'
  CHECK (purpose IN ('booking','milestone','subscription','activation','equipment_deposit'));
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS subject_id uuid;        -- subscription / rental id etc.

-- WhatsApp opt-in (blueprint: "WhatsApp notifications could be added later")
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false;

-- ---- Coverage: counties / towns, enabled per country for international expansion ----
CREATE TABLE IF NOT EXISTS service_locations (
  id serial PRIMARY KEY, country_code char(2) NOT NULL DEFAULT 'KE', county text NOT NULL, town text,
  enabled boolean NOT NULL DEFAULT true, centre geography(Point,4326), UNIQUE (country_code, county, town)
);

-- ---- Support desk ----
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id), booking_id uuid REFERENCES bookings(id),
  subject text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_user','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to uuid REFERENCES users(id), escalated_from_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_messages (
  id bigserial PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id), staff boolean NOT NULL DEFAULT false, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- CMS: homepage blocks, articles, static pages, testimonials ----
CREATE TABLE IF NOT EXISTS content_pages (
  id serial PRIMARY KEY, slug text UNIQUE NOT NULL, kind text NOT NULL DEFAULT 'page' CHECK (kind IN ('page','article','testimonial','banner','faq')),
  title text NOT NULL, body text NOT NULL DEFAULT '', meta jsonb NOT NULL DEFAULT '{}', published boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---- Warranties (blueprint 24.3): terms recorded per booking, claims submitted by customers ----
CREATE TABLE IF NOT EXISTS warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
  customer_id uuid NOT NULL REFERENCES users(id), professional_id uuid NOT NULL REFERENCES professional_profiles(id),
  description text NOT NULL, evidence_keys text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','declined','resolved','escalated')),
  professional_response text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS warranty_days smallint;       -- frozen from the service at booking time
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS warranty_terms text;

-- ---- Equipment rental (24.8): separate contract, deposit, eligibility ----
CREATE TABLE IF NOT EXISTS equipment_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  name text NOT NULL, category text NOT NULL, description text, daily_rate bigint NOT NULL CHECK (daily_rate >= 0),
  deposit bigint NOT NULL DEFAULT 0, eligibility_notes text, insurance_required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true, location geography(Point,4326), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS equipment_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES equipment_listings(id),
  renter_id uuid NOT NULL REFERENCES users(id), period daterange NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','declined','active','returned','disputed','cancelled')),
  rate bigint NOT NULL, deposit bigint NOT NULL, contract_accepted_at timestamptz, deposit_intent_id uuid REFERENCES payment_intents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (listing_id WITH =, period WITH &&) WHERE (status IN ('approved','active'))   -- no double rental, enforced in DB
);

-- ---- Loyalty & coupons (24.4 / 24.5) ----
CREATE TABLE IF NOT EXISTS loyalty_entries (
  id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), points int NOT NULL, reason text NOT NULL,
  booking_id uuid REFERENCES bookings(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, reason, booking_id)
);
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id bigserial PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES promotional_campaigns(id), user_id uuid NOT NULL REFERENCES users(id),
  booking_id uuid REFERENCES bookings(id), amount bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount bigint NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code text;

-- ---- Team: assign jobs to technicians inside a business (6.4) ----
CREATE TABLE IF NOT EXISTS booking_assignments (
  id bigserial PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES users(id), assigned_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_assignment ON booking_assignments (booking_id) WHERE active;

-- ---- Masked calling (9.2): numbers never exposed; the provider bridges the call ----
CREATE TABLE IF NOT EXISTS call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
  caller_id uuid NOT NULL REFERENCES users(id), callee_id uuid NOT NULL REFERENCES users(id),
  provider_ref text, status text NOT NULL DEFAULT 'initiated', created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz
);

-- ---- Digital contract acceptance records (24.2) ----
CREATE TABLE IF NOT EXISTS contract_acceptances (
  id bigserial PRIMARY KEY, contract_id uuid NOT NULL REFERENCES contracts(id), user_id uuid NOT NULL REFERENCES users(id),
  party text NOT NULL CHECK (party IN ('customer','professional')), ip inet, device text, body_sha256 text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(), UNIQUE (contract_id, party)
);

-- ---- Subscription billing: one payable invoice per period ----
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  amount bigint NOT NULL, period_start timestamptz NOT NULL, period_end timestamptz NOT NULL,
  payment_intent_id uuid REFERENCES payment_intents(id), status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','paid','failed','void'))
);

-- ---- Verification expiry reminders ----
ALTER TABLE professional_verifications ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz;

-- ---- Extra permissions for new admin sections ----
INSERT INTO permissions (code) VALUES ('support.manage'),('content.publish'),('equipment.moderate'),('exports.customer_data')
ON CONFLICT DO NOTHING;
WITH m(role, perm) AS (VALUES
 ('support_agent','support.manage'),('dispute_officer','support.manage'),('content_manager','content.publish'),
 ('platform_admin','support.manage'),('platform_admin','content.publish'),('platform_admin','reviews.moderate'),
 ('platform_admin','promotions.write'),('platform_admin','subscriptions.write'),('operations_manager','equipment.moderate'),
 ('marketing_manager','content.publish'))
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM m JOIN roles r ON r.code=m.role JOIN permissions p ON p.code=m.perm ON CONFLICT DO NOTHING;

-- ---- Seed: counties (all 47) ----
INSERT INTO service_locations (county, enabled) SELECT c, c IN ('Nairobi','Mombasa','Kisumu','Nakuru','Uasin Gishu','Kiambu','Nyeri','Meru','Machakos') FROM unnest(ARRAY[
'Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa','Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi','Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos','Makueni','Mandera','Marsabit','Meru','Migori','Mombasa','Murang''a','Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri','Samburu','Siaya','Taita-Taveta','Tana River','Tharaka-Nithi','Trans Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot']) AS c
ON CONFLICT DO NOTHING;

INSERT INTO content_pages (slug, kind, title, body, published) VALUES
 ('faq-refunds','faq','How do refunds work?','Refund requests are reviewed by our finance team. Approved refunds return to your original payment method.',true),
 ('faq-cancel','faq','How do I cancel a booking?','Open the booking and choose Cancel. Fees depend on how close to the appointment you cancel.',true),
 ('faq-verified','faq','How do I become a verified professional?','Finish onboarding, upload your ID and any certificates, and our team reviews them.',true)
ON CONFLICT DO NOTHING;

-- notification delivery tracking: a worker fans notifications out to sms / email / push / whatsapp per user preferences
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_undelivered ON notifications (created_at) WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS payment_intents_subject ON payment_intents (purpose, subject_id);

-- Founding-professional window (activation waived for accounts created before this date) and loyalty rate. Adjust in Admin > Settings.
INSERT INTO platform_settings (key, value) VALUES ('founding.until','"2027-06-30"'), ('loyalty.points_per_kes100','1')
ON CONFLICT (key) DO NOTHING;
