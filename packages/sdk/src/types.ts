/** Response shapes of the FundiLink API. Money is integer minor units (KES cents). */
export type Role = 'customer' | 'professional' | 'business_member' | 'org_member' | string;
export type PricingModel = 'fixed' | 'hourly' | 'daily' | 'call_out' | 'per_unit' | 'per_sqm' | 'project' | 'quotation' | 'recurring';
export type BookingKind = 'instant' | 'scheduled' | 'emergency';

export type BookingStatus =
  | 'draft' | 'pending_payment' | 'awaiting_acceptance' | 'confirmed' | 'declined' | 'scheduled' | 'en_route' | 'arrived'
  | 'in_progress' | 'awaiting_completion' | 'completed' | 'disputed' | 'cancelled' | 'refunded' | 'partially_refunded'
  | 'settlement_pending' | 'settled';

export interface Session { accessToken: string; refreshToken: string; roles: string[] }
export interface LatLng { lat: number; lng: number }

export interface Category {
  id: number; slug: string; name: string; icon: string | null; requires_license: boolean; emergency_capable: boolean;
  services: { id: number; slug: string; name: string }[] | null;
}

export interface SearchParams {
  q?: string; lat?: number; lng?: number; radiusKm?: number; category?: string; minRating?: number; verifiedOnly?: boolean;
  availableNow?: boolean; minYears?: number; businessType?: 'individual' | 'business'; language?: string; pricing?: PricingModel;
  sort?: 'recommended' | 'nearest' | 'rating' | 'experience' | 'price' | 'earliest' | 'jobs'; limit?: number;
}

export interface ProCard {
  id: string; slug: string; name: string; businessName: string | null; logoUrl: string | null; headline: string | null;
  accountType: 'individual' | 'business'; county: string | null; area: string | null;
  verification: { identity: boolean; qualification: boolean; business: boolean };
  rating: number; reviews: number; completedJobs: number; yearsExperience: number | null; startingPrice: number | null;
  distanceKm: number | null; availableNow: boolean; acceptsEmergency: boolean; responseMinutes: number | null;
  languages: string[]; newcomer: boolean; mapPin: LatLng;
  /** Up to three recent portfolio image URLs, when the API provides them. */
  portfolioPreview?: string[];
}
export interface SearchResult { intent: { categoryId: number | null }; total: number; results: ProCard[]; sponsored: string[] }

export interface ProProfile {
  id: string; slug: string; name: string; businessName: string | null; headline: string | null; bio: string | null; logoUrl: string | null;
  memberSince: string; accountType: string; yearsExperience: number | null; languages: string[]; county: string | null; area: string | null;
  stats: { rating: number; reviews: number; completedJobs: number; completionRate: number; cancellationRate: number; responseMinutes: number | null };
  travel: { freeRadiusKm: number; maxTravelKm: number; perKm: number; minCallOut: number };
  acceptsEmergency: boolean; verification: string[]; paymentModes?: PaymentMode[];
  services: { id: string; name: string; description: string | null; duration_minutes: number; warranty_days: number | null;
    pricing: { model: PricingModel; amount: number | null; min: number; unit: string | null; emergency: number | null }[] }[];
  reviews: { overall: number; work_quality: number | null; professionalism: number | null; punctuality: number | null; value_for_money: number | null;
    communication: number | null; body: string | null; created_at: string; reviewer: string; verified_booking: boolean; response: string | null }[];
  ratingBreakdown: Record<string, number | string | null> | null;
  portfolio: { id: string; title: string; description: string | null; media: any }[];
  qualifications: { kind: string; title: string; issuer: string | null }[];
  serviceAreas: { county: string; town: string | null; estate: string | null }[];
  mapPin: LatLng;
}

export interface CompareRow {
  id: string; slug: string; name: string; rating_avg: string; rating_count: number; completed_jobs: number; years_experience: number | null;
  avg_response_minutes: number | null; max_travel_km: string; accepts_emergency: boolean; starting_price: string | null;
  verification: string[] | null; qualifications: string[] | null;
  /** Optional terms, shown in the comparison when the API provides them. */
  warranty_days?: number | null; per_km?: string | null; min_call_out?: string | null; free_radius_km?: string | null;
  cancellation_rate?: string | number | null; completion_rate?: string | number | null; portfolio_count?: number | null; repeat_customer_rate?: string | number | null;
}

