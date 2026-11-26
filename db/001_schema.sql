-- FundiLink schema. PostgreSQL 15+ with PostGIS.
-- Money is integer minor units (KES cents). Country/currency are columns, never hardcoded in logic.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- needed for the double-booking exclusion constraint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================================================================
-- Enums
-- =========================================================================
CREATE TYPE booking_status AS ENUM (
  'draft','pending_payment','awaiting_acceptance','confirmed','declined','scheduled','en_route','arrived',
  'in_progress','awaiting_completion','completed','disputed','cancelled','refunded','partially_refunded',
  'settlement_pending','settled');
CREATE TYPE booking_kind AS ENUM ('instant','scheduled','quotation','emergency');
CREATE TYPE pricing_model AS ENUM ('fixed','hourly','daily','call_out','per_unit','per_sqm','project','quotation','recurring');
CREATE TYPE account_type AS ENUM ('individual','business');
CREATE TYPE verification_level AS ENUM ('basic','identity','qualification','business');
CREATE TYPE verification_state AS ENUM ('pending','approved','rejected','expired','suspended','revoked');
CREATE TYPE quotation_status AS ENUM ('requested','submitted','revision_requested','accepted','rejected','expired','withdrawn');
CREATE TYPE milestone_status AS ENUM ('pending','in_progress','submitted','approved','disputed','paid');
CREATE TYPE dispute_status AS ENUM ('open','under_review','awaiting_evidence','resolved_customer','resolved_professional','resolved_split','escalated','closed');
CREATE TYPE settlement_status AS ENUM ('pending','processing','paid','failed','reversed');
CREATE TYPE plan_code AS ENUM ('free','professional_plus','business_pro');

-- =========================================================================
-- Identity, roles, RBAC
-- =========================================================================
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE,
  email text UNIQUE,
  password_hash text,                       -- argon2id; null for passwordless accounts
  full_name text NOT NULL,
  avatar_url text,
  locale text NOT NULL DEFAULT 'en',
  country_code char(2) NOT NULL DEFAULT 'KE',
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- OTPs are generated and verified by us. Only the hash is stored; the SMS provider just delivers text.
CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination text NOT NULL,
  purpose text NOT NULL,                     -- signup | login | payout_change | 2fa
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON otp_codes (destination, purpose, created_at DESC);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash text NOT NULL,
  device text, ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE roles (id serial PRIMARY KEY, code text UNIQUE NOT NULL, description text);
CREATE TABLE permissions (id serial PRIMARY KEY, code text UNIQUE NOT NULL, description text);
CREATE TABLE role_permissions (role_id int REFERENCES roles(id) ON DELETE CASCADE, permission_id int REFERENCES permissions(id) ON DELETE CASCADE, PRIMARY KEY (role_id, permission_id));
CREATE TABLE user_roles (user_id uuid REFERENCES users(id) ON DELETE CASCADE, role_id int REFERENCES roles(id) ON DELETE CASCADE, PRIMARY KEY (user_id, role_id));

CREATE TABLE customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referral_code text UNIQUE,
  referred_by uuid REFERENCES users(id),
  loyalty_points int NOT NULL DEFAULT 0
);

CREATE TABLE saved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,                       -- Home, Office, Rental, Parents' home, Construction site...
  address text NOT NULL,
  location geography(Point,4326) NOT NULL,
  notes text,
  organization_property_id uuid
);

