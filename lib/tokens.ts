import crypto from 'crypto';

/** Generate a URL-safe random token for confirmation/unsubscribe links. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
