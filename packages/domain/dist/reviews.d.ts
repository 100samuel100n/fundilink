export declare const RATING_CATEGORIES: readonly ["work_quality", "professionalism", "punctuality", "value_for_money", "communication", "overall"];
export type RatingCategory = (typeof RATING_CATEGORIES)[number];
export interface ReviewInput {
    reviewerId: string;
    professionalOwnerIds: string[];
    bookingCustomerId: string;
    bookingStatus: string;
    alreadyReviewedBookingIds: string[];
    bookingId: string;
    ratings: Partial<Record<RatingCategory, number>>;
}
/** Only the booking's customer, once, after completion, never the professional or their team. */
export declare function assertCanReview(r: ReviewInput): void;