export interface LineInput { label: string; kind: 'labour' | 'materials' | 'transport' | 'other'; quantity: number; unitAmount: number }
export interface Invoice {
  lines: (LineInput & { total: number })[]; serviceSubtotal: number; customerFee: number; tax: number; customerTotal: number;
  commission: number; professionalNet: number; platformRevenue: number;
}
export interface CreateBookingInput {
  professionalId: string; professionalServiceId?: string; kind: BookingKind; description: string; address: string; lat: number; lng: number;
  startsAt: string; durationMinutes: number; lines: LineInput[]; attachmentKeys?: string[]; organizationId?: string; couponCode?: string;
  paymentMode?: PaymentMode; directMethod?: 'cash' | 'mpesa';
}
export interface Booking {
  payment_mode?: PaymentMode;
  id: string; reference: string; kind: BookingKind; status: BookingStatus; customer_id: string; professional_id: string; description: string;
  address?: string; lat?: number; lng?: number; subtotal: string; customer_fee: string; tax: string; total: string; commission: string;
  professional_net: string; currency: string; scheduled_during: string; created_at: string; request_expires_at?: string | null;
}
export type PaymentMode = 'escrow' | 'direct';
export interface AddonItem { label: string; kind: string; quantity: number; unitAmount: number; total?: number }
export interface Revision {
  id: string; status: 'pending' | 'approved' | 'rejected' | 'expired' | 'withdrawn'; payment_status: 'none' | 'due' | 'paid';
  reason: string; discovered: string | null; items: AddonItem[]; extra_total: string; expires_at: string; created_at: string; decided_at: string | null; paid_at: string | null;
  evidence_keys: string[]; payment: { id: string; status: string; failure_reason: string | null } | null;
}
export interface DirectPayment { method: 'cash' | 'mpesa'; amount: string; reference: string | null; recorded_at: string; customer_confirmed_at: string | null }
export interface BookingDetail extends Booking {
  payment_mode?: PaymentMode; direct_method?: 'cash' | 'mpesa' | null;
  directPayment?: DirectPayment | null; revisions?: Revision[];
  payments?: { id: string; purpose: string; amount: string; status: string; receipt: string | null; paid_at: string | null }[];
  items: { id: string; label: string; kind: string; quantity: string; unit_amount: string }[];
  history: { id: number; from_status: string | null; to_status: string; actor: string; reason: string | null; created_at: string }[];
  side: 'customer' | 'professional' | null;
}
export interface PaymentIntent {
  id: string; status: 'created' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' | string; purpose?: string; provider_ref: string | null; amount: string; method: string;
  currency?: string; receipt?: string | null; failure_reason?: string | null; phone?: string | null; created_at?: string; expires_at?: string; message?: string;
}
export interface PaymentConfig { provider: string; methods: ('mpesa' | 'card' | 'bank')[]; escrowEnabled: boolean; directEnabled: boolean; wallet: { minTopup: number; maxTopup: number } }
export interface WalletSummary { balance: number | string; minBalance: number; lowAlert: number; minTopup: number; maxTopup: number; low: boolean; canTakeDirect: boolean }
export interface WalletTxn { id: string; kind: string; booking_id: string | null; created_at: string; amount: string; reference: string | null }
export interface WalletView extends WalletSummary { transactions: WalletTxn[]; topups: PaymentIntent[] }
export interface Journey {
  active: boolean; destination?: LatLng; trail?: LatLng[]; plannedRoute?: LatLng[]; etaMinutes?: number | null;
}
export interface LivePosition { lat: number; lng: number; heading: number | null; speedKmh: number | null; remainingKm: number; etaMinutes: number; nearby: boolean; at: number }

export interface Message { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; attachments?: any[] | null }
export interface Notification { id: string; template: string; title: string; body: string; data: any; created_at: string; read_at: string | null }
export interface SavedLocation { id: string; label: string; address: string; notes: string | null; lat: number; lng: number }

export interface Earnings { payable: string; settled: string; pendingSettlement: string; inEscrow?: string; directThisMonth?: string; directJobsThisMonth?: number; wallet?: WalletSummary }
export interface ProOverview { today: string; pending_requests: string; month_earnings: string; rating: string; reviews: number; status: string }
export interface ProAnalytics { bookings: string; avg_value: string; cancellationRate: string; responseMinutes: number | null; completedJobs: number }

export interface UnderstoodSearch {
  category: string | null; problem: string; locationText: string | null; dateText: string | null; timeOfDay: string | null; urgent: boolean; dangerous: boolean;
}
export type BriefStep = { done: false; question: string } | { done: true; title: string; summary: string; details: string[]; suggestedPhotos: string[]; safetyNote: string | null };

export interface AdminOverview {
  customers: string; professionals: string; active_professionals: string; verified_professionals: string; pending_verifications: string; active_counties: string;
  bookings: { total: string; completed: string; cancelled: string; disputed: string; gmv: string };
  finance: { commission_revenue: string; refunds: string; pending_settlements: string; activation_revenue: string };
  series: { day: string; bookings: string; gmv: string }[]; topServices: { service: string; bookings: string }[]; counties: { county: string; professionals: string }[];
  takeRatePct: number;
}

export interface Project { id: string; title: string; status: string; [k: string]: any }
export interface Organization { id: string; name: string; role: string; [k: string]: any }

/* ---- professional self-service ---- */
export interface WeeklySlot { weekday: number; start: string; end: string }
export interface AvailabilityState {
  weekly: WeeklySlot[]; timeOff: { id: string; starts_at: string; ends_at: string; reason: string | null }[]; autoAccept: boolean; acceptsEmergency: boolean;
}
export interface MyService {
  id: string; service_id: number; name: string; title: string | null; description: string | null; enabled: boolean; duration_minutes: number; warranty_days: number | null;
  pricing: { model: PricingModel; amount: number | null; minCharge: number; unit: string | null; emergencyAmount: number | null }[];
}
export interface PortfolioItem { id: string; title: string; description: string | null; media: { key: string; kind: string; role: string }[]; customer_approved: boolean; created_at: string }
export interface MyReview {
  id: string; overall: number; work_quality: number | null; professionalism: number | null; punctuality: number | null; value_for_money: number | null;
  communication: number | null; body: string | null; created_at: string; reviewer: string; response: string | null;
}
export interface MyCustomer { id: string; first_name: string; jobs: string; last_job: string; earned: string }
