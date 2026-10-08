// Point d'entrée : écrans, réseau, lobby, interface de jeu.
import { Net, preloadGame, preloadRealtime, playableAt, tourneyFor } from './net.js';
import { INVITE_URL } from './config.js';
import { initAudio, playMusic, nextTrack, sfx, toggleMute, setVolume, audioSettings, setMood } from './audio.js';
import { Scene } from './scene.js';
import { Editor, drawPortraitInto } from './editor.js';
import * as S from './sprites.js';
import { ITEMS } from './data.js';
import { MODES, PLAYER_COLORS, TEAM_NAMES } from './worlds.js';
import { VARIANTS, variantName } from './variants.js';
import { encodePlayers } from './invitelook.js';
import { gameIcon } from './gameicons.js';
import { TouchPad } from './touch.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const net = new Net();
let user = null;
let lobby = null;
let scene = null; // roulette
let mini = null; // mini-jeu en cours (fusillade, lasso, duel, Charlie)
// Scènes des mini-jeux, chargées à la demande (le démarrage n'attend que l'accueil et la roulette).
const MINI_SCENES = {
  shooter: () => import('./shooter.js').then((m) => m.ShooterScene),
  lasso: () => import('./lasso.js').then((m) => m.LassoScene),
  duel: () => import('./duel.js').then((m) => m.DuelScene),
  charlie: () => import('./charlie.js').then((m) => m.CharlieScene),
  fort: () => import('./fort.js').then((m) => m.FortScene),
  wagon: () => import('./wagon.js').then((m) => m.WagonScene),
  pinte: () => import('./pinte.js').then((m) => m.PinteScene),
  mine: () => import('./mine.js').then((m) => m.MineScene),
  course: () => import('./course.js').then((m) => m.CourseScene),
  rts: () => import('./rts.js').then((m) => m.RtsScene),
  fps: () => import('./fps.js').then((m) => m.FpsScene),
  fpsdm: () => import('./fps.js').then((m) => m.FpsDmScene),
  bagarre: () => import('./bagarre.js').then((m) => m.BagarreScene),
  melee: () => import('./brawl.js').then((m) => m.BrawlScene),
};
const sceneCls = {}; // jeu -> classe de sa scène, une fois chargée
const sceneLoads = {}; // jeu -> chargement en cours
const sceneKey = (kind) => (MINI_SCENES[kind] ? kind : 'shooter'); // jeu inconnu : la fusillade, comme avant
function loadScene(kind) {
  kind = sceneKey(kind);
  if (sceneCls[kind]) return Promise.resolve(sceneCls[kind]);
  sceneLoads[kind] ||= MINI_SCENES[kind]().then((cls) => (sceneCls[kind] = cls), (e) => { delete sceneLoads[kind]; throw e; });
  return sceneLoads[kind];
}
// Chargement d'avance (jeu choisi dans le lobby, tiré par la roue, carte du menu survolée) : la partie démarre sans attendre.
function preload(kind) {
  if (!MODES[kind] || kind === 'roulette') return;
  loadScene(kind).catch(() => {});
  if (!lobby || isHostOf(lobby)) preloadGame(kind); // l'arbitre, pour l'hôte (ou le jeu solo)
}
let screen = 'title';
// Tournoi : match affiché (le sien, ou celui qu'on regarde depuis le banc) ; watching : en spectateur
let curMatch = null;
let watching = false;
const pad = new TouchPad(document.getElementById('touchpad')); // commandes tactiles des mini-jeux
let pending = false;
let lassoSlot = -1;
let matchStart = 0;
let music = 'menu';
let pendingJoin = new URLSearchParams(location.search).get('lobby');
if (pendingJoin) preloadRealtime(); // lien d'invitation : le canal de la table servira tout de suite
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
// field : un texte à saisir ({ value, placeholder, max, line }), lu dans $('modal-field') une fois confirmé ;
// line : une seule ligne, validée par Entrée.
let modalDone = null;
function askConfirm({ title, text, yes = 'Oui', no = 'Annuler', icon = null, danger = false, field = null }) {
  if (modalDone) modalDone(false); // une seule question à la fois
  $('modal-title').textContent = title;
  $('modal-text').textContent = text;
  $('modal-yes').textContent = yes;
  $('modal-no').textContent = no;
  $('modal-yes').classList.toggle('danger', danger);
  $('modal-icon').innerHTML = icon ? pxIcon(icon, 2) : '';
  const f = $('modal-field');
  f.classList.toggle('hidden', !field);
  if (field) {
    f.value = field.value || '';
    f.placeholder = field.placeholder || '';
    f.maxLength = field.max || 500;
    f.rows = field.line ? 1 : 3;
    f.classList.toggle('line', !!field.line);
  }
  $('modal').classList.remove('hidden');
  const before = document.activeElement;
  (field ? f : danger ? $('modal-no') : $('modal-yes')).focus();
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
  else if (e.key === 'Enter' && e.target === $('modal-field') && $('modal-field').classList.contains('line')) { e.preventDefault(); modalDone(true); }
  else if (e.key === 'Tab') {
    e.preventDefault();
    const els = [$('modal-field'), $('modal-no'), $('modal-yes')].filter((el) => !el.classList.contains('hidden'));
    const k = els.indexOf(document.activeElement);
    els[(k + (e.shiftKey ? els.length - 1 : 1)) % els.length].focus();
  }
}, true);

