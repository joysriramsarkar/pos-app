import { execSync } from 'child_process';

const isVercel = process.env.VERCEL === '1';
const isCloudflare = Boolean(
  process.env.CF_PAGES === '1' ||
  process.env.CLOUDFLARE_BUILD === '1' ||
  process.env.WORKERS_CI === '1' ||
  (!isVercel && process.platform === 'linux' && !process.env.DOCKER_BUILD)
);

console.log(`[Build] Target environment: isVercel=${isVercel}, isCloudflare=${isCloudflare}, platform=${process.platform}`);

execSync('npm run db:generate', { stdio: 'inherit' });

if (isCloudflare) {
  console.log('[Build] Building for Cloudflare Workers (opennextjs-cloudflare build)...');
  execSync('npm run build:worker', { stdio: 'inherit' });
} else {
  console.log('[Build] Building standard Next.js application...');
  execSync('npx next build', { stdio: 'inherit' });
  try {
    execSync('npx shx mkdir -p .next/standalone/.next && npx shx cp -r public .next/standalone/public && npx shx cp -r .next/static .next/standalone/.next/static', { stdio: 'inherit' });
  } catch {
    // Non-fatal if standalone folders already exist
  }
}