-- =========================================================================
-- Taxonomy: new categories are data, not code
-- =========================================================================
CREATE TABLE categories (
  id serial PRIMARY KEY,
  parent_id int REFERENCES categories(id),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  icon text,
  requires_license boolean NOT NULL DEFAULT false,   -- drives profession-specific verification rules
  license_body text,                                  -- e.g. ERC, EPRA, ICPAK, LSK
  risk_level smallint NOT NULL DEFAULT 1,             -- 1 low, 2 medium, 3 high (stricter checks)
  emergency_capable boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE services (
  id serial PRIMARY KEY,
  category_id int NOT NULL REFERENCES categories(id),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  keywords text[] NOT NULL DEFAULT '{}'               -- feeds problem-based search ("leaking pipe")
);
CREATE INDEX services_trgm ON services USING gin (name gin_trgm_ops);

-- =========================================================================
-- Professionals & businesses
-- =========================================================================
CREATE TABLE professional_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  account_type account_type NOT NULL DEFAULT 'individual',
  slug text UNIQUE NOT NULL,                          -- public URL: /professionals/john-plumbing-services
  display_name text NOT NULL,
  business_name text,
  headline text,
  bio text,
  logo_url text,
  years_experience smallint,
  languages text[] NOT NULL DEFAULT '{en,sw}',
  base_location geography(Point,4326),
  base_area text,                                     -- estate / neighbourhood
  county text,
  country_code char(2) NOT NULL DEFAULT 'KE',
  max_travel_km numeric(6,2) NOT NULL DEFAULT 15,
  free_radius_km numeric(6,2) NOT NULL DEFAULT 5,
  per_km_amount bigint NOT NULL DEFAULT 0,
  min_call_out bigint NOT NULL DEFAULT 0,
  out_of_area_surcharge bigint NOT NULL DEFAULT 0,
  accepts_emergency boolean NOT NULL DEFAULT false,
  auto_accept boolean NOT NULL DEFAULT false,
  max_daily_bookings smallint NOT NULL DEFAULT 6,
  buffer_minutes smallint NOT NULL DEFAULT 15,
  lead_time_hours smallint NOT NULL DEFAULT 2,
  searchable boolean NOT NULL DEFAULT true,           -- privacy: allow indexing/search
  status text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding','in_review','active','suspended','deactivated')),
  activated_at timestamptz,
  founding_member boolean NOT NULL DEFAULT false,
  plan plan_code NOT NULL DEFAULT 'free',
  -- denormalised reputation, refreshed by background job from reviews/bookings
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  completed_jobs int NOT NULL DEFAULT 0,
  completion_rate numeric(4,3) NOT NULL DEFAULT 0,
  cancellation_rate numeric(4,3) NOT NULL DEFAULT 0,
  avg_response_minutes int NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX professional_geo ON professional_profiles USING gist (base_location);
CREATE INDEX professional_status ON professional_profiles (status, county);

CREATE TABLE business_members (
  business_id uuid REFERENCES professional_profiles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','operations','support','technician')),
  PRIMARY KEY (business_id, user_id)
);
CREATE TABLE business_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  email text, phone text, role text NOT NULL, token_hash text NOT NULL,
  expires_at timestamptz NOT NULL, accepted_at timestamptz
);

CREATE TABLE professional_categories (
  professional_id uuid REFERENCES professional_profiles(id) ON DELETE CASCADE,
  category_id int REFERENCES categories(id),
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (professional_id, category_id)
);

CREATE TABLE professional_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  county text NOT NULL, town text, estate text
);

-- Qualifications are OPTIONAL by default so grassroots professionals can join; categories flag where required.
CREATE TABLE professional_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,                         -- certificate | licence | education | membership | training
  title text NOT NULL, issuer text, reference_no text,
  issued_on date, expires_on date,
  document_key text                           -- object storage key (signed URL access only)
);

CREATE TABLE professional_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  level verification_level NOT NULL,
  state verification_state NOT NULL DEFAULT 'pending',
  qualification_id uuid REFERENCES professional_qualifications(id),
  reviewed_by uuid REFERENCES users(id),
  decision_reason text,
  reviewed_at timestamptz,
  expires_at timestamptz,
  UNIQUE (professional_id, level, qualification_id)
);

CREATE TABLE professional_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,                         -- national_id | passport | business_reg | kra_pin | cert
  storage_key text NOT NULL,
  id_number_encrypted bytea,                  -- application-level encryption
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE professional_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  title text NOT NULL, description text,
  media jsonb NOT NULL DEFAULT '[]',          -- [{key, kind: image|video, role: before|after|gallery}]
  category_id int REFERENCES categories(id),
  customer_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE professional_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  service_id int NOT NULL REFERENCES services(id),
  title text, description text,
  enabled boolean NOT NULL DEFAULT true,
  duration_minutes int NOT NULL DEFAULT 60,
  warranty_days int,
  UNIQUE (professional_id, service_id)
);

-- A service can enable several pricing models at once.
CREATE TABLE service_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_service_id uuid NOT NULL REFERENCES professional_services(id) ON DELETE CASCADE,
  model pricing_model NOT NULL,
  amount bigint,                              -- null for quotation-only
  min_charge bigint NOT NULL DEFAULT 0,
  unit_label text,                            -- 'window', 'sqm', 'hour'
  emergency_amount bigint,
  currency char(3) NOT NULL DEFAULT 'KES'
);

