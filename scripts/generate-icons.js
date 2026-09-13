/* eslint-disable @typescript-eslint/no-require-imports */
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

const splashScreens = [
  { folder: 'drawable', width: 512, height: 512, iconScale: 0.6 },
  { folder: 'drawable-port-mdpi', width: 320, height: 480, iconScale: 0.4 },
  { folder: 'drawable-port-hdpi', width: 480, height: 800, iconScale: 0.4 },
  { folder: 'drawable-port-xhdpi', width: 720, height: 1280, iconScale: 0.38 },
  { folder: 'drawable-port-xxhdpi', width: 960, height: 1600, iconScale: 0.36 },
  { folder: 'drawable-port-xxxhdpi', width: 1280, height: 1920, iconScale: 0.35 },
  { folder: 'drawable-land-mdpi', width: 480, height: 320, iconScale: 0.4 },
  { folder: 'drawable-land-hdpi', width: 800, height: 480, iconScale: 0.4 },
  { folder: 'drawable-land-xhdpi', width: 1280, height: 720, iconScale: 0.38 },
  { folder: 'drawable-land-xxhdpi', width: 1600, height: 960, iconScale: 0.36 },
  { folder: 'drawable-land-xxxhdpi', width: 1920, height: 1280, iconScale: 0.35 },
];

async function generate() {
  console.log('Generating zoomed app icons and splash screens...');

  // Read SVG and adjust viewBox from 8 0 96 96 to 13 5 86 86
  // Card is at x=16..96, y=8..88 (80x80).
  // In 86x86 box from (13, 5):
  // left margin = 16 - 13 = 3px, right margin = 99 - 96 = 3px
  // top margin = 8 - 5 = 3px, bottom margin = 91 - 88 = 3px
  // Card takes 80/86 = 93% of box (clearly zoomed in!)
  const svgContent = fs.readFileSync(sourceSvgPath, 'utf-8');
  const zoomedSvg = svgContent.replace(/viewBox="[^"]+"/, 'viewBox="13 5 86 86"');
  const svgBuffer = Buffer.from(zoomedSvg);

  fs.writeFileSync(sourceSvgPath, zoomedSvg, 'utf-8');
  console.log('Updated public/app-icon.svg with zoomed viewBox (13 5 86 86)');

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

  // 3. Browser tab favicon & Next.js app icon
  const faviconIcoPath = path.join(publicDir, 'favicon.ico');
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(faviconIcoPath);
  console.log('Saved updated public/favicon.ico');

  const appIconPath = path.join(appDir, 'icon.png');
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(appIconPath);
  console.log('Saved src/app/icon.png for Next.js tab favicon');

  fs.writeFileSync(path.join(publicDir, 'logo.svg'), zoomedSvg, 'utf-8');

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

    // ic_launcher_foreground.png (adaptive icon)
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

  // 6. Generate Android Splash Screens
  console.log('Generating splash screens for all screen densities...');
  for (const s of splashScreens) {
    const splashDir = path.join(resDir, s.folder);
    if (!fs.existsSync(splashDir)) {
      fs.mkdirSync(splashDir, { recursive: true });
    }

    const minDim = Math.min(s.width, s.height);
    const logoSize = Math.round(minDim * s.iconScale);
    const logoBuffer = await sharp(svgBuffer)
      .resize(logoSize, logoSize)
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: s.width,
        height: s.height,
        channels: 4,
        background: { r: 30, g: 27, b: 75, alpha: 1 } // #1E1B4B
      }
    })
      .composite([{ input: logoBuffer, gravity: 'center' }])
      .png()
      .toFile(path.join(splashDir, 'splash.png'));

    console.log(`Generated splash.png for ${s.folder} (${s.width}x${s.height})`);
  }

  console.log('All icons and splash screens generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
