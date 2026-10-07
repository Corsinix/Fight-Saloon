// Empreinte de version pour le service worker (public/sw.js) : l'hôte et les joueurs doivent avoir le même code.
// Calcule l'empreinte de chaque fichier publié (ceux que Surge envoie : .surgeignore et public/music exclus)
// et l'écrit dans sw.js (VERSION, FILES). Nouveau contenu = nouvelle empreinte = nouveau service worker et nouveau cache.
//   node tools/stamp.mjs            écrit l'empreinte
//   node tools/stamp.mjs --reset    revient à VERSION 'dev' (réseau d'abord : le serveur local sert toujours le dernier code)
//   node tools/stamp.mjs -- <cmd>   écrit l'empreinte, lance la commande (le déploiement), puis revient à 'dev'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SW = path.join(PUBLIC, 'sw.js');

// motifs de .surgeignore (nom, dossier, dossier/**, *.ext) + ce qui ne doit jamais être en cache
function ignored() {
  let pats = [];
  try { pats = fs.readFileSync(path.join(PUBLIC, '.surgeignore'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')); } catch {}
  pats.push('music', 'sw.js');
  const res = pats.map((p) => new RegExp(`^${p.replace(/\/\*\*$/, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}(/.*)?$`));
  return (rel) => rel.split('/').some((part) => part.startsWith('.')) || res.some((re) => re.test(rel));
}

function files() {
  const skip = ignored();
  const out = {};
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(PUBLIC, abs).replace(/\\/g, '/');
      if (skip(rel)) continue;
      if (e.isDirectory()) walk(abs);
      else out[rel] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 12);
    }
  })(PUBLIC);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function write(version, list) {
  let src = fs.readFileSync(SW, 'utf8');
  const v = /^const VERSION = '[^']*';/m, f = /^const FILES = \{.*\};.*$/m;
  if (!v.test(src) || !f.test(src)) throw new Error('sw.js : lignes VERSION / FILES introuvables');
  src = src.replace(v, `const VERSION = '${version}';`)
    .replace(f, `const FILES = ${JSON.stringify(list)}; // chemin -> empreinte du fichier`);
  fs.writeFileSync(SW, src);
}

function stamp() {
  const list = files();
  const version = crypto.createHash('sha256').update(Object.entries(list).map(([p, h]) => `${p}:${h}`).join('\n')).digest('hex').slice(0, 10);
  write(version, list);
  console.log(`sw.js : version ${version}, ${Object.keys(list).length} fichiers`);
}

function reset() {
  write('dev', {});
  console.log('sw.js : version dev');
}

const args = process.argv.slice(2);
const sep = args.indexOf('--');
if (args[0] === '--reset') reset();
else if (sep >= 0) {
  stamp();
  let status = 1;
  try {
    status = spawnSync(args.slice(sep + 1).join(' '), { stdio: 'inherit', shell: true }).status ?? 1;
  } finally {
    reset();
  }
  process.exitCode = status;
} else stamp();
