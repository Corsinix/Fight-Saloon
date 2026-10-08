// Réseau sans serveur dédié : comptes et classement dans Supabase (Postgres),
// messages des tables relayés par Supabase Realtime.
// Le navigateur de l'hôte fait office de serveur de la table : il fait tourner la partie
// (game.js) et n'envoie à chaque joueur que ce qu'il a le droit de voir.
// L'interface (on / send / messages { t: ... }) est la même que l'ancien serveur WebSocket.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { Game, personalize } from './game.js';
import { Bot, botPlayer } from './bot.js';
import { variantOk } from './variants.js';
import { MODES, MAX_PLAYERS } from './worlds.js';
import { CHAR_PARTS, CHAR_COLORS } from './data.js';

const RECONNECT_GRACE = 45000;
const HOST_GRACE = 8000;
const JOIN_TIMEOUT = 6000;
const STATS0 = { played: 0, wins: 0, losses: 0, shots: 0, selfShots: 0, hits: 0, mgPlayed: 0, mgWins: 0 };
const MINI_TICK = 100;
const SOLO_BOTS = 3; // adversaires bots dans un mini-jeu solo
const SPIN_MS = 4300; // roue des jeux : animation (main.js) puis annonce, avant le début de la partie
const CHAMP_PTS = [5, 3, 2, 1]; // points du championnat selon la place
const FORMATS = ['single', 'wheel', 'champ']; // un jeu choisi, la roue (jeu au hasard), le championnat
const ROUNDS = [3, 5, 7, 10];
const TOURNEY_PAUSE = 6000; // tournoi : pause entre deux tours (résultats, puis tirage du tour suivant)

const MAX_CATCHUP = 50; // pas d'horloge rejoués au plus d'un coup (onglet de l'hôte en arrière-plan)
const ROSTER_MS = 5000; // noms et personnages des joueurs renvoyés avec les événements au moins toutes les 5 s
const STATIC_KEYS = ['name', 'character', 'bot']; // champs des joueurs qui ne changent pas pendant une partie

const configured = /^https:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('COLLE') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('COLLE');

// supabase-js (version fixée : le service worker la garde en cache) ne sert qu'au canal Realtime des tables :
// chargée à la première table ouverte, pour que l'accueil et le jeu solo démarrent sans elle (hors ligne, CDN en panne…).
// Les fonctions SQL (comptes, résultats) passent par un simple fetch.
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
let sbLoad = null;
function realtime() {
  if (!sbLoad) {
    sbLoad = import(SUPABASE_JS).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }));
    sbLoad.catch(() => { sbLoad = null; }); // échec (réseau) : nouvel essai au prochain appel
  }
  return sbLoad;
}
// Chargement d'avance (lien d'invitation, menu au repos) : la table s'ouvre ensuite sans attendre le CDN.
export const preloadRealtime = () => { if (configured) realtime().catch(() => {}); };

