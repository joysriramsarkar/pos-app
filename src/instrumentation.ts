// Next.js instrumentation hook — runs once on server startup (not during build or tests)
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("@/lib/env");
    } catch (e) {
      console.warn("[instrumentation] Failed to load env:", e);
    }

    // C6: ALLOWED_ORIGINS check
    if (process.env.NODE_ENV === "production" && !process.env.ALLOWED_ORIGINS) {
      console.warn(
        "[STARTUP] ALLOWED_ORIGINS environment variable is not explicitly set. Default origins will apply."
      );
    }
  }
}
