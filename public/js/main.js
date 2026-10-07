// Point d'entrée : écrans, réseau, lobby, interface de jeu.
import { Net, fetchLeaderboard } from './net.js';
import { initAudio, playMusic, nextTrack, sfx, toggleMute, setVolume, audioSettings, setMood } from './audio.js';
import { Scene, due60 } from './scene.js';
import { Editor, drawPortraitInto } from './editor.js';
import * as S from './sprites.js';
import { ITEMS } from './data.js';
import { ShooterScene } from './shooter.js';
import { LassoScene } from './lasso.js';
import { DuelScene } from './duel.js';
import { CharlieScene } from './charlie.js';
import { FortScene } from './fort.js';
import { WagonScene } from './wagon.js';
import { PinteScene } from './pinte.js';
import { MineScene } from './mine.js';
import { CourseScene } from './course.js';
import { RtsScene } from './rts.js';
import { FpsScene, FpsDmScene } from './fps.js';
import { TEAM_NAMES } from './fortgame.js';
import { MODES, PLAYER_COLORS } from './worlds.js';
import { VARIANTS, variantName } from './variants.js';
import { gameIcon } from './gameicons.js';
import { TouchPad } from './touch.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const net = new Net();
let user = null;
let lobby = null;
let scene = null; // roulette
let mini = null; // mini-jeu en cours (fusillade, lasso, duel, Charlie)
const MINI_SCENES = { shooter: ShooterScene, lasso: LassoScene, duel: DuelScene, charlie: CharlieScene, fort: FortScene, wagon: WagonScene, pinte: PinteScene, mine: MineScene, course: CourseScene, rts: RtsScene, fps: FpsScene, fpsdm: FpsDmScene };
let screen = 'title';
const pad = new TouchPad(document.getElementById('touchpad')); // commandes tactiles des mini-jeux
let pending = false;
let lassoSlot = -1;
let matchStart = 0;
let music = 'menu';
let pendingJoin = new URLSearchParams(location.search).get('lobby');
let savedName = null;
try { savedName = localStorage.getItem('bs-user'); } catch {}

const ICON = {
  heart: S.heartFull().toDataURL(),
  heartOff: S.heartEmpty().toDataURL(),
  star: S.starIcon(true).toDataURL(),
  starOff: S.starIcon(false).toDataURL(),
};

// Icône pixel art en <img>, agrandie d'un facteur entier pour rester nette
const pxCache = {};
function pxIcon(name, scale = 2) {
  const c = S.uiIcon(name);
  pxCache[name] ||= c.toDataURL();
  return `<img class="px-ico" src="${pxCache[name]}" width="${c.width * scale}" height="${c.height * scale}" alt="">`;
}
for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', pxIcon(el.dataset.icon));

// ------------------------------------------------------------ utilitaires UI
function toast(html, where = 'global-toasts') {
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML = html;
  $(where).appendChild(d);
  setTimeout(() => d.remove(), 6000);
}

// ------------------------------------------------------------ diagnostic (surtout pour les téléphones)
// 1) Une erreur JavaScript s'affiche à l'écran (une fois par message) : on peut la photographier pour la signaler.
const seenErrors = new Set();
function reportError(msg, where) {
  msg = String(msg || 'erreur inconnue');
  if (msg === 'Script error.' || msg.includes('ResizeObserver')) return; // bruit sans intérêt (autres sites, extensions)
  const key = `${msg}|${where}`;
  if (seenErrors.has(key) || seenErrors.size >= 5) return;
  seenErrors.add(key);
  toast(`<b>Erreur :</b> ${esc(msg)}${where ? ` <small>(${esc(where)})</small>` : ''}`);
}
addEventListener('error', (e) => reportError(e.message, e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : ''));
addEventListener('unhandledrejection', (e) => reportError(e.reason?.message || e.reason, ''));
// 2) Partie en cours notée dans sessionStorage, effacée en quittant normalement. Si le navigateur tue la page
//    (mémoire du téléphone), elle se recharge avec la note encore là : on le dit, avec le jeu et la durée.
const LIVE_KEY = 'bs-live';
let liveTimer = 0;
function liveMark(kind) {
  clearInterval(liveTimer);
  const t0 = Date.now();
  const save = () => { if (document.hidden) return; try { sessionStorage.setItem(LIVE_KEY, JSON.stringify({ kind, s: Math.round((Date.now() - t0) / 1000) })); } catch {} };
  save();
  liveTimer = setInterval(save, 2000);
}
function liveClear() {
  clearInterval(liveTimer);
  try { sessionStorage.removeItem(LIVE_KEY); } catch {}
}
addEventListener('pagehide', liveClear);
// en arrière-plan, le téléphone peut fermer l'onglet pour faire de la place : ce n'est pas un plantage du jeu
document.addEventListener('visibilitychange', () => { if (document.hidden) try { sessionStorage.removeItem(LIVE_KEY); } catch {} });
try {
  const crashed = JSON.parse(sessionStorage.getItem(LIVE_KEY) || 'null');
  sessionStorage.removeItem(LIVE_KEY);
  if (crashed) {
    const name = crashed.kind === 'roulette' ? 'la roulette' : `« ${MODES[crashed.kind]?.name || crashed.kind} »`;
    setTimeout(() => toast(`<b>Le jeu s’est fermé tout seul</b> pendant ${esc(name)}, après ${crashed.s} s de partie. Le téléphone a sans doute manqué de mémoire.`), 800);
  }
} catch {}

// Fenêtre de confirmation au style du jeu (remplace confirm()) : renvoie une promesse (true = confirmé).
// Échap ou un clic à côté = annuler. Pour une action risquée (danger), le focus est sur « annuler ».
let modalDone = null;
function askConfirm({ title, text, yes = 'Oui', no = 'Annuler', icon = null, danger = false }) {
  if (modalDone) modalDone(false); // une seule question à la fois
  $('modal-title').textContent = title;
  $('modal-text').textContent = text;
  $('modal-yes').textContent = yes;
  $('modal-no').textContent = no;
  $('modal-yes').classList.toggle('danger', danger);
  $('modal-icon').innerHTML = icon ? pxIcon(icon, 2) : '';
  $('modal').classList.remove('hidden');
  const before = document.activeElement;
  (danger ? $('modal-no') : $('modal-yes')).focus();
  sfx('ding');
  return new Promise((resolve) => {
    modalDone = (ok) => {
      modalDone = null;
      $('modal').classList.add('hidden');
      before?.focus?.();
      resolve(ok);
    };
  });
}
$('modal-yes').onclick = () => modalDone?.(true);
$('modal-no').onclick = () => modalDone?.(false);
$('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal')) modalDone?.(false); });
// tant que la fenêtre est ouverte, le clavier lui appartient (pas de chat, de rechargement ni de pari en douce)
document.addEventListener('keydown', (e) => {
  if (!modalDone) return;
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { e.preventDefault(); modalDone(false); }
  else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === $('modal-yes') ? $('modal-no') : $('modal-yes')).focus(); }
}, true);

function setMusic(name) {
  music = name;
  playMusic(name);
}

function show(name) {
  screen = name;
  hideSpin();
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== `scr-${name}`);
  const game = name === 'game';
  $('bg').classList.toggle('hidden', game);
  $('hud').classList.toggle('hidden', !game);
  $('bottombar').classList.toggle('hidden', !game);
  $('scr-game').classList.toggle('multi', game && !!lobby && !lobby.solo); // bouton de chat tactile
  if (!game) { $('progress-fill').style.width = '0'; $('tooltip').classList.add('hidden'); }
}

function setUrl(code) {
  history.replaceState(null, '', code ? `?lobby=${code}` : location.pathname);
}

