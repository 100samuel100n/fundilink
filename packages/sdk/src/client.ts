import { io, type Socket } from 'socket.io-client';
import type * as T from './types.ts';

/** Where tokens live. Web: localStorage. Mobile: expo-secure-store. */
export interface TokenStore {
  get(): Promise<T.Session | null>;
  set(s: T.Session | null): Promise<void>;
}

export interface DemoAccount { role: string; label: string; identifier: string; password: string; note?: string }
export interface DemoJourneyPlan { start: { lat: number; lng: number }; destination: { lat: number; lng: number }; route: { lat: number; lng: number }[]; etaMinutes: number; source: 'mapbox' | 'estimated' }

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export interface ClientOptions { baseUrl: string; store: TokenStore; onSessionLost?: () => void; deviceLabel?: string }

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const newIdempotencyKey = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).padEnd(16, '0');

export class FundiLink {
  private refreshing: Promise<T.Session | null> | null = null;
  constructor(private o: ClientOptions) {}

  get baseUrl() { return this.o.baseUrl; }

  /* ---------------- transport ---------------- */
  private async raw(path: string, init: RequestInit, token?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as any) };
    if (token) headers.authorization = `Bearer ${token}`;
    return fetch(`${this.o.baseUrl}${path}`, { ...init, headers });
  }

  /** One refresh at a time: parallel 401s share the same rotation, because refresh tokens are single-use. */
  private refresh(): Promise<T.Session | null> {
    this.refreshing ??= (async () => {
      const cur = await this.o.store.get();
      if (!cur) return null;
      const r = await this.raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: cur.refreshToken }) });
      if (!r.ok) { await this.o.store.set(null); this.o.onSessionLost?.(); return null; }
      const next = (await r.json()) as T.Session;
      await this.o.store.set(next);
      return next;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async req<R = any>(method: string, path: string, body?: unknown): Promise<R> {
    const send = async (tok?: string) => this.raw(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }, tok);
    let session = await this.o.store.get();
    let res = await send(session?.accessToken);
    if (res.status === 401 && session) {
      session = await this.refresh();
      if (session) res = await send(session.accessToken);
    }
    if (res.status === 204) return undefined as R;
    const text = await res.text();
    const json = text ? safeParse(text) : undefined;
    if (!res.ok) {
      const msg = (json as any)?.message;
      throw new ApiError(res.status, typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(', ') : res.statusText, json);
    }
    return json as R;
  }
  get = <R = any>(p: string) => this.req<R>('GET', p);
  post = <R = any>(p: string, b?: unknown) => this.req<R>('POST', p, b ?? {});
  put = <R = any>(p: string, b?: unknown) => this.req<R>('PUT', p, b ?? {});

  /** Re-issue tokens (e.g. after the account gains the professional role) so JWT roles are current. */
  refreshSession = () => this.refresh();

  async accessToken() { return (await this.o.store.get())?.accessToken ?? null; }

  /* ---------------- auth ---------------- */
  requestOtp = (destination: string, purpose: 'signup' | 'login') => this.post<{ sent?: boolean; devCode?: string }>('/auth/otp', { destination, purpose });
  authProviders = () => this.get<{ google: boolean; phoneOtp: boolean; demo: boolean }>('/auth/providers');
  /** URL that starts Google sign-in. `returnTo` is where the API sends the browser/app back with ?code=... */
  googleStartUrl = (returnTo: string, role: 'customer' | 'professional' = 'customer') =>
    `${this.o.baseUrl}/auth/google/start?${new URLSearchParams({ redirect: returnTo, role })}`;
  async googleExchange(code: string) { const s = await this.post<T.Session>('/auth/google/exchange', { code }); await this.o.store.set(s); return s; }
  async googleIdToken(idToken: string, role: 'customer' | 'professional' = 'customer') { const s = await this.post<T.Session>('/auth/google/token', { idToken, role }); await this.o.store.set(s); return s; }
  demoAccounts = () => this.get<DemoAccount[]>('/demo/accounts');
  demoResetBooking = (id: string) => this.post<any>(`/demo/bookings/${id}/reset`);
  demoJourneyPlan = (id: string) => this.get<DemoJourneyPlan>(`/demo/bookings/${id}/journey-plan`);
  async register(i: { fullName: string; phone: string; email?: string; password?: string; otp: string; role: 'customer' | 'professional' }) {
    const s = await this.post<T.Session>('/auth/register', i); await this.o.store.set(s); return s;
  }
  async login(i: { identifier: string; password?: string; otp?: string }) {
    const s = await this.post<T.Session>('/auth/login', i); await this.o.store.set(s); return s;
  }
  async logout() {
    const s = await this.o.store.get();
    if (s) await this.post('/auth/logout', { refreshToken: s.refreshToken }).catch(() => {});
    await this.o.store.set(null);
  }

  /* ---------------- discovery (public) ---------------- */
  categories = () => this.get<T.Category[]>('/discover/categories');
  search = (p: T.SearchParams) => this.get<T.SearchResult>(`/discover/search${qs(p as any)}`);
  profile = (slug: string) => this.get<T.ProProfile>(`/discover/professionals/${encodeURIComponent(slug)}`);
  compare = (ids: string[]) => this.get<T.CompareRow[]>(`/discover/compare${qs({ ids: ids.slice(0, 4).join(',') })}`);

  /* ---------------- bookings ---------------- */
  createBooking = (i: T.CreateBookingInput) => this.post<{ booking: T.Booking; invoice: T.Invoice }>('/bookings', i);
  bookings = (as: 'customer' | 'professional' = 'customer') => this.get<T.Booking[]>(`/bookings${qs({ as })}`);
  booking = (id: string) => this.get<T.BookingDetail>(`/bookings/${id}`);
  transition = (id: string, to: T.BookingStatus, extra: { reason?: string; lat?: number; lng?: number; pin?: string } = {}) =>
    this.post<any>(`/bookings/${id}/transition`, { to, ...extra });
  /** Add-on / "Extra work": the professional proposes, the customer approves in-app (and pays, on in-app bookings). */
  submitRevision = (id: string, i: { reason: string; discovered: string; extraLines: T.LineInput[]; attachmentKeys?: string[] }) => this.post<{ id: string; expires_at: string; extra_total: number }>(`/bookings/${id}/revisions`, i);
  decideRevision = (rid: string, approve: boolean) => this.post<{ approved: boolean; paymentRequired?: boolean; amount?: number; mode?: T.PaymentMode }>(`/bookings/revisions/${rid}/decision`, { approve });
  withdrawRevision = (rid: string) => this.post(`/bookings/revisions/${rid}/withdraw`);
  revisions = (bookingId: string) => this.get<T.Revision[]>(`/bookings/${bookingId}/revisions`);
  /** Pay-on-site: the professional records how they were paid before finishing the job. */
  recordDirectPayment = (bookingId: string, i: { method: 'cash' | 'mpesa'; reference?: string }) => this.post(`/bookings/${bookingId}/direct-payment`, i);
  journey = (id: string) => this.get<T.Journey>(`/bookings/${id}/journey`);

  /* ---------------- payments ---------------- */
  /** Pass the SAME key when the user taps Pay again for the same attempt; the API returns the original intent. */
  pay = (i: { bookingId: string; method: 'mpesa' | 'card' | 'bank'; phone?: string; idempotencyKey: string }) => this.post<T.PaymentIntent>('/payments', i);
  payAddon = (i: { revisionId: string; phone?: string; idempotencyKey: string; method?: 'mpesa' | 'card' | 'bank' }) => this.post<T.PaymentIntent>('/payments/addon', i);
  /** Poll while the customer approves the M-Pesa prompt. */
  paymentIntent = (id: string) => this.get<T.PaymentIntent>(`/payments/${id}`);
  paymentConfig = () => this.get<T.PaymentConfig>('/payments/config');
  /** Professional prepaid wallet (pay-on-site commission). Amounts are minor units. */
  wallet = () => this.get<T.WalletView>('/wallet');
  walletTopup = (i: { amount: number; phone?: string; idempotencyKey: string }) => this.post<T.PaymentIntent>('/wallet/topup', i);
  setPaymentModes = (i: { escrow: boolean; direct: boolean }) => this.put<{ escrow: boolean; direct: boolean }>('/professional/payment-modes', i);
  requestRefund = (i: { bookingId: string; amount: number; reason: string }) => this.post('/refunds', i);
  earnings = () => this.get<T.Earnings>('/earnings');

  /* ---------------- messaging & reviews ---------------- */
  openConversation = (bookingId: string) => this.post<{ id: string }>(`/messages/booking/${bookingId}`);
  messages = (conversationId: string) => this.get<T.Message[]>(`/messages/conversation/${conversationId}`);
  sendMessage = (conversationId: string, body: string) => this.post<T.Message>(`/messages/conversation/${conversationId}`, { body });
  blockConversation = (id: string) => this.post(`/messages/conversation/${id}/block`);
  report = (i: { targetKind: 'user' | 'professional' | 'review' | 'booking' | 'message'; targetId: string; reason: string; details?: string }) => this.post('/messages/report', i);
  review = (bookingId: string, i: { overall: number; workQuality?: number; professionalism?: number; punctuality?: number; valueForMoney?: number; communication?: number; body?: string }) =>
    this.post(`/reviews/booking/${bookingId}`, i);
  respondToReview = (id: string, body: string) => this.post(`/reviews/${id}/respond`, { body });
  flagReview = (id: string, reason: string) => this.post(`/reviews/${id}/flag`, { reason });

  /* ---------------- account ---------------- */
  notifications = () => this.get<T.Notification[]>('/notifications');
  markRead = (id: string) => this.post(`/notifications/${id}/read`);
  registerPushToken = (token: string, platform: 'ios' | 'android' | 'web') => this.post('/push-token', { token, platform });
  savedPros = () => this.get<{ id: string; slug: string; display_name: string; rating_avg: string }[]>('/saved/professionals');
  savePro = (id: string) => this.post(`/saved/professionals/${id}`);
  locations = () => this.get<T.SavedLocation[]>('/locations');
  addLocation = (i: { label: string; address: string; lat: number; lng: number; notes?: string }) => this.post('/locations', i);
  editLocation = (id: string, i: { label?: string; address?: string; lat?: number; lng?: number; notes?: string | null }) => this.put(`/locations/${id}`, i);
  deleteLocation = (id: string) => this.del(`/locations/${id}`);
  suggestPlaces = (q: string, near?: { lat: number; lng: number }) => this.get<T.PlaceSuggestion[]>(`/places/search${qs({ q, lat: near?.lat, lng: near?.lng })}`);
  reversePlace = (lat: number, lng: number) => this.get<T.PlaceSuggestion | null>(`/places/reverse${qs({ lat, lng })}`);
  rebook = (bookingId: string) => this.get<{ professionalId: string; address: string; services: { id: string; name: string }[] }>(`/rebook/${bookingId}`);
  propertyHistory = (address: string) => this.get<{ completed_at: string; service: string; professional: string }[]>(`/property-history${qs({ address })}`);

  /* ---------------- projects / quotations ---------------- */
  createProject = (i: { title: string; scope: string; address: string; lat: number; lng: number; budget?: number; categoryId: number; organizationId?: string }) => this.post<Project>('/projects', i);
  projects = () => this.get<T.Project[]>('/projects');
  project = (id: string) => this.get<any>(`/projects/${id}`);
  projectQuotes = (id: string) => this.get<any[]>(`/projects/${id}/quotations`);
  submitQuote = (id: string, i: unknown) => this.post(`/projects/quotations/${id}/submit`, i);
  acceptQuote = (id: string) => this.post(`/projects/quotations/${id}/accept`);
  requestQuoteRevision = (id: string, note: string) => this.post(`/projects/quotations/${id}/revision`, { note });
  submitMilestone = (id: string, note: string) => this.post(`/projects/milestones/${id}/submit`, { note });
  approveMilestone = (id: string) => this.post(`/projects/milestones/${id}/approve`);

  /* ---------------- professional ---------------- */
  onboard = (i: unknown) => this.post('/professional/onboard', i);
  myProfile = () => this.get<any>('/professional/me');
  updateLocation = (i: { lat: number; lng: number; county: string; area?: string; maxTravelKm?: number; freeRadiusKm?: number; serviceAreas?: { county: string; estate?: string }[] }) => this.put('/professional/location', i);
  upsertService = (i: unknown) => this.put('/professional/services', i);
  setPayoutAccount = (i: { kind: 'mobile_money' | 'bank'; provider: string; accountRef: string; accountName: string }) => this.put('/professional/payout-account', i);
  proOverview = () => this.get<T.ProOverview>('/professional/overview');
  proAnalytics = () => this.get<T.ProAnalytics>('/professional/analytics');
  myServices = () => this.get<T.MyService[]>('/professional/services');
  availability = () => this.get<T.AvailabilityState>('/professional/availability');
  setAvailability = (weekly: T.WeeklySlot[]) => this.put('/professional/availability', { weekly });
  addTimeOff = (i: { startsAt: string; endsAt: string; reason?: string }) => this.post('/professional/time-off', i);
  removeTimeOff = (id: string) => this.post(`/professional/time-off/${id}/remove`);
  setPreferences = (i: { autoAccept?: boolean; acceptsEmergency?: boolean }) => this.put('/professional/preferences', i);
  portfolio = () => this.get<T.PortfolioItem[]>('/professional/portfolio');
  addPortfolio = (i: { title: string; description?: string; categoryId?: number; media: { key: string; kind?: 'image' | 'video'; role?: 'before' | 'after' | 'gallery' }[] }) => this.post('/professional/portfolio', i);
  removePortfolio = (id: string) => this.post(`/professional/portfolio/${id}/remove`);
  myReviews = () => this.get<T.MyReview[]>('/professional/reviews');
  myCustomers = () => this.get<T.MyCustomer[]>('/professional/customers');
  /** Step 1 of a direct-to-storage upload: ask for a signed URL, then PUT the file to it with `uploadFile`. */
  uploadSlot = (purpose: 'avatar' | 'portfolio' | 'document' | 'evidence' | 'problem', contentType: string) =>
    this.post<{ key: string; uploadUrl: string }>('/professional/uploads', { purpose, contentType });
  async uploadFile(purpose: Parameters<FundiLink['uploadSlot']>[0], body: Blob | ArrayBuffer, contentType: string) {
    const slot = await this.uploadSlot(purpose, contentType);
    const r = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: body as any });
    if (!r.ok) throw new ApiError(r.status, 'Upload failed');
    return slot.key;
  }

  /* ---------------- AI ---------------- */
  understand = (text: string) => this.post<T.UnderstoodSearch>('/ai/understand', { text });
  brief = (history: { role: 'user' | 'assistant'; content: string }[], category?: string) => this.post<T.BriefStep>('/ai/brief', { history, category });
  support = (message: string, bookingId?: string) => this.post<{ reply: string; escalated: boolean }>('/ai/support', { message, bookingId });
  quoteDraft = (requirements: string, trade: string) => this.post<{ draft: any; notice: string }>('/ai/quote-draft', { requirements, trade });

  /* ---------------- enterprise ---------------- */
  orgs = () => this.get<T.Organization[]>('/enterprise/organizations');
  createOrg = (i: { name: string; kind?: string; registrationNo?: string; billingEmail?: string }) => this.post('/enterprise/organizations', i);
  addProperty = (orgId: string, i: { name: string; address: string; lat?: number; lng?: number; units?: { building?: string; label: string }[] }) => this.post(`/enterprise/organizations/${orgId}/properties`, i);
  properties = (orgId: string) => this.get<any[]>(`/enterprise/organizations/${orgId}/properties`);
  maintenanceRequest = (orgId: string, i: { propertyId: string; unitId?: string; categoryId: number; title: string; description?: string; priority?: 'low' | 'normal' | 'high' | 'urgent'; estimatedCost?: number }) =>
    this.post(`/enterprise/organizations/${orgId}/requests`, i);
  maintenanceRequests = (orgId: string) => this.get<any[]>(`/enterprise/organizations/${orgId}/requests`);
  approveRequest = (id: string) => this.post(`/enterprise/requests/${id}/approve`);
  createContract = (orgId: string, i: { propertyId: string; professionalId: string; serviceId: number; rrule: string; amount: number; startsOn: string; endsOn?: string }) => this.post(`/enterprise/organizations/${orgId}/contracts`, i);
  orgSpend = (orgId: string) => this.get<any>(`/enterprise/organizations/${orgId}/spend`);

  /* ---------------- admin (server enforces permissions) ---------------- */
  admin = {
    overview: () => this.get<T.AdminOverview>('/admin/overview'),
    verifications: (state = 'pending') => this.get<any[]>(`/admin/verifications${qs({ state })}`),
    decideVerification: (id: string, i: { decision: 'approved' | 'rejected' | 'suspended' | 'revoked'; reason: string; expiresAt?: string }) => this.post(`/admin/verifications/${id}/decide`, i),
    suspendProfessional: (id: string, i: unknown) => this.post(`/admin/professionals/${id}/suspend`, i),
    transactions: () => this.get<any[]>('/admin/transactions'),
    balances: () => this.get<any[]>('/admin/ledger/balances'),
    settlements: () => this.get<any[]>('/admin/settlements'),
    refunds: () => this.get<any[]>('/admin/refunds'),
    approveRefund: (id: string) => this.post(`/admin/refunds/${id}/approve`),
    disputes: () => this.get<any[]>('/admin/disputes'),
    resolveDispute: (id: string, i: { outcome: 'resolved_customer' | 'resolved_professional' | 'resolved_split'; resolution: string; refundAmount?: number }) => this.post(`/admin/disputes/${id}/resolve`, i),
    setCommission: (i: { commissionBps: number; customerFeeBps?: number; reason: string }) => this.put('/admin/commission', i),
    setActivationFee: (i: { amount: number; enabled: boolean; founding_waiver?: boolean; reason: string }) => this.put('/admin/activation-fee', i),
    auditLogs: (limit = 200) => this.get<any[]>(`/admin/audit-logs${qs({ limit })}`),
    fraudFlags: () => this.get<any[]>('/admin/fraud-flags'),
  };


  /* ---------------- extensions: support, plans, warranty, loyalty, team, equipment, content ---------------- */
  content = (kind?: string) => this.get<any[]>(`/content${qs({ kind })}`);
  contentPage = (slug: string) => this.get<any>(`/content/${encodeURIComponent(slug)}`);
  coverage = (country = 'KE') => this.get<any[]>(`/coverage${qs({ country })}`);
  plans = () => this.get<any[]>('/subscription/plans');
  mySubscription = () => this.get<any>('/subscription/mine');
  subscribe = (i: { plan: 'professional_plus' | 'business_pro'; method: 'mpesa' | 'card' | 'bank'; phone?: string; idempotencyKey: string }) => this.post('/subscription/subscribe', i);
  cancelSubscription = () => this.post('/subscription/cancel');
  activation = () => this.get<{ enabled: boolean; amount: number; due: boolean; founding: boolean; paid: boolean; refundableDays: number; terms: string }>('/professional/activation');
  payActivation = (i: { method: 'mpesa' | 'card' | 'bank'; phone?: string; idempotencyKey: string }) => this.post('/professional/activation/pay', i);
  tickets = () => this.get<any[]>('/support/tickets');
  ticket = (id: string) => this.get<any>(`/support/tickets/${id}`);
  createTicket = (i: { subject: string; body: string; bookingId?: string; priority?: 'low' | 'normal' | 'high' | 'urgent'; fromAi?: boolean }) => this.post('/support/tickets', i);
  replyTicket = (id: string, body: string) => this.post(`/support/tickets/${id}/messages`, { body });
  warrantyClaims = (as: 'customer' | 'professional' = 'customer') => this.get<any[]>(`/warranty/claims${qs({ as })}`);
  claimWarranty = (i: { bookingId: string; description: string; evidenceKeys?: string[] }) => this.post('/warranty/claims', i);
  respondWarranty = (id: string, i: { decision: 'accepted' | 'declined' | 'resolved'; response: string }) => this.post(`/warranty/claims/${id}/respond`, i);
  escalateWarranty = (id: string) => this.post(`/warranty/claims/${id}/escalate`);
  contract = (id: string) => this.get<any>(`/contracts/${id}`);
  acceptContract = (id: string) => this.post(`/contracts/${id}/accept`);
  loyalty = () => this.get<{ points: number; referralCode: string | null; entries: any[] }>('/loyalty');
  redeemPoints = (points: number) => this.post<{ code: string; value: number }>('/loyalty/redeem', { points });
  validatePromo = (code: string, subtotal: number, platformMargin?: number) => this.post<{ code: string; discount: number }>('/promotions/validate', { code, subtotal, platformMargin });
  team = () => this.get<any[]>('/team');
  addTeamMember = (i: { phone: string; role: 'admin' | 'operations' | 'support' | 'technician' }) => this.post('/team/members', i);
  removeTeamMember = (userId: string) => this.post(`/team/members/${userId}/remove`);
  assignTechnician = (bookingId: string, technicianId: string) => this.post(`/bookings/${bookingId}/assign`, { technicianId });
  callMasked = (bookingId: string) => this.post<{ ok: boolean; message: string }>(`/bookings/${bookingId}/call`);
  equipment = (p: { q?: string; category?: string; lat?: number; lng?: number; km?: number } = {}) => this.get<any[]>(`/equipment${qs(p)}`);
  myEquipment = () => this.get<{ listings: any[]; incoming: any[] }>('/equipment/mine');
  createEquipment = (i: { name: string; category: string; description?: string; dailyRate: number; deposit: number; eligibilityNotes?: string; insuranceRequired?: boolean }) => this.post('/equipment', i);
  toggleEquipment = (id: string) => this.post(`/equipment/${id}/toggle`);
  rentEquipment = (id: string, i: { from: string; to: string }) => this.post(`/equipment/${id}/rent`, { ...i, acceptTerms: true });
  myRentals = () => this.get<any[]>('/equipment/rentals');
  decideRental = (rid: string, approve: boolean) => this.post(`/equipment/rentals/${rid}/decide`, { approve });
  payRentalDeposit = (rid: string, i: { method: 'mpesa' | 'card' | 'bank'; phone?: string; idempotencyKey: string }) => this.post(`/equipment/rentals/${rid}/deposit`, i);
  returnRental = (rid: string) => this.post(`/equipment/rentals/${rid}/return`);
  del = <R = any>(p: string) => this.req<R>('DELETE', p);


  verification = () => this.get<any>('/professional/verification');
  addDocument = (i: { kind: 'national_id' | 'passport' | 'business_reg' | 'kra_pin' | 'cert'; storageKey: string; idNumber?: string }) => this.post('/professional/documents', i);
  addQualification = (i: { kind: 'certificate' | 'licence' | 'education' | 'membership' | 'training'; title: string; issuer?: string; referenceNo?: string; issuedOn?: string; expiresOn?: string; documentKey?: string }) => this.post('/professional/qualifications', i);
  verifyBusiness = (i: { registrationNo: string; kraPin?: string; documentKey: string }) => this.post('/professional/business-verification', i);
  marketing = () => this.get<{ slug: string; shareUrl: string; referralCode: string; platformSearches30d: number }>('/professional/marketing');
  proInvoices = () => this.get<any[]>('/professional/invoices');
  myInvoices = () => this.get<any[]>('/invoices');
  orgMembers = (orgId: string) => this.get<any[]>(`/enterprise/organizations/${orgId}/members`);
  inviteOrgMember = (orgId: string, i: { phone: string; role: 'manager' | 'approver' | 'requester' | 'viewer'; spendLimit?: number }) => this.post(`/enterprise/organizations/${orgId}/members`, i);
  removeOrgMember = (orgId: string, userId: string) => this.post(`/enterprise/organizations/${orgId}/members/${userId}/remove`);
  orgStatement = (orgId: string, p: { from?: string; to?: string } = {}) => this.get<any[]>(`/enterprise/organizations/${orgId}/statement${qs(p)}`);
  orgHistory = (orgId: string, propertyId?: string) => this.get<any[]>(`/enterprise/organizations/${orgId}/history${qs({ propertyId })}`);

  /* ---------------- admin: remaining sections ---------------- */
  adminX = {
    customers: (q = '') => this.get<any[]>(`/admin/customers${qs({ q })}`),
    setCustomerStatus: (id: string, i: { status: 'active' | 'suspended'; reason: string }) => this.post(`/admin/customers/${id}/status`, i),
    professionals: (p: { q?: string; status?: string } = {}) => this.get<any[]>(`/admin/professionals${qs(p)}`),
    businesses: () => this.get<any[]>('/admin/businesses'),
    organizations: () => this.get<any[]>('/admin/organizations'),
    catalogue: () => this.get<{ categories: any[]; services: any[] }>('/admin/catalogue'),
    addCategory: (i: unknown) => this.post('/admin/categories', i),
    editCategory: (id: number, i: unknown) => this.put(`/admin/categories/${id}`, i),
    addService: (i: unknown) => this.post('/admin/services', i),
    bookings: (p: { status?: string; q?: string } = {}) => this.get<any[]>(`/admin/bookings${qs(p)}`),
    bookingHistory: (id: string) => this.get<any>(`/admin/bookings/${id}/history`),
    quotations: () => this.get<any[]>('/admin/quotations'),
    projects: () => this.get<any[]>('/admin/projects'),
    reviews: (status = 'flagged') => this.get<any[]>(`/admin/reviews${qs({ status })}`),
    moderateReview: (id: string, i: { status: 'published' | 'removed'; reason: string }) => this.post(`/admin/reviews/${id}/moderate`, i),
    locations: () => this.get<any[]>('/admin/locations'),
    setLocation: (id: number, enabled: boolean) => this.put(`/admin/locations/${id}`, { enabled }),
    addLocation: (i: unknown) => this.post('/admin/locations', i),
    promotions: () => this.get<any[]>('/admin/promotions'),
    addPromotion: (i: unknown) => this.post('/admin/promotions', i),
    togglePromotion: (id: string) => this.post(`/admin/promotions/${id}/toggle`),
    subscriptions: () => this.get<{ plans: any[]; active: any[] }>('/admin/subscriptions'),
    setPlan: (code: string, i: { monthlyAmount: number; features?: unknown; reason: string }) => this.put(`/admin/plans/${code}`, i),
    activationPayments: () => this.get<any[]>('/admin/activation-payments'),
    roles: () => this.get<{ roles: any[]; permissions: { code: string }[] }>('/admin/roles'),
    setRolePermissions: (code: string, i: { permissions: string[]; reason: string }) => this.put(`/admin/roles/${code}/permissions`, i),
    staff: () => this.get<any[]>('/admin/staff'),
    grantRole: (i: { identifier: string; role: string; revoke?: boolean; reason: string }) => this.post('/admin/staff/grant', i),
    content: () => this.get<any[]>('/admin/content'),
    saveContent: (slug: string, i: unknown) => this.put(`/admin/content/${slug}`, i),
    tickets: (status = 'open') => this.get<any[]>(`/admin/tickets${qs({ status })}`),
    ticket: (id: string) => this.get<any>(`/admin/tickets/${id}`),
    replyTicket: (id: string, i: { body: string; status?: string }) => this.post(`/admin/tickets/${id}/reply`, i),
    reports: () => this.get<any[]>('/admin/reports'),
    resolveReport: (id: string, note: string) => this.post(`/admin/reports/${id}/resolve`, { note }),
    equipment: () => this.get<any[]>('/admin/equipment'),
    analytics: () => this.get<any>('/admin/analytics'),
    settings: () => this.get<any[]>('/admin/settings'),
    setSetting: (key: string, value: unknown, reason: string) => this.put(`/admin/settings/${key}`, { value, reason }),
    exportCsv: async (kind: 'bookings' | 'transactions' | 'customers') => {
      const t = await this.accessToken();
      const r = await fetch(`${this.o.baseUrl}/admin/export/${kind}`, { headers: { authorization: `Bearer ${t}` } });
      if (!r.ok) throw new ApiError(r.status, 'Export refused');
      return r.text();
    },
  };

  /* ---------------- realtime ---------------- */
  /**
   * Live journey. The server only relays positions while a booking is en_route/arrived, so a stale subscription leaks nothing.
   * Returns an unsubscribe function.
   */
  async watchJourney(bookingId: string, h: { onPosition(p: T.LivePosition): void; onStatus?(s: string): void; onReady?(i: { status: string; last: T.LatLng | null }): void }) {
    const sock = await this.socket('/tracking');
    sock.on('position', h.onPosition);
    if (h.onStatus) sock.on('status', (e: { status: string }) => h.onStatus!(e.status));
    sock.emit('watch', { bookingId }, (r: any) => h.onReady?.(r));
    return () => { sock.off('position'); sock.off('status'); sock.disconnect(); };
  }

  /** Professional device: push a GPS fix every few seconds while travelling. */
  async broadcastPosition(bookingId: string) {
    const sock = await this.socket('/tracking');
    return {
      send: (p: { lat: number; lng: number; heading?: number; speedKmh?: number }) => sock.emit('position', { bookingId, ...p }),
      stop: () => sock.disconnect(),
    };
  }

  async chat(conversationId: string, h: { onMessage(m: T.Message): void; onTyping?(userId: string): void; onRead?(userId: string): void }) {
    const sock = await this.socket('/chat');
    sock.on('message', h.onMessage);
    if (h.onTyping) sock.on('typing', (e: { userId: string }) => h.onTyping!(e.userId));
    if (h.onRead) sock.on('read', (e: { userId: string }) => h.onRead!(e.userId));
    sock.emit('join', { conversationId });
    return {
      send: (body: string) => sock.emit('message', { conversationId, body }),
      typing: () => sock.emit('typing', { conversationId }),
      read: () => sock.emit('read', { conversationId }),
      close: () => sock.disconnect(),
    };
  }

  private async socket(ns: string): Promise<Socket> {
    let tok = await this.accessToken();
    if (!tok) throw new ApiError(401, 'Sign in first');
    // access tokens last 15 minutes; refresh first if the cached one is stale
    if (isExpiring(tok)) tok = (await this.refresh())?.accessToken ?? tok;
    return io(`${this.o.baseUrl}${ns}`, { auth: { token: tok }, transports: ['websocket'], reconnectionDelayMax: 8000 });
  }
}

type Project = T.Project;

function isExpiring(jwt: string) {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob !== 'function') return false;
    const payload = JSON.parse(atob(part));
    return payload.exp * 1000 - Date.now() < 30_000;
  } catch { return false; }
}
function safeParse(s: string) { try { return JSON.parse(s); } catch { return s; } }
