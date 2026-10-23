export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
  /** Directory fields the profile screen reads; absent on a session cached before they existed. */
  phone?: string | null;
  department?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  /** A short-lived link to the transparent signature PNG printed documents stamp. */
  signatureUrl?: string | null;
  /** A signature submitted for administrator review; it prints only once approved. */
  pendingSignatureUrl?: string | null;
  signatureRequestedAt?: string | null;
  /** Why the last submitted signature was rejected, until the next submission. */
  signatureRejectionReason?: string | null;
  lastLoginAt?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  permissions: string[];
}

export interface MeResponse {
  user: AuthUser;
  permissions: string[];
}
