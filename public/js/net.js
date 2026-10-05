// Réseau sans serveur dédié : comptes et classement dans Supabase (Postgres),
// messages des tables relayés par Supabase Realtime.
// Le navigateur de l'hôte fait office de serveur de la table : il fait tourner la partie
// (game.js) et n'envoie à chaque joueur que ce qu'il a le droit de voir.
// L'interface (on / send / messages { t: ... }) est la même que l'ancien serveur WebSocket.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { Game, personalize } from './game.js';
import { Bot, botPlayer } from './bot.js';
import { MiniGame } from './mini.js';
import { FortGame } from './fortgame.js';
import { WagonGame } from './wagongame.js';
import { PinteGame } from './pintegame.js';
import { MineGame } from './minegame.js';
import { CourseGame } from './coursegame.js';
import { RtsGame } from './rtsgame.js';
import { MODES, MAX_PLAYERS } from './worlds.js';

const RECONNECT_GRACE = 45000;
const HOST_GRACE = 8000;
const JOIN_TIMEOUT = 6000;
const STATS0 = { played: 0, wins: 0, losses: 0, shots: 0, selfShots: 0, hits: 0, mgPlayed: 0, mgWins: 0 };
const MINI_TICK = 100;
const SOLO_BOTS = 3; // adversaires bots dans un mini-jeu solo

const configured = /^https:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('COLLE') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('COLLE');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (name) => String(name).toLowerCase();
const validUsername = (name) => typeof name === 'string' && /^[A-Za-z0-9_\-éèàçÉÈÀ]{2,16}$/.test(name);

function defaultCharacter() {
  return {
    skin: 1, hat: 'cowboy', hatColor: 1, hair: 'short', hairColor: 1,
    eyes: 'squint', nose: 'small', mouth: 'neutral', beard: 'stubble',
    outfit: 'poncho', outfitColor: 2,
  };
}

function sanitizeCharacter(c) {
  const out = defaultCharacter();
  if (!c || typeof c !== 'object') return out;
  for (const k of Object.keys(out)) {
    const v = c[k];
    if (typeof out[k] === 'number' && Number.isInteger(v) && v >= 0 && v < 32) out[k] = v;
    if (typeof out[k] === 'string' && typeof v === 'string' && /^[a-z]{1,16}$/.test(v)) out[k] = v;
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
    else if (p.to === this.user.key && !this.hosting) this.fromHost(p.msg);
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
        if (this.hostKey && !this.presentKeys().has(this.hostKey)) this.hostClosed('L’hôte a quitté le saloon. La table est fermée.');
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

  fromHost(msg) {
    if (msg.t === 'lobby') {
      clearTimeout(this.joinTimer);
      this.joining = null;
      if (!this.hosting) this.hostKey = msg.lobby.host;
    }
    if (msg.t === 'error' && this.joining) {
      clearTimeout(this.joinTimer);
      this.joining = null;
      this.closeChannel();
    }
    if (msg.t === 'closed') return this.hostClosed(msg.text);
    this.local(msg);
  }

  async hostClosed(text) {
    clearTimeout(this.hostGoneTimer);
    this.hostGoneTimer = 0;
    this.hostKey = null;
    await this.closeChannel();
    this.local({ t: 'info', text });
    this.local({ t: 'left' });
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
      clearTimeout(l.botTimer);
      clearInterval(l.miniTimer);
      Object.values(l.dcTimers).forEach(clearTimeout);
      const me = this.gameIdx(l, l.host);
      if (l.game && l.game.phase === 'playing' && !l.game.kind) this.sendEvents(l, l.game.forfeit(me));
      for (const p of l.players) if (p.key !== l.host) this.deliver(p.key, { t: 'closed', text: 'L’hôte a fermé la table.' });
      this.hosting = null;
      if (this.chan) await sleep(300); // laisse partir les derniers messages
    } else if (this.code && this.hostKey) {
      await this.wire('host', { t: 'leave' });
    }
    this.hostKey = null;
    await this.closeChannel();
  }

  // ---------------------------------------------------------------- côté hôte
  async createLobby(solo, mode = 'roulette') {
    await this.leave();
    const code = newCode();
    const me = { key: this.user.key, name: this.user.name, character: this.character, connected: true };
    const l = {
      code, host: me.key, solo, mode, players: [me], game: null, bot: null, botTimer: null, miniTimer: null,
      rematch: new Set(), dcTimers: {}, lockUntil: 0,
    };
    if (solo) {
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
      players: l.players.map((p) => ({
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
      if (l.players.length >= MAX_PLAYERS) return err('Cette table est déjà complète.');
      if (l.game && l.game.phase === 'playing') return err('Une partie est en cours.');
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
    switch (m.t) {
      case 'char':
        l.players[idx].character = sanitizeCharacter(m.character);
        if (!l.game) this.broadcastLobby(l);
        break;
      case 'leave':
        this.removePlayer(l, idx, true);
        break;
      case 'mode':
        if (l.host !== from || !MODES[m.mode] || (l.game && l.game.phase === 'playing')) return;
        if (l.players.length > MODES[m.mode].max) return err(`${MODES[m.mode].name} : ${MODES[m.mode].max} joueurs maximum.`);
        l.mode = m.mode;
        l.rematch.clear();
        this.broadcastLobby(l);
        break;
      case 'start': {
        if (l.host !== from) return err("Seul l'hôte peut lancer la partie.");
        if (l.game && l.game.phase === 'playing') return;
        const why = this.cantStart(l);
        if (why) return err(why);
        this.startGame(l);
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
        if (!l.game || l.game.phase !== 'over') return;
        if (l.solo) return this.startGame(l);
        l.rematch.add(l.players[idx].name);
        if (l.rematch.size >= l.players.length && !this.cantStart(l)) this.startGame(l);
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

  removePlayer(l, idx, forfeit) {
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
    for (const o of l.players) this.deliver(o.key, { t: 'info', text: `${p.name} a quitté le saloon.` });
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

  startGame(l) {
    l.rematch.clear();
    clearInterval(l.miniTimer);
    clearTimeout(l.botTimer);
    l.bot = null;
    const players = l.players.map((p) => ({ key: p.key, name: p.name, character: p.character, bot: !!p.bot }));
    if (l.mode === 'roulette') {
      l.game = new Game(players);
      if (l.solo) l.bot = new Bot(l.players.findIndex((p) => p.bot));
    } else {
      // Mini-jeu en temps réel : l'hôte fait avancer l'horloge (tirs des bandits, bots, fin de partie).
      const g = l.mode === 'fort' ? new FortGame(players) : l.mode === 'wagon' ? new WagonGame(players)
        : l.mode === 'pinte' ? new PinteGame(players) : l.mode === 'mine' ? new MineGame(players) : l.mode === 'course' ? new CourseGame(players)
        : l.mode === 'rts' ? new RtsGame(players) : new MiniGame(l.mode, players);
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
      // Les duels solo ne comptent pas pour le classement.
      const res = l.solo
        ? { soloPlayed: 1, soloWins: won ? 1 : 0, soloLosses: won ? 0 : 1 }
        : { played: 1, wins: won ? 1 : 0, losses: won ? 0 : 1 };
      const entry = {
        solo: !!l.solo,
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
      const res = l.solo ? { soloMgPlayed: 1, soloMgWins: won ? 1 : 0 } : { mgPlayed: 1, mgWins: won ? 1 : 0 };
      const entry = {
        game: g.kind,
        solo: !!l.solo,
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
