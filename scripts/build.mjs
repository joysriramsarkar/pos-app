import { execSync } from 'child_process';

console.log('[Build] Target: Node.js standalone (Docker / self-hosted)');

// Step 1: Prisma Client generation
console.log('[Build] Step 1: Generating Prisma client...');
execSync('npm run db:generate', { stdio: 'inherit' });

// Step 2: Next.js build
console.log('[Build] Step 2: Compiling Next.js application...');
execSync('npx next build', { stdio: 'inherit' });

// Step 3: Copy static assets for the standalone server (Docker / Node.js)
try {
  execSync('npx shx mkdir -p .next/standalone/.next && npx shx cp -r public .next/standalone/public && npx shx cp -r .next/static .next/standalone/.next/static', { stdio: 'inherit' });
} catch {
  // Non-fatal if standalone folders already exist
}

console.log('[Build] Build completed successfully! ✨');