// Arbitres des mini-jeux, chargés à la demande (games.js en est la version synchrone, pour les bancs d'essai).
const REFEREES = {
  fort: [() => import('./fortgame.js'), (m, players, v) => new m.FortGame(players, v)],
  wagon: [() => import('./wagongame.js'), (m, players) => new m.WagonGame(players)],
  pinte: [() => import('./pintegame.js'), (m, players, v) => new m.PinteGame(players, v)],
  mine: [() => import('./minegame.js'), (m, players) => new m.MineGame(players)],
  course: [() => import('./coursegame.js'), (m, players, v) => new m.CourseGame(players, v)],
  rts: [() => import('./rtsgame.js'), (m, players, v) => new m.RtsGame(players, v)],
  fps: [() => import('./fpsgame.js'), (m, players) => new m.FpsGame(players, 'fps')],
  fpsdm: [() => import('./fpsgame.js'), (m, players) => new m.FpsGame(players, 'fpsdm')],
  bagarre: [() => import('./bagarregame.js'), (m, players) => new m.BagarreGame(players)],
  // « La mêlée » en vue de dessus : un arbitre pour ses cinq modes (la variante dit le mode)
  melee: [() => import('./brawlgame.js'), (m, players, v) => new m.BrawlGame(players, v)],
};
const MINI_REF = [() => import('./mini.js'), (m, players, v, mode) => new m.MiniGame(mode, players, v)];
const refLoaded = {}; // mode -> module de l'arbitre, une fois chargé
const loadReferee = (mode) => (REFEREES[mode] || MINI_REF)[0]().then((m) => { refLoaded[mode] = m; });
const makeGame = (mode, players, variant) => (REFEREES[mode] || MINI_REF)[1](refLoaded[mode], players, variant, mode);
// Chargement d'avance quand l'hôte choisit le jeu (ou survole sa carte) : la partie démarre sans attendre.
export const preloadGame = (mode) => { if (MODES[mode] && mode !== 'roulette' && !refLoaded[mode]) loadReferee(mode).catch(() => {}); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (name) => String(name).toLowerCase();
const validUsername = (name) => typeof name === 'string' && /^[A-Za-z0-9_\-éèàçÉÈÀ]{2,16}$/.test(name);

// Jeu à deux (roulette, duel) à une table de plus de deux joueurs : il se joue en tournoi (voir startTourney).
export const tourneyFor = (mode, n) => MODES[mode]?.max === 2 && n > 2;
export const playableAt = (mode, n) => !!MODES[mode] && n >= MODES[mode].min && (n <= MODES[mode].max || tourneyFor(mode, n));

function defaultCharacter() {
  return {
    skin: 1, hat: 'cowboy', hatColor: 1, hair: 'short', hairColor: 1,
    eyes: 'squint', eyeColor: 0, nose: 'small', mouth: 'neutral', beard: 'stubble',
    outfit: 'poncho', outfitColor: 2, extra: 'none',
  };
}

// Chaque partie et couleur est validée d'après les listes de l'éditeur (data.js) : une option ajoutée là-bas est acceptée d'office.
function sanitizeCharacter(c) {
  const out = defaultCharacter();
  if (!c || typeof c !== 'object') return out;
  for (const p of CHAR_PARTS) if (p.options.some(([id]) => id === c[p.key])) out[p.key] = c[p.key];
  for (const p of CHAR_COLORS) {
    const v = c[p.key];
    if (Number.isInteger(v) && v >= 0 && v < p.colors.length) out[p.key] = v;
  }
  return out;
}

const toUser = (r) => r && {
  username: r.username,
  character: sanitizeCharacter(r.character),
  stats: { ...STATS0, ...r.stats },
  history: r.history || [],
};

// Fonction SQL de supabase/schema.sql, appelée comme le fait supabase-js (PostgREST : POST /rest/v1/rpc/<fonction>).
async function callSql(fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(data?.message || `${fn} : HTTP ${res.status}`);
  return data;
}

async function rpc(fn, args) {
  const data = await callSql(fn, args);
  return Array.isArray(data) ? data[0] : data;
}

// État d'une table tenue par ce navigateur (créée, ou reprise d'un autre hôte).
function lobbyBase(code, host) {
  return {
    code, host, solo: false, mode: 'roulette', players: [], game: null, bot: null, botTimer: null, miniTimer: null,
    rematch: new Set(), dcTimers: {}, lockUntil: 0,
    format: 'single', pool: Object.keys(MODES), rounds: 5, locked: false, banned: new Set(),
    variants: {}, // mode -> variante imposée par l'hôte (format « Un jeu » ; voir variants.js)
    champ: null, spinning: false, spinTimer: 0, lastPick: null, formerHost: null,
  };
}

// Version d'un événement pour un spectateur du tournoi : vue du joueur 0, sans ses infos secrètes.
function spectate(ev) {
  const { states, private: priv, ...rest } = ev;
  return { ...rest, state: states[0], ...(priv ? { hidden: true } : {}) };
}

// Classement d'une partie terminée : place de chaque joueur (ex aequo possibles).
function placesOf(g, end) {
  if (end.places) return end.places; // tournoi : places calculées par l'arbitre (voir finishTourney)
  if (!g.kind) return g.p.map((_, i) => (i === end.winner ? 1 : 2));
  if (end.winners) return g.p.map((_, i) => (end.tie || end.winners.includes(i) ? 1 : end.winners.length + 1));
  const order = end.ranking?.length ? end.ranking : g.p.map((_, i) => i).sort((a, b) => g.p[b].score - g.p[a].score);
  const places = [];
  order.forEach((i, k) => {
    const prev = order[k - 1];
    // même score = même place, sauf dans les courses (classées au temps) et pour ceux qui sont partis
    const same = k > 0 && g.p[i].time === undefined && !g.p[i].left && !g.p[prev].left && g.p[i].score === g.p[prev].score;
    places[i] = same ? places[prev] : k + 1;
  });
  return places;
}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

export class Net {
  constructor() {
    this.handlers = {};
    this.stopped = false;
    this.user = null; // { key, name }
    this.character = null;
    this.chan = null; // canal Realtime de la table
    this.code = null;
    this.hosting = null; // la table, si on en est l'hôte
    this.hostKey = null; // clé de l'hôte, si on est invité
    this.joining = null;
    this.joinTimer = 0;
    this.hostGoneTimer = 0;
    this.roster = new Map(); // invité : clé -> { name, character, bot } des joueurs de la partie (voir packEvents)
    this.wireRoster = null; // hôte : ce qui en a été envoyé { game, at, sent }
    this.renaming = null; // changement de pseudo en cours (voir rename)
    setTimeout(() => this.emit('open'), 0);
  }

  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  emit(t, m) { (this.handlers[t] || []).forEach((fn) => fn(m)); }

  // Livraison asynchrone, comme si le message venait du réseau.
  local(msg) {
    setTimeout(() => this.emit(msg.t, msg), 0);
  }

  send(m) {
    if (!configured) return this.local({ t: 'error', text: 'Supabase n’est pas configuré (voir public/js/config.js).' });
    this.handle(m).catch((e) => {
      console.error(e);
      this.local({ t: 'error', text: 'Le saloon ne répond pas. Réessaie dans un instant.' });
    });
  }

  async handle(m) {
    if (m.t === 'hello') return this.hello(m.username);
    if (!this.user) return this.local({ t: 'error', text: 'Identifie-toi d’abord.' });
    switch (m.t) {
      case 'saveChar': {
        const u = toUser(await rpc('saloon_save_character', { p_username: this.user.name, p_character: sanitizeCharacter(m.character) }));
        this.character = u.character;
        this.local({ t: 'user', user: u });
        return this.toHost({ t: 'char', character: u.character });
      }
      case 'rename': return this.rename(m.username);
      case 'createLobby': return this.createLobby(false);
      case 'createSolo': return this.createLobby(true, MODES[m.mode] ? m.mode : 'roulette');
      case 'joinLobby': return this.joinLobby(m.code);
      case 'leaveLobby':
        await this.leave();
        return this.local({ t: 'left' });
      default:
        return this.toHost(m); // start, mode, action, rematch, chat
    }
  }

  async hello(username) {
    username = String(username || '').trim();
    if (!validUsername(username)) return this.local({ t: 'error', text: 'Pseudo invalide (2 à 16 lettres, chiffres, _ ou -).' });
    const u = toUser(await rpc('saloon_login', { p_username: username, p_character: defaultCharacter() }));
    this.user = { key: keyOf(u.username), name: u.username };
    this.character = u.character;
    this.local({ t: 'welcome', user: u });
  }

  // Changer de pseudo sans quitter la table. Le pseudo est l'identifiant du joueur (compte, place, présence sur
  // le canal) : l'hôte renomme la place, puis on rouvre le canal sous le nouveau nom. Le personnage actuel sert
  // pour un pseudo neuf ; un pseudo existant retrouve le sien (et son palmarès).
  async rename(username) {
    username = String(username || '').trim();
    if (!validUsername(username)) return this.local({ t: 'error', text: 'Pseudo invalide (2 à 16 lettres, chiffres, _ ou -).' });
    if (keyOf(username) === this.user.key) return;
    if (this.renaming) return this.local({ t: 'error', text: 'Changement de pseudo déjà en cours…' });
    this.renaming = {}; // done : réponse de l'hôte, quand on est invité
    try {
      const l = this.hosting;
      if (l) {
        const why = this.renameRefusal(l, this.user.key, username);
        if (why) return this.local({ t: 'error', text: why });
      }
      const u = toUser(await rpc('saloon_login', { p_username: username, p_character: this.character }));
      const before = this.user.key;
      if (l && this.hosting === l) {
        const why = this.renameRefusal(l, before, u.username); // la table a pu bouger pendant l'appel
        if (why) return this.local({ t: 'error', text: why });
        this.setIdentity(u);
        this.renamePlayer(l, before, u.username, u.character);
        await this.openChannel(l.code); // présence sous le nouveau nom
        return this.broadcastLobby(l);
      }
      const code = this.code;
      if (code && this.hostKey && !this.hosting) {
        const res = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: false, text: 'L’hôte ne répond pas. Réessaie dans un instant.' }), JOIN_TIMEOUT);
          this.renaming.done = (r) => { clearTimeout(timer); resolve(r); };
          this.wire('host', { t: 'rename', name: u.username, character: u.character });
        });
        if (!res.ok) return this.local({ t: 'error', text: res.text || 'Impossible de changer de pseudo.' });
        await this.closeChannel();
        this.setIdentity(u);
        return await this.joinLobby(code);
      }
      if (!this.code) this.setIdentity(u); // plus de table entre-temps : simple changement de compte
      else this.local({ t: 'error', text: 'La table a changé pendant ce temps. Réessaie.' });
    } finally {
      this.renaming = null;
    }
  }

  setIdentity(u) {
    this.user = { key: keyOf(u.username), name: u.username };
    this.character = u.character;
    this.local({ t: 'user', user: u });
  }

  // ---------------------------------------------------------------- canal Realtime
  async openChannel(code) {
    await this.closeChannel();
    const sb = await realtime();
    const ch = sb.channel(`saloon:${code}`, { config: { broadcast: { self: false }, presence: { key: this.user.key } } });
    this.chan = ch;
    this.code = code;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => { if (this.chan === ch) this.onWire(payload); });
    ch.on('presence', { event: 'sync' }, () => { if (this.chan === ch) this.onPresence(); });
    await new Promise((resolve, reject) => {
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ name: this.user.name });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
    });
  }

  async closeChannel() {
    const ch = this.chan;
    this.chan = null;
    this.code = null;
    if (ch) await (await realtime()).removeChannel(ch);
  }

  // ks : destinataires d'un message envoyé une seule fois à toute la table (to 'all', voir deliverAll)
  wire(to, msg, ks) {
    return this.chan?.send({ type: 'broadcast', event: 'm', payload: { to, from: this.user.key, name: this.user.name, msg, ...(ks ? { ks } : {}) } });
  }

  presentKeys() {
    return new Set(Object.keys(this.chan?.presenceState() || {}));
  }

  onWire(p) {
    if (!p || !p.msg) return;
    if (p.to === 'all' && p.ks) {
      // message de l'hôte pour plusieurs joueurs (lobby, comptoir, événements) : ks dit lesquels
      if (this.hosting || !p.ks.includes(this.user.key)) return;
      const msg = p.msg.t === 'ev' ? this.unpackEvents(p.msg) : p.msg;
      if (msg) this.fromHost(msg, p.from);
      return;
    }
    if (p.to === 'all') {
      // positions : celle d'un joueur, ou un lot (b : [[clé, d]…]) pour tous les bots de l'hôte
      for (const [from, d] of p.msg.b || [[p.from, p.msg.d]]) {
        this.hosting?.game?.onLive?.(from, d);
        this.emit('live', { from, d });
      }
      return;
    }
    if (p.to === 'host' && this.hosting) this.hostHandle(p.from, p.msg, p.name);
    else if (p.to === this.user.key && this.hosting && p.msg.t === 'deposed') this.deposed(p.from);
    else if (p.to === this.user.key && !this.hosting) this.fromHost(p.msg, p.from);
  }

  onPresence() {
    const here = this.presentKeys();
    if (this.hosting) return this.hostPresence(this.hosting, here);
    if (!this.hostKey) return;
    if (here.has(this.hostKey)) {
      clearTimeout(this.hostGoneTimer);
      this.hostGoneTimer = 0;
    } else if (!this.hostGoneTimer) {
      this.hostGoneTimer = setTimeout(() => {
        this.hostGoneTimer = 0;
        if (this.hostKey && !this.presentKeys().has(this.hostKey)) this.hostVanished();
      }, HOST_GRACE);
    }
  }

  // Positions en temps réel (viseur, cheval…) : diffusées directement à toute la table, sans passer par l'hôte.
  // L'hôte les lit aussi quand le jeu en a besoin (positions pour l'assaut du fort, même en solo).
  sendLive(d) {
    this.hosting?.game?.onLive?.(this.user.key, d);
    if (this.code) this.wire('all', { t: 'live', d });
  }

  // Positions des bots de l'hôte : un seul message par pas d'horloge pour tous (avant : un message par bot).
  liveOut(out) {
    if (!out.length) return;
    for (const o of out) this.emit('live', { from: o.key, d: o.d });
    this.chan?.send({ type: 'broadcast', event: 'm', payload: { to: 'all', from: this.user.key, msg: { t: 'live', b: out.map((o) => [o.key, o.d]) } } });
  }

  // ---------------------------------------------------------------- événements des mini-jeux, en un seul message
  // Dans un mini-jeu, l'état vu par chaque joueur ne diffère que par « me » : l'hôte envoie un seul lot à toute
  // la table et chacun reconstruit sa version (me = sa place dans la partie). Sur le fil, les états identiques
  // d'un lot ne passent qu'une fois, et les noms, personnages et drapeaux bot (fixes pendant la partie) sont
  // envoyés à part (r : au début de la partie, puis toutes les ROSTER_MS) et remis dans chaque état à l'arrivée.
  // Renvoie null si le lot ne s'y prête pas (infos secrètes, états qui diffèrent) : envoi joueur par joueur.
  packEvents(g, events) {
    const st = [], si = [], seen = new Map();
    const now = Date.now();
    let w = this.wireRoster;
    const fresh = !w || w.game !== g || now - w.at > ROSTER_MS;
    if (fresh) w = { game: g, at: now, sent: new Map() };
    const ev = [];
    for (const e of events) {
      const { states, private: priv, ...rest } = e;
      if (priv || !states?.length) return null;
      const s0 = JSON.stringify(states[0]);
      for (let i = 1; i < states.length; i++) if (JSON.stringify({ ...states[i], me: 0 }) !== s0) return null;
      const s = states[0];
      if (!Array.isArray(s.players) || s.players.some((p) => !p || typeof p.key !== 'string')) return null;
      if (fresh) for (const p of s.players) if (!w.sent.has(p.key)) w.sent.set(p.key, Object.fromEntries(STATIC_KEYS.filter((k) => k in p).map((k) => [k, p[k]])));
      const players = s.players.map((p) => {
        const r = w.sent.get(p.key);
        const out = {};
        for (const k in p) if (!(r && STATIC_KEYS.includes(k) && k in r && r[k] === p[k])) out[k] = p[k];
        return out;
      });
      const c = JSON.stringify({ ...s, players });
      if (!seen.has(c)) { seen.set(c, st.length); st.push(JSON.parse(c)); }
      si.push(seen.get(c));
      ev.push(rest);
    }
    this.wireRoster = w;
    return { t: 'ev', e: ev, s: st, i: si, ...(fresh ? { r: [...w.sent] } : {}) };
  }

  // Invité : lot reçu -> { t: 'events', events } tel que l'aurait envoyé personalize() pour ce joueur.
  unpackEvents(m) {
    for (const [key, info] of m.r || []) this.roster.set(key, info);
    const me = this.user.key;
    const lobbyOf = (key) => this.lastLobby?.players?.find((p) => p.key === key);
    const inflate = (c) => {
      const players = c.players.map((p) => {
        const r = this.roster.get(p.key) || lobbyOf(p.key) || {};
        const out = { ...p };
        for (const k of STATIC_KEYS) if (!(k in out) && k in r) out[k] = r[k];
        return out;
      });
      const j = players.findIndex((p) => p.key === me);
      return j < 0 ? null : { ...c, me: j, players };
    };
    const events = [];
    for (let k = 0; k < m.e.length; k++) {
      const state = inflate(m.s[m.i[k]]); // un objet neuf par événement, comme avant
      if (!state) return null;
      events.push({ ...m.e[k], state });
    }
    return { t: 'events', events };
  }

  // ---------------------------------------------------------------- côté invité
  toHost(m) {
    if (this.hosting) return this.hostHandle(this.user.key, m, this.user.name);
    if (this.code && this.hostKey) return this.wire('host', m);
  }

  fromHost(msg, from) {
    // l'hôte nous confie la table
    if (msg.t === 'host') {
      if (this.hosting || !from || from !== this.hostKey) return;
      return this.adopt(msg.lobby, msg);
    }
    if (msg.t === 'lobby') {
      clearTimeout(this.joinTimer);
      clearTimeout(this.heirTimer);
      this.joining = null;
      this.rejoining = false;
      this.lastLobby = msg.lobby;
      if (!this.hosting) this.hostKey = msg.lobby.host;
    }
    if (msg.t === 'error' && this.joining) {
      clearTimeout(this.joinTimer);
      this.joining = null;
      this.closeChannel();
      if (this.rejoining) { this.rejoining = false; this.local({ t: 'left' }); }
    }
    if (msg.t === 'closed') return this.hostClosed(msg.text);
    if (msg.t === 'renamed') return this.renaming?.done?.(msg);
    // état complet (retour en cours de partie) : noms et personnages pour les lots qui suivront (unpackEvents)
    if (msg.t === 'sync' && Array.isArray(msg.state?.players)) {
      for (const p of msg.state.players) if (p?.key) this.roster.set(p.key, Object.fromEntries(STATIC_KEYS.filter((k) => k in p).map((k) => [k, p[k]])));
    }
    this.local(msg);
  }

  async hostClosed(text) {
    clearTimeout(this.hostGoneTimer);
    clearTimeout(this.heirTimer);
    this.hostGoneTimer = 0;
    this.hostKey = null;
    this.lastLobby = null;
    this.rejoining = false;
    await this.closeChannel();
    this.local({ t: 'info', text });
    this.local({ t: 'left' });
  }

  // L'hôte a disparu (onglet fermé, réseau coupé) : le premier joueur encore là reprend la table
  // d'après le dernier état reçu. La partie en cours est perdue ; la table et le championnat restent.
  hostVanished() {
    const v = this.lastLobby, here = this.presentKeys(), gone = this.hostKey;
    const heir = v && v.code === this.code && v.players.find((p) => !p.bot && p.key !== gone && here.has(p.key));
    if (!heir) return this.hostClosed('L’hôte a quitté le saloon. La table est fermée.');
    if (heir.key === this.user.key) {
      return this.adopt({ ...v, players: v.players.filter((p) => p.key !== gone) }, { why: 'gone', aborted: v.inGame, formerHost: gone });
    }
    // un autre joueur reprend : on attend sa table, sinon elle ferme
    this.hostKey = heir.key;
    clearTimeout(this.heirTimer);
    this.heirTimer = setTimeout(() => {
      if (this.hostKey === heir.key && this.lastLobby?.host !== heir.key) this.hostClosed('L’hôte a quitté le saloon. La table est fermée.');
    }, JOIN_TIMEOUT * 2);
  }

  // Devenir l'hôte d'une table existante (confiée par l'hôte, ou reprise après son départ).
  adopt(v, { why = 'give', prev = 'L’hôte', aborted = false, formerHost = null } = {}) {
    clearTimeout(this.hostGoneTimer);
    clearTimeout(this.heirTimer);
    this.hostGoneTimer = 0;
    const me = this.user.key;
    const l = lobbyBase(v.code, me);
    l.mode = MODES[v.mode] ? v.mode : 'roulette';
    l.format = FORMATS.includes(v.format) ? v.format : 'single';
    if (Array.isArray(v.pool) && v.pool.some((id) => MODES[id])) l.pool = v.pool.filter((id) => MODES[id]);
    l.rounds = ROUNDS.includes(v.rounds) ? v.rounds : 5;
    l.variants = Object.fromEntries(Object.entries(v.variants || {}).filter(([mode, id]) => variantOk(mode, id)));
    l.locked = !!v.locked;
    l.banned = new Set(Array.isArray(v.banned) ? v.banned : []);
    l.champ = v.champ && typeof v.champ === 'object' ? v.champ : null;
    l.formerHost = formerHost;
    l.players = (v.players || []).filter((p) => p && p.key).map((p) => ({
      key: p.key, name: p.name, character: sanitizeCharacter(p.character), bot: !!p.bot, connected: true,
    }));
    if (!l.players.some((p) => p.key === me)) l.players.unshift({ key: me, name: this.user.name, character: this.character, connected: true });
    this.hosting = l;
    this.hostKey = null;
    this.lastLobby = null;
    this.hostPresence(l, this.presentKeys());
    const mine = this.user.name;
    const text = why === 'give' ? [`${prev} te confie la table : tu es l’hôte.`, `${prev} confie la table à ${mine}.`]
      : why === 'leave' ? [`${prev} est parti : tu reprends la table.`, `${prev} est parti : ${mine} reprend la table.`]
        : ['L’hôte a disparu : tu reprends la table.', `L’hôte a disparu : ${mine} reprend la table.`];
    for (const p of l.players) {
      if (aborted) this.deliver(p.key, { t: 'aborted' });
      this.deliver(p.key, { t: 'info', text: p.key === me ? text[0] : text[1] });
    }
    this.broadcastLobby(l);
  }

  // On croyait tenir la table, mais un autre l'a reprise pendant notre absence : on s'y rassoit en invité.
  deposed(from) {
    const l = this.hosting;
    if (!l || from === this.user.key) return;
    this.stopTimers(l);
    const wasPlaying = !!l.game && l.game.phase === 'playing';
    this.hosting = null;
    this.hostKey = from;
    if (wasPlaying) this.local({ t: 'aborted' });
    this.local({ t: 'info', text: 'Connexion perdue : la table a continué sans toi.' });
    this.joining = this.code;
    this.rejoining = true;
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => { if (this.rejoining) this.hostClosed('La table a fermé.'); }, JOIN_TIMEOUT);
    this.wire('host', { t: 'join', character: this.character });
  }

  async joinLobby(rawCode) {
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (!code) return;
    if (this.hosting?.code === code) return this.broadcastLobby(this.hosting);
    if (this.code !== code) {
      await this.leave();
      await this.openChannel(code);
    }
    this.joining = code;
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => {
      if (this.joining !== code) return;
      this.joining = null;
      this.closeChannel();
      this.local({ t: 'error', text: 'Ce saloon n’existe pas (ou a fermé).' });
    }, JOIN_TIMEOUT);
    this.wire('host', { t: 'join', character: this.character });
  }

  async leave() {
    clearTimeout(this.joinTimer);
    clearTimeout(this.hostGoneTimer);
    this.joining = null;
    this.hostGoneTimer = 0;
    const l = this.hosting;
    if (l) {
      this.stopTimers(l);
      const me = this.gameIdx(l, l.host);
      const playing = !!l.game && l.game.phase === 'playing';
      if (playing && !l.game.kind) this.sendEvents(l, l.game.forfeit(me));
      this.stopTimers(l); // le bot a pu se reprogrammer
      // un autre joueur reprend la table ; s'il ne reste que des bots, elle ferme
      const heir = this.heirOf(l);
      if (heir) this.handOver(l, heir.key, { leaving: true, aborted: playing && !!l.game.kind });
      else this.deliverAll(l, { t: 'closed', text: 'L’hôte a fermé la table.' }, l.players.map((p) => p.key).filter((k) => k !== l.host));
      this.hosting = null;
      if (this.chan) await sleep(300); // laisse partir les derniers messages
    } else if (this.code && this.hostKey) {
      await this.wire('host', { t: 'leave' });
    }
    this.hostKey = null;
    this.lastLobby = null;
    this.rejoining = false;
    clearTimeout(this.heirTimer);
    await this.closeChannel();
  }

  // ---------------------------------------------------------------- côté hôte
  async createLobby(solo, mode = 'roulette') {
    await this.leave();
    const code = newCode();
    const me = { key: this.user.key, name: this.user.name, character: this.character, connected: true };
    const l = Object.assign(lobbyBase(code, me.key), { solo, mode, players: [me] });
    if (solo) {
      // ?variant=canyon dans l'adresse : impose la variante du jeu solo (pour l'essayer)
      const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('variant') : null;
      if (variantOk(mode, v)) l.variants[mode] = v;
      // Le jeu solo se joue entièrement dans ce navigateur.
      const n = Math.min(MODES[mode].soloBots ?? SOLO_BOTS, MODES[mode].max - 1); // la bagarre se joue seul
      for (let k = 0; k < n; k++) {
        let b;
        do b = botPlayer(n > 1 ? `${code}:${k}` : code); while (l.players.some((p) => p.name === b.name));
        l.players.push(b);
      }
      this.hosting = l;
      return this.startGame(l);
    }
    await this.openChannel(code);
    this.hosting = l;
    this.broadcastLobby(l);
  }

  stopTimers(l) {
    clearTimeout(l.botTimer);
    clearTimeout(l.spinTimer);
    clearInterval(l.miniTimer);
    if (l.game?.tourney) this.stopTourney(l.game);
    Object.values(l.dcTimers).forEach(clearTimeout);
    l.dcTimers = {};
    l.spinning = false;
  }

  // Prochain hôte : le premier joueur humain encore connecté.
  heirOf(l) {
    const here = this.presentKeys();
    return l.players.find((p) => !p.bot && p.key !== l.host && p.connected && here.has(p.key));
  }

  // Confie la table à un autre joueur : il reçoit tout l'état de la table et en devient l'hôte.
  handOver(l, heirKey, { leaving = false, aborted = false } = {}) {
    this.stopTimers(l);
    const v = this.lobbyView(l);
    if (leaving) v.players = v.players.filter((p) => p.key !== l.host);
    Object.assign(v, { host: heirKey, game: null, tourney: null, inGame: false, over: false, rematch: [], spinning: false });
    this.wire(heirKey, { t: 'host', lobby: v, why: leaving ? 'leave' : 'give', prev: this.user.name, aborted });
    this.hosting = null;
    this.hostKey = leaving ? null : heirKey;
  }

  humans(l) {
    return l.players.filter((p) => !p.bot);
  }

  // Jeux de la sélection (roue, championnat) jouables au nombre actuel de joueurs
  compatPool(l) {
    const n = l.players.length;
    return l.pool.filter((id) => playableAt(id, n));
  }

  deliver(key, msg) {
    if (key === this.user.key) this.fromHost(msg);
    else if (!key.startsWith('bot:')) this.wire(key, msg);
  }

  // Même message pour plusieurs joueurs (toute la table par défaut) : un seul envoi sur le canal, avec la liste
  // des destinataires (avant : un message par joueur, que chaque invité recevait aussi pour les autres).
  deliverAll(l, msg, keys = l.players.map((p) => p.key)) {
    const ks = [];
    for (const key of keys) {
      if (key === this.user.key) this.fromHost(msg);
      else if (!key.startsWith('bot:')) ks.push(key);
    }
    if (ks.length) this.wire('all', msg, ks);
  }

  lobbyView(l) {
    return {
      code: l.code,
      host: l.host,
      solo: !!l.solo,
      mode: l.mode,
      game: l.game ? l.game.kind || 'roulette' : null,
      max: MAX_PLAYERS,
      format: l.format,
      pool: l.pool,
      rounds: l.rounds,
      variants: l.variants,
      locked: !!l.locked,
      banned: [...l.banned],
      champ: l.champ,
      spinning: !!l.spinning,
      players: l.players.map((p) => ({
        key: p.key,
        name: p.name,
        bot: !!p.bot,
        character: p.character,
        connected: !!(p.bot || p.key === l.host || p.connected),
      })),
      inGame: !!l.game && l.game.phase === 'playing',
      over: !!l.game && l.game.phase === 'over',
      rematch: [...l.rematch],
      tourney: l.game?.tourney ? this.tourneyView(l.game) : null,
    };
  }

  broadcastLobby(l) {
    this.deliverAll(l, { t: 'lobby', lobby: this.lobbyView(l) });
    // le jeu choisi par l'hôte : son arbitre se charge d'avance (la roue et le championnat le font au tirage)
    if (l.format === 'single' && !(l.game && l.game.phase === 'playing')) preloadGame(l.mode);
  }

  hostPresence(l, here) {
    // l'ancien hôte revient alors que la table a été reprise : on le prévient
    if (l.formerHost && here.has(l.formerHost) && !l.players.some((p) => p.key === l.formerHost)) {
      this.wire(l.formerHost, { t: 'deposed' });
      l.formerHost = null;
    }
    let changed = false;
    for (const p of l.players) {
      if (p.bot || p.key === l.host) continue;
      const on = here.has(p.key);
      if (on !== !!p.connected) { p.connected = on; changed = true; }
      if (on) {
        clearTimeout(l.dcTimers[p.key]);
        delete l.dcTimers[p.key];
      } else if (!l.dcTimers[p.key]) {
        l.dcTimers[p.key] = setTimeout(() => {
          delete l.dcTimers[p.key];
          const idx = l.players.findIndex((x) => x.key === p.key);
          if (idx >= 0 && !l.players[idx].connected && this.hosting === l) this.removePlayer(l, idx, true);
        }, RECONNECT_GRACE);
      }
    }
    if (changed) this.broadcastLobby(l);
  }

  hostJoin(l, key, name, character) {
    const err = (text) => this.deliver(key, { t: 'error', text });
    const existing = l.players.find((p) => p.key === key);
    if (!existing) {
      if (l.solo) return err('Cette table est réservée à un duel solo.');
      if (l.banned.has(key)) return err('L’hôte t’a expulsé de cette table.');
      if (l.locked) return err('Cette table est fermée aux nouveaux venus.');
      if (l.players.length >= MAX_PLAYERS) return err('Cette table est déjà complète.');
      if ((l.game && l.game.phase === 'playing') || l.spinning || l.loading) return err('Une partie est en cours.');
      if (!validUsername(name) || keyOf(name) !== key) return err('Pseudo invalide.');
      l.players.push({ key, name, character: sanitizeCharacter(character), connected: true });
      this.sysChat(l, `${name} rejoint la table.`);
      // jeu à 2 choisi mais la table grossit : on passe au premier jeu qui accepte tout le monde
      if (!l.game && !playableAt(l.mode, l.players.length)) {
        l.mode = Object.keys(MODES).find((id) => playableAt(id, l.players.length)) || l.mode;
      }
    } else {
      existing.connected = true;
      clearTimeout(l.dcTimers[key]);
      delete l.dcTimers[key];
      if (!l.game) existing.character = sanitizeCharacter(character);
    }
    this.broadcastLobby(l);
    // de retour en pleine partie : l'état complet de sa partie (ou de son match du tournoi)
    const s = l.game?.tourney ? this.matchOf(l.game, key) : l;
    const j = s ? this.gameIdx(s, key) : -1;
    if (j >= 0) this.deliver(key, { t: 'sync', state: s.game.syncView ? s.game.syncView(j) : s.game.view(j), ...(s === l ? {} : { match: s.id }) });
  }

  hostHandle(from, m, name) {
    const l = this.hosting;
    if (!l) return;
    if (m.t === 'join') return this.hostJoin(l, from, name, m.character);
    const idx = l.players.findIndex((p) => p.key === from);
    if (idx < 0) return;
    const err = (text) => this.deliver(from, { t: 'error', text });
    const isHost = l.host === from;
    const busy = (l.game && l.game.phase === 'playing') || l.spinning || !!l.loading;
    switch (m.t) {
      case 'char':
        l.players[idx].character = sanitizeCharacter(m.character);
        if (!busy) this.broadcastLobby(l);
        break;
      case 'rename': {
        // réponse à l'ancien nom d'abord : le joueur rouvre ensuite le canal sous le nouveau
        const text = this.renameRefusal(l, from, m.name);
        this.deliver(from, { t: 'renamed', ok: !text, text });
        if (!text) this.renamePlayer(l, from, m.name, m.character);
        break;
      }
      case 'leave':
        this.removePlayer(l, idx, true);
        break;
      case 'mode':
        if (!isHost || !MODES[m.mode] || busy) return;
        if (l.players.length > MODES[m.mode].max && !tourneyFor(m.mode, l.players.length)) return err(`${MODES[m.mode].name} : ${MODES[m.mode].max} joueurs maximum.`);
        l.mode = m.mode;
        l.rematch.clear();
        this.broadcastLobby(l);
        break;
      // déroulé : un jeu choisi, la roue, ou un championnat (qui repart de zéro)
      case 'format':
        if (!isHost || busy || !FORMATS.includes(m.format) || m.format === l.format) return;
        l.format = m.format;
        l.champ = null;
        l.rematch.clear();
        this.broadcastLobby(l);
        break;
      // jeux mis dans la roue (au moins un)
      case 'pool': {
        if (!isHost || busy || !MODES[m.mode]) return;
        const has = l.pool.includes(m.mode);
        if (has && l.pool.length <= 1) return err('Il faut au moins un jeu dans la sélection.');
        l.pool = Object.keys(MODES).filter((id) => (id === m.mode ? !has : l.pool.includes(id)));
        this.broadcastLobby(l);
        break;
      }
      case 'poolAll':
        if (!isHost || busy) return;
        l.pool = Object.keys(MODES);
        this.broadcastLobby(l);
        break;
      case 'rounds':
        if (!isHost || busy || !ROUNDS.includes(m.n) || (l.champ && !l.champ.done)) return;
        l.rounds = m.n;
        this.broadcastLobby(l);
        break;
      // variante du jeu (carte, région, salle…) ; id null : de nouveau tirée au hasard
      case 'variant':
        if (!isHost || busy || !MODES[m.mode]) return;
        if (m.id == null) delete l.variants[m.mode];
        else if (variantOk(m.mode, m.id)) l.variants[m.mode] = m.id;
        else return;
        this.broadcastLobby(l);
        break;
      case 'champReset':
        if (!isHost || busy) return;
        l.champ = null;
        l.rematch.clear();
        this.broadcastLobby(l);
        break;
      case 'lock':
        if (!isHost) return;
        l.locked = !l.locked;
        this.broadcastLobby(l);
        break;
      case 'addBot': {
        if (!isHost || busy) return;
        if (l.players.length >= MAX_PLAYERS) return err('La table est complète.');
        let b, k = 0;
        do b = botPlayer(`${l.code}:${Date.now().toString(36)}:${k++}`); while (l.players.some((p) => p.name === b.name || p.key === b.key));
        l.players.push({ ...b, connected: true });
        this.sysChat(l, `${b.name} (bot) s’assoit à la table.`);
        if (!l.game && !playableAt(l.mode, l.players.length)) {
          l.mode = Object.keys(MODES).find((id) => playableAt(id, l.players.length)) || l.mode;
        }
        l.rematch.clear();
        this.broadcastLobby(l);
        break;
      }
      case 'kick': {
        if (!isHost || m.key === l.host) return;
        const k = l.players.findIndex((p) => p.key === m.key);
        if (k < 0) return;
        const p = l.players[k];
        if (!p.bot) {
          l.banned.add(p.key);
          this.deliver(p.key, { t: 'closed', text: 'L’hôte t’a expulsé de la table.' });
        }
        this.removePlayer(l, k, true, p.bot ? `${p.name} quitte la table.` : `${p.name} a été expulsé de la table.`);
        break;
      }
      case 'giveHost': {
        if (!isHost || busy) return;
        const p = l.players.find((x) => x.key === m.key);
        if (!p || p.bot || p.key === l.host) return;
        if (!p.connected || !this.presentKeys().has(p.key)) return err(`${p.name} n’est pas connecté.`);
        this.handOver(l, p.key);
        break;
      }
      case 'start': {
        if (!isHost) return err("Seul l'hôte peut lancer la partie.");
        if (busy) return;
        const why = this.cantLaunch(l);
        if (why) return err(why);
        this.launch(l);
        break;
      }
      case 'action': {
        // tournoi : le coup va à la partie du match où joue ce joueur
        const s = l.game?.tourney ? this.matchOf(l.game, from) : l;
        if (!s?.game) return;
        const gi = this.gameIdx(s, from);
        if (gi < 0) return;
        if (!s.game.kind && Date.now() < s.lockUntil - 400) return err('Patience, cowboy…');
        const r = s.game.act(gi, m.action);
        if (r.error) return err(r.error);
        this.sendEvents(l, r.events, s);
        if (s === l && l.game && l.game.phase === 'over') this.broadcastLobby(l);
        break;
      }
      // tournoi : depuis le banc, regarder un match en cours (id null : revenir au banc)
      case 'watch':
        if (l.game?.tourney) this.watchMatch(l, l.game, from, m.id ?? null);
        break;
      case 'rematch':
        if (!l.game || l.game.phase !== 'over' || l.spinning) return;
        if (l.solo) return this.startGame(l);
        l.rematch.add(l.players[idx].name);
        // revanche, nouveau tour de roue ou jeu suivant du championnat : dès que tous les humains sont prêts
        if (l.rematch.size >= this.humans(l).length && !this.cantLaunch(l)) this.launch(l);
        else this.broadcastLobby(l);
        break;
      case 'chat': {
        const text = String(m.text || '').slice(0, 120).trim();
        if (!text) return;
        this.deliverAll(l, { t: 'chat', from: l.players[idx].name, text });
        break;
      }
    }
  }

  removePlayer(l, idx, forfeit, text) {
    const p = l.players[idx];
    clearTimeout(l.dcTimers[p.key]);
    delete l.dcTimers[p.key];
    if (l.game?.tourney && l.game.phase === 'playing') {
      // tournoi : le partant perd son match (ou ne jouera pas le suivant), le tournoi continue
      l.players.splice(idx, 1);
      l.rematch.delete(p.name);
      this.sysChat(l, text || `${p.name} a quitté la table.`);
      this.tourneyLeave(l, l.game, p.key);
      return this.broadcastLobby(l);
    }
    const gi = this.gameIdx(l, p.key);
    const playing = !!l.game && l.game.phase === 'playing';
    // Dans un mini-jeu à plusieurs, les autres continuent : le score du partant est figé.
    const keepGame = playing && !!l.game.kind && l.players.length > 2;
    if (keepGame) this.sendEvents(l, l.game.leave(gi));
    else if (playing && forfeit && gi >= 0) this.sendEvents(l, l.game.forfeit(gi));
    l.players.splice(idx, 1);
    l.rematch.delete(p.name);
    if (!keepGame) {
      clearInterval(l.miniTimer);
      l.game = null;
    }
    this.sysChat(l, text || `${p.name} a quitté la table.`);
    this.broadcastLobby(l);
  }

  // Pourquoi le joueur `key` ne peut pas prendre ce pseudo à la table (null : il peut).
  renameRefusal(l, key, name) {
    const k = keyOf(name);
    if (!validUsername(name)) return 'Pseudo invalide (2 à 16 lettres, chiffres, _ ou -).';
    if ((l.game && l.game.phase === 'playing') || l.spinning || l.loading) return 'Attends la fin de la partie pour changer de pseudo.';
    if (k !== key && l.players.some((p) => p.key === k)) return 'Ce pseudo est déjà assis à la table.';
    if (l.banned.has(k)) return 'Ce pseudo a été expulsé de cette table.';
    // les points du championnat sont rangés sous le nom : pas question d'hériter de ceux d'un joueur parti
    if (k !== key && l.champ && Object.keys(l.champ.scores || {}).some((n) => keyOf(n) === k)) return 'Ce pseudo a déjà des points dans le championnat.';
    return null;
  }

  // Renomme une place : clé, nom, et tout ce que la table range sous le nom (revanche, points du championnat).
  renamePlayer(l, key, name, character) {
    const p = l.players.find((x) => x.key === key);
    if (!p) return;
    const old = p.name;
    const k = keyOf(name);
    clearTimeout(l.dcTimers[key]);
    delete l.dcTimers[key];
    Object.assign(p, { key: k, name, character: sanitizeCharacter(character) });
    if (l.host === key) l.host = k;
    if (l.rematch.delete(old)) l.rematch.add(name);
    const c = l.champ;
    if (c) {
      for (const t of [c.scores, c.firsts]) if (t && old in t) { t[name] = t[old]; delete t[old]; }
      for (const r of c.last?.res || []) if (r.name === old) r.name = name;
    }
    this.sysChat(l, `${old} se fait désormais appeler ${name}.`);
    this.broadcastLobby(l);
  }

  // Ligne du narrateur dans le comptoir (arrivées, départs…), pour toute la table.
  sysChat(l, text) {
    this.deliverAll(l, { t: 'chat', sys: true, text });
  }

  gameIdx(l, key) {
    return l.game ? l.game.p.findIndex((p) => p.key === key) : -1;
  }

  cantStart(l) {
    const m = MODES[l.mode] || MODES.roulette;
    if (l.players.length < m.min) return 'Il faut un adversaire !';
    if (!playableAt(l.mode, l.players.length)) return `${m.name} : ${m.max} joueurs maximum. Choisis un autre jeu.`;
    return null;
  }

  cantLaunch(l) {
    if (l.format === 'single') return this.cantStart(l);
    if (l.players.length < 2) return 'Il faut un adversaire !';
    if (!this.compatPool(l).length) return `Aucun jeu de la sélection ne se joue à ${l.players.length}.`;
    return null;
  }

  // Lance la partie selon le déroulé : directement, ou après un tour de roue qui tire le jeu au sort.
  launch(l) {
    l.rematch.clear();
    if (l.format === 'single') return this.startGame(l);
    if (l.format === 'champ' && (!l.champ || l.champ.done)) {
      l.champ = { rounds: l.rounds, n: 0, done: false, scores: {}, firsts: {}, played: [], last: null };
    }
    const champ = l.format === 'champ' ? l.champ : null;
    const pool = this.compatPool(l);
    let cand = pool;
    // championnat : pas deux fois le même jeu tant qu'il en reste d'autres ; et jamais deux fois de suite
    if (champ) {
      const fresh = pool.filter((id) => !champ.played.includes(id));
      if (fresh.length) cand = fresh;
    }
    if (cand.length > 1) cand = cand.filter((id) => id !== l.lastPick);
    const pick = cand[Math.floor(Math.random() * cand.length)];
    l.mode = pick;
    l.lastPick = pick;
    l.spinning = true;
    const spin = { t: 'spin', pick, pool, round: champ ? champ.n + 1 : 0, rounds: champ ? champ.rounds : 0 };
    this.deliverAll(l, spin);
    preloadGame(pick); // l'arbitre se charge pendant que la roue tourne
    this.broadcastLobby(l);
    clearTimeout(l.spinTimer);
    l.spinTimer = setTimeout(() => {
      l.spinning = false;
      if (this.hosting !== l) return;
      if (this.cantStart(l)) return this.broadcastLobby(l); // la table a changé pendant le tirage
      this.startGame(l);
    }, SPIN_MS);
  }

  // Fin d'une partie du championnat : des points selon la place (ceux qui sont partis n'en marquent pas).
  champRecord(l, end) {
    const g = l.game, c = l.champ;
    if (!c || c.done || g.champDone) return;
    g.champDone = true;
    const places = placesOf(g, end);
    const res = g.p.map((p, i) => {
      const pts = p.left ? 0 : CHAMP_PTS[places[i] - 1] || 0;
      c.scores[p.name] = (c.scores[p.name] || 0) + pts;
      if (places[i] === 1 && !p.left) c.firsts[p.name] = (c.firsts[p.name] || 0) + 1;
      return { name: p.name, place: places[i], pts };
    });
    c.last = { mode: g.kind || 'roulette', res };
    c.played.push(g.kind || 'roulette');
    c.n++;
    if (c.n >= c.rounds) c.done = true;
  }

  startGame(l) {
    if (l.loading) return;
    // arbitre du mini-jeu pas encore chargé : on le charge, puis on lance (si la table n'a pas bougé entre-temps)
    if (l.mode !== 'roulette' && !refLoaded[l.mode]) {
      const mode = l.mode;
      l.loading = mode;
      loadReferee(mode).then(() => {
        l.loading = null;
        if (this.hosting !== l || l.mode !== mode || (l.game && l.game.phase === 'playing')) return;
        if (this.cantStart(l)) return this.broadcastLobby(l);
        this.startGame(l);
      }, (e) => {
        l.loading = null;
        console.error(e);
        if (this.hosting !== l) return;
        this.deliver(l.host, { t: 'error', text: `Impossible de charger ce jeu (réseau ?). Réessaie dans un instant. [${e?.name || 'Erreur'} : ${e?.message || e}]` });
        if (l.solo && !l.game) this.hosting = null; // la partie solo n'a jamais commencé : on reste au menu
        else this.broadcastLobby(l);
      });
      return;
    }
    l.rematch.clear();
    if (l.game?.tourney) this.stopTourney(l.game);
    // jeu à deux et table de plus de deux : tournoi (matchs en parallèle, voir startTourney)
    if (tourneyFor(l.mode, l.players.length)) return this.startTourney(l);
    const players = l.players.map((p) => ({ key: p.key, name: p.name, character: p.character, bot: !!p.bot }));
    // la variante choisie par l'hôte ne vaut que pour « Un jeu » : la roue et le championnat restent des surprises
    this.runGame(l, l, l.mode, players, l.format === 'single' ? l.variants[l.mode] ?? null : null);
    l.game.champ = l.format === 'champ' && !!l.champ && !l.champ.done;
    this.broadcastLobby(l);
    this.sendEvents(l, l.game.start());
  }

  // Crée la partie et ses minuteries. s : la table elle-même, ou un match du tournoi (ses joueurs, sa partie,
  // son bot et ses minuteries, rangés comme ceux d'une table).
  runGame(l, s, mode, players, variant) {
    clearInterval(s.miniTimer);
    clearTimeout(s.botTimer);
    s.bot = null;
    if (mode === 'roulette') {
      s.game = new Game(players);
      const bi = players.findIndex((p) => p.bot);
      if (bi >= 0) s.bot = new Bot(bi);
      return;
    }
    // Mini-jeu en temps réel : l'hôte fait avancer l'horloge (tirs des bandits, bots, fin de partie).
    const g = makeGame(mode, players, variant);
    s.game = g;
    let last = Date.now();
    s.miniTimer = setInterval(() => {
      if (this.hosting !== l || s.game !== g) return clearInterval(s.miniTimer);
      // Onglet de l'hôte en arrière-plan : le navigateur n'appelle plus cette minuterie qu'une fois par seconde
      // (ou moins). On rejoue les pas manqués, chacun à son heure de jeu (horloge de l'arbitre reculée le temps
      // du pas), pour que la partie ne tourne pas au ralenti pour toute la table.
      const now = Date.now(), late = now - last;
      last = now;
      const steps = late > MINI_TICK * 2 && Number.isFinite(g.startAt) ? Math.min(MAX_CATCHUP, Math.round(late / MINI_TICK)) : 1;
      const events = [];
      for (let k = steps - 1; k >= 0; k--) {
        const back = Math.round((late * k) / steps);
        if (back) g.startAt += back;
        try { events.push(...g.tick()); } finally { if (back) g.startAt -= back; }
      }
      this.sendEvents(l, events, s);
      this.liveOut(g.liveOut.splice(0));
      if (g.phase === 'over') {
        clearInterval(s.miniTimer);
        if (s === l) this.broadcastLobby(l);
      }
    }, MINI_TICK);
  }

  // Événements d'une partie : à chacun de ses joueurs sa version ; s : la table, ou un match du tournoi
  // (alors aussi aux spectateurs de ce match, et la fin du match fait avancer le tournoi).
  sendEvents(l, events, s = l) {
    if (!events.length) return;
    const g = s.game;
    s.lockUntil = Date.now() + events.reduce((sum, e) => sum + (e.dur || 0), 0);
    const inGame = s.players.filter((p) => this.gameIdx(s, p.key) >= 0);
    const tag = s === l ? {} : { match: s.id };
    // mini-jeu : un seul lot pour toute la table (voir packEvents) ; l'hôte garde sa version personnalisée
    const packed = s === l && g.kind && inGame.some((p) => p.key !== this.user.key && !p.key.startsWith('bot:')) ? this.packEvents(g, events) : null;
    for (const p of inGame) {
      if (packed && p.key !== this.user.key) continue;
      const j = this.gameIdx(s, p.key);
      this.deliver(p.key, { t: 'events', events: events.map((e) => personalize(e, j)), ...tag });
    }
    if (packed) this.deliverAll(l, packed, inGame.map((p) => p.key).filter((k) => k !== this.user.key));
    if (s !== l) {
      const eyes = this.watchersOf(l.game, s);
      if (eyes.length) this.deliverAll(l, { t: 'events', events: events.map(spectate), ...tag, watch: true }, eyes);
    }
    const end = events.find((e) => e.type === 'matchEnd');
    if (end) {
      if (s !== l) this.matchEnd(l, l.game, s, end);
      else {
        if (g.champ) this.champRecord(l, end);
        if (g.kind) this.recordMini(l, end);
        else this.recordMatch(l, end);
      }
    }
    if (s.bot) {
      const bot = s.bot;
      bot.observe(events);
      const line = bot.react(events);
      if (line) {
        setTimeout(() => {
          if (s.game !== g || this.hosting !== l) return;
          // la réplique du bot : pour ceux qui sont à sa table (et ses spectateurs)
          const keys = s === l ? undefined : [...s.players.map((p) => p.key), ...this.watchersOf(l.game, s)];
          this.deliverAll(l, { t: 'chat', from: s.players[bot.idx].name, text: line.text }, keys);
        }, line.delay);
      }
      this.scheduleBot(l, s);
    }
  }

  // Le bot joue quand c'est son tour, une fois les animations terminées.
  scheduleBot(l, s = l) {
    clearTimeout(s.botTimer);
    const g = s.game, bot = s.bot;
    if (!bot || !g || g.phase !== 'playing' || g.turn !== bot.idx) return;
    const delay = Math.max(0, s.lockUntil - Date.now()) + 700 + Math.random() * 900;
    s.botTimer = setTimeout(() => {
      if (this.hosting !== l || s.game !== g || g.phase !== 'playing' || g.turn !== bot.idx) return;
      let r = g.act(bot.idx, bot.decide(g.view(bot.idx)));
      if (r.error) r = g.act(bot.idx, { kind: 'shoot', target: 'opp' });
      if (r.error) return;
      this.sendEvents(l, r.events, s);
      if (g.phase === 'over' && s === l) this.broadcastLobby(l);
    }, delay);
  }

  // ---------------------------------------------------------------- tournoi
  // Jeu à deux (roulette, duel) à plus de deux joueurs : élimination directe, tous les matchs d'un tour en même
  // temps (un bot complète un nombre impair). Qui a fini son match attend sur le banc, d'où il peut regarder
  // les matchs encore en cours. Pour la table, le tournoi tient lieu de partie (l.game) : phase, joueurs, places.
  // Chaque match se range comme une petite table (players, game, bot, minuteries) : voir runGame et sendEvents.
  startTourney(l) {
    const mode = l.mode;
    const all = l.players.map((p) => ({ key: p.key, name: p.name, character: p.character, bot: !!p.bot, score: 0, left: false }));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const t = {
      tourney: true, kind: mode, id: Date.now().toString(36), phase: 'playing',
      all, // tous les inscrits, bots d'appoint compris ; score = matchs gagnés
      p: [...all], // les joueurs de la table (places du championnat)
      rounds: [], // tours successifs : liste des matchs
      watch: new Map(), // spectateur -> id du match regardé
      timer: 0, champion: null,
      variant: l.format === 'single' ? l.variants[mode] ?? null : null,
      champ: l.format === 'champ' && !!l.champ && !l.champ.done,
    };
    l.game = t;
    this.sysChat(l, `Tournoi de ${MODES[mode].name} à ${all.length} : élimination directe.`);
    this.tourneyRound(l, t, all);
  }

  stopTourney(t) {
    clearTimeout(t.timer);
    t.timer = 0;
    for (const m of t.rounds.flat()) {
      clearInterval(m.miniTimer);
      clearTimeout(m.botTimer);
    }
  }

  // Un tour : les matchs démarrent tous ensemble ; entre deux bots, le match se règle aux dés.
  tourneyRound(l, t, entrants) {
    const list = [...entrants];
    if (list.length % 2) {
      const b = this.fillerBot(l, t);
      list.push(b);
      this.sysChat(l, `Nombre impair : ${b.name} (bot) complète le tableau.`);
    }
    const r = t.rounds.length;
    const matches = [];
    for (let i = 0; i < list.length; i += 2) {
      matches.push({ id: `${t.id}:${r}:${i / 2}`, players: [list[i], list[i + 1]], game: null, bot: null, botTimer: 0, miniTimer: 0, lockUntil: 0, winner: null });
    }
    t.rounds.push(matches);
    const name = matches.length === 1 ? 'Finale' : matches.length === 2 ? 'Demi-finales' : `Tour ${r + 1}`;
    this.sysChat(l, `${name} : ${matches.map((m) => `${m.players[0].name} contre ${m.players[1].name}`).join(', ')}.`);
    for (const m of matches) {
      if (m.players.every((p) => p.bot)) continue;
      for (const p of m.players) t.watch.delete(p.key);
      this.runGame(l, m, t.kind, m.players.map(({ key, name: n, character, bot }) => ({ key, name: n, character, bot })), t.variant);
    }
    this.broadcastLobby(l); // le tableau d'abord, puis les parties
    for (const m of matches) {
      if (m.game) this.sendEvents(l, m.game.start(), m);
      else m.botTimer = setTimeout(() => { if (this.hosting === l && l.game === t) this.matchDone(l, t, m, Math.random() < 0.5 ? 0 : 1, 'bots'); }, 2500 + Math.random() * 2500);
    }
  }

  fillerBot(l, t) {
    let b, k = 0;
    do b = botPlayer(`${l.code}:${t.id}:${t.all.length}:${k++}`);
    while (k < 30 && [...l.players, ...t.all].some((p) => p.name === b.name || p.key === b.key));
    const e = { key: b.key, name: b.name, character: b.character, bot: true, filler: true, score: 0, left: false };
    t.all.push(e);
    return e;
  }

  // Le match en cours de ce joueur (null : il est sur le banc).
  matchOf(t, key) {
    return (t.rounds[t.rounds.length - 1] || []).find((m) => m.winner == null && m.players.some((p) => p.key === key)) || null;
  }

  watchersOf(t, m) {
    return t?.watch ? [...t.watch].filter(([, id]) => id === m.id).map(([k]) => k) : [];
  }

  // Depuis le banc : regarder un match du tour en cours (vu du côté de son premier joueur, sans ses secrets).
  watchMatch(l, t, key, id) {
    if (id == null) return t.watch.delete(key);
    const m = (t.rounds[t.rounds.length - 1] || []).find((x) => x.id === id);
    if (!m?.game || this.matchOf(t, key)) return;
    t.watch.set(key, m.id);
    const g = m.game;
    this.deliver(key, { t: 'sync', state: g.syncView ? g.syncView(0) : g.view(0), match: m.id, watch: true });
  }

  // Fin de partie d'un match (appelé par sendEvents) : résultats enregistrés, vainqueur qualifié.
  matchEnd(l, t, m, end) {
    if (!t?.tourney || m.winner != null) return;
    const g = m.game;
    if (g.kind) this.recordMini(l, end, m);
    else this.recordMatch(l, end, m);
    if (g.kind && end.tie) return this.matchDone(l, t, m, Math.random() < 0.5 ? 0 : 1, 'tie');
    this.matchDone(l, t, m, g.kind ? end.ranking?.[0] ?? end.winner : end.winner);
  }

  matchDone(l, t, m, w, how = '') {
    if (m.winner != null || t.phase !== 'playing') return;
    m.winner = w;
    const win = m.players[w], lose = m.players[1 - w];
    win.score = t.rounds.length;
    const why = how === 'bots' ? ' (entre bots, aux dés)' : how === 'tie' ? ' (égalité : pile ou face)' : '';
    this.sysChat(l, `${win.name} bat ${lose.name}${why}.`);
    const round = t.rounds[t.rounds.length - 1];
    if (round.includes(m) && round.every((x) => x.winner != null)) this.roundOver(l, t);
    this.broadcastLobby(l);
  }

  // Tous les matchs du tour sont joués : tour suivant après une pause, ou fin du tournoi.
  roundOver(l, t) {
    const alive = () => t.rounds[t.rounds.length - 1].map((m) => m.players[m.winner]).filter((p) => !p.left);
    if (alive().length <= 1) return this.finishTourney(l, t, alive()[0] || null);
    this.sysChat(l, 'Tour suivant dans quelques secondes…');
    clearTimeout(t.timer);
    t.timer = setTimeout(() => {
      t.timer = 0;
      if (this.hosting !== l || l.game !== t) return;
      const next = alive(); // un qualifié a pu quitter la table pendant la pause
      if (next.length <= 1) this.finishTourney(l, t, next[0] || null);
      else this.tourneyRound(l, t, next);
    }, TOURNEY_PAUSE);
  }

  finishTourney(l, t, champion) {
    clearTimeout(t.timer);
    t.timer = 0;
    t.phase = 'over';
    t.champion = champion ? champion.name : null;
    t.watch.clear();
    // place : 1 + nombre d'inscrits qui ont gagné plus de matchs (ex aequo : éliminés au même tour)
    const places = t.p.map((p) => 1 + t.all.filter((q) => q.score > p.score).length);
    if (t.champ) this.champRecord(l, { type: 'matchEnd', places });
    this.sysChat(l, champion ? `${champion.name} remporte le tournoi !` : 'Le tournoi s’arrête : plus personne en lice.');
    this.broadcastLobby(l);
  }

  // Un joueur quitte la table pendant le tournoi : il perd son match en cours, ou ne jouera pas le suivant.
  tourneyLeave(l, t, key) {
    t.watch.delete(key);
    const e = t.all.find((x) => x.key === key);
    if (e) e.left = true;
    const m = this.matchOf(t, key);
    if (m?.game && m.game.phase === 'playing') this.sendEvents(l, m.game.forfeit(this.gameIdx(m, key)), m);
  }

  tourneyView(t) {
    return {
      mode: t.kind, phase: t.phase, champion: t.champion, pause: !!t.timer,
      rounds: t.rounds.map((ms) => ms.map((m) => ({
        id: m.id, w: m.winner, live: !!m.game && m.winner == null,
        p: m.players.map((p) => ({ key: p.key, name: p.name, bot: p.bot, left: p.left })),
      }))),
    };
  }

  // L'hôte enregistre le résultat de chaque joueur humain dans Supabase.
  recordMatch(l, end, s = l) {
    const g = s.game;
    if (g.recorded) return;
    g.recorded = true;
    g.p.forEach(async (p, i) => {
      const pl = l.players.find((x) => x.key === p.key);
      if (!pl || pl.bot) return;
      const won = i === end.winner;
      // Les duels solo (ou contre un bot) ne comptent pas pour le classement.
      const solo = l.solo || g.p.some((x) => x.bot);
      const res = solo
        ? { soloPlayed: 1, soloWins: won ? 1 : 0, soloLosses: won ? 0 : 1 }
        : { played: 1, wins: won ? 1 : 0, losses: won ? 0 : 1 };
      const entry = {
        solo,
        date: new Date().toISOString(),
        opponent: g.p[1 - i].name,
        result: won ? 'victoire' : 'défaite',
        score: `${p.wins}-${g.p[1 - i].wins}`,
        forfeit: !!end.forfeit,
      };
      try {
        const u = toUser(await rpc('saloon_record', { p_username: p.name, p_stats: { ...res, ...p.stats }, p_entry: entry }));
        if (u) this.deliver(pl.key, { t: 'user', user: u });
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Mini-jeux : classement de chaque joueur humain (ne compte pas pour le classement de la roulette).
  recordMini(l, end, s = l) {
    const g = s.game;
    if (g.recorded) return;
    g.recorded = true;
    g.p.forEach(async (p, i) => {
      const pl = l.players.find((x) => x.key === p.key);
      if (!pl || pl.bot) return;
      const rank = end.ranking.indexOf(i) + 1;
      const won = end.winners ? end.winners.includes(i) : rank === 1 && !end.tie; // jeux en équipes : toute l'équipe gagne
      const solo = l.solo || g.p.every((x, j) => j === i || x.bot); // seul humain face à des bots
      const res = solo ? { soloMgPlayed: 1, soloMgWins: won ? 1 : 0 } : { mgPlayed: 1, mgWins: won ? 1 : 0 };
      const entry = {
        game: g.kind,
        solo,
        date: new Date().toISOString(),
        opponent: g.p.filter((_, j) => j !== i).map((x) => x.name).join(', ').slice(0, 60),
        result: won ? 'victoire' : 'défaite',
        rank,
        of: g.p.length,
        score: `${p.score} ${g.unit || MODES[g.kind].unit || 'pts'}`,
      };
      try {
        const u = toUser(await rpc('saloon_record', { p_username: p.name, p_stats: res, p_entry: entry }));
        if (u) this.deliver(pl.key, { t: 'user', user: u });
      } catch (e) {
        console.error(e);
      }
    });
  }
}