// Son : au doigt, seul le lâcher autorise le navigateur à lancer l'audio (iPhone notamment).
const unlockAudio = (e) => {
  if (e.type === 'pointerdown' && e.pointerType !== 'mouse') return;
  initAudio();
  playMusic(music);
};
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('pointerup', unlockAudio);

// Joué au doigt ? (body.touch : commandes tactiles, aides adaptées). Suit le dernier pointeur utilisé.
const setTouch = (on) => document.body.classList.toggle('touch', on);
setTouch(matchMedia('(hover: none) and (pointer: coarse)').matches);
document.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'pen') setTouch(e.pointerType === 'touch'); }, true);

// Plein écran (Android, tablettes ; l'iPhone ne le permet pas : ajouter le site à l'écran d'accueil)
if (document.fullscreenEnabled) {
  $('btn-full').classList.remove('hidden');
  $('btn-full').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  };
}
document.addEventListener('click', (e) => { if (e.target.closest('.btn')) sfx('ui'); });

// ------------------------------------------------------------ application installable
// Service worker (sw.js) : démarrage rapide et écran d'accueil. Seulement en https (ou en local).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// Bouton « Installer l'app » du menu : la vraie fenêtre d'installation sur Android (Chrome, Edge, Samsung),
// et la marche à suivre sur iPhone (Safari n'a pas de fenêtre d'installation) ou dans les autres navigateurs.
const installed = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// téléphone ou tablette : écran tactile comme pointeur principal (un PC tactile garde la souris en principal)
const isMobile = isIos || /android/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  if (!isMobile) return; // sur PC, pas de bouton : le navigateur garde son icône d'installation dans la barre d'adresse
  e.preventDefault();
  installPrompt = e;
  $('btn-install').classList.remove('hidden');
});
addEventListener('appinstalled', () => {
  installPrompt = null;
  $('btn-install').classList.add('hidden');
  toast('Le saloon est installé : retrouve-le sur ton écran d’accueil.');
});
if (!installed() && isMobile) {
  // sur iPhone tout de suite ; ailleurs, seulement si le navigateur ne propose pas sa propre fenêtre
  setTimeout(() => { if (!installed()) $('btn-install').classList.remove('hidden'); }, isIos ? 0 : 3000);
}
$('btn-install').onclick = async () => {
  if (installPrompt) {
    const p = installPrompt;
    installPrompt = null;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') $('btn-install').classList.add('hidden');
    return;
  }
  await askConfirm({
    title: 'Installer le saloon',
    text: isIos
      ? 'Dans Safari, touche le bouton Partager (le carré avec une flèche vers le haut), puis « Sur l’écran d’accueil ». Le saloon s’ouvrira ensuite en plein écran, comme une app.'
      : 'Ouvre le menu du navigateur (les trois points), puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
    yes: 'Compris', no: 'Fermer', icon: 'hat',
  });
};

const muteIcon = (m) => pxIcon(m ? 'soundOff' : 'soundOn');
$('btn-mute').onclick = () => { initAudio(); $('btn-mute').innerHTML = muteIcon(toggleMute()); };
$('btn-mute').innerHTML = muteIcon(audioSettings.muted);
$('vol-music').value = audioSettings.music;
$('vol-music').oninput = (e) => setVolume('music', +e.target.value);
$('btn-next').onclick = () => { initAudio(); nextTrack(); };
window.addEventListener('bs-track', (e) => { $('tb-track').textContent = e.detail ? `♪ ${e.detail}` : ''; });

// ------------------------------------------------------------ fond désert animé
const bgx = $('bg').getContext('2d');
bgx.imageSmoothingEnabled = false;
const desert = S.makeCanvas(384, 216);
S.drawDesert(desert.getContext('2d'), 0, 0, 384, 216, { sunX: 0.76, sunY: 0.27 });
const tw = { x: -30 };
const bgGate = { next: 0 };
(function bgLoop(t) {
  requestAnimationFrame(bgLoop);
  if (screen !== 'game' && due60(bgGate, t)) {
    bgx.drawImage(desert, 0, 0);
    for (let i = 0; i < 3; i++) {
      const a = t / 5000 + i * 2.1;
      S.vulture(bgx, Math.round(70 + i * 105 + Math.cos(a) * 34), Math.round(26 + i * 7 + Math.sin(a) * 9), t + i * 90);
    }
    tw.x += 0.7;
    if (tw.x > 410) tw.x = -40 - Math.random() * 400;
    S.tumbleweed(bgx, Math.round(tw.x), Math.round(178 - Math.abs(Math.sin(t / 170)) * 7), t);
  }
})(0);

// ------------------------------------------------------------ connexion
$('username').value = savedName || '';
$('login-form').onsubmit = (e) => {
  e.preventDefault();
  initAudio();
  setMusic('menu');
  net.send({ t: 'hello', username: $('username').value.trim() });
};

net.on('open', () => {
  const name = user?.username || savedName;
  if (name) net.send({ t: 'hello', username: name });
});

net.on('welcome', ({ user: u }) => {
  user = u;
  savedName = u.username;
  try { localStorage.setItem('bs-user', u.username); } catch {}
  $('tb-info').textContent = `@${u.username}`;
  if (lobby) return net.send({ t: 'joinLobby', code: lobby.code });
  if (screen === 'title') showMenu();
  if (pendingJoin) {
    net.send({ t: 'joinLobby', code: pendingJoin });
    pendingJoin = null;
  }
});

net.on('user', ({ user: u }) => {
  if (!u) return;
  user = u;
  if (screen === 'menu') showMenu();
});

net.on('error', ({ text }) => {
  toast(esc(text));
  pending = false;
  updateControls();
  if (!lobby) setUrl(null);
  if (!user && screen !== 'title') show('title');
});

net.on('info', ({ text }) => toast(esc(text), screen === 'game' ? 'toasts' : 'global-toasts'));

net.on('kicked', ({ text }) => {
  net.stopped = true;
  toast(esc(text));
  show('title');
});

// ------------------------------------------------------------ menu
async function showMenu() {
  show('menu');
  setMusic('menu');
  $('menu-hello').textContent = `Salut, ${user.username}.`;
  const poster = $('menu-poster');
  poster.innerHTML = `<div class="poster-head">WANTED</div><canvas width="56" height="60"></canvas>
    <div class="poster-name">${esc(user.username)}</div><div class="poster-sub">Récompense : $${100 + user.stats.wins * 250}</div>`;
  drawPortraitInto(poster.querySelector('canvas'), user.character);
  renderMenuStats(user.stats || {}, user.history || []);
  try {
    renderLeaderboard(await fetchLeaderboard());
  } catch {}
}

// Palmarès : trois tuiles (roulette, solo, mini-jeux), les tirs, puis les 3 dernières parties.
function renderMenuStats(s, history) {
  const n = (v) => v || 0;
  const vd = (v, d) => `<span class="v">${n(v)}</span><i>/</i><span class="d">${n(d)}</span>`;
  const last = history.slice(0, 3).map((h) => {
    const ico = pxIcon(h.result === 'victoire' ? 'trophy' : 'skull');
    const extra = `${h.solo ? ', solo' : ''}${h.forfeit ? ', abandon' : ''}`;
    const text = h.game
      ? `${esc(MODES[h.game]?.name || h.game)} : ${h.rank}${h.rank === 1 ? 'er' : 'e'}/${h.of} <em>(${esc(h.score)}${extra})</em>`
      : `Roulette contre ${esc(h.opponent)} <em>(${esc(h.score)}${extra})</em>`;
    return `<li>${ico}<span>${text}</span></li>`;
  }).join('');
  $('menu-stats').innerHTML = `
    <div class="tiles">
      <div class="tile" title="Duels de roulette : victoires / défaites"><b>${vd(s.wins, s.losses)}</b><small>Roulette</small></div>
      <div class="tile" title="Parties contre l'ordinateur : victoires / défaites"><b>${vd(s.soloWins, s.soloLosses)}</b><small>Solo</small></div>
      <div class="tile" title="Mini-jeux : victoires / parties jouées"><b>${vd(s.mgWins, s.mgPlayed)}</b><small>Mini-jeux</small></div>
    </div>
    <p class="shots">Tirs <b>${n(s.shots)}</b> · sur soi <b>${n(s.selfShots)}</b> · touchés <b>${n(s.hits)}</b></p>
    ${last ? `<ul class="last">${last}</ul>` : '<p class="empty">Aucune partie pour l’instant.</p>'}`;
}

