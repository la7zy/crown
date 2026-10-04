// Checks the site folder before it is pushed. Run from the repository root:
//   node tools/check.mjs
// To also prove that every released episode opens with its code, give the teacher
// password in the environment (it is never written anywhere):
//   CROWN_PASSWORD=... node tools/check.mjs
import fs from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 150000;
const HEADER = 28; // 16-byte salt + 12-byte IV
const FORBIDDEN = /\.(pdf|zip)$/i;
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + msg); if (!ok) fails.push(msg); };
const exists = (f) => fs.existsSync(f) && fs.statSync(f).size > 0;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function open(file, secret) {
  const u = new Uint8Array(fs.readFileSync(file));
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(norm(secret)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: u.slice(0, 16), iterations: ITERATIONS, hash: 'SHA-256' }, km, 256);
  const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(16, 28) }, key, u.slice(HEADER));
  return JSON.parse(new TextDecoder().decode(plain));
}

let eps = [];
try { eps = JSON.parse(fs.readFileSync('episodes.json', 'utf8')).eps || []; check(eps.length > 0, 'episodes.json lists ' + eps.length + ' episodes'); }
catch (e) { check(false, 'episodes.json is valid JSON (' + e.message + ')'); }

for (const f of ['index.html', 'ep.html', 'teacher.html', 'teacher.bin', 'sw.js', 'manifest.webmanifest', '.nojekyll']) check(fs.existsSync(f), f + ' is present');

const sw = fs.existsSync('sw.js') ? fs.readFileSync('sw.js', 'utf8') : '';
const shell = (sw.match(/SHELL=\[([^\]]*)\]/) || [, ''])[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter((s) => s && s !== './');
for (const f of shell) check(exists(f), 'offline file ' + f + ' exists');

const ready = eps.filter((e) => e.ready);
for (const e of ready) {
  check(exists('ep' + e.n + '.bin') && fs.statSync('ep' + e.n + '.bin').size > HEADER, 'episode ' + e.n + ' has its ep' + e.n + '.bin');
  check(exists('thumb' + e.n + '.jpg'), 'episode ' + e.n + ' has its thumbnail');
  check(shell.includes('thumb' + e.n + '.jpg'), 'episode ' + e.n + ' thumbnail is in the offline list in sw.js');
}
for (const e of eps.filter((x) => !x.ready)) check(!fs.existsSync('ep' + e.n + '.bin'), 'unreleased episode ' + e.n + ' has no file on the site');

try {
  const m = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  for (const i of m.icons) check(exists(i.src), 'icon ' + i.src + ' exists');
} catch (e) { check(false, 'manifest.webmanifest is valid JSON (' + e.message + ')'); }

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.name === '.git' ? [] : x.isDirectory() ? walk(d + '/' + x.name) : [d + '/' + x.name]));
const leaked = walk('.').filter((f) => FORBIDDEN.test(f));
check(leaked.length === 0, 'no PDF or zip in the site folder' + (leaked.length ? ' (found ' + leaked.join(', ') + ')' : ''));

if (process.env.CROWN_PASSWORD) {
  try {
    const t = await open('teacher.bin', process.env.CROWN_PASSWORD);
    check(true, 'teacher.bin opens with the teacher password');
    check(t.eps.map((e) => e.n).sort().join() === ready.map((e) => e.n).sort().join(), 'teacher page lists the same ' + ready.length + ' released episodes');
    for (const e of t.eps) {
      try { const p = await open('ep' + e.n + '.bin', e.code); check(Boolean(p.html && p.title), 'episode ' + e.n + ' opens with its code'); }
      catch { check(false, 'episode ' + e.n + ' opens with its code'); }
    }
  } catch { check(false, 'teacher.bin opens with the teacher password'); }
} else console.log('SKIP  decryption checks (set CROWN_PASSWORD to run them)');

console.log(fails.length ? '\n' + fails.length + ' check(s) failed.' : '\nAll checks passed.');
process.exit(fails.length ? 1 : 0);
