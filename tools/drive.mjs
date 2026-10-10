// Pilote le vrai jeu (public/index.html) dans Chrome sans fenêtre, par le protocole DevTools, pour tester une interface
// de bout en bout : clics, saisie, captures. Les fonctions SQL de Supabase sont simulées (compte de test en mémoire,
// rien n'est écrit dans la base). Les tables à plusieurs passent par le vrai canal Realtime (messages éphémères).
//   node tools/drive.mjs <scénario.mjs> [largeur] [hauteur]
// Le scénario exporte : export default async (p) => { await p.click('#btn-story'); await p.shot('a.png'); … }
//   p.eval(expr) · p.click(sélecteur) · p.type(sélecteur, texte) · p.key(touche) · p.clickGame(x, y) (pixels du jeu 384×216)
//   p.wait(ms) · p.waitFor(expr, ms) · p.shot(fichier) · p.errors() (erreurs JS de la page) · p.log(texte)
//   p.open(pseudo) : un autre onglet, connecté sous un autre pseudo (même navigateur) -> un objet p de plus
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const [scenario, w = '1280', h = '800'] = process.argv.slice(2);
if (!scenario) { console.error('usage : node tools/drive.mjs <scénario.mjs>'); process.exit(1); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json' };
const CHROMES = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const chrome = CHROMES.find((p) => fs.existsSync(p));

// Supabase simulé : saloon_login / saloon_save_character / saloon_record renvoient un compte de test
const FAKE = (name) => `(() => {
  const real = window.fetch;
  let user = null;
  window.fetch = async (u, o) => {
    const url = String(u);
    if (!url.includes('/rest/v1/rpc/')) return real(u, o);
    const fn = url.split('/rpc/')[1];
    const args = o?.body ? JSON.parse(o.body) : {};
    if (fn === 'saloon_login') user = { username: args.p_username, character: args.p_character, stats: {}, history: [] };
    if (fn === 'saloon_save_character' && user) user.character = args.p_character;
    if (fn === 'saloon_leaderboard') return new Response('[]', { status: 200 });
    return new Response(JSON.stringify(user ? [user] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  window.__errors = [];
  addEventListener('error', (e) => window.__errors.push(e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')'));
  addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  try { localStorage.setItem('bs-user', ${JSON.stringify(name)}); } catch {}
})();`;

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const port = 9300 + Math.floor(Math.random() * 500);
const prof = path.join(process.env.TEMP || '/tmp', `drive-${process.pid}`);
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--remote-debugging-port=${port}`,
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let first = null;
for (let k = 0; k < 50 && !first; k++) {
  await sleep(200);
  try { first = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!first) { console.error('Chrome ne répond pas'); proc.kill(); process.exit(1); }

const sockets = [];
async function openPage(target, name) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  sockets.push(ws);
  await new Promise((r) => ws.on('open', r));
  let id = 0;
  const pending = new Map();
  ws.on('message', (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }); // chaque onglet se croit au premier plan
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: FAKE(name) });
  await cdp('Page.navigate', { url: base });
  await sleep(1500);

  const ev = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(`${expr} : ${r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text}`);
    return r.result?.result?.value;
  };
  const center = async (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  const mouse = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, pointerType: 'mouse' });
  };
  return {
    name,
    eval: ev,
    wait: sleep,
    log: (m) => console.log(`[${name}] ${m}`),
    async click(sel) {
      const c = await center(sel);
      if (!c) throw new Error(`[${name}] introuvable : ${sel}`);
      await mouse(c[0], c[1]);
      await sleep(150);
    },
    async clickGame(x, y) {
      const r = await ev(`(() => { const c = document.getElementById('game').getBoundingClientRect(); return [c.x, c.y, c.width, c.height]; })()`);
      const k = Math.min(r[2] / 384, r[3] / 216);
      const ox = r[0] + (r[2] - 384 * k) / 2, oy = r[1] + (r[3] - 216 * k) / 2;
      await mouse(ox + x * k, oy + y * k);
      await sleep(150);
    },
    async type(sel, text) {
      await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    },
    async key(key) {
      const code = key === ' ' ? 'Space' : key;
      for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key, code, text: type === 'keyDown' && key.length === 1 ? key : undefined, windowsVirtualKeyCode: key === ' ' ? 32 : key === 'Enter' ? 13 : key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0) });
      await sleep(80);
    },
    async waitFor(expr, ms = 10000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(150); }
      throw new Error(`[${name}] délai dépassé : ${expr}`);
    },
    async shot(file) {
      await cdp('Page.bringToFront');
      const r = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      console.log(`capture : ${path.resolve(file)}`);
    },
    errors: () => ev('window.__errors'),
    async open(other) {
      const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      const q = await openPage(t, other);
      pages.push(q);
      return q;
    },
  };
}

const pages = [];
const p = await openPage(first, 'Testeur');
pages.push(p);
try {
  const mod = await import(pathToFileURL(path.resolve(scenario)).href);
  await mod.default(p);
  for (const q of pages) {
    const errs = await q.errors();
    console.log(errs?.length ? `[${q.name}] ERREURS :\n${errs.join('\n')}` : `[${q.name}] aucune erreur`);
  }
} catch (e) {
  console.error(`ÉCHEC : ${e.message}`);
  for (const q of pages) {
    const errs = await q.errors().catch(() => []);
    if (errs?.length) console.log(`[${q.name}] ERREURS :\n${errs.join('\n')}`);
  }
  process.exitCode = 1;
}
for (const ws of sockets) ws.close();
proc.kill();
server.close();
setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} process.exit(); }, 500);
