import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';

function patchOpenNextForWindows() {
  try {
    const filePath = 'node_modules/@opennextjs/aws/dist/build/copyTracedFiles.js';
    if (!existsSync(filePath)) return;
    let content = readFileSync(filePath, 'utf8');
    if (content.includes('symlinkSync(symlink, to);') && !content.includes('cpSync(from, to')) {
      content = content.replace(
        'if (e.code !== "EEXIST") {\n                    throw e;\n                }',
        'if (e.code === "EPERM") {\n                    try { cpSync(from, to, { recursive: true, dereference: true }); } catch {}\n                } else if (e.code !== "EEXIST") {\n                    throw e;\n                }'
      );
      writeFileSync(filePath, content, 'utf8');
    }
  } catch {}
}

const isVercel = process.env.VERCEL === '1';
const isCloudflare = Boolean(
  process.env.BUILD_TARGET === 'cloudflare' ||
  process.env.CF_PAGES === '1' ||
  process.env.CLOUDFLARE_BUILD === '1' ||
  process.env.WORKERS_CI === '1' ||
  (!isVercel && process.platform === 'linux' && !process.env.DOCKER_BUILD)
);

console.log(`[Build] Environment: isVercel=${isVercel}, isCloudflare=${isCloudflare}, platform=${process.platform}`);

// Step 1: Prisma Client generation
console.log('[Build] Step 1: Generating Prisma client...');
execSync('npm run db:generate', { stdio: 'inherit' });

// Step 2: Next.js build
console.log('[Build] Step 2: Compiling Next.js application...');
execSync('npx next build', { stdio: 'inherit' });

// Step 3: Cloudflare OpenNext packaging or Standalone mode
if (isCloudflare) {
  patchOpenNextForWindows();
  console.log('[Build] Step 3: Packaging with OpenNext for Cloudflare Workers (--skipNextBuild)...');
  execSync('npx opennextjs-cloudflare build --skipNextBuild', { stdio: 'inherit' });
} else {
  // Standalone mode: copy static assets for Docker / Node.js server
  try {
    execSync('npx shx mkdir -p .next/standalone/.next && npx shx cp -r public .next/standalone/public && npx shx cp -r .next/static .next/standalone/.next/static', { stdio: 'inherit' });
  } catch {
    // Non-fatal if standalone folders already exist
  }
}

console.log('[Build] Build completed successfully! ✨');
