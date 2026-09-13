const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sourceSvgPath = path.resolve(__dirname, '../public/app-icon.svg');
const resDir = path.resolve(__dirname, '../android/app/src/main/res');
const publicDir = path.resolve(__dirname, '../public');
const appDir = path.resolve(__dirname, '../src/app');

const mipmaps = [
  { folder: 'mipmap-mdpi', size: 48, fgSize: 108 },
  { folder: 'mipmap-hdpi', size: 72, fgSize: 162 },
  { folder: 'mipmap-xhdpi', size: 96, fgSize: 216 },
  { folder: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
  { folder: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
];

async function generate() {
  console.log('Generating app icons from public/app-icon.svg with centered crop...');

  // Read SVG and adjust viewBox from 0 0 112 112 to 8 0 96 96
  // Card is at x=16..96, y=8..88 (80x80).
  // In 96x96 box from (8, 0):
  // left margin = 16 - 8 = 8px, right margin = 104 - 96 = 8px
  // top margin = 8 - 0 = 8px, bottom margin = 96 - 88 = 8px
  // This removes the bottom 16px excess shadow/space and makes it perfectly centered!
  const svgContent = fs.readFileSync(sourceSvgPath, 'utf-8');
  const centeredSvg = svgContent.replace(/viewBox="[^"]+"/, 'viewBox="8 0 96 96"');
  const svgBuffer = Buffer.from(centeredSvg);

  // Overwrite public/app-icon.svg with the centered viewBox
  fs.writeFileSync(sourceSvgPath, centeredSvg, 'utf-8');
  console.log('Updated public/app-icon.svg with centered viewBox (8 0 96 96)');

  // 1. Play Store 512x512 icon
  const playstoreIconPath = path.join(resDir, 'playstore-icon-512.png');
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(playstoreIconPath);
  console.log('Saved Play Store icon (512x512):', playstoreIconPath);

  // 2. Public web icons
  const publicIcon512 = path.join(publicDir, 'icon-512.png');
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(publicIcon512);

  const publicIcon192 = path.join(publicDir, 'icon-192.png');
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(publicIcon192);

  // 3. Browser tab favicon (32x32, 48x48) & Next.js app icon
  const faviconIcoPath = path.join(publicDir, 'favicon.ico');
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(faviconIcoPath);
  console.log('Saved updated public/favicon.ico');

  // Next.js convention: src/app/icon.png automatically becomes the favicon
  const appIconPath = path.join(appDir, 'icon.png');
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(appIconPath);
  console.log('Saved src/app/icon.png for Next.js tab favicon');

  // Update public/logo.svg as well
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), centeredSvg, 'utf-8');

  // 4. Android Mipmap icons
  for (const m of mipmaps) {
    const targetDir = path.join(resDir, m.folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // ic_launcher.png
    await sharp(svgBuffer)
      .resize(m.size, m.size)
      .png()
      .toFile(path.join(targetDir, 'ic_launcher.png'));

    // ic_launcher_round.png
    const circleSvg = Buffer.from(
      `<svg width="${m.size}" height="${m.size}"><circle cx="${m.size / 2}" cy="${m.size / 2}" r="${m.size / 2}" fill="#fff" /></svg>`
    );
    await sharp(svgBuffer)
      .resize(m.size, m.size)
      .composite([{ input: circleSvg, blend: 'dest-in' }])
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_round.png'));

    // ic_launcher_foreground.png (for adaptive icon: centered with safe-margin padding)
    const innerSize = Math.round(m.fgSize * 0.72);
    const resizedInner = await sharp(svgBuffer)
      .resize(innerSize, innerSize)
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: m.fgSize,
        height: m.fgSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: resizedInner, gravity: 'center' }])
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));

    console.log(`Generated icons for ${m.folder}`);
  }

  // 5. Update ic_launcher_background.xml
  const bgXmlPath = path.join(resDir, 'values/ic_launcher_background.xml');
  const bgXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#312E81</color>
</resources>
`;
  fs.writeFileSync(bgXmlPath, bgXmlContent, 'utf-8');
  console.log('Updated ic_launcher_background.xml with #312E81');

  console.log('All icons cropped and generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