CREATE TABLE service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_service_id uuid NOT NULL REFERENCES professional_services(id) ON DELETE CASCADE,
  name text NOT NULL, description text, amount bigint NOT NULL, featured boolean NOT NULL DEFAULT false
);

CREATE TABLE professional_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL, end_time time NOT NULL,
  CHECK (end_time > start_time)
);
CREATE TABLE professional_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  during tstzrange NOT NULL, reason text
);

-- =========================================================================
-- Organisations (enterprise portal)
-- =========================================================================
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, kind text, registration_no text, billing_email text,
  plan text NOT NULL DEFAULT 'standard', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organization_members (
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','manager','approver','requester','viewer')),
  spend_limit bigint,                         -- above this, an approver must sign off
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL, address text NOT NULL, location geography(Point,4326), manager_id uuid REFERENCES users(id)
);
CREATE TABLE property_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  building text, unit_label text NOT NULL
);
ALTER TABLE saved_locations ADD FOREIGN KEY (organization_property_id) REFERENCES properties(id);

CREATE TABLE maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_id uuid REFERENCES property_units(id),
  reported_by uuid REFERENCES users(id),
  category_id int REFERENCES categories(id),
  title text NOT NULL, description text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','awaiting_approval','approved','quoted','scheduled','in_progress','done','rejected')),
  estimated_cost bigint, approved_by uuid REFERENCES users(id), approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE maintenance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id),
  service_id int NOT NULL REFERENCES services(id),
  rrule text NOT NULL,                        -- iCal RRULE, e.g. FREQ=WEEKLY;BYDAY=MO
  amount bigint NOT NULL, starts_on date NOT NULL, ends_on date, active boolean NOT NULL DEFAULT true
);

-- =========================================================================
-- Bookings
-- =========================================================================
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL,
  kind booking_kind NOT NULL,
  status booking_status NOT NULL DEFAULT 'draft',
  customer_id uuid NOT NULL REFERENCES users(id),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id),
  assigned_user_id uuid REFERENCES users(id),             -- technician inside a business
  organization_id uuid REFERENCES organizations(id),
  maintenance_request_id uuid REFERENCES maintenance_requests(id),
  professional_service_id uuid REFERENCES professional_services(id),
  description text,
  address text NOT NULL,
  location geography(Point,4326) NOT NULL,
  scheduled_during tstzrange,                              -- appointment window
  distance_km numeric(6,2),
  currency char(3) NOT NULL DEFAULT 'KES',
  subtotal bigint NOT NULL DEFAULT 0,
  customer_fee bigint NOT NULL DEFAULT 0,
  tax bigint NOT NULL DEFAULT 0,
  total bigint NOT NULL DEFAULT 0,
  commission bigint NOT NULL DEFAULT 0,
  professional_net bigint NOT NULL DEFAULT 0,
  commission_bps int NOT NULL,                             -- frozen at booking time
  request_expires_at timestamptz,
  start_pin_hash text,                                     -- customer shows a 4-digit PIN on arrival; job can't start without it
  arrived_at timestamptz,
  completed_at timestamptz,
  review_window_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- THE double-booking guarantee: one pro, no overlapping windows among live bookings.
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    professional_id WITH =,
    scheduled_during WITH &&
  ) WHERE (status IN ('awaiting_acceptance','confirmed','scheduled','en_route','arrived','in_progress','awaiting_completion')
           AND scheduled_during IS NOT NULL)
);
CREATE INDEX bookings_customer ON bookings (customer_id, status);
CREATE INDEX bookings_pro ON bookings (professional_id, status);

CREATE TABLE booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('labour','materials','transport','other')),
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit_amount bigint NOT NULL CHECK (unit_amount >= 0),
  approved_by_customer boolean NOT NULL DEFAULT false      -- revisions/extras need explicit approval
);

CREATE TABLE booking_status_history (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status booking_status, to_status booking_status NOT NULL,
  actor text NOT NULL, actor_user_id uuid REFERENCES users(id),
  reason text, at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE booking_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('problem','completion_evidence','quotation','other')),
  storage_key text NOT NULL, mime text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE booking_reschedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES users(id),
  old_during tstzrange, new_during tstzrange NOT NULL,
  state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','accepted','rejected'))
);
CREATE TABLE booking_cancellations (
  booking_id uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  cancelled_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL, fee bigint NOT NULL DEFAULT 0, at timestamptz NOT NULL DEFAULT now()
);

