// Capture d'une page de public/ avec Chrome sans fenêtre (bancs d'essai : story-test.html, mini-test.html…).
//   node tools/shot.mjs <page.html> "<requête>" <sortie.png> [largeur] [hauteur]
//   ex. node tools/shot.mjs story-test.html "cut=intro&frames=0,1500,3000,4500" shot.png 1400 900
// Sert public/ sur un port libre le temps de la capture, puis affiche les erreurs JS relevées par la page
// (la page les écrit dans <pre id="errlog">).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const [page = 'story-test.html', query = '', out = 'shot.png', w = '1400', h = '900'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav' };
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const chrome = CHROMES.find((p) => fs.existsSync(p));
if (!chrome) { console.error('Chrome introuvable'); process.exit(1); }

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/${page}?${query}`;
  const common = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--virtual-time-budget=${process.env.VTIME || 20000}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${path.join(process.env.TEMP || '/tmp', `shot-${process.pid}`)}`];
  const run = (args) => new Promise((ok, ko) => {
    execFile(chrome, [...common, ...args, url], { maxBuffer: 1 << 26, timeout: 120000 }, (e, so) => (e ? ko(e) : ok(so)));
  });
  (async () => {
    try {
      const dom = await run(['--dump-dom']);
      const m = /<pre id="errlog"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
      const errs = m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : '(page non chargée ?)';
      const info = /<pre id="info"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
      if (info) console.log(info[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim());
      console.log(errs ? `ERREURS :\n${errs}` : 'aucune erreur');
      await run([`--screenshot=${path.resolve(out)}`]);
      console.log(`capture : ${path.resolve(out)}`);
    } catch (e) { console.error(e.message); process.exitCode = 1; }
    server.close();
  })();
});
