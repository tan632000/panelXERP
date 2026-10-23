/** Event types of the signature review: a request to administrators, and the verdict back. */
export const SIGNATURE_REVIEW_REQUESTED_EVENT = 'signature_review_requested';
export const SIGNATURE_REVIEW_APPROVED_EVENT = 'signature_review_approved';
export const SIGNATURE_REVIEW_REJECTED_EVENT = 'signature_review_rejected';

/** Only full system access reviews a signature; the administrator is the role that carries it. */
export const SIGNATURE_REVIEWER_ROLE_CODES = ['admin'] as const;
export const SIGNATURE_REVIEWER_SCOPE = '*:*';

export const SIGNATURE_REJECTION_REASON_MAX_LENGTH = 500;

/** One open request per account, so a resubmission replaces it rather than piling up. */
export function signatureReviewDedupeKey(userId: number): string {
  return `user:${userId}`;
}

/** The user list opens the review of this account straight away. */
export function signatureReviewLink(userId: number): string {
  return `/system/users?signatureReview=${userId}`;
}

export const PROFILE_LINK = '/profile';
