/**
 * Server-side Firebase ID token verification.
 *
 * The client uses Firebase (Phone OTP / Google) to authenticate. Previously the
 * server trusted the client-supplied `isOtpVerified` / `isGoogleVerified` flags —
 * which allowed account takeover (an attacker could simply set the flag to "true"
 * for any username). This module cryptographically verifies the Firebase ID token
 * that the client obtained after a real Firebase sign-in.
 *
 * Verification is done against Google's public JWK set using Web Crypto, so it
 * works both in Node.js and in edge/Cloudflare Workers runtimes without the
 * firebase-admin dependency.
 */

const FIREBASE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface VerifiedFirebaseToken {
  /** Firebase user id (`sub` claim). */
  uid: string;
  email?: string;
  emailVerified: boolean;
  phoneNumber?: string;
  signInProvider?: string;
}

interface FirebaseJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg: string;
  use: string;
}

interface JwkCacheEntry {
  keys: FirebaseJwk[];
  expiresAt: number;
}

let jwkCache: JwkCacheEntry | null = null;

export function getFirebaseProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "pos-app-508501"
  );
}

function base64UrlToUint8Array(input: string): Uint8Array<ArrayBuffer> {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad === 0 ? base64 : base64 + "=".repeat(4 - pad);

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getSigningKeys(): Promise<FirebaseJwk[]> {
  const now = Date.now();
  if (jwkCache && jwkCache.expiresAt > now) return jwkCache.keys;

  const res = await fetch(FIREBASE_JWK_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase signing keys (${res.status})`);
  }

  const data = (await res.json()) as { keys?: FirebaseJwk[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  if (keys.length === 0) {
    throw new Error("Firebase signing key set is empty");
  }

  // Honour Cache-Control max-age (Google serves these with a long TTL).
  let ttlMs = 60 * 60 * 1000;
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  if (maxAgeMatch) ttlMs = Math.max(60_000, parseInt(maxAgeMatch[1], 10) * 1000);

  jwkCache = { keys, expiresAt: now + ttlMs };
  return keys;
}

/**
 * Verify a Firebase ID token and return its trusted claims.
 * Throws when the token is malformed, expired, or the signature does not match.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
): Promise<VerifiedFirebaseToken> {
  if (typeof idToken !== "string" || idToken.length < 20) {
    throw new Error("Missing Firebase ID token");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed Firebase ID token");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64)));
  } catch {
    throw new Error("Malformed Firebase ID token payload");
  }

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported Firebase token algorithm");
  }

  const projectId = getFirebaseProjectId();
  const now = Math.floor(Date.now() / 1000);

  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  const aud = payload.aud;
  const iss = payload.iss;
  const sub = payload.sub;

  if (!Number.isFinite(exp) || exp <= now) {
    throw new Error("Firebase ID token has expired");
  }
  if (Number.isFinite(iat) && iat > now + 300) {
    throw new Error("Firebase ID token issued in the future");
  }
  if (aud !== projectId) {
    throw new Error("Firebase ID token audience mismatch");
  }
  if (iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Firebase ID token issuer mismatch");
  }
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Firebase ID token missing subject");
  }

  const keys = await getSigningKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error("Firebase signing key not found for token");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlToUint8Array(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );

  if (!valid) {
    throw new Error("Firebase ID token signature is invalid");
  }

  const firebaseClaim = payload.firebase as { sign_in_provider?: string } | undefined;

  return {
    uid: sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified: payload.email_verified === true,
    phoneNumber:
      typeof payload.phone_number === "string" ? payload.phone_number : undefined,
    signInProvider: firebaseClaim?.sign_in_provider,
  };
}