// Classement de la roulette : rang, portrait, pseudo, victoires et défaites alignées ; ta ligne ressort.
function renderLeaderboard(lb) {
  const ol = $('leaderboard');
  if (!lb.length) { ol.innerHTML = '<li class="empty">Personne encore… à toi l’honneur.</li>'; return; }
  const me = user?.username.toLowerCase();
  ol.innerHTML = lb.map((u, i) => `
    <li class="${u.username.toLowerCase() === me ? 'me' : ''}" title="${esc(u.username)} : ${u.wins} victoires, ${u.losses} défaites">
      <span class="rk">${i + 1}</span><canvas width="56" height="60"></canvas><span class="nm">${esc(u.username)}</span>
      <span class="v">${u.wins}<small>V</small></span><span class="d">${u.losses}<small>D</small></span>
    </li>`).join('');
  ol.querySelectorAll('canvas').forEach((c, i) => drawPortraitInto(c, lb[i].character || {}));
}

// Cartes des jeux en solo (nom court et adversaires ; nom complet et règle en infobulle)
const SOLO = {
  roulette: ['Roulette', '1 bot'], shooter: ['Fusillade', '3 bots'], lasso: ['Lasso', '3 bots'], duel: ['Duel', '1 bot'],
  charlie: ['Charlie', '3 bots'], fort: ['Fort', 'toi + 1 bot'], wagon: ['Roulotte', '3 bots'], pinte: ['Pinte', '3 bots'], mine: ['Mine', '3 bots'],
  course: ['Course', '3 bots'], rts: ['Conquête', '3 bots'], fps: ['Règlement', '3 bots'], fpsdm: ['Mort ou vif', '3 bots'],
};
// Pages de 2 × 3 jeux, parcourues avec les flèches ; les cases vides annoncent les prochains jeux.
const SOLO_PAGE = 6;
const soloIds = Object.keys(MODES);
const soloPages = Math.max(1, Math.ceil(soloIds.length / SOLO_PAGE));
let soloPage = 0;
const icoImg = (ico) => (ico ? `<img class="px-ico" src="${ico.toDataURL()}" width="${ico.width * 2}" height="${ico.height * 2}" alt="">` : '');
function soloCard(id) {
  if (!id) return `<div class="solo-card soon" aria-disabled="true" title="Un nouveau jeu arrive bientôt au saloon">${icoImg(gameIcon('soon'))}<b>Coming soon</b><small>bientôt</small></div>`;
  const m = MODES[id];
  const [name, vs] = SOLO[id] || [m.name, m.max > 2 ? '3 bots' : '1 bot'];
  return `<button class="solo-card" data-solo="${id}" title="${esc(m.name)} : ${esc(m.sub)}">${icoImg(gameIcon(id))}<b>${esc(name)}</b><small>${esc(vs)}</small></button>`;
}
function renderSolo() {
  const ids = soloIds.slice(soloPage * SOLO_PAGE, (soloPage + 1) * SOLO_PAGE);
  while (ids.length < SOLO_PAGE) ids.push(null);
  $('solo-grid').innerHTML = ids.map(soloCard).join('');
  $('solo-prev').disabled = soloPage === 0;
  $('solo-next').disabled = soloPage >= soloPages - 1;
  $('solo-dots').innerHTML = soloPages > 1
    ? Array.from({ length: soloPages }, (_, k) => `<button class="${k === soloPage ? 'on' : ''}" data-page="${k}" aria-label="Page ${k + 1}"></button>`).join('')
    : '';
}
const soloGo = (k) => {
  const p = Math.max(0, Math.min(soloPages - 1, k));
  if (p === soloPage) return;
  soloPage = p;
  sfx('ui');
  renderSolo();
};
$('solo-prev').onclick = () => soloGo(soloPage - 1);
$('solo-next').onclick = () => soloGo(soloPage + 1);
$('solo-dots').onclick = (e) => { const b = e.target.closest('[data-page]'); if (b) soloGo(+b.dataset.page); };
renderSolo();

$('btn-create').onclick = () => net.send({ t: 'createLobby' });
$('solo-grid').onclick = (e) => {
  const b = e.target.closest('[data-solo]');
  if (b) net.send({ t: 'createSolo', mode: b.dataset.solo });
};
$('btn-join').onclick = () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code) net.send({ t: 'joinLobby', code });
};
$('join-code').onkeydown = (e) => { if (e.key === 'Enter') $('btn-join').click(); };
$('btn-logout').onclick = () => {
  try { localStorage.removeItem('bs-user'); } catch {}
  user = null;
  savedName = null;
  $('tb-info').textContent = '';
  show('title');
};

// ------------------------------------------------------------ éditeur
const editor = new Editor({
  onSave: (c) => { net.send({ t: 'saveChar', character: c }); user.character = c; showMenu(); },
  onBack: () => showMenu(),
});
$('btn-edit').onclick = () => { show('editor'); editor.open(user.character, user.username); };

// ------------------------------------------------------------ lobby
net.on('lobby', ({ lobby: l }) => {
  const prev = lobby;
  lobby = l;
  setUrl(l.code);
  if (prev && screen === 'game') {
    for (const p of l.players) {
      const was = prev.players.find((x) => x.name === p.name);
      if (was && was.connected && !p.connected && p.name !== user.username) {
        toast(`<b>${esc(p.name)}</b> a perdu la connexion… 45 s pour revenir.`, 'toasts');
      }
    }
  }
  if (l.inGame) {
    if (screen !== 'game' || !$('gameover').classList.contains('hidden')) enterGame(l.game);
  } else if (screen === 'game') updateGameOver();
  else if (!l.solo) showLobby();
});

function closeScenes() {
  liveClear();
  pad.detach();
  if (scene) { scene.destroy(); scene = null; }
  if (mini) { mini.destroy(); mini = null; }
}

net.on('left', () => {
  lobby = null;
  setUrl(null);
  closeScenes();
  showMenu();
});

// Déroulé d'une table à plusieurs : un jeu choisi par l'hôte, la roue (jeu tiré au sort), ou un championnat.
const FORMATS = {
  single: ['Un jeu', 'L’hôte choisit le jeu'],
  wheel: ['La roue', 'Un jeu tiré au sort parmi la sélection, à chaque partie'],
  champ: ['Championnat', 'Plusieurs jeux tirés au sort à la suite : des points à chaque partie (5, 3, 2, 1), classement à la fin'],
};
const ROUNDS = [3, 5, 7, 10];
const playersText = (m) => (m.min === m.max ? `${m.min} joueurs` : `${m.min} à ${m.max} joueurs`);
const fits = (m, n) => n >= m.min && n <= m.max;

