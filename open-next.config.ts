import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Cloudflare Hyperdrive binding থেকে DATABASE_URL env var সেট করা হবে runtime-এ
  // Hyperdrive Worker-এর env.HYPERDRIVE.connectionString দিয়ে Neon-এ connect করে
});

