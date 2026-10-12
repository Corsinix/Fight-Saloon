import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IsoView } from '../public/js/villeiso.js';
import { Pix, Sprite, hex } from '../public/js/isokit.js';

function world(n = 16) {
  const size = n * n;
  return {
    n, B: [], byId: new Map(), solo: true,
    road: new Uint8Array(size), owner: new Int8Array(size),
    wood: new Uint8Array(size), dep: new Uint8Array(size), depQ: new Uint16Array(size),
    tileB: new Int32Array(size).fill(-1), fieldOf: new Int32Array(size).fill(-1),
    reveal: new Uint8Array(size),
  };
}

for (let rot = 0; rot < 4; rot++) {
  test(`progressive volumes preserve pixels and depth, rotation ${rot}`, () => {
    const a = new Sprite(2, 3, 32, 2, 2, rot);
    const b = new Sprite(2, 3, 32, 2, 2, rot);
    const color = (u, v, z, face) => [hex('8a6a44'), hex('f8d070'), hex('5a3a22')][face];
    for (const sprite of [a, b]) sprite.vol(2, 2, 20, 20, 4, color);
    const height = (u, v) => 5 + Math.sin(u / 5) * 3 + v / 4;
    assert.equal(a.vol(1, 3, 28, 40, height, color, 1), a);
    let steps = 0;
    for (const _ of b.volSteps(1, 3, 28, 40, height, color, 1)) steps++;
    assert.ok(steps > 1);
    assert.deepEqual(b.px.d, a.px.d);
    assert.deepEqual(b.zb, a.zb);
    assert.deepEqual(b.mask, a.mask);
  });
}

test('chunk generation resumes across budgets and keeps the old canvas until ready', (t) => {
  const v = new IsoView(world());
  const old = { width: 512, height: 360 }, fresh = { width: 512, height: 360 };
  v.chunks.set('0:0', { cv: old, sig: -1 });
  let starts = 0;
  v.paintChunkSteps = function* () { starts++; yield; yield; return fresh; };
  let clock = 0;
  t.mock.method(performance, 'now', () => clock++);
  const frame = () => v.chunk(0, 0, { n: 4, deadline: clock + 1 });
  assert.equal(frame(), old);
  assert.equal(frame(), old);
  assert.equal(old.width, 512);
  assert.equal(frame(), fresh);
  assert.equal(starts, 1);
  assert.equal(old.width, 0);
  assert.equal(v.chunkJobs.size, 0);
  assert.equal(v.chunk(0, 0, { n: 4 }), fresh);
  assert.equal(starts, 1);
});

test('a changed chunk restarts unfinished work, including changes across a border', (t) => {
  const w = world(), v = new IsoView(w);
  const before = v.sig(0, 0);
  let starts = 0;
  v.paintChunkSteps = function* () { starts++; yield; return { width: 1, height: 1 }; };
  let clock = 0;
  t.mock.method(performance, 'now', () => clock++);
  assert.equal(v.chunk(0, 0, { n: 4, deadline: clock + 1 }), null);
  w.road[8] = 1;
  assert.notEqual(v.sig(0, 0), before);
  assert.equal(v.chunk(0, 0, { n: 4, deadline: clock + 1 }), null);
  assert.equal(starts, 2);
  assert.ok(v.chunk(0, 0, { n: 4 }));
});

test('zero budgets do not begin expensive work', () => {
  const v = new IsoView(world());
  v.paintChunkSteps = () => { throw new Error('unexpected generation'); };
  assert.equal(v.chunk(0, 0, { n: 0 }), null);
  assert.equal(v.chunk(0, 0, { n: 4, deadline: -Infinity }), null);
  assert.equal(v.chunkJobs.size, 0);
});

test('large synchronous previews never draw an evicted canvas', () => {
  const v = new IsoView(world(96));
  v.zoom = 1;
  v.paintChunkSteps = function* () { return { width: 512, height: 360 }; };
  let draws = 0;
  const g = {
    fillRect() {},
    drawImage(canvas) { assert.ok(canvas.width > 0); draws++; },
  };
  v.draw(g, 3072, 1700, 0, { budget: 999 });
  assert.equal(draws, 144);
  assert.equal(v.chunks.size, 64);
  assert.equal(v.pending, false);
});

test('filter canvases have a bounded LRU cache and are released on reset', (t) => {
  t.mock.method(Pix.prototype, 'canvas', function () { return { width: this.w, height: this.h }; });
  const v = new IsoView(world(96));
  v.filter = 'territoire';
  const first = v.overlay(0, 0), second = v.overlay(1, 0);
  for (let k = 2; k < 64; k++) v.overlay(k % 12, Math.floor(k / 12));
  assert.equal(v.overlay(0, 0), first);
  v.overlay(4, 5);
  assert.equal(v.overlays.size, 64);
  assert.equal(second.width, 0);
  assert.ok(first.width > 0);
  v.filterVer++;
  const replacement = v.overlay(0, 0);
  assert.equal(first.width, 0);
  const ground = { width: 512, height: 360 };
  v.chunks.set('0:0', { cv: ground, sig: 0 });
  v.chunkJobs.set('1:1', {});
  v.fx.push({ k: 'smoke' });
  v.setWorld(world());
  assert.equal(ground.width, 0);
  assert.equal(replacement.width, 0);
  assert.equal(v.chunkJobs.size, 0);
  assert.equal(v.overlays.size, 0);
  assert.equal(v.fx.length, 0);
});