function showLobby() {
  if (screen !== 'lobby') { show('lobby'); setMusic('menu'); }
  const l = lobby;
  const fmt = FORMATS[l.format] ? l.format : 'single';
  const single = fmt === 'single';
  const mode = MODES[l.mode] || MODES.roulette;
  const isHost = isHostOf(l);
  const n = l.players.length;
  const pool = l.pool || Object.keys(MODES);
  const champ = fmt === 'champ' ? l.champ : null;
  const champOn = !!champ && !champ.done;
  const lock = !isHost || l.spinning; // réglages réservés à l'hôte, figés pendant le tirage
  $('lobby-code').textContent = l.code;
  $('lobby-link').value = `${location.origin}/?lobby=${l.code}`;
  const lk = $('btn-lock');
  lk.textContent = l.locked ? 'Table fermée' : 'Table ouverte';
  lk.classList.toggle('on', !!l.locked);
  lk.disabled = !isHost;
  lk.title = isHost
    ? (l.locked ? 'Rouvrir la table aux nouveaux venus' : 'Fermer la table : plus personne ne peut entrer avec le code')
    : (l.locked ? 'L’hôte a fermé la table aux nouveaux venus' : 'Tout le monde peut entrer avec le code');

  $('formats').innerHTML = Object.entries(FORMATS).map(([id, [name, tip]]) =>
    `<button type="button" class="${fmt === id ? 'on' : ''}" data-format="${id}" title="${esc(tip)}" ${lock ? 'disabled' : ''}>${name}</button>`).join('');
  $('rounds').classList.toggle('hidden', fmt !== 'champ');
  const nRounds = champOn ? champ.rounds : l.rounds;
  $('rounds').innerHTML = '<span class="lbl">Jeux :</span>' + ROUNDS.map((r) =>
    `<button type="button" class="${nRounds === r ? 'on' : ''}" data-rounds="${r}" ${lock || champOn ? 'disabled' : ''}>${r}</button>`).join('');

  // un jeu : on choisit la carte ; roue et championnat : on coche les jeux qui peuvent tomber
  const all = pool.length >= Object.keys(MODES).length;
  $('modes-label').innerHTML = single ? 'Choisis le jeu :'
    : `Jeux dans la roue (${pool.length}) :${isHost && !all ? ' <button type="button" class="mini-link" data-poolall>tout cocher</button>' : ''}`;
  // le jeu choisi change : on affiche sa page
  if (single && l.mode !== modesShown) modesPage = Math.floor(Math.max(0, soloIds.indexOf(l.mode)) / MODES_PAGE);
  modesShown = single ? l.mode : null;
  renderModes();
  // un jeu à variantes : l'hôte peut imposer la carte, la région, la salle… (sinon tirée au hasard)
  const V = single ? VARIANTS[l.mode] : null;
  const variant = V ? l.variants?.[l.mode] ?? null : null;
  $('variants').classList.toggle('hidden', !V);
  if (V) {
    $('variants').innerHTML = `<span class="lbl">${esc(V.label)} :</span>` + [{ id: '', name: V.any || 'Aléatoire' }, ...V.list].map((v) =>
      `<button type="button" class="${(variant ?? '') === v.id ? 'on' : ''}" data-variant="${v.id}" ${lock ? 'disabled' : ''}>${esc(v.name)}</button>`).join('');
  }

  $('players-n').textContent = `${n}/${l.max || 6}`;
  renderSeats(l, isHost);
  renderChampBoard(l, isHost);

  const compat = pool.filter((id) => MODES[id] && fits(MODES[id], n));
  const start = $('btn-start');
  start.classList.toggle('hidden', !isHost);
  let hint;
  if (single) {
    const tooMany = n > mode.max;
    start.disabled = n < mode.min || tooMany || l.spinning;
    start.textContent = `Lancer : ${SOLO[l.mode]?.[0] || mode.name}${variant ? ` — ${variantName(l.mode, variant)}` : ''}`;
    hint = tooMany
      ? `${mode.name} se joue à ${mode.max} maximum. ${isHost ? 'Choisis un autre jeu.' : 'L’hôte doit choisir un autre jeu.'}`
      : n < mode.min
        ? 'Partage le lien ou le code, ou ajoute un bot. La partie commence quand l’hôte la lance.'
        : isHost ? 'Choisis le jeu et lance la partie !' : `L’hôte va lancer : ${mode.name}…`;
  } else {
    start.disabled = n < 2 || !compat.length || l.spinning;
    start.textContent = fmt === 'wheel' ? 'Lancer la roue' : champOn ? `Jeu suivant (${champ.n + 1}/${champ.rounds})` : 'Lancer le championnat';
    const what = fmt === 'wheel' ? 'la roue' : 'le championnat';
    hint = l.spinning ? 'La roue tourne…'
      : n < 2 ? 'Partage le lien ou le code, ou ajoute un bot.'
        : !compat.length ? `Aucun jeu coché ne se joue à ${n}. ${isHost ? 'Ajoute des jeux à la roue.' : ''}`
          : isHost ? `${compat.length} jeu${compat.length > 1 ? 'x' : ''} possible${compat.length > 1 ? 's' : ''} à ${n} joueurs. Lance ${what} !`
            : `L’hôte va lancer ${what}…`;
  }
  $('lobby-hint').textContent = hint;
}

// Choix du jeu : les cartes du menu solo (icône, nom court), par pages de 2 × 4 parcourues avec les flèches.
// Un jeu : on choisit la carte ; roue et championnat : on coche les jeux qui peuvent tomber.
const MODES_PAGE = 8;
const modesPages = Math.max(1, Math.ceil(soloIds.length / MODES_PAGE));
let modesPage = 0;
let modesShown = null;
function renderModes() {
  const l = lobby;
  if (!l) return;
  const single = (l.format || 'single') === 'single';
  const isHost = isHostOf(l);
  const n = l.players.length;
  const pool = l.pool || soloIds;
  const lock = !isHost || l.spinning;
  const ids = soloIds.slice(modesPage * MODES_PAGE, (modesPage + 1) * MODES_PAGE);
  $('modes').classList.toggle('pick', !single);
  $('modes').innerHTML = ids.map((id) => {
    const m = MODES[id];
    const short = SOLO[id]?.[0] || m.name;
    const ok = fits(m, n);
    const head = `${icoImg(gameIcon(id))}<b>${esc(short)}</b><small>${playersText(m)}</small>`;
    if (single) {
      // les jeux trop petits pour la table sont grisés (ex. roulette et duel au-delà de 2 joueurs)
      const full = n > m.max;
      return `<button type="button" class="solo-card${l.mode === id ? ' on' : ''}${full ? ' full' : ''}" data-mode="${id}" ${lock || full ? 'disabled' : ''}
        title="${esc(m.name)} : ${esc(m.sub)}${full ? ` (${m.max} joueurs maximum)` : ''}">${head}</button>`;
    }
    const on = pool.includes(id);
    const why = ok ? '' : ` (ne tombera pas à ${n} joueur${n > 1 ? 's' : ''})`;
    return `<button type="button" class="solo-card${on ? ' in' : ' out'}${ok ? '' : ' full'}" data-pool="${id}" ${lock ? 'disabled' : ''} aria-pressed="${on}"
      title="${esc(m.name)} : ${esc(m.sub)}${why}${isHost ? (on ? ' · cliquer pour le retirer' : ' · cliquer pour l’ajouter') : ''}">${head}<span class="check">${on ? '✓' : ''}</span></button>`;
  }).join('') + '<div class="solo-card ghost" aria-hidden="true"></div>'.repeat(MODES_PAGE - ids.length); // même hauteur à chaque page
  $('modes-prev').disabled = modesPage === 0;
  $('modes-next').disabled = modesPage >= modesPages - 1;
  $('modes-dots').innerHTML = modesPages > 1
    ? Array.from({ length: modesPages }, (_, k) => `<button type="button" class="${k === modesPage ? 'on' : ''}" data-page="${k}" aria-label="Page ${k + 1}"></button>`).join('')
    : '';
}
const modesGo = (k) => {
  const p = Math.max(0, Math.min(modesPages - 1, k));
  if (p === modesPage) return;
  modesPage = p;
  sfx('ui');
  renderModes();
};
$('modes-prev').onclick = () => modesGo(modesPage - 1);
$('modes-next').onclick = () => modesGo(modesPage + 1);
$('modes-dots').onclick = (e) => { const b = e.target.closest('[data-page]'); if (b) modesGo(+b.dataset.page); };