-- Live journey tracking: stored only while a booking is en_route/arrived, purged after completion.
CREATE TABLE booking_tracking_points (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  location geography(Point,4326) NOT NULL,
  heading real, speed_kmh real, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON booking_tracking_points (booking_id, recorded_at);

-- =========================================================================
-- Quotations & projects
-- =========================================================================
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id),
  professional_id uuid REFERENCES professional_profiles(id),
  organization_id uuid REFERENCES organizations(id),
  title text NOT NULL, scope text, address text, location geography(Point,4326),
  budget bigint, starts_on date, due_on date,
  status text NOT NULL DEFAULT 'requesting_quotes' CHECK (status IN ('requesting_quotes','active','completed','cancelled','disputed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professional_profiles(id),
  status quotation_status NOT NULL DEFAULT 'requested',
  scope text, exclusions text, duration_days int, valid_until date,
  total bigint, version int NOT NULL DEFAULT 1,
  milestones jsonb NOT NULL DEFAULT '[]',                   -- proposed payment milestones, copied to project_milestones on acceptance
  submitted_at timestamptz, decided_at timestamptz,
  UNIQUE (project_id, professional_id)
);
CREATE TABLE quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  label text NOT NULL, kind text NOT NULL, quantity numeric(10,2) NOT NULL, unit_amount bigint NOT NULL
);
CREATE TABLE quotation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid REFERENCES quotations(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL, discovered text,
  previous_total bigint NOT NULL, revised_total bigint NOT NULL,
  extra_items jsonb NOT NULL DEFAULT '[]',
  customer_decision text CHECK (customer_decision IN ('approved','rejected')),
  decided_at timestamptz,
  CHECK (quotation_id IS NOT NULL OR booking_id IS NOT NULL)
);
CREATE TABLE project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position int NOT NULL, title text NOT NULL, criteria text NOT NULL,
  percent_bps int NOT NULL CHECK (percent_bps BETWEEN 1 AND 10000),
  amount bigint NOT NULL, status milestone_status NOT NULL DEFAULT 'pending',
  approval_deadline timestamptz,              -- auto-approve / escalate: funds are never locked forever
  UNIQUE (project_id, position)
);
CREATE TABLE project_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES project_milestones(id), author_id uuid NOT NULL REFERENCES users(id),
  body text, media jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE milestone_approvals (
  milestone_id uuid PRIMARY KEY REFERENCES project_milestones(id) ON DELETE CASCADE,
  approved_by uuid REFERENCES users(id), auto boolean NOT NULL DEFAULT false, at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id), booking_id uuid REFERENCES bookings(id),
  body text NOT NULL, warranty_terms text,
  customer_accepted_at timestamptz, professional_accepted_at timestamptz,
  acceptance_ip inet
);

-- =========================================================================
-- Payments & ledger (append-only)
-- =========================================================================
CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id), milestone_id uuid REFERENCES project_milestones(id),
  user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text UNIQUE NOT NULL,                   -- double-tap on Pay never charges twice
  provider text NOT NULL, provider_ref text UNIQUE,
  method text, amount bigint NOT NULL CHECK (amount > 0), currency char(3) NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','succeeded','failed','cancelled','refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_events (                              -- raw verified webhooks, deduplicated
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL, event_id text NOT NULL, payload jsonb NOT NULL,
  signature_valid boolean NOT NULL, processed_at timestamptz, received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
CREATE TABLE payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id),
  kind text NOT NULL CHECK (kind IN ('mobile_money','bank')),
  provider text NOT NULL, account_ref_encrypted bytea NOT NULL, account_name text NOT NULL,
  name_verified_at timestamptz, active boolean NOT NULL DEFAULT true,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id),
  payout_account_id uuid REFERENCES payout_accounts(id),
  amount bigint NOT NULL CHECK (amount > 0), status settlement_status NOT NULL DEFAULT 'pending',
  provider_ref text, idempotency_key text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);
