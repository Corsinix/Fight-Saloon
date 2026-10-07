// Capture de la page d'aperçu des armes en main (public/vm-test.html) avec Chrome sans fenêtre.
//   node tools/vmshot.mjs <sortie.png> "<requête>" [largeur] [hauteur]
//   ex. node tools/vmshot.mjs shot.png "ids=bow,winchester&z=2" 1600 1400
// Sert public/ sur un port libre le temps de la capture, puis affiche les erreurs JS relevées par la page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const [out = 'vmshot.png', query = 'ids=colt', w = '1600', h = '1200'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
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
  const url = `http://127.0.0.1:${server.address().port}/vm-test.html?${query}`;
  const common = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, '--virtual-time-budget=15000', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(process.env.TEMP || '/tmp', `vmshot-${process.pid}`)}`];
  const run = (args) => new Promise((ok, ko) => {
    // execFileSync bloquerait le serveur : on passe par un processus séparé
    import('node:child_process').then(({ execFile }) => execFile(chrome, [...common, ...args, url], { maxBuffer: 1 << 26, timeout: 90000 }, (e, so) => (e ? ko(e) : ok(so))));
  });
  (async () => {
    try {
      const dom = await run(['--dump-dom']);
      const m = /<pre id="errlog"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
      const errs = m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() : '(page non chargée ?)';
      const labels = [...dom.matchAll(/<div>([a-z]+ [a-z]+ \d+ [^<]*)<\/div>/g)].map((x) => x[1]);
      console.log(labels.join('\n'));
      console.log(errs ? `ERREURS :\n${errs}` : 'aucune erreur');
      await run([`--screenshot=${path.resolve(out)}`]);
      console.log(`capture : ${path.resolve(out)}`);
    } catch (e) { console.error(e.message); process.exitCode = 1; }
    server.close();
  })();
});