// Places autour de la table : portrait, badges, et pour l'hôte « confier la table » et « expulser ».
function renderSeats(l, isHost) {
  const seats = $('seats');
  seats.innerHTML = '';
  const canEdit = isHost && !l.spinning;
  // toujours 6 places affichées ; les vides servent à inviter (ou à asseoir un bot)
  const nSeats = Math.max(l.players.length, l.max || 6);
  for (let i = 0; i < nSeats; i++) {
    const p = l.players[i];
    const d = document.createElement('div');
    if (!p) {
      d.className = 'seat empty';
      if (canEdit) {
        d.innerHTML = `<div class="box acts"><button type="button" class="seat-btn" data-invite title="Copier le lien d’invitation">Inviter</button>
          <button type="button" class="seat-btn" data-bot title="Asseoir un bot à cette place">+ Bot</button></div>`;
      } else {
        d.title = 'Copier le lien d’invitation';
        d.dataset.invite = '';
        d.innerHTML = '<div class="box">Chaise vide…<br>Clique pour inviter</div>';
      }
    } else {
      const key = p.key || p.name.toLowerCase();
      const me = p.name === user.username;
      const host = key === l.host;
      d.className = `seat${p.bot ? ' bot' : ''}${host ? ' host' : ''}`;
      const acts = canEdit && !me
        ? `<div class="seat-acts">${!p.bot && p.connected ? `<button type="button" class="sa" data-give="${esc(key)}" data-name="${esc(p.name)}" title="Confier la table à ${esc(p.name)}"><img class="px-ico" src="${ICON.star}" width="14" height="14" alt="Hôte"></button>` : ''}
          <button type="button" class="sa kick" data-kick="${esc(key)}" data-name="${esc(p.name)}" data-isbot="${p.bot ? 1 : ''}" title="${p.bot ? 'Retirer' : 'Expulser'} ${esc(p.name)}">${pxIcon('close', 1)}</button></div>`
        : '';
      d.innerHTML = `${acts}<canvas width="56" height="60"></canvas><div class="nm">${esc(p.name)}</div>
        <div class="tag">${host ? `<img class="px-ico" src="${ICON.star}" width="14" height="14" alt=""> hôte ` : ''}${me ? '(toi)' : ''}${p.bot ? '<span class="botag">bot</span>' : ''} ${p.connected ? '' : '<span class="off">déconnecté</span>'}</div>`;
      drawPortraitInto(d.querySelector('canvas'), p.character || {});
    }
    seats.appendChild(d);
  }
}

$('seats').onclick = async (e) => {
  if (!lobby) return;
  const b = e.target.closest('[data-invite], [data-bot], [data-kick], [data-give]');
  if (!b) return;
  if (b.dataset.kick !== undefined) {
    const name = b.dataset.name;
    if (!b.dataset.isbot && !(await askConfirm({
      title: `Expulser ${name} ?`,
      text: `${name} quitte la table et ne pourra plus y revenir.`,
      yes: 'Expulser', no: 'Annuler', icon: 'close', danger: true,
    }))) return;
    return net.send({ t: 'kick', key: b.dataset.kick });
  }
  if (b.dataset.give !== undefined) {
    const name = b.dataset.name;
    if (!(await askConfirm({
      title: `Confier la table à ${name} ?`,
      text: `${name} devient l’hôte : choix des jeux, lancement des parties, expulsions. Tu restes assis à la table.`,
      yes: 'Confier la table', no: 'Annuler', icon: 'hat',
    }))) return;
    return net.send({ t: 'giveHost', key: b.dataset.give });
  }
  if (b.dataset.bot !== undefined) return net.send({ t: 'addBot' });
  invite();
};

// Classement du championnat (lobby et fin de partie) ; ex aequo : même place.
function champRows(l) {
  const c = l.champ;
  const names = new Set([...Object.keys(c.scores || {}), ...l.players.map((p) => p.name)]);
  const rows = [...names].map((name) => ({
    name, pts: c.scores?.[name] || 0, firsts: c.firsts?.[name] || 0, here: l.players.some((p) => p.name === name),
  })).sort((a, b) => b.pts - a.pts || b.firsts - a.firsts || a.name.localeCompare(b.name));
  rows.forEach((r, k) => { r.place = k && r.pts === rows[k - 1].pts && r.firsts === rows[k - 1].firsts ? rows[k - 1].place : k + 1; });
  return rows;
}

function champHtml(l, end) {
  const c = l.champ;
  const rows = champRows(l);
  const gain = {};
  if (end && c.last) for (const r of c.last.res) gain[r.name] = r.pts;
  const leaders = rows.filter((r) => r.place === 1);
  const head = c.done
    ? `<p class="champion">${pxIcon('trophy')} ${leaders.length > 1 ? `Égalité en tête : ${leaders.map((r) => esc(r.name)).join(', ')}` : `${esc(leaders[0]?.name || '')} remporte le championnat !`}</p>`
    : '';
  const played = (c.played || []).map((id) => `<span title="${esc(MODES[id]?.name || id)}">${icoImg(gameIcon(id))}</span>`).join('');
  return `<h3>Championnat <small>${c.done ? 'terminé' : `${c.n}/${c.rounds} jeux`}</small></h3>${head}
    <ol class="champ-rank">${rows.map((r) => `<li class="${r.name === user.username ? 'me' : ''}${r.here ? '' : ' gone'}">
      <span class="rk">${r.place}</span><span class="nm">${esc(r.name)}</span>${gain[r.name] != null ? `<span class="gain">+${gain[r.name]}</span>` : ''}<span class="pts">${r.pts} pts</span></li>`).join('')}</ol>
    ${played ? `<div class="champ-played">${played}</div>` : ''}`;
}

function renderChampBoard(l, isHost) {
  const board = $('champ-board');
  const c = l.format === 'champ' ? l.champ : null;
  board.classList.toggle('hidden', !c);
  if (!c) return (board.innerHTML = '');
  board.innerHTML = champHtml(l, false) + (isHost && !l.spinning ? '<button type="button" class="mini-link" data-champreset>Recommencer à zéro</button>' : '');
}

$('champ-board').onclick = async (e) => {
  if (!e.target.closest('[data-champreset]') || !lobby) return;
  if (lobby.champ && !lobby.champ.done && !(await askConfirm({
    title: 'Recommencer le championnat ?',
    text: 'Les points de tout le monde repartent à zéro.',
    yes: 'Remettre à zéro', no: 'Annuler', icon: 'trophy', danger: true,
  }))) return;
  net.send({ t: 'champReset' });
};

$('modes').onclick = (e) => {
  if (!lobby || !isHostOf(lobby)) return;
  const b = e.target.closest('[data-mode]');
  if (b && b.dataset.mode !== lobby.mode) return net.send({ t: 'mode', mode: b.dataset.mode });
  const p = e.target.closest('[data-pool]');
  if (p) net.send({ t: 'pool', mode: p.dataset.pool });
};
$('modes-label').onclick = (e) => { if (e.target.closest('[data-poolall]')) net.send({ t: 'poolAll' }); };

