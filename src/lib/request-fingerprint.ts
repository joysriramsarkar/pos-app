/**
 * Deterministic request fingerprints for idempotency (P0-A).
 *
 * An idempotency key is NOT an authorization token and must not be replayed
 * for a *different* request. Before a cached result is returned we compare a
 * canonical hash of the original request with the hash of the incoming one:
 *
 *   key + same tenant + same action + same payload  → replay the result
 *   key + different payload/tenant/action           → reject (409)
 *
 * Canonicalisation keeps the hash stable across JSON key ordering, `undefined`
 * members in objects, and non-finite numbers, so a client that reserialises
 * its body still hits the same fingerprint.
 */
import { createHash } from "crypto";

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  const type = typeof value;

  if (type === "number") {
    return Number.isFinite(value as number) ? value : null;
  }
  if (type === "string" || type === "boolean") return value;
  if (type === "bigint") return (value as bigint).toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map(normalize);

  if (type === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = normalize(source[key]);
    }
    return out;
  }

  return String(value);
}

/** JSON with sorted object keys — same input always produces the same string. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/** sha256 hex of the canonical request body. */
export function requestFingerprint(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/** Canonical deep copy that Prisma can store in a Json column. */
export function toJsonValue(value: unknown): unknown {
  return JSON.parse(stableStringify(value));
}
