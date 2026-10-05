// Point d'entrée : écrans, réseau, lobby, interface de jeu.
import { Net, fetchLeaderboard } from './net.js';
import { initAudio, playMusic, nextTrack, sfx, toggleMute, setVolume, audioSettings } from './audio.js';
import { Scene } from './scene.js';
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
import { RtsScene } from './rts.js';
import { TEAM_NAMES } from './fortgame.js';
import { MODES, PLAYER_COLORS } from './worlds.js';
import { gameIcon } from './gameicons.js';
import { TouchPad } from './touch.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const net = new Net();
let user = null;
let lobby = null;
let scene = null; // roulette
let mini = null; // mini-jeu en cours (fusillade, lasso, duel, Charlie)
const MINI_SCENES = { shooter: ShooterScene, lasso: LassoScene, duel: DuelScene, charlie: CharlieScene, fort: FortScene, wagon: WagonScene, pinte: PinteScene, mine: MineScene, rts: RtsScene };
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
(function bgLoop(t) {
  if (screen !== 'game') {
    bgx.drawImage(desert, 0, 0);
    for (let i = 0; i < 3; i++) {
      const a = t / 5000 + i * 2.1;
      S.vulture(bgx, Math.round(70 + i * 105 + Math.cos(a) * 34), Math.round(26 + i * 7 + Math.sin(a) * 9), t + i * 90);
    }
    tw.x += 0.7;
    if (tw.x > 410) tw.x = -40 - Math.random() * 400;
    S.tumbleweed(bgx, Math.round(tw.x), Math.round(178 - Math.abs(Math.sin(t / 170)) * 7), t);
  }
  requestAnimationFrame(bgLoop);
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
  rts: ['Conquête', '3 bots'],
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

function showLobby() {
  if (screen !== 'lobby') { show('lobby'); setMusic('menu'); }
  const l = lobby;
  const mode = MODES[l.mode] || MODES.roulette;
  const isHost = isHostOf(l);
  $('lobby-code').textContent = l.code;
  $('lobby-link').value = `${location.origin}/?lobby=${l.code}`;
  // les jeux trop petits pour la table sont grisés (ex. roulette et duel au-delà de 2 joueurs)
  $('modes').innerHTML = Object.entries(MODES).map(([id, m]) => {
    const full = l.players.length > m.max;
    const title = full ? `title="${m.name} se joue à ${m.max} maximum"` : '';
    return `
    <button class="mode${l.mode === id ? ' on' : ''}${full ? ' full' : ''}" data-mode="${id}" ${isHost && !full ? '' : 'disabled'} ${title}>
      <b>${m.name}</b><small>${m.sub}</small><i>${m.min === m.max ? `${m.min} joueurs` : `${m.min} à ${m.max} joueurs`}</i>
    </button>`;
  }).join('');
  const seats = $('seats');
  seats.innerHTML = '';
  // toujours 4 places affichées ; les vides servent à inviter
  const nSeats = Math.max(l.players.length, l.max || 4);
  for (let i = 0; i < nSeats; i++) {
    const p = l.players[i];
    const d = document.createElement('div');
    if (!p) {
      d.className = 'seat empty';
      d.title = 'Copier le lien d’invitation';
      d.innerHTML = '<div class="box">Chaise vide…<br>Clique pour inviter</div>';
      d.onclick = invite;
    } else {
      d.className = 'seat';
      d.innerHTML = `<canvas width="56" height="60"></canvas><div class="nm">${esc(p.name)}</div>
        <div class="tag">${p.name.toLowerCase() === l.host ? `<img class="px-ico" src="${ICON.star}" width="14" height="14" alt=""> hôte ` : ''}${p.name === user.username ? '(toi)' : ''} ${p.connected ? '' : '<span class="off">déconnecté</span>'}</div>`;
      drawPortraitInto(d.querySelector('canvas'), p.character || {});
    }
    seats.appendChild(d);
  }
  const tooMany = l.players.length > mode.max;
  $('btn-start').classList.toggle('hidden', !isHost);
  $('btn-start').disabled = l.players.length < mode.min || tooMany;
  $('btn-start').textContent = `Lancer : ${mode.name}`;
  $('lobby-hint').textContent = tooMany
    ? `${mode.name} se joue à ${mode.max} maximum. ${isHost ? 'Choisis un mini-jeu.' : 'L’hôte doit choisir un autre jeu.'}`
    : l.players.length < mode.min
      ? 'Partage le lien ou le code. La partie commence quand l’hôte la lance.'
      : isHost ? 'Choisis le jeu et lance la partie !' : `L’hôte va lancer : ${mode.name}…`;
}

$('modes').onclick = (e) => {
  const b = e.target.closest('[data-mode]');
  if (b && lobby && isHostOf(lobby) && b.dataset.mode !== lobby.mode) net.send({ t: 'mode', mode: b.dataset.mode });
};

function isHostOf(l) {
  return !!user && l.host === user.username.toLowerCase();
}

async function copyLink() {
  const v = $('lobby-link').value;
  try { await navigator.clipboard.writeText(v); } catch { $('lobby-link').select(); document.execCommand('copy'); }
  $('btn-copy').textContent = 'Copié !';
  setTimeout(() => ($('btn-copy').textContent = 'Copier'), 1500);
}

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
// Quitter la table : si on en est l'hôte et que d'autres joueurs sont assis, la table ferme pour tout le monde.
async function leaveTable() {
  const others = lobby && isHostOf(lobby) && !lobby.solo && lobby.players.length > 1;
  if (others && !(await askConfirm({
    title: 'Fermer la table ?',
    text: 'Tu es l’hôte : si tu pars, la table ferme et les autres joueurs sont renvoyés au menu.',
    yes: 'Fermer la table', no: 'Rester', icon: 'close', danger: true,
  }))) return;
  net.send({ t: 'leaveLobby' });
}
$('btn-leave').onclick = leaveTable;
$('btn-start').onclick = () => net.send({ t: 'start' });

$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const v = $('chat-input').value.trim();
  if (v) net.send({ t: 'chat', text: v });
  $('chat-input').value = '';
};
net.on('chat', ({ from, text }) => {
  const line = `<b>${esc(from)} :</b> ${esc(text)}`;
  const log = $('chat-log');
  const d = document.createElement('div');
  d.innerHTML = line;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  if (screen === 'game') toast(line, 'toasts');
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
  pending = false;
  matchStart = Date.now();
  say('Bienvenue au Buckshot Saloon. Asseyez-vous, messieurs-dames…');
  scene = new Scene($('game'), {
    onState: (st) => { renderHud(st); updateControls(); },
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
  setMusic('game');
  $('bottombar').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('toasts').innerHTML = '';
  closeScenes();
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
  setTimeout(() => { if (screen === 'game') setMusic('menu'); }, 3500);
  updateGameOver();
}

net.on('live', ({ from, d }) => { if (mini && screen === 'game') mini.onLive(from, d); });

net.on('events', ({ events }) => {
  const kind = events[0]?.state?.kind;
  if (kind) {
    if (!mini || screen !== 'game' || mini.kind !== kind) enterMini(kind);
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
  if (lobby.solo) {
    $('btn-rematch').disabled = false;
    $('go-rematch').textContent = '';
    return;
  }
  const voted = lobby.rematch.includes(user.username);
  const alone = lobby.players.length < 2;
  $('btn-rematch').disabled = voted || alone;
  $('go-rematch').textContent = alone
    ? 'Tes adversaires ont quitté la table.'
    : lobby.rematch.length
      ? `Revanche demandée par : ${lobby.rematch.join(', ')}`
      : '';
}

$('btn-rematch').onclick = () => net.send({ t: 'rematch' });
$('btn-go-menu').onclick = () => {
  if (lobby?.solo) return net.send({ t: 'leaveLobby' });
  closeScenes();
  showLobby();
};

$('btn-exit').onclick = async () => {
  const host = lobby && isHostOf(lobby) && !lobby.solo && lobby.players.length > 1;
  const hostNote = host ? ' Tu es l’hôte : la table fermera pour tout le monde.' : '';
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
      text: `Ton score sera figé et tu finiras dernier.${hostNote}`,
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