function setMusic(name) {
  music = name;
  playMusic(name);
}

function show(name) {
  if (screen === 'editor' && name !== 'editor') editor.close();
  screen = name;
  hideSpin();
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== `scr-${name}`);
  const game = name === 'game';
  $('bg').classList.toggle('hidden', game);
  $('hud').classList.toggle('hidden', !game);
  $('bottombar').classList.toggle('hidden', !game);
  $('scr-game').classList.toggle('multi', game && !!lobby && !lobby.solo); // bouton de chat tactile
  if (!game) { $('progress-fill').style.width = '0'; $('tooltip').classList.add('hidden'); $('watch-bar').classList.add('hidden'); bgStart(); }
  if (name === 'menu' || name === 'title') applyUpdate(); // nouvelle version du site : on la prend ici, jamais en pleine partie
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
// Une nouvelle version du site s'installe en arrière-plan et ne prend la main qu'à l'accueil ou au menu
// (la page se recharge), jamais en pleine partie ni à une table : l'hôte et ses joueurs gardent le même code.
let swWaiting = null; // nouvelle version prête, en attente
let swStale = false; // une nouvelle version a pris la main (depuis un autre onglet) : on recharge au prochain passage au menu
let swReg = null, swChecked = Date.now();
function applyUpdate() {
  if (lobby || (screen !== 'menu' && screen !== 'title')) return;
  if (swStale) { swStale = false; location.reload(); return; }
  if (swWaiting) { swWaiting.postMessage({ t: 'skipWaiting' }); swWaiting = null; return; }
  // onglet ouvert depuis longtemps : on regarde s'il y a du neuf (au plus toutes les 10 min)
  if (swReg && Date.now() - swChecked > 600000) { swChecked = Date.now(); swReg.update().catch(() => {}); }
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // première installation : même code, rien à recharger
    swStale = true;
    applyUpdate();
  });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((reg) => {
    swReg = reg;
    const watch = (w) => {
      if (!w) return;
      const ready = () => {
        if (w.state !== 'installed' || !navigator.serviceWorker.controller) return;
        swWaiting = w;
        applyUpdate();
      };
      w.addEventListener('statechange', ready);
      ready();
    };
    watch(reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch(() => {}));
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
// 30 images/s suffisent aux vautours et au virevoltant ; la boucle s'arrête pendant les parties (show la relance).
const bgGate = { next: 0, last: 0 };
let bgRaf = 0;
function bgLoop(t) {
  bgRaf = 0;
  if (screen === 'game') return;
  bgRaf = requestAnimationFrame(bgLoop);
  if (t < bgGate.next - 2) return;
  bgGate.next = Math.max(bgGate.next + 1000 / 30, t);
  const dt = Math.min(100, t - (bgGate.last || t));
  bgGate.last = t;
  bgx.drawImage(desert, 0, 0);
  for (let i = 0; i < 3; i++) {
    const a = t / 5000 + i * 2.1;
    S.vulture(bgx, Math.round(70 + i * 105 + Math.cos(a) * 34), Math.round(26 + i * 7 + Math.sin(a) * 9), t + i * 90);
  }
  tw.x += 0.7 * (dt / (1000 / 60)); // même vitesse qu'à 60 images/s
  if (tw.x > 410) tw.x = -40 - Math.random() * 400;
  S.tumbleweed(bgx, Math.round(tw.x), Math.round(178 - Math.abs(Math.sin(t / 170)) * 7), t);
}
function bgStart() {
  if (bgRaf || screen === 'game') return;
  bgGate.last = 0;
  bgRaf = requestAnimationFrame(bgLoop);
}
bgStart();

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
  const renamed = u.username !== user?.username;
  user = u;
  if (renamed) {
    // nouveau pseudo choisi à une table : il devient celui de ce navigateur
    savedName = u.username;
    try { localStorage.setItem('bs-user', u.username); } catch {}
    $('tb-info').textContent = `@${u.username}`;
  }
  if (screen === 'menu') showMenu();
  else if (screen === 'lobby' && renamed && lobby) showLobby();
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
let rtTimer = 0;
function showMenu() {
  show('menu');
  // au repos sur le menu : la bibliothèque du canal Realtime se charge en douce (créer ou rejoindre une table sans attendre)
  clearTimeout(rtTimer);
  rtTimer = setTimeout(preloadRealtime, 3000);
  setMusic('menu');
  $('menu-hello').textContent = `Salut, ${user.username}.`;
  const poster = $('menu-poster');
  poster.innerHTML = `<div class="poster-head">WANTED</div><canvas width="56" height="60"></canvas>
    <div class="poster-name">${esc(user.username)}</div><div class="poster-sub">Récompense : $${100 + user.stats.wins * 250}</div>`;
  drawPortraitInto(poster.querySelector('canvas'), user.character);
  renderMenuStats(user.stats || {}, user.history || []);
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

// Cartes des jeux en solo (nom court et adversaires ; nom complet et règle en infobulle)
const SOLO = {
  roulette: ['Roulette', '1 bot'], shooter: ['Fusillade', '3 bots'], lasso: ['Lasso', '3 bots'], duel: ['Duel', '1 bot'],
  charlie: ['Charlie', '3 bots'], fort: ['Fort', 'toi + 1 bot'], wagon: ['Roulotte', '3 bots'], pinte: ['Pinte', '3 bots'], mine: ['Mine', '3 bots'],
  course: ['Course', '3 bots'], rts: ['Conquête', '3 bots'], fps: ['Règlement', '3 bots'], fpsdm: ['Mort ou vif', '3 bots'],
  bagarre: ['Bagarre', '5 cogneurs'],
  melee: ['La mêlée', '5 bots'],
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
  if (!b) return;
  preload(b.dataset.solo);
  net.send({ t: 'createSolo', mode: b.dataset.solo });
};
// survol ou toucher d'une carte : le jeu commence à se charger avant le clic
for (const ev of ['pointerover', 'focusin']) $('solo-grid').addEventListener(ev, (e) => { const b = e.target.closest?.('[data-solo]'); if (b) preload(b.dataset.solo); });
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
// Ouvert depuis le menu ou depuis le lobby : on y revient en sortant (la table continue pendant ce temps).
const editorBack = () => (lobby && !lobby.solo ? showLobby() : showMenu());
const editor = new Editor({
  onSave: (c) => { net.send({ t: 'saveChar', character: c }); user.character = c; editorBack(); },
  onBack: editorBack,
});
const openEditor = () => { show('editor'); editor.open(user.character, user.username); };
$('btn-edit').onclick = openEditor;

// Changer de pseudo à une table : la place, le palmarès et le pseudo retenu suivent le nouveau nom.
async function renameAtTable() {
  if (!(await askConfirm({
    title: 'Changer de pseudo',
    text: 'Ton nouveau nom à la table. Le palmarès suit le pseudo : un pseudo neuf repart de zéro.',
    yes: 'Changer', no: 'Annuler', icon: 'hat',
    field: { value: user.username, placeholder: 'Nouveau pseudo', max: 16, line: true },
  }))) return;
  const name = $('modal-field').value.trim();
  if (name && name !== user.username) net.send({ t: 'rename', username: name });
}

// ------------------------------------------------------------ lobby
net.on('lobby', ({ lobby: l }) => {
  const prev = lobby;
  lobby = l;
  setUrl(l.code);
  if ((l.format || 'single') === 'single' && !l.inGame) preload(l.mode);
  if (prev && screen === 'game') {
    for (const p of l.players) {
      const was = prev.players.find((x) => x.name === p.name);
      if (was && was.connected && !p.connected && p.name !== user.username) {
        toast(`<b>${esc(p.name)}</b> a perdu la connexion… 45 s pour revenir.`, 'toasts');
      }
    }
  }
  if (l.tourney && l.inGame) onTourney();
  else if (l.inGame) {
    if (screen !== 'game' || !$('gameover').classList.contains('hidden')) enterGame(l.game);
  } else if (screen === 'game') updateGameOver();
  else if (!l.solo && screen !== 'editor') showLobby(); // chez le tailleur : la table attend qu'on revienne
});

function closeScenes() {
  miniHold = null;
  liveClear();
  pad.detach();
  if (scene) { scene.destroy(); scene = null; }
  if (mini) { mini.destroy(); mini = null; }
}

net.on('left', () => {
  lobby = null;
  curMatch = null;
  watching = false;
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
  $('lobby-link').value = inviteUrl(l);
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

  const compat = pool.filter((id) => playableAt(id, n));
  const start = $('btn-start');
  start.classList.toggle('hidden', !isHost);
  let hint;
  if (single) {
    const tooMany = n > mode.max && !tourneyFor(l.mode, n);
    const cup = tourneyFor(l.mode, n);
    start.disabled = n < mode.min || tooMany || l.spinning;
    start.textContent = `Lancer : ${SOLO[l.mode]?.[0] || mode.name}${cup ? ' en tournoi' : ''}${variant ? ` — ${variantName(l.mode, variant)}` : ''}`;
    hint = tooMany
      ? `${mode.name} se joue à ${mode.max} maximum. ${isHost ? 'Choisis un autre jeu.' : 'L’hôte doit choisir un autre jeu.'}`
      : cup
        ? `À ${n}, ${mode.name} se joue en tournoi : des duels en même temps, les gagnants passent au tour suivant${n % 2 ? ' (un bot complète le tableau)' : ''}. Les autres regardent depuis le banc.`
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
    const ok = playableAt(id, n);
    const cup = tourneyFor(id, n);
    const head = `${icoImg(gameIcon(id))}<b>${esc(short)}</b><small>${cup ? 'en tournoi' : playersText(m)}</small>`;
    if (single) {
      // les jeux trop petits pour la table sont grisés ; les jeux à deux passent en tournoi
      const full = !ok && n > m.max;
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
// Chaque message du lobby redemande les places : seules celles qui ont changé sont refaites,
// et un portrait n'est redessiné que si la place est refaite ou si le personnage a changé.
function renderSeats(l, isHost) {
  const seats = $('seats');
  const canEdit = isHost && !l.spinning;
  // toujours 6 places affichées ; les vides servent à inviter (ou à asseoir un bot)
  const nSeats = Math.max(l.players.length, l.max || 6);
  while (seats.children.length > nSeats) seats.lastElementChild.remove();
  for (let i = 0; i < nSeats; i++) {
    const p = l.players[i];
    const d = document.createElement('div');
    if (!p) {
      d.className = 'seat empty';
      if (canEdit) {
        d.innerHTML = `<div class="box acts"><button type="button" class="seat-btn" data-invite title="Envoyer une invitation">Inviter</button>
          <button type="button" class="seat-btn" data-bot title="Asseoir un bot à cette place">+ Bot</button></div>`;
      } else {
        d.title = 'Envoyer une invitation';
        d.dataset.invite = '';
        d.innerHTML = '<div class="box">Chaise vide…<br>Clique pour inviter</div>';
      }
    } else {
      const key = p.key || p.name.toLowerCase();
      const me = p.name === user.username;
      const host = key === l.host;
      d.className = `seat${p.bot ? ' bot' : ''}${host ? ' host' : ''}`;
      // ta place : changer de tenue ou de pseudo (pas pendant le tirage de la roue) ; les autres : actions de l'hôte
      const acts = me
        ? (l.spinning ? '' : `<div class="seat-acts"><button type="button" class="sa" data-outfit title="Changer de tenue">${pxIcon('hat', 1)}</button>
          <button type="button" class="sa txt" data-rename title="Changer de pseudo">Aa</button></div>`)
        : canEdit
          ? `<div class="seat-acts">${!p.bot && p.connected ? `<button type="button" class="sa" data-give="${esc(key)}" data-name="${esc(p.name)}" title="Confier la table à ${esc(p.name)}"><img class="px-ico" src="${ICON.star}" width="14" height="14" alt="Hôte"></button>` : ''}
          <button type="button" class="sa kick" data-kick="${esc(key)}" data-name="${esc(p.name)}" data-isbot="${p.bot ? 1 : ''}" title="${p.bot ? 'Retirer' : 'Expulser'} ${esc(p.name)}">${pxIcon('close', 1)}</button></div>`
          : '';
      d.innerHTML = `${acts}<canvas width="56" height="60"></canvas><div class="nm">${esc(p.name)}</div>
        <div class="tag">${host ? `<img class="px-ico" src="${ICON.star}" width="14" height="14" alt=""> hôte ` : ''}${me ? '(toi)' : ''}${p.bot ? '<span class="botag">bot</span>' : ''} ${p.connected ? '' : '<span class="off">déconnecté</span>'}</div>`;
    }
    const sig = `${d.className}|${d.title}|${d.dataset.invite ?? '-'}|${d.innerHTML}`;
    const look = p ? JSON.stringify(p.character || {}) : '';
    let el = seats.children[i];
    if (el && el.seatSig === sig && el.seatLook === look) continue; // rien n'a changé à cette place
    if (!el) el = seats.appendChild(d);
    else if (el.seatSig !== sig) {
      el.replaceWith(d);
      el = d;
    }
    el.seatSig = sig;
    el.seatLook = look;
    if (p) drawPortraitInto(el.querySelector('canvas'), p.character || {});
  }
}

$('seats').onclick = async (e) => {
  if (!lobby) return;
  const b = e.target.closest('[data-invite], [data-bot], [data-kick], [data-give], [data-outfit], [data-rename]');
  if (!b) return;
  if (b.dataset.outfit !== undefined) return openEditor();
  if (b.dataset.rename !== undefined) return renameAtTable();
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

// ------------------------------------------------------------ invitation
// Le lien porte le pseudo et le message de celui qui invite : invite/worker.js en fait l'aperçu du lien
// (Discord, WhatsApp…) « <pseudo> t'attend au Buckshot Saloon ! », puis envoie le joueur à la table.
// Le message : celui du joueur s'il en a écrit un (gardé sur ce navigateur), sinon une description de la table.
const INVITE_KEY = 'bs-invite';
let inviteMsg = '';
try { inviteMsg = localStorage.getItem(INVITE_KEY) || ''; } catch {}

// avec le worker : https://<worker>/CODE/pseudo?m=message&p=joueurs&s=chaises ; sans : lien direct vers la table (aperçu générique)
// . ! ( ) ' ~ * encodés aussi : Discord coupe la ponctuation en fin de lien
const encodeAll = (s) => encodeURIComponent(s).replace(/[.!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
function inviteUrl(l) {
  if (!INVITE_URL) return `${location.origin}/?lobby=${l.code}`;
  const who = user ? `/${encodeAll(user.username)}` : '';
  // p : les joueurs déjà assis (apparence et nom) pour l'image de l'aperçu ; s : nombre de chaises
  return `${INVITE_URL.replace(/\/$/, '')}/${l.code}${who}?m=${encodeAll(inviteMsg || autoInvite(l))}`
    + `&p=${encodeAll(encodePlayers(l.players))}&s=${l.max || 6}`;
}

function inviteWhat(l) {
  if (l.format === 'wheel') return 'la roue des jeux';
  if (l.format === 'champ') return `un championnat en ${l.champ && !l.champ.done ? l.champ.rounds : l.rounds} jeux`;
  const m = MODES[l.mode] || MODES.roulette;
  const v = l.variants?.[l.mode];
  return `une partie de ${m.name}${v ? ` (${variantName(l.mode, v)})` : ''}`;
}

function autoInvite(l) {
  const free = (l.max || 6) - l.players.length;
  const seats = free > 1 ? ` Encore ${free} chaises libres.` : free === 1 ? ' Plus qu’une chaise libre !' : '';
  return `Une table pour ${inviteWhat(l)}.${seats}`;
}

$('btn-invite-msg').onclick = async () => {
  if (!lobby) return;
  if (!(await askConfirm({
    title: 'Message d’invitation',
    text: 'Il s’affiche dans l’aperçu du lien (Discord, WhatsApp…). Laisse vide pour décrire la table automatiquement.',
    yes: 'Enregistrer', no: 'Annuler', icon: 'hat',
    field: { value: inviteMsg, placeholder: autoInvite(lobby), max: 200 },
  }))) return;
  inviteMsg = $('modal-field').value.trim();
  try { inviteMsg ? localStorage.setItem(INVITE_KEY, inviteMsg) : localStorage.removeItem(INVITE_KEY); } catch {}
  $('btn-invite-msg').classList.toggle('on', !!inviteMsg);
  if (lobby) $('lobby-link').value = inviteUrl(lobby);
};
$('btn-invite-msg').classList.toggle('on', !!inviteMsg);

// le message est dans l'aperçu du lien : on n'envoie que le lien
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
  preload(pick);
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
  curMatch = null;
  watching = false;
  if (screen !== 'game') return;
  closeScenes();
  if (lobby && !lobby.solo) showLobby();
  else showMenu();
});

// Partage natif (mobile, Windows…) si dispo, sinon copie du lien
async function invite() {
  if (navigator.share) {
    try {
      return await navigator.share({ title: 'Buckshot Saloon', url: $('lobby-link').value });
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
  const myTurn = !watching && !!st && st.phase === 'playing' && st.turn === st.me && !scene.busy && !pending;
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
  if (kind && kind !== 'roulette') whenScene(kind, () => enterMini(kind));
  else enterRoulette();
}

// Scène du mini-jeu pas encore chargée (import à la demande) : les messages de la partie attendent, dans l'ordre.
let miniHold = null; // { kind, todo: [fonctions] }
function whenScene(kind, fn) {
  if (sceneCls[sceneKey(kind)] && !miniHold) return fn();
  if (!miniHold || miniHold.kind !== kind) {
    const hold = miniHold = { kind, todo: [] };
    loadScene(kind).then(() => {
      if (miniHold !== hold) return;
      miniHold = null;
      for (const f of hold.todo) f();
    }, (e) => {
      console.error(e);
      if (miniHold !== hold) return;
      miniHold = null;
      toast(`Impossible de charger ce jeu (réseau ?). Quitte la table et réessaie. <small>(${esc(`${e?.name || 'Erreur'} : ${e?.message || e}`)})</small>`);
    });
  }
  miniHold.todo.push(fn);
}

let tipTimer = 0, tipKey = null, tipH = 0;
function enterRoulette() {
  show('game');
  setMusic('game');
  $('gameover').classList.add('hidden');
  $('bottombar').classList.toggle('hidden', watching); // en spectateur : pas de boutons de tir
  showWatchBar();
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
      if (!id) { tipKey = null; return tip.classList.add('hidden'); }
      // appelé à chaque mouvement de souris : le texte (et sa hauteur) ne changent qu'avec l'objet survolé
      const key = `${id}|${isOpp}|${tap}`;
      if (key !== tipKey || tip.classList.contains('hidden')) {
        const it = ITEMS[id];
        tip.innerHTML = `<b>${it.name}${isOpp ? ' (adversaire)' : ''}</b>${it.desc}${tap ? '<em>Touche encore pour l’utiliser</em>' : ''}`;
        tip.classList.remove('hidden');
        tipKey = key;
        tipH = tip.offsetHeight;
      }
      const w = Math.min(260, innerWidth - 16);
      tip.style.left = `${Math.max(8, Math.min(x + 16, innerWidth - w - 8))}px`;
      // au doigt, au-dessus du doigt pour ne pas cacher l'objet
      const top = tap === undefined ? y + 16 : y - tipH - 20;
      tip.style.top = `${Math.max(8, Math.min(top, innerHeight - tipH - 8))}px`;
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
  const MiniCls = sceneCls[sceneKey(kind)];
  const watch = watching; // en spectateur : ni coups ni positions envoyés
  mini = new MiniCls($('game'), {
    send: (action) => { if (!watch) net.send({ t: 'action', action }); },
    live: (d) => { if (!watch) net.sendLive(d); },
    onState: queueHud,
    onEnd: showMiniOver,
  });
  mini.watch = watch;
  if (!watch) pad.attach(mini);
  showWatchBar();
  hudHtml = hudBar = null; // le HUD et la barre ont pu servir à la roulette ou être remis à zéro entre-temps
  renderMiniHud();
}

// HUD des mini-jeux : redessiné au plus une fois par image (un lot de k événements = k états), et seulement s'il change.
let hudRaf = 0, hudHtml = null, hudBar = null;
function queueHud() {
  if (!hudRaf) hudRaf = requestAnimationFrame(() => { hudRaf = 0; renderMiniHud(); });
}

function renderMiniHud() {
  const st = mini?.state;
  if (!st) return;
  setMood(mini.mood());
  const stats = mini.hudStats().map(([k, v, cls]) => `<span class="${cls}">${k} ${v}</span>`).join('');
  const players = st.players.map((p, i) => `<span class="pl" style="color:${PLAYER_COLORS[i]}${p.left ? ';opacity:.5' : ''}" title="${esc(p.name)}">
    <span class="nm">${esc(i === st.me && !watching ? 'Toi' : p.name)}</span>${p.score}</span>`).join('');
  const ms = mini.clock();
  const r = Math.ceil((ms ?? 0) / 1000);
  const clock = ms == null ? '' : `<span class="cream">${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}</span>`;
  const html = `${stats}${players}<span class="grow"></span>${clock}`;
  if (html !== hudHtml) $('hud').innerHTML = hudHtml = html;
  const bar = `${(mini.progress() ?? 0) * 100}%`;
  if (bar !== hudBar) $('progress-fill').style.width = hudBar = bar;
}

function showMiniOver(ev) {
  const st = mini.state;
  const me = watching ? -1 : st.me;
  const ranking = ev.ranking?.length ? ev.ranking : st.players.map((_, i) => i).sort((a, b) => st.players[b].score - st.players[a].score);
  const rank = ranking.indexOf(me) + 1;
  // jeux en équipes (assaut du fort) : toute l'équipe gagne ou perd
  const teams = !!ev.winners;
  const tie = teams ? ev.tie : ev.tie && st.players[me].score === st.players[ranking[0]].score;
  const win = teams ? ev.winners.includes(me) : rank === 1 && !ev.tie;
  $('gameover').classList.remove('hidden');
  $('go-title').textContent = watching ? (ev.tie ? 'ÉGALITÉ !' : `${st.players[ranking[0]].name.toUpperCase()} GAGNE`)
    : win ? 'VICTOIRE !' : tie ? 'ÉGALITÉ !' : teams ? 'DÉFAITE !' : `${rank}e PLACE`;
  $('go-title').style.color = watching ? 'var(--yellow)' : win ? 'var(--green)' : tie ? 'var(--yellow)' : 'var(--salmon)';
  const unit = mini.unit?.() || MODES[mini.kind]?.unit || 'pts';
  const head = teams && ev.teams ? `<b>${TEAM_NAMES[0]} ${ev.teams[0]} — ${TEAM_NAMES[1]} ${ev.teams[1]}</b> (moyenne par joueur)<br>` : '';
  $('go-sub').innerHTML = head + ranking.map((i, k) => {
    const p = st.players[i];
    return `<span style="color:${PLAYER_COLORS[i]}">${k + 1}. ${esc(p.name)} — ${p.score} ${unit}${p.left ? ' (parti)' : ''}</span>`;
  }).join('<br>');
  if (!watching) {
    sfx(win ? 'victory' : 'defeat');
    if (win) sfx('yeehaw', 0.4);
  }
  setTimeout(() => { if (screen === 'game') setMusic('menu'); }, 3500);
  updateGameOver();
}

net.on('live', ({ from, d }) => { if (mini && screen === 'game') mini.onLive(from, d); });

// Tournoi : les messages d'un match portent son id (match) et, pour un spectateur, watch. Ceux d'un match
// qu'on ne suit plus sont ignorés ; le début d'un autre match (le sien au tour suivant) remplace la scène.
function followMatch(match, watch, starts) {
  const tag = match ?? null;
  if (tag === curMatch && !!watch === watching) return 'same';
  if (!starts) return 'stale';
  curMatch = tag;
  watching = !!watch;
  return 'new';
}

net.on('events', ({ events, match, watch }) => {
  const kind = events[0]?.state?.kind;
  const follow = followMatch(match, watch, events.some((ev) => ev.type === 'mgStart' || ev.type === 'intro'));
  if (follow === 'stale') return;
  if (follow === 'new') closeScenes();
  if (kind) {
    whenScene(kind, () => {
      if (!mini || screen !== 'game' || mini.kind !== kind) {
        // un dernier tick d'une partie qu'on vient de quitter ne doit pas rouvrir l'écran de jeu
        if (!events.some((ev) => ev.type === 'mgStart')) return;
        enterMini(kind);
      }
      for (const ev of events) mini.event(ev);
    });
    return;
  }
  if (!scene || screen !== 'game') enterRoulette();
  scene.enqueue(events);
  updateControls();
});

net.on('sync', ({ state, match, watch }) => {
  if (followMatch(match, watch, true) === 'new') closeScenes();
  if (state.kind) {
    whenScene(state.kind, () => {
      if (!mini || screen !== 'game' || mini.kind !== state.kind) enterMini(state.kind);
      mini.sync(state);
    });
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
  const me = st.players[st.me], op = st.players[1 - st.me];
  if (watching) {
    // spectateur d'un match du tournoi
    const w = st.players[ev.winner], l = st.players[1 - ev.winner];
    $('go-title').textContent = `${w.name.toUpperCase()} GAGNE`;
    $('go-title').style.color = 'var(--yellow)';
    $('go-sub').textContent = ev.forfeit ? `${l.name} a quitté la table.` : `${w.wins} manche${w.wins > 1 ? 's' : ''} à ${l.wins}.`;
    return updateGameOver();
  }
  $('go-title').textContent = win ? 'VICTOIRE !' : 'DÉFAITE…';
  $('go-title').style.color = win ? 'var(--green)' : 'var(--salmon)';
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
  // tournoi : le tableau, et depuis le banc les matchs à regarder ; pas de revanche avant la fin
  const cup = lobby.tourney;
  $('go-tourney').innerHTML = cup ? tourneyHtml(cup) : '';
  $('go-buttons').classList.toggle('hidden', !!cup && cup.phase === 'playing');
  if (cup && cup.phase === 'playing') return void ($('go-rematch').textContent = '');
  // revanche, nouveau tour de roue ou jeu suivant du championnat : chacun se dit prêt
  $('btn-rematch').textContent = c ? (c.done ? 'Nouveau championnat' : `Jeu suivant (${c.n + 1}/${c.rounds})`)
    : fmt === 'wheel' ? 'Relancer la roue' : cup ? 'Nouveau tournoi' : 'Revanche';
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
  curMatch = null;
  watching = false;
  showLobby();
};

// ------------------------------------------------------------ tournoi : le banc
const myKey = () => user?.username.toLowerCase();
const tLive = (t) => (t.rounds[t.rounds.length - 1] || []).filter((m) => m.w == null);
const roundName = (ms, r) => (ms.length === 1 ? 'Finale' : ms.length === 2 ? 'Demi-finales' : `Tour ${r + 1}`);

// Message du lobby pendant un tournoi : à son match (ses événements arrivent d'eux-mêmes), au match qu'on regarde, ou au banc.
function onTourney() {
  const t = lobby.tourney;
  const mine = tLive(t).find((m) => m.p.some((p) => p.key === myKey()));
  if (mine) {
    if (curMatch === mine.id && !watching) return; // ma partie est à l'écran
    if (screen === 'game' && !$('gameover').classList.contains('hidden')) updateGameOver();
    return; // ma partie va commencer : ses premiers événements ouvriront la scène
  }
  // le match à l'écran (le sien, ou celui qu'on regarde) est de ce tour : sa scène montre la fin d'elle-même
  if (curMatch && (t.rounds[t.rounds.length - 1] || []).some((m) => m.id === curMatch) && screen === 'game') {
    if (!$('gameover').classList.contains('hidden')) updateGameOver();
    return showWatchBar();
  }
  showBench();
}

// Le banc : le panneau de fin de partie, avec le tableau du tournoi et les matchs à regarder.
function showBench() {
  if (screen !== 'game') { show('game'); setMusic('menu'); }
  if (watching) { watching = false; curMatch = null; closeScenes(); }
  $('bottombar').classList.add('hidden');
  $('watch-bar').classList.add('hidden');
  if ($('gameover').classList.contains('hidden')) {
    // pas de résultat de match à montrer : on est simplement sur le banc
    $('go-title').textContent = 'LE BANC';
    $('go-title').style.color = 'var(--yellow)';
    $('go-sub').textContent = '';
    $('gameover').classList.remove('hidden');
  }
  updateGameOver();
}

function showWatchBar() {
  const m = watching && lobby?.tourney ? tLive(lobby.tourney).find((x) => x.id === curMatch) || lobby.tourney.rounds.flat().find((x) => x.id === curMatch) : null;
  $('watch-bar').classList.toggle('hidden', !m);
  if (m) $('watch-text').innerHTML = `Tu regardes <b>${esc(m.p[0].name)}</b> contre <b>${esc(m.p[1].name)}</b>`;
}

function tourneyHtml(t) {
  const me = myKey();
  const live = tLive(t);
  const playing = live.some((m) => m.p.some((p) => p.key === me));
  const lost = t.rounds.flat().some((m) => m.w != null && m.p[1 - m.w].key === me);
  const status = t.phase === 'over'
    ? (t.champion ? `${pxIcon('trophy')} <b>${esc(t.champion)}</b> remporte le tournoi !` : 'Le tournoi s’est arrêté.')
    : playing ? 'Ton match va commencer…'
      : lost ? 'Éliminé : regarde la suite depuis le banc.'
        : t.pause ? 'Qualifié ! Le tour suivant commence dans un instant.'
          : 'Qualifié ! En attendant les autres matchs, regarde-les depuis le banc.';
  const rounds = t.rounds.map((ms, r) => {
    const rows = ms.map((m) => {
      const side = (k) => {
        const p = m.p[k];
        const cls = [m.w === k ? 'won' : m.w === 1 - k ? 'lost' : '', p.key === me ? 'me' : ''].join(' ').trim();
        return `<span class="${cls}">${esc(p.name)}${p.bot ? '<i class="botag">bot</i>' : ''}</span>`;
      };
      const seen = watching && curMatch === m.id;
      const act = !m.live ? ''
        : playing || m.p.every((p) => p.bot) ? '<em>en cours</em>'
          : `<button type="button" class="btn alt t-watch" data-watch="${esc(m.id)}" ${seen ? 'disabled' : ''}>${seen ? 'À l’écran' : 'Regarder'}</button>`;
      return `<li>${side(0)}<b>contre</b>${side(1)}${act}</li>`;
    }).join('');
    return `<div class="t-round"><h4>${roundName(ms, r)}</h4><ul>${rows}</ul></div>`;
  }).join('');
  return `<h3>Tournoi <small>${esc(MODES[t.mode]?.name || '')}</small></h3><p class="t-status">${status}</p>${rounds}`;
}

$('go-tourney').onclick = (e) => {
  const b = e.target.closest('[data-watch]');
  if (b) net.send({ t: 'watch', id: b.dataset.watch });
};
$('btn-bench').onclick = () => {
  net.send({ t: 'watch', id: null });
  watching = false;
  curMatch = null;
  closeScenes();
  $('gameover').classList.add('hidden'); // le banc, sans le résultat du match regardé
  showBench();
};

$('btn-exit').onclick = async () => {
  const host = lobby && isHostOf(lobby) && othersAtTable();
  const hostNote = host ? ' Tu es l’hôte : la table passera à un autre joueur.' : '';
  if (screen === 'game' && !watching && scene?.state?.phase === 'playing') {
    const ok = await askConfirm({
      title: 'Quitter la table ?',
      text: `Tu perds le duel par abandon${lobby?.solo ? '.' : ', et ton adversaire empoche la victoire.'}${hostNote}`,
      yes: 'Abandonner', no: 'Rester', icon: 'skull', danger: true,
    });
    if (ok) net.send({ t: 'leaveLobby' });
  } else if (screen === 'game' && !watching && mini && !mini.over) {
    const ok = await askConfirm({
      title: 'Quitter la partie ?',
      text: host
        ? 'Tu es l’hôte : la partie s’arrête pour tout le monde et la table passe à un autre joueur.'
        : 'Ton score sera figé et tu finiras dernier.',
      yes: 'Quitter', no: 'Rester', icon: 'close', danger: true,
    });
    if (ok) net.send({ t: 'leaveLobby' });
  } else if (screen === 'game' || screen === 'lobby') leaveTable();
  else if (screen === 'editor') editorBack();
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