CREATE TABLE settlement_items (settlement_id uuid REFERENCES settlements(id), booking_id uuid REFERENCES bookings(id), milestone_id uuid REFERENCES project_milestones(id), amount bigint NOT NULL);
CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id), payment_intent_id uuid NOT NULL REFERENCES payment_intents(id),
  amount bigint NOT NULL CHECK (amount > 0), reason text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','processed','rejected','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_transactions (
  id bigserial PRIMARY KEY,
  idempotency_key text UNIQUE NOT NULL,
  kind text NOT NULL, booking_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ledger_entries (
  id bigserial PRIMARY KEY,
  transaction_id bigint NOT NULL REFERENCES ledger_transactions(id),
  account text NOT NULL,
  debit bigint NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit bigint NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK ((debit = 0) <> (credit = 0))
);
CREATE INDEX ON ledger_entries (account);

-- Append-only: no UPDATE/DELETE on money or audit tables, ever. Corrections are reversing entries.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME; END $$;

CREATE TRIGGER ledger_tx_immutable BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Every ledger transaction must balance when the DB transaction commits.
CREATE FUNCTION assert_ledger_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d bigint; c bigint;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF d <> c THEN RAISE EXCEPTION 'Ledger transaction % unbalanced: debits % credits %', NEW.transaction_id, d, c; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();

CREATE VIEW ledger_balances AS
  SELECT account, SUM(debit) AS debits, SUM(credit) AS credits, SUM(credit) - SUM(debit) AS credit_balance
  FROM ledger_entries GROUP BY account;

CREATE TABLE invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid REFERENCES bookings(id), project_id uuid REFERENCES projects(id), number text UNIQUE NOT NULL, payload jsonb NOT NULL, etims_ref text, issued_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE receipts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_intent_id uuid NOT NULL REFERENCES payment_intents(id), number text UNIQUE NOT NULL, issued_at timestamptz NOT NULL DEFAULT now());

-- =========================================================================
-- Messaging & notifications
-- =========================================================================
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id), project_id uuid REFERENCES projects(id),
  kind text NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct','support')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversation_members (conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id), last_read_at timestamptz, blocked boolean NOT NULL DEFAULT false, PRIMARY KEY (conversation_id, user_id));
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id),                    -- null = system message
  body text, is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (conversation_id, created_at);
CREATE TABLE message_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE, storage_key text NOT NULL, mime text, size_bytes bigint);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template text NOT NULL, title text, body text, data jsonb NOT NULL DEFAULT '{}',
  channels text[] NOT NULL DEFAULT '{in_app}', read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification_preferences (user_id uuid REFERENCES users(id) ON DELETE CASCADE, template text NOT NULL, channel text NOT NULL, enabled boolean NOT NULL DEFAULT true, PRIMARY KEY (user_id, template, channel));
CREATE TABLE push_tokens (user_id uuid REFERENCES users(id) ON DELETE CASCADE, token text PRIMARY KEY, platform text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- =========================================================================
-- Trust: reviews, reports, disputes, fraud
-- =========================================================================
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),   -- UNIQUE: one review per booking, enforced in DB
  customer_id uuid NOT NULL REFERENCES users(id),
  professional_id uuid NOT NULL REFERENCES professional_profiles(id),
  work_quality smallint CHECK (work_quality BETWEEN 1 AND 5),
  professionalism smallint CHECK (professionalism BETWEEN 1 AND 5),
  punctuality smallint CHECK (punctuality BETWEEN 1 AND 5),
  value_for_money smallint CHECK (value_for_money BETWEEN 1 AND 5),
  communication smallint CHECK (communication BETWEEN 1 AND 5),
  overall smallint NOT NULL CHECK (overall BETWEEN 1 AND 5),
  body text, status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','flagged','removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE review_responses (review_id uuid PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE, professional_id uuid NOT NULL REFERENCES professional_profiles(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- Professionals may respond but can never delete a genuine review: no DELETE grant is given to the app role on reviews.

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id),
  target_kind text NOT NULL CHECK (target_kind IN ('user','professional','review','booking','message')),
  target_id uuid NOT NULL, reason text NOT NULL, details text,
  status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id), milestone_id uuid REFERENCES project_milestones(id),
  opened_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
  status dispute_status NOT NULL DEFAULT 'open', assigned_to uuid REFERENCES users(id),
  resolution_due_at timestamptz NOT NULL,           -- defined deadline; escalation if missed
  resolution text, refund_amount bigint, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE dispute_evidence (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE, submitted_by uuid NOT NULL REFERENCES users(id), note text, storage_key text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE account_restrictions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL, reason text NOT NULL, imposed_by uuid NOT NULL REFERENCES users(id), starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz, appeal_note text, appeal_state text CHECK (appeal_state IN ('none','submitted','upheld','overturned')) DEFAULT 'none');
CREATE TABLE fraud_flags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), booking_id uuid REFERENCES bookings(id), signal text NOT NULL, score numeric(4,3) NOT NULL, details jsonb NOT NULL DEFAULT '{}', state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','reviewed_ok','actioned')), created_at timestamptz NOT NULL DEFAULT now());

