import fs from 'fs';
import path from 'path';

const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf8'));
const bn = JSON.parse(fs.readFileSync('messages/bn.json', 'utf8'));

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

const enFlat = flatten(en);
const bnFlat = flatten(bn);

const srcFiles = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory() && f !== 'node_modules' && f !== '.next') walk(p);
    else if (/\.(tsx?|jsx?)$/.test(f)) srcFiles.push(p);
  }
}
walk('src');

const missing = new Map();

for (const file of srcFiles) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  /** @type {Record<string, string>} */
  const varNs = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nsM = line.match(/const\s+(\w+)\s*=\s*useTranslations\(\s*['"]([^'"]+)['"]\s*\)/);
    if (nsM) varNs[nsM[1]] = nsM[2];

    for (const [varName, ns] of Object.entries(varNs)) {
      const re = new RegExp(`\\b${varName}\\(\\s*['"]([^'"]+)['"]`, 'g');
      let c;
      while ((c = re.exec(line))) {
        const full = `${ns}.${c[1]}`;
        if (!(full in enFlat) || !(full in bnFlat)) {
          if (!missing.has(full)) missing.set(full, { files: new Set(), en: full in enFlat, bn: full in bnFlat });
          missing.get(full).files.add(`${file.replace(/\\/g, '/')}:${i + 1}`);
        }
      }
    }
  }
}

const sorted = [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log('Missing keys count:', sorted.length);
for (const [k, info] of sorted) {
  const tag = !info.en && !info.bn ? 'BOTH' : !info.en ? 'EN' : 'BN';
  console.log(`${tag}  ${k}  <- ${[...info.files].slice(0, 4).join(', ')}`);
}