$('formats').onclick = async (e) => {
  const b = e.target.closest('[data-format]');
  if (!b || !lobby || !isHostOf(lobby) || b.dataset.format === lobby.format) return;
  const c = lobby.format === 'champ' ? lobby.champ : null;
  if (c && !c.done && c.n > 0 && !(await askConfirm({
    title: 'Abandonner le championnat ?',
    text: 'Le championnat en cours s’arrête et les points sont perdus.',
    yes: 'Abandonner', no: 'Continuer', icon: 'trophy', danger: true,
  }))) return;
  net.send({ t: 'format', format: b.dataset.format });
};
$('rounds').onclick = (e) => {
  const b = e.target.closest('[data-rounds]');
  if (b && lobby && isHostOf(lobby)) net.send({ t: 'rounds', n: +b.dataset.rounds });
};
$('variants').onclick = (e) => {
  const b = e.target.closest('[data-variant]');
  if (b && !b.disabled && lobby && isHostOf(lobby)) net.send({ t: 'variant', mode: lobby.mode, id: b.dataset.variant || null });
};
$('btn-lock').onclick = () => { if (lobby && isHostOf(lobby)) net.send({ t: 'lock' }); };

function isHostOf(l) {
  return !!user && l.host === user.username.toLowerCase();
}

async function copyText(v, input) {
  try { await navigator.clipboard.writeText(v); } catch {
    if (input) { input.select(); document.execCommand('copy'); }
  }
}

async function copyLink() {
  await copyText($('lobby-link').value, $('lobby-link'));
  $('btn-copy').textContent = 'Copié !';
  setTimeout(() => ($('btn-copy').textContent = 'Copier'), 1500);
}

// Un clic sur le code de la table le copie (pour le dicter ou le coller dans « Rejoindre »)
let copiedTimer = 0;
$('lobby-code').onclick = async () => {
  if (!lobby) return;
  await copyText(lobby.code);
  const c = $('code-copied');
  c.textContent = 'code copié !';
  c.classList.add('on');
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => c.classList.remove('on'), 1500);
};

// ------------------------------------------------------------ roue des jeux
// Les jeux défilent comme une machine à sous puis s'arrêtent sur celui que l'hôte a tiré.
let spinRaf = 0, spinHideTimer = 0;
function hideSpin() {
  cancelAnimationFrame(spinRaf);
  clearTimeout(spinHideTimer);
  $('spin').classList.add('hidden');
}
net.on('spin', ({ pick, pool, round, rounds }) => {
  if (!MODES[pick]) return;
  hideSpin();
  modalDone?.(false); // une question restée ouverte n'a plus lieu d'être
  $('tooltip').classList.add('hidden');
  const ids = pool?.length ? pool.filter((id) => MODES[id]) : [pick];
  const any = () => ids[Math.floor(Math.random() * ids.length)];
  const N = 30; // case du jeu tiré
  const seq = Array.from({ length: N }, any).concat(pick, any(), any());
  const strip = $('spin-strip');
  strip.style.transform = 'translateX(0)';
  strip.innerHTML = seq.map((id) => `<div class="spin-cell">${icoImg(gameIcon(id))}<b>${esc(MODES[id].name)}</b></div>`).join('');
  $('spin-title').textContent = round ? `Championnat · jeu ${round} sur ${rounds}` : 'La roue du saloon';
  $('spin-result').textContent = '';
  $('spin').classList.remove('hidden');
  const cells = strip.children;
  const cw = cells[1].offsetLeft - cells[0].offsetLeft;
  const reelW = strip.parentElement.clientWidth;
  const target = cells[N].offsetLeft - (reelW - cells[N].offsetWidth) / 2;
  const dur = 3000;
  let t0 = 0, last = -1;
  const step = (now) => {
    t0 ||= now; // horloge des images : la première peut dater d'avant ce message
    const k = Math.max(0, Math.min(1, (now - t0) / dur));
    const x = target * (1 - (1 - k) ** 4);
    strip.style.transform = `translateX(${-x}px)`;
    const at = Math.floor((x + reelW / 2) / cw);
    if (at !== last) { last = at; sfx('hover'); }
    if (k < 1) { spinRaf = requestAnimationFrame(step); return; }
    cells[N].classList.add('on');
    $('spin-result').textContent = `${MODES[pick].name} !`;
    sfx('ding');
    spinHideTimer = setTimeout(hideSpin, 4000); // filet de sécurité si la partie ne démarre pas
  };
  spinRaf = requestAnimationFrame(step);
});

// La partie a été interrompue (l'hôte est parti en plein mini-jeu) : retour à la table.
net.on('aborted', () => {
  if (screen !== 'game') return;
  closeScenes();
  if (lobby && !lobby.solo) showLobby();
  else showMenu();
});

// Partage natif (mobile, Windows…) si dispo, sinon copie du lien
async function invite() {
  if (navigator.share) {
    try {
      return await navigator.share({ title: 'Buckshot Saloon', text: `Rejoins ma table au Buckshot Saloon (code ${lobby.code})`, url: $('lobby-link').value });
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  copyLink();
}

$('btn-copy').onclick = copyLink;
$('btn-share').onclick = invite;
$('btn-share').classList.toggle('hidden', !navigator.share);
// Quitter la table : si on en est l'hôte, un autre joueur la reprend (elle ne ferme que s'il ne reste que des bots).
function leaveTable() {
  net.send({ t: 'leaveLobby' });
}
// d'autres humains restent assis ?
const othersAtTable = () => !!lobby && !lobby.solo && lobby.players.some((p) => !p.bot && p.name !== user?.username);
$('btn-leave').onclick = leaveTable;
$('btn-start').onclick = () => net.send({ t: 'start' });

$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const v = $('chat-input').value.trim();
  if (v) net.send({ t: 'chat', text: v });
  $('chat-input').value = '';
};
net.on('chat', ({ from, text, sys }) => {
  // sys : ligne du narrateur (quelqu'un rejoint ou quitte la table)
  const line = sys ? esc(text) : `<b>${esc(from)} :</b> ${esc(text)}`;
  const log = $('chat-log');
  const d = document.createElement('div');
  if (sys) d.className = 'sys';
  d.innerHTML = line;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  if (screen === 'game') toast(line, 'toasts');
  else if (sys && !log.offsetParent) toast(line); // comptoir caché (petit écran) : en bulle, comme avant
});

// ------------------------------------------------------------ partie
let typeTimer = 0;
function say(text) {
  clearInterval(typeTimer);
  const el = $('dealer');
  let i = 0;
  el.textContent = '';
  typeTimer = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i);
    if (i % 4 === 0) sfx('hover');
    if (i >= text.length) clearInterval(typeTimer);
  }, 20);
}

function hearts(p) {
  return Array.from({ length: p.maxHp }, (_, i) => `<img src="${i < p.hp ? ICON.heart : ICON.heartOff}" alt="">`).join('');
}
function stars(p) {
  return `<span class="stars">${[0, 1].map((i) => `<img src="${i < p.wins ? ICON.star : ICON.starOff}" alt="">`).join('')}</span>`;
}

// jeton de pari en cours (rouge ou blanche) à côté du nom
const betChip = (p) => (p.bet == null ? '' : `<span class="betchip ${p.bet ? 'live' : 'blank'}" title="Pari en cours">${p.bet ? 'R' : 'B'}</span>`);

function renderHud(st) {
  const me = st.players[st.me], op = st.players[1 - st.me];
  const myTurn = st.turn === st.me;
  $('hud').innerHTML = `
    <span class="yellow">MANCHE ${st.round}</span>
    <span class="pl cream ${myTurn ? 'turn' : ''}" title="${esc(me.name)}"><span class="nm">${esc(me.name)}</span><span class="hp">${hearts(me)}</span>${stars(me)}${betChip(me)}</span>
    <span class="pl salmon ${!myTurn ? 'turn' : ''}" title="${esc(op.name)}"><span class="nm">${esc(op.name)}</span><span class="hp">${hearts(op)}</span>${stars(op)}${betChip(op)}</span>
    <span class="grow"></span>
    <span class="green">FUSIL ${st.shellsLeft}</span>
    <span class="cream" id="hud-time">${fmtTime()}</span>`;
  const total = st.load.live + st.load.blank || 1;
  $('progress-fill').style.width = `${(st.shellsLeft / total) * 100}%`;
  $('btn-shoot-opp').textContent = `Tirer sur ${op.name}`;
  $('btn-shoot-opp').title = `Tirer sur ${op.name}`; // nom complet si le bouton le coupe
}

