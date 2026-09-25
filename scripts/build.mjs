import { execSync } from 'child_process';

const isVercel = process.env.VERCEL === '1';
const isCloudflare = Boolean(
  process.env.CF_PAGES === '1' ||
  process.env.CLOUDFLARE_BUILD === '1' ||
  process.env.WORKERS_CI === '1' ||
  (!isVercel && process.platform === 'linux' && !process.env.DOCKER_BUILD)
);

console.log(`[Build] Target environment: isVercel=${isVercel}, isCloudflare=${isCloudflare}, platform=${process.platform}`);

// When running inside opennextjs-cloudflare build context, this script is called
// as the Next.js build step — just run next build to avoid infinite recursion.
// Prisma generate is handled by the build:worker script before opennextjs runs.
execSync('next build', { stdio: 'inherit' });

if (!isCloudflare) {
  // Standalone mode: copy files for Docker/Node.js server
  try {
    execSync('shx mkdir -p .next/standalone/.next && shx cp -r public .next/standalone/public && shx cp -r .next/static .next/standalone/.next/static', { stdio: 'inherit' });
  } catch {
    // Non-fatal if standalone folders already exist
  }
}
