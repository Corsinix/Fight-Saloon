// Petit serveur statique pour tester en local (npm start).
// En production, le dossier public/ est hébergé tel quel (Surge) et tout le reste passe par Supabase.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
};

// Liste des morceaux présents dans public/music/ (chemins relatifs), lue par audio.js :
// il ne demande ainsi que les fichiers qui existent.
const AUDIO_EXT = new Set(['.mp3', '.ogg', '.m4a', '.wav']);
function musicIndex(dir = path.join(PUBLIC, 'music'), base = '') {
  let out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out = out.concat(musicIndex(path.join(dir, e.name), rel));
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) out.push(rel);
  }
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/music/index.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(musicIndex()));
  }
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (url.pathname === '/' || !path.extname(file)) file = path.join(PUBLIC, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    // no-cache : le navigateur revérifie chaque fichier, pour toujours tester la dernière version du code
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🤠 Buckshot Saloon ouvert sur http://localhost:${PORT}\n`);
});