-- =========================================================================
-- Admin config, monetisation, audit
-- =========================================================================
CREATE TABLE platform_settings (key text PRIMARY KEY, value jsonb NOT NULL, country_code char(2), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE commission_rules (id serial PRIMARY KEY, category_id int REFERENCES categories(id), kind booking_kind, organization_id uuid REFERENCES organizations(id), commission_bps int NOT NULL, customer_fee_bps int NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, priority int NOT NULL DEFAULT 0);
CREATE TABLE activation_fee_rules (id serial PRIMARY KEY, country_code char(2) NOT NULL DEFAULT 'KE', amount bigint NOT NULL, enabled boolean NOT NULL DEFAULT false, founding_waiver boolean NOT NULL DEFAULT true, refundable_days int NOT NULL DEFAULT 7);
CREATE TABLE activation_payments (professional_id uuid PRIMARY KEY REFERENCES professional_profiles(id), payment_intent_id uuid REFERENCES payment_intents(id), waived boolean NOT NULL DEFAULT false, paid_at timestamptz);
CREATE TABLE subscription_plans (code plan_code PRIMARY KEY, name text NOT NULL, monthly_amount bigint NOT NULL, features jsonb NOT NULL DEFAULT '{}');
CREATE TABLE subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), professional_id uuid REFERENCES professional_profiles(id), organization_id uuid REFERENCES organizations(id), plan plan_code NOT NULL, status text NOT NULL DEFAULT 'active', current_period_end timestamptz NOT NULL);
CREATE TABLE promotional_campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, kind text NOT NULL CHECK (kind IN ('percent','fixed','credit')), value bigint NOT NULL, max_redemptions int, per_user_limit int NOT NULL DEFAULT 1, starts_at timestamptz, ends_at timestamptz, active boolean NOT NULL DEFAULT true);
CREATE TABLE referrals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referrer_id uuid NOT NULL REFERENCES users(id), referred_id uuid NOT NULL UNIQUE REFERENCES users(id), qualified_at timestamptz, reward_paid_at timestamptz);
CREATE TABLE sponsored_placements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), professional_id uuid NOT NULL REFERENCES professional_profiles(id), category_id int REFERENCES categories(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL);  -- always rendered with an "Ad" label, never mixed into organic rank
CREATE TABLE saved_professionals (user_id uuid REFERENCES users(id) ON DELETE CASCADE, professional_id uuid REFERENCES professional_profiles(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, professional_id));
CREATE TABLE search_events (id bigserial PRIMARY KEY, user_id uuid, query text, category_id int, location geography(Point,4326), filters jsonb, result_count int, booked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid, actor_role text, action text NOT NULL,
  target_kind text NOT NULL, target_id text NOT NULL,
  previous_value jsonb, new_value jsonb, reason text, ip inet, device text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER status_history_immutable BEFORE UPDATE OR DELETE ON booking_status_history FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- =========================================================================
-- Discovery: radius + filters in one indexed query (used by the API as a parameterised statement)
-- =========================================================================
CREATE FUNCTION nearby_professionals(
  p_lat double precision, p_lng double precision, p_radius_km double precision,
  p_category int DEFAULT NULL, p_min_rating numeric DEFAULT 0, p_verified_only boolean DEFAULT false,
  p_limit int DEFAULT 50
) RETURNS TABLE (id uuid, distance_km double precision)
LANGUAGE sql STABLE AS $$
  SELECT p.id, ST_Distance(p.base_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat),4326)::geography) / 1000.0 AS distance_km
  FROM professional_profiles p
  WHERE p.status = 'active' AND p.searchable
    AND ST_DWithin(p.base_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat),4326)::geography, p_radius_km * 1000)
    AND ST_Distance(p.base_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat),4326)::geography) / 1000.0 <= p.max_travel_km
    AND (p_category IS NULL OR EXISTS (SELECT 1 FROM professional_categories pc WHERE pc.professional_id = p.id AND pc.category_id = p_category))
    AND (p.rating_count = 0 OR p.rating_avg >= p_min_rating)    -- newcomers aren't filtered out by a rating floor
    AND (NOT p_verified_only OR EXISTS (SELECT 1 FROM professional_verifications v WHERE v.professional_id = p.id AND v.level = 'identity' AND v.state = 'approved'))
  ORDER BY distance_km
  LIMIT p_limit
$$;
