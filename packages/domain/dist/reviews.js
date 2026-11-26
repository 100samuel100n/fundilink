"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATING_CATEGORIES = void 0;
exports.assertCanReview = assertCanReview;
exports.RATING_CATEGORIES = [
    'work_quality',
    'professionalism',
    'punctuality',
    'value_for_money',
    'communication',
    'overall',
];
/** Only the booking's customer, once, after completion, never the professional or their team. */
function assertCanReview(r) {
    if (!['completed', 'settlement_pending', 'settled'].includes(r.bookingStatus))
        throw new Error('Booking is not eligible for review');
    if (r.reviewerId !== r.bookingCustomerId)
        throw new Error('Only the booking customer can review');
    if (r.professionalOwnerIds.includes(r.reviewerId))
        throw new Error('Professionals cannot review themselves');
    if (r.alreadyReviewedBookingIds.includes(r.bookingId))
        throw new Error('This booking was already reviewed');
    for (const [k, v] of Object.entries(r.ratings)) {
        if (!exports.RATING_CATEGORIES.includes(k))
            throw new Error(`Unknown rating category ${k}`);
        if (!Number.isInteger(v) || v < 1 || v > 5)
            throw new Error('Ratings are whole numbers 1-5');
    }
    if (r.ratings.overall === undefined)
        throw new Error('Overall rating is required');
}
