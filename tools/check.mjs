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
// The reader: the episode page and what it loads once an episode is open.
const READER = ['ep.html', 'reader.js', 'reader.css', 'immersive.js', 'immersive.css', 'ambient.js', 'after.js', 'after.css'];
// Working files that hold episodes unlocked, or belong to the build. They must never reach the site.
const TEXT = /\.(html|js|mjs|css|json|webmanifest|md|txt|svg)$/i;   // the files that are searched for codes
const UNLOCKED = /(^|\/)(episode-\d\d\.js|series(-map)?\.js|story\.json|scenes\.json|extra\.json|source\.bin|test-codes\.json)$/i;
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

check(fs.existsSync('.nojekyll'), '.nojekyll is present');
for (const f of ['index.html', 'teacher.html', 'teacher.bin', 'sw.js', 'manifest.webmanifest', ...READER]) check(exists(f), f + ' is present');

// The episode page allows scripts from this site only, so it must not carry one of its own.
const page = (fs.existsSync('ep.html') ? fs.readFileSync('ep.html', 'utf8') : '').replace(/<!--[\s\S]*?-->/g, '');
const policy = (page.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/) || [, ''])[1];
const scriptsFrom = (policy.match(/script-src([^;]*)/) || [, ''])[1].trim();
check(/default-src 'self'/.test(policy) && scriptsFrom === "'self' 'unsafe-eval'", 'ep.html allows scripts from this site only');
check(!/<script(?![^>]*\bsrc=)/i.test(page) && !/\son[a-z]+\s*=/i.test(page), 'ep.html has no script written into the page');

const sw = fs.existsSync('sw.js') ? fs.readFileSync('sw.js', 'utf8') : '';
const shell = (sw.match(/SHELL=\[([^\]]*)\]/) || [, ''])[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter((s) => s && s !== './');
for (const f of shell) check(exists(f), 'offline file ' + f + ' exists');
for (const f of READER) check(shell.includes(f), f + ' is in the offline list in sw.js');

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
const unlocked = walk('.').filter((f) => UNLOCKED.test(f));
check(unlocked.length === 0, 'no working file with an unlocked episode in the site folder' + (unlocked.length ? ' (found ' + unlocked.join(', ') + ')' : ''));

if (process.env.CROWN_PASSWORD) {
  try {
    const t = await open('teacher.bin', process.env.CROWN_PASSWORD);
    check(true, 'teacher.bin opens with the teacher password');
    check(t.eps.map((e) => e.n).sort().join() === ready.map((e) => e.n).sort().join(), 'teacher page lists the same ' + ready.length + ' released episodes');
    // No code and no password may be written in a file anyone can read, however it is spelt.
    const secrets = [process.env.CROWN_PASSWORD, ...t.eps.map((e) => e.code)].map(norm).filter(Boolean);
    const carrying = walk('.').filter((f) => TEXT.test(f) && secrets.some((s) => norm(fs.readFileSync(f, 'utf8')).includes(s)));
    check(carrying.length === 0, 'no code and no password is written in a public file' + (carrying.length ? ' (look at ' + carrying.join(', ') + ')' : ''));
    for (const e of t.eps) {
      try {
        const p = await open('ep' + e.n + '.bin', e.code);
        check(Boolean(p.html && p.title), 'episode ' + e.n + ' opens with its code');
        check(Boolean(p.reader && p.extra && Array.isArray(p.extra.parts) && typeof p.code === 'string'), 'episode ' + e.n + ' is built for the reader with scenes behind the text');
      }
      catch { check(false, 'episode ' + e.n + ' opens with its code'); }
    }
  } catch { check(false, 'teacher.bin opens with the teacher password'); }
} else console.log('SKIP  the locked files were not opened, and the files were not searched for codes (set CROWN_PASSWORD to do both)');

const all = process.env.CROWN_PASSWORD ? 'All checks passed.' : 'The checks that could run passed. Set CROWN_PASSWORD to run them all.';
console.log(fails.length ? '\n' + fails.length + ' check(s) failed.' : '\n' + all);
process.exit(fails.length ? 1 : 0);