// Musique dynamique de la roulette : la manche décisive et les joueurs à 1 PV font monter la tension,
// le cœur bat quand il ne te reste qu'un PV, l'horloge tourne sur la dernière cartouche.
function rouletteMood(st) {
  if (st.phase !== 'playing') return setMood();
  const me = st.players[st.me], op = st.players[1 - st.me];
  const decisive = me.wins > 0 && op.wins > 0;
  const low = Math.min(me.hp, op.hp) <= 1;
  setMood({ level: Math.min(1, 0.5 + (decisive ? 0.2 : 0) + (low ? 0.3 : 0)), heart: me.hp === 1, tick: st.shellsLeft === 1 });
}

function fmtTime() {
  const s = Math.floor((Date.now() - matchStart) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
setInterval(() => { const el = $('hud-time'); if (el && screen === 'game' && !mini) el.textContent = fmtTime(); }, 1000);
setInterval(() => { if (mini && screen === 'game') renderMiniHud(); }, 250);

function updateControls() {
  const st = scene?.state;
  const myTurn = !!st && st.phase === 'playing' && st.turn === st.me && !scene.busy && !pending;
  $('btn-shoot-opp').disabled = !myTurn || scene.stealMode;
  $('btn-shoot-self').disabled = !myTurn || scene.stealMode;
  // pari : une fois par chargement, et seulement s'il reste des cartouches des deux couleurs (d'après l'annonce)
  let canBet = myTurn && !scene.stealMode && st.players[st.me].canBet;
  if (canBet) {
    const liveSpent = st.spent.filter(Boolean).length;
    canBet = st.load.live - liveSpent > 0 && st.load.blank - (st.spent.length - liveSpent) > 0;
  }
  $('btn-bet-live').disabled = !canBet;
  $('btn-bet-blank').disabled = !canBet;
  if (scene) scene.selectable = myTurn && !scene.stealMode;
  const chip = $('turn-chip');
  chip.classList.toggle('mine', myTurn);
  if (!st) chip.textContent = '';
  else if (st.phase !== 'playing') chip.textContent = 'FIN DU DUEL';
  else if (myTurn) chip.textContent = 'À TOI DE JOUER';
  else if (scene.busy || pending) chip.textContent = '…';
  else chip.textContent = `TOUR : ${st.players[st.turn].name.toUpperCase()}`;
}

function act(action) {
  pending = true;
  scene.stealMode = false;
  updateControls();
  net.send({ t: 'action', action });
}

function enterGame(kind) {
  if (kind && kind !== 'roulette') enterMini(kind);
  else enterRoulette();
}

let tipTimer = 0;
function enterRoulette() {
  show('game');
  setMusic('game');
  $('gameover').classList.add('hidden');
  $('toasts').innerHTML = '';
  closeScenes();
  liveMark('roulette');
  pending = false;
  matchStart = Date.now();
  say('Bienvenue au Buckshot Saloon. Asseyez-vous, messieurs-dames…');
  scene = new Scene($('game'), {
    onState: (st) => { renderHud(st); updateControls(); rouletteMood(st); },
    onSay: say,
    onIdle: () => { pending = false; updateControls(); },
    // tap : objet touché au doigt (le prochain toucher sur le même objet l'utilise)
    onHover: (id, x, y, isOpp, tap) => {
      const tip = $('tooltip');
      clearTimeout(tipTimer);
      if (!id) return tip.classList.add('hidden');
      const it = ITEMS[id];
      tip.innerHTML = `<b>${it.name}${isOpp ? ' (adversaire)' : ''}</b>${it.desc}${tap ? '<em>Touche encore pour l’utiliser</em>' : ''}`;
      tip.classList.remove('hidden');
      const w = Math.min(260, innerWidth - 16);
      tip.style.left = `${Math.max(8, Math.min(x + 16, innerWidth - w - 8))}px`;
      // au doigt, au-dessus du doigt pour ne pas cacher l'objet
      const top = tap === undefined ? y + 16 : y - tip.offsetHeight - 20;
      tip.style.top = `${Math.max(8, Math.min(top, innerHeight - tip.offsetHeight - 8))}px`;
      if (isOpp || (tap === false && document.body.classList.contains('touch'))) tipTimer = setTimeout(() => tip.classList.add('hidden'), 3500);
    },
    onItem: (slot) => {
      const st = scene.state;
      const id = st.players[st.me].items[slot];
      if (id === 'lasso') {
        const targets = st.players[1 - st.me].items.filter((x) => x !== 'lasso');
        if (!targets.length) return toast('Rien à attraper au lasso chez ton adversaire.', 'toasts');
        lassoSlot = slot;
        scene.stealMode = true;
        updateControls();
        return;
      }
      act({ kind: 'item', slot });
    },
    onSteal: (idx) => {
      const id = scene.state.players[1 - scene.state.me].items[idx];
      if (id === 'lasso') return toast('Impossible de voler un lasso.', 'toasts');
      act({ kind: 'item', slot: lassoSlot, steal: idx });
    },
    onCancelSteal: () => { scene.stealMode = false; updateControls(); },
    onMatchEnd: showGameOver,
  });
  updateControls();
}

// ------------------------------------------------------------ mini-jeux
function enterMini(kind) {
  show('game');
  setMusic(`mini-${kind}`);
  $('bottombar').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('toasts').innerHTML = '';
  closeScenes();
  liveMark(kind);
  const MiniCls = MINI_SCENES[kind] || ShooterScene;
  mini = new MiniCls($('game'), {
    send: (action) => net.send({ t: 'action', action }),
    live: (d) => net.sendLive(d),
    onState: renderMiniHud,
    onEnd: showMiniOver,
  });
  pad.attach(mini);
  renderMiniHud();
}

function renderMiniHud() {
  const st = mini?.state;
  if (!st) return;
  setMood(mini.mood());
  const stats = mini.hudStats().map(([k, v, cls]) => `<span class="${cls}">${k} ${v}</span>`).join('');
  const players = st.players.map((p, i) => `<span class="pl" style="color:${PLAYER_COLORS[i]}${p.left ? ';opacity:.5' : ''}" title="${esc(p.name)}">
    <span class="nm">${esc(i === st.me ? 'Toi' : p.name)}</span>${p.score}</span>`).join('');
  const ms = mini.clock();
  const r = Math.ceil((ms ?? 0) / 1000);
  const clock = ms == null ? '' : `<span class="cream">${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}</span>`;
  $('hud').innerHTML = `${stats}${players}<span class="grow"></span>${clock}`;
  $('progress-fill').style.width = `${(mini.progress() ?? 0) * 100}%`;
}

function showMiniOver(ev) {
  const st = mini.state;
  const me = st.me;
  const ranking = ev.ranking?.length ? ev.ranking : st.players.map((_, i) => i).sort((a, b) => st.players[b].score - st.players[a].score);
  const rank = ranking.indexOf(me) + 1;
  // jeux en équipes (assaut du fort) : toute l'équipe gagne ou perd
  const teams = !!ev.winners;
  const tie = teams ? ev.tie : ev.tie && st.players[me].score === st.players[ranking[0]].score;
  const win = teams ? ev.winners.includes(me) : rank === 1 && !ev.tie;
  $('gameover').classList.remove('hidden');
  $('go-title').textContent = win ? 'VICTOIRE !' : tie ? 'ÉGALITÉ !' : teams ? 'DÉFAITE !' : `${rank}e PLACE`;
  $('go-title').style.color = win ? 'var(--green)' : tie ? 'var(--yellow)' : 'var(--salmon)';
  const unit = MODES[mini.kind]?.unit || 'pts';
  const head = teams && ev.teams ? `<b>${TEAM_NAMES[0]} ${ev.teams[0]} — ${TEAM_NAMES[1]} ${ev.teams[1]}</b> (moyenne par joueur)<br>` : '';
  $('go-sub').innerHTML = head + ranking.map((i, k) => {
    const p = st.players[i];
    return `<span style="color:${PLAYER_COLORS[i]}">${k + 1}. ${esc(p.name)} — ${p.score} ${unit}${p.left ? ' (parti)' : ''}</span>`;
  }).join('<br>');
  sfx(win ? 'victory' : 'defeat');
  if (win) sfx('yeehaw', 0.4);
  setTimeout(() => { if (screen === 'game') setMusic('menu'); }, 3500);
  updateGameOver();
}

net.on('live', ({ from, d }) => { if (mini && screen === 'game') mini.onLive(from, d); });

net.on('events', ({ events }) => {
  const kind = events[0]?.state?.kind;
  if (kind) {
    if (!mini || screen !== 'game' || mini.kind !== kind) {
      // un dernier tick d'une partie qu'on vient de quitter ne doit pas rouvrir l'écran de jeu
      if (!events.some((ev) => ev.type === 'mgStart')) return;
      enterMini(kind);
    }
    for (const ev of events) mini.event(ev);
    return;
  }
  if (!scene || screen !== 'game') enterRoulette();
  scene.enqueue(events);
  updateControls();
});

net.on('sync', ({ state }) => {
  if (state.kind) {
    if (!mini || screen !== 'game' || mini.kind !== state.kind) enterMini(state.kind);
    mini.sync(state);
    return;
  }
  if (!scene || screen !== 'game') enterRoulette();
  scene.queue = [];
  scene.anim = null;
  scene.setState(state);
  pending = false;
  updateControls();
  if (state.phase === 'over') showGameOver({ winner: state.winner });
});

$('btn-shoot-opp').onclick = () => act({ kind: 'shoot', target: 'opp' });
$('btn-shoot-self').onclick = () => act({ kind: 'shoot', target: 'self' });
$('btn-bet-live').onclick = () => act({ kind: 'bet', live: true });
$('btn-bet-blank').onclick = () => act({ kind: 'bet', live: false });

function showGameOver(ev) {
  const st = scene.state;
  const win = ev.winner === st.me;
  $('gameover').classList.remove('hidden');
  $('tooltip').classList.add('hidden');
  $('go-title').textContent = win ? 'VICTOIRE !' : 'DÉFAITE…';
  $('go-title').style.color = win ? 'var(--green)' : 'var(--salmon)';
  const me = st.players[st.me], op = st.players[1 - st.me];
  $('go-sub').textContent = ev.forfeit
    ? (win ? `${op.name} a pris la fuite. Victoire par abandon.` : 'Tu as quitté la table.')
    : `${me.wins} manche${me.wins > 1 ? 's' : ''} à ${op.wins}. ${win ? 'Le saloon te paie un verre.' : 'Le croque-mort prend tes mesures.'}`;
  setTimeout(() => { if (screen === 'game') setMusic('menu'); }, 3500);
  updateGameOver();
}

function updateGameOver() {
  if (!lobby) return;
  $('btn-go-menu').textContent = lobby.solo ? 'Retour au menu' : 'Retour à la table';
  const fmt = lobby.solo ? 'single' : lobby.format || 'single';
  const c = fmt === 'champ' ? lobby.champ : null;
  $('go-champ').innerHTML = c ? champHtml(lobby, true) : '';
  // revanche, nouveau tour de roue ou jeu suivant du championnat : chacun se dit prêt
  $('btn-rematch').textContent = c ? (c.done ? 'Nouveau championnat' : `Jeu suivant (${c.n + 1}/${c.rounds})`)
    : fmt === 'wheel' ? 'Relancer la roue' : 'Revanche';
  if (lobby.solo) {
    $('btn-rematch').disabled = false;
    $('go-rematch').textContent = '';
    return;
  }
  const voted = lobby.rematch.includes(user.username);
  const alone = lobby.players.length < 2;
  $('btn-rematch').disabled = voted || alone || !lobby.over || lobby.spinning;
  const humans = lobby.players.filter((p) => !p.bot).length;
  $('go-rematch').textContent = alone
    ? 'Tes adversaires ont quitté la table.'
    : !lobby.over && !lobby.spinning
      ? 'La table a changé d’hôte : retourne à la table.'
      : lobby.rematch.length
        ? `${fmt === 'single' ? 'Revanche demandée par' : 'Prêts'} (${lobby.rematch.length}/${humans}) : ${lobby.rematch.join(', ')}`
        : '';
}

$('btn-rematch').onclick = () => net.send({ t: 'rematch' });
$('btn-go-menu').onclick = () => {
  if (lobby?.solo) return net.send({ t: 'leaveLobby' });
  closeScenes();
  showLobby();
};

$('btn-exit').onclick = async () => {
  const host = lobby && isHostOf(lobby) && othersAtTable();
  const hostNote = host ? ' Tu es l’hôte : la table passera à un autre joueur.' : '';
  if (screen === 'game' && scene?.state?.phase === 'playing') {
    const ok = await askConfirm({
      title: 'Quitter la table ?',
      text: `Tu perds le duel par abandon${lobby?.solo ? '.' : ', et ton adversaire empoche la victoire.'}${hostNote}`,
      yes: 'Abandonner', no: 'Rester', icon: 'skull', danger: true,
    });
    if (ok) net.send({ t: 'leaveLobby' });
  } else if (screen === 'game' && mini && !mini.over) {
    const ok = await askConfirm({
      title: 'Quitter la partie ?',
      text: host
        ? 'Tu es l’hôte : la partie s’arrête pour tout le monde et la table passe à un autre joueur.'
        : 'Ton score sera figé et tu finiras dernier.',
      yes: 'Quitter', no: 'Rester', icon: 'close', danger: true,
    });
    if (ok) net.send({ t: 'leaveLobby' });
  } else if (screen === 'game' || screen === 'lobby') leaveTable();
  else if (screen === 'editor') { editor.close(); showMenu(); }
};

// chat en jeu : Entrée pour parler
document.addEventListener('keydown', (e) => {
  if (screen !== 'game') return;
  const form = $('game-chat');
  const input = form.querySelector('input');
  if (e.key === 'Enter' && document.activeElement !== input) {
    e.preventDefault();
    form.classList.remove('hidden');
    input.focus();
  } else if (e.key === 'Escape') {
    form.classList.add('hidden');
    input.blur();
    if (scene?.stealMode) { scene.stealMode = false; updateControls(); }
  }
});
// au doigt : pas de touche Entrée, un bouton ouvre le chat
$('btn-chat').onclick = () => {
  const form = $('game-chat');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) form.querySelector('input').focus();
};
// bandeau « tourne ton téléphone » : un toucher le ferme pour la session
$('rotate-hint').onclick = () => $('rotate-hint').classList.add('off');

$('game-chat').onsubmit = (e) => {
  e.preventDefault();
  const input = $('game-chat').querySelector('input');
  if (input.value.trim()) net.send({ t: 'chat', text: input.value.trim() });
  input.value = '';
  $('game-chat').classList.add('hidden');
  input.blur();
};

show('title');
