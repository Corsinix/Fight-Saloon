// Réseau sans serveur dédié : comptes et classement dans Supabase (Postgres),
// messages des tables relayés par Supabase Realtime.
// Le navigateur de l'hôte fait office de serveur de la table : il fait tourner la partie
// (game.js) et n'envoie à chaque joueur que ce qu'il a le droit de voir.
// L'interface (on / send / messages { t: ... }) est la même que l'ancien serveur WebSocket.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { Game, personalize } from './game.js';
import { Bot, botPlayer } from './bot.js';
import { makeGame } from './games.js';
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

const configured = /^https:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('COLLE') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('COLLE');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (name) => String(name).toLowerCase();
const validUsername = (name) => typeof name === 'string' && /^[A-Za-z0-9_\-éèàçÉÈÀ]{2,16}$/.test(name);

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

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
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

// Classement d'une partie terminée : place de chaque joueur (ex aequo possibles).
function placesOf(g, end) {
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

export async function fetchLeaderboard() {
  if (!sb) return [];
  const { data, error } = await sb.rpc('saloon_leaderboard');
  if (error) throw error;
  return data || [];
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
    setTimeout(() => this.emit('open'), 0);
  }

  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  emit(t, m) { (this.handlers[t] || []).forEach((fn) => fn(m)); }

  // Livraison asynchrone, comme si le message venait du réseau.
  local(msg) { setTimeout(() => this.emit(msg.t, msg), 0); }

  send(m) {
    if (!sb) return this.local({ t: 'error', text: 'Supabase n’est pas configuré (voir public/js/config.js).' });
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

  // ---------------------------------------------------------------- canal Realtime
  async openChannel(code) {
    await this.closeChannel();
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
    if (ch) await sb.removeChannel(ch);
  }

  wire(to, msg) {
    return this.chan?.send({ type: 'broadcast', event: 'm', payload: { to, from: this.user.key, name: this.user.name, msg } });
  }

  presentKeys() {
    return new Set(Object.keys(this.chan?.presenceState() || {}));
  }

  onWire(p) {
    if (!p || !p.msg) return;
    if (p.to === 'all') {
      this.hosting?.game?.onLive?.(p.from, p.msg.d);
      return this.emit('live', { from: p.from, d: p.msg.d });
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

  liveOut(key, d) {
    this.emit('live', { from: key, d });
    this.chan?.send({ type: 'broadcast', event: 'm', payload: { to: 'all', from: key, msg: { t: 'live', d } } });
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
      else for (const p of l.players) if (p.key !== l.host) this.deliver(p.key, { t: 'closed', text: 'L’hôte a fermé la table.' });
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
      const n = Math.min(SOLO_BOTS, MODES[mode].max - 1);
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
    Object.assign(v, { host: heirKey, game: null, inGame: false, over: false, rematch: [], spinning: false });
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
    return l.pool.filter((id) => MODES[id] && n >= MODES[id].min && n <= MODES[id].max);
  }

  deliver(key, msg) {
    if (key === this.user.key) this.fromHost(msg);
    else if (!key.startsWith('bot:')) this.wire(key, msg);
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
    };
  }

  broadcastLobby(l) {
    const v = this.lobbyView(l);
    for (const p of l.players) this.deliver(p.key, { t: 'lobby', lobby: v });
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
      if ((l.game && l.game.phase === 'playing') || l.spinning) return err('Une partie est en cours.');
      if (!validUsername(name) || keyOf(name) !== key) return err('Pseudo invalide.');
      l.players.push({ key, name, character: sanitizeCharacter(character), connected: true });
      // jeu à 2 choisi mais la table grossit : on passe au premier jeu qui accepte tout le monde
      if (!l.game && l.players.length > MODES[l.mode].max) {
        l.mode = Object.keys(MODES).find((id) => MODES[id].max >= l.players.length) || l.mode;
      }
    } else {
      existing.connected = true;
      clearTimeout(l.dcTimers[key]);
      delete l.dcTimers[key];
      if (!l.game) existing.character = sanitizeCharacter(character);
    }
    this.broadcastLobby(l);
    if (l.game) {
      const j = this.gameIdx(l, key);
      if (j >= 0) this.deliver(key, { t: 'sync', state: l.game.syncView ? l.game.syncView(j) : l.game.view(j) });
    }
  }

  hostHandle(from, m, name) {
    const l = this.hosting;
    if (!l) return;
    if (m.t === 'join') return this.hostJoin(l, from, name, m.character);
    const idx = l.players.findIndex((p) => p.key === from);
    if (idx < 0) return;
    const err = (text) => this.deliver(from, { t: 'error', text });
    const isHost = l.host === from;
    const busy = (l.game && l.game.phase === 'playing') || l.spinning;
    switch (m.t) {
      case 'char':
        l.players[idx].character = sanitizeCharacter(m.character);
        if (!l.game) this.broadcastLobby(l);
        break;
      case 'leave':
        this.removePlayer(l, idx, true);
        break;
      case 'mode':
        if (!isHost || !MODES[m.mode] || busy) return;
        if (l.players.length > MODES[m.mode].max) return err(`${MODES[m.mode].name} : ${MODES[m.mode].max} joueurs maximum.`);
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
        if (!l.game && l.players.length > MODES[l.mode].max) {
          l.mode = Object.keys(MODES).find((id) => MODES[id].max >= l.players.length) || l.mode;
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
        if (!l.game) return;
        const gi = this.gameIdx(l, from);
        if (gi < 0) return;
        if (!l.game.kind && Date.now() < l.lockUntil - 400) return err('Patience, cowboy…');
        const r = l.game.act(gi, m.action);
        if (r.error) return err(r.error);
        this.sendEvents(l, r.events);
        if (l.game && l.game.phase === 'over') this.broadcastLobby(l);
        break;
      }
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
        for (const p of l.players) this.deliver(p.key, { t: 'chat', from: l.players[idx].name, text });
        break;
      }
    }
  }

  removePlayer(l, idx, forfeit, text) {
    const p = l.players[idx];
    clearTimeout(l.dcTimers[p.key]);
    delete l.dcTimers[p.key];
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
    for (const o of l.players) this.deliver(o.key, { t: 'info', text: text || `${p.name} a quitté le saloon.` });
    this.broadcastLobby(l);
  }

  gameIdx(l, key) {
    return l.game ? l.game.p.findIndex((p) => p.key === key) : -1;
  }

  cantStart(l) {
    const m = MODES[l.mode] || MODES.roulette;
    if (l.players.length < m.min) return 'Il faut un adversaire !';
    if (l.players.length > m.max) return `${m.name} : ${m.max} joueurs maximum. Choisis un autre jeu.`;
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
    for (const p of l.players) this.deliver(p.key, spin);
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
    l.rematch.clear();
    clearInterval(l.miniTimer);
    clearTimeout(l.botTimer);
    l.bot = null;
    const players = l.players.map((p) => ({ key: p.key, name: p.name, character: p.character, bot: !!p.bot }));
    if (l.mode === 'roulette') {
      l.game = new Game(players);
      const bi = l.players.findIndex((p) => p.bot);
      if (bi >= 0) l.bot = new Bot(bi);
    } else {
      // Mini-jeu en temps réel : l'hôte fait avancer l'horloge (tirs des bandits, bots, fin de partie).
      // la variante choisie par l'hôte ne vaut que pour « Un jeu » : la roue et le championnat restent des surprises
      const g = makeGame(l.mode, players, l.format === 'single' ? l.variants[l.mode] ?? null : null);
      l.game = g;
      l.miniTimer = setInterval(() => {
        if (this.hosting !== l || l.game !== g) return clearInterval(l.miniTimer);
        this.sendEvents(l, g.tick());
        for (const o of g.liveOut.splice(0)) this.liveOut(o.key, o.d);
        if (g.phase === 'over') {
          clearInterval(l.miniTimer);
          this.broadcastLobby(l);
        }
      }, MINI_TICK);
    }
    l.game.champ = l.format === 'champ' && !!l.champ && !l.champ.done;
    this.broadcastLobby(l);
    this.sendEvents(l, l.game.start());
  }

  sendEvents(l, events) {
    if (!events.length) return;
    l.lockUntil = Date.now() + events.reduce((s, e) => s + (e.dur || 0), 0);
    for (const p of l.players) {
      const j = this.gameIdx(l, p.key);
      if (j >= 0) this.deliver(p.key, { t: 'events', events: events.map((e) => personalize(e, j)) });
    }
    const end = events.find((e) => e.type === 'matchEnd');
    if (end) {
      if (l.game.champ) this.champRecord(l, end);
      if (l.game.kind) this.recordMini(l, end);
      else this.recordMatch(l, end);
    }
    if (l.bot) {
      l.bot.observe(events);
      const line = l.bot.react(events);
      if (line) {
        const g = l.game;
        setTimeout(() => {
          if (l.game !== g || this.hosting !== l) return;
          for (const p of l.players) this.deliver(p.key, { t: 'chat', from: l.players[l.bot.idx].name, text: line.text });
        }, line.delay);
      }
      this.scheduleBot(l);
    }
  }

  // Le bot joue quand c'est son tour, une fois les animations terminées.
  scheduleBot(l) {
    clearTimeout(l.botTimer);
    const g = l.game;
    if (!l.bot || !g || g.phase !== 'playing' || g.turn !== l.bot.idx) return;
    const delay = Math.max(0, l.lockUntil - Date.now()) + 700 + Math.random() * 900;
    l.botTimer = setTimeout(() => {
      if (this.hosting !== l || l.game !== g || g.phase !== 'playing' || g.turn !== l.bot.idx) return;
      let r = g.act(l.bot.idx, l.bot.decide(g.view(l.bot.idx)));
      if (r.error) r = g.act(l.bot.idx, { kind: 'shoot', target: 'opp' });
      if (r.error) return;
      this.sendEvents(l, r.events);
      if (g.phase === 'over') this.broadcastLobby(l);
    }, delay);
  }

  // L'hôte enregistre le résultat de chaque joueur humain dans Supabase.
  recordMatch(l, end) {
    const g = l.game;
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
  recordMini(l, end) {
    const g = l.game;
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
        score: `${p.score} ${MODES[g.kind].unit || 'pts'}`,
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
