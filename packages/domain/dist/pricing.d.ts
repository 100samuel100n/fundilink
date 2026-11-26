/**
 * Money is ALWAYS integer minor units (KES cents). Never floats.
 * Fees are expressed in basis points (500 bps = 5%).
 */
export type PricingModel = 'fixed' | 'hourly' | 'daily' | 'call_out' | 'per_unit' | 'per_sqm' | 'project' | 'quotation' | 'recurring';
export interface Money {
    amount: number;
    currency: string;
}
export declare const pct: (amount: number, bps: number) => number;
export interface LineItem {
    label: string;
    kind: 'labour' | 'materials' | 'transport' | 'other';
    quantity: number;
    unitAmount: number;
}
export interface FeeRules {
    /** deducted from the professional's earnings */
    commissionBps: number;
    /** optional fee added on top for the customer */
    customerFeeBps: number;
    /** tax on the customer-facing service fee, if applicable */
    taxBps: number;
}
export declare const DEFAULT_FEES: FeeRules;
export interface Invoice {
    lines: (LineItem & {
        total: number;
    })[];
    serviceSubtotal: number;
    customerFee: number;
    tax: number;
    customerTotal: number;
    commission: number;
    professionalNet: number;
    platformRevenue: number;
}
export declare function buildInvoice(lines: LineItem[], rules?: FeeRules): Invoice;
export interface TravelPolicy {
    freeRadiusKm: number;
    perKmAmount: number;
    minCallOut: number;
    maxTravelKm: number;
    outOfAreaSurcharge: number;
    allowOutOfArea: boolean;
}
export type TravelQuote = {
    ok: true;
    fee: number;
    km: number;
} | {
    ok: false;
    reason: 'out_of_service_area';
};
export declare function travelFee(distanceKm: number, p: TravelPolicy): TravelQuote;
export interface Revision {
    originalTotal: number;
    revisedTotal: number;
    customerApproved: boolean;
    reason: string;
}
export declare function assertRevisionAllowed(r: Revision): void;
export interface Milestone {
    title: string;
    percentBps: number;
    criteria: string;
}
export declare function validateMilestones(ms: Milestone[]): void;
/** Split a project total across milestones; the last milestone absorbs rounding drift. */
export declare function milestoneAmounts(total: number, ms: Milestone[]): number[];
