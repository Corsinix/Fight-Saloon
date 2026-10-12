import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATS, BUILDING_IDS } from '../public/js/villekit.js';

globalThis.location = { hostname: 'test.invalid' };
const { fitText, hitZone, CATEGORY_LABELS, BUILD_VISIBLE } = await import('../public/js/villeui.js');
const { VilleScene } = await import('../public/js/ville.js');
delete globalThis.location;

function scene() {
  const s = Object.create(VilleScene.prototype);
  Object.defineProperty(s, 't', { value: 1 });
  Object.assign(s, {
    world: {}, ui: [], modal: null, uiModal: null, mouse: { x: 20, y: 50 },
    mode: 'idle', tab: null, sel: null, press: null, tabScroll: 0, filtersOpen: false,
  });
  return s;
}

test('text fitting preserves short text and respects narrow widths', () => {
  const measure = (s) => s.length * 5;
  assert.equal(fitText('VILLE', 25, measure), 'VILLE');
  assert.equal(fitText('UNE TRÈS GRANDE VILLE', 25, measure), 'UNE…');
  assert.equal(fitText('VILLE', 0, measure), '');
  for (let width = 0; width < 100; width++) assert.ok(measure(fitText('UNE TRÈS GRANDE VILLE', width, measure)) <= width);
});

test('every building has a working tooltip, including deposits without a trade good', () => {
  const s = scene();
  s.world = { towns: [{ era: 4 }], solo: true };
  for (const id of BUILDING_IDS) assert.ok(s.buildingTip(id).length);
  assert.ok(s.buildingTip('briqueterie').some((line) => line.includes('ARGILE')));
});

test('all construction categories have visible labels', () => {
  assert.equal(CATS.length, 10);
  for (const c of CATS) assert.ok(CATEGORY_LABELS[c.id]);
});

test('disabled buttons and panel backgrounds block the map without masking child controls', () => {
  const panel = { x: 0, y: 0, w: 100, h: 100, fn: null };
  const button = { x: 5, y: 5, w: 20, h: 20, fn: () => {} };
  const disabled = { x: 30, y: 5, w: 20, h: 20, fn: null };
  assert.equal(hitZone([panel, button, disabled], { x: 10, y: 10 }), button);
  assert.equal(hitZone([panel, button, disabled], { x: 35, y: 10 }), disabled);
  assert.equal(hitZone([panel, button, disabled], { x: 80, y: 80 }), panel);
  assert.equal(hitZone([panel], { x: 100, y: 10 }), null);
});

test('clicking a disabled UI zone never picks or starts dragging the map', () => {
  const s = scene();
  s.view = { pick() { throw new Error('unexpected map click'); } };
  s.zone(0, 20, 100, 60, null);
  s.onFire({ x: 10, y: 30 });
  assert.equal(s.press, null);
});

test('newly opened modals cannot activate stale background buttons', () => {
  const s = scene();
  s.zone(0, 0, 100, 100, () => { throw new Error('stale action'); });
  s.modal = { id: 'menu' };
  s.onFire({ x: 10, y: 30 });
});

test('modal rendering replaces all underlying hit zones', () => {
  const s = scene();
  s.zone(0, 0, 100, 100, () => { throw new Error('background action'); });
  s.modal = { id: 'menu' };
  s.mMenu = function () { this.zone(20, 20, 20, 20, null); };
  s.drawModal({ fillRect() {} });
  assert.equal(s.ui.length, 2);
  s.hitUI({ x: 2, y: 2 }).fn();
  assert.equal(s.modal, null);
});

test('Escape preserves required decisions and returns from confirmation to its menu', () => {
  const s = scene();
  for (const id of ['event', 'campagne']) {
    s.modal = { id };
    s.onKey('escape');
    assert.equal(s.modal.id, id);
  }
  s.modal = { id: 'confirm', back: 'menu' };
  s.onKey('escape');
  assert.deepEqual(s.modal, { id: 'menu' });
  s.onKey('escape');
  assert.equal(s.modal, null);
});

test('filter shortcut opens a default filter and closes construction', () => {
  const s = scene();
  s.tab = 'cultiver';
  s.onKey('f');
  assert.equal(s.filtersOpen, true);
  assert.equal(s.tab, null);
  assert.equal(s.filterId, 'eau');
  s.onKey('escape');
  assert.equal(s.filtersOpen, false);
});

test('wheel scrolls panels, zooms only the map, and ignores modals', () => {
  const s = scene();
  let zooms = 0;
  s.zoomBy = () => zooms++;
  s.tab = 'cultiver'; s.mouse.y = 130;
  s.onWheel(1);
  assert.equal(s.tabScroll, BUILD_VISIBLE);
  assert.equal(zooms, 0);
  s.tab = null; s.mouse.y = 50;
  s.inspectorRect = { x: 0, y: 20, w: 100, h: 100 };
  s.onWheel(1);
  assert.equal(s.inspectorPage, 1);
  s.inspectorRect = null;
  s.onWheel(1);
  assert.equal(zooms, 1);
  s.zone(0, 20, 100, 100, null);
  s.onWheel(1);
  assert.equal(zooms, 1);
  s.modal = { id: 'menu' };
  s.onWheel(1);
  assert.equal(zooms, 1);
});

test('changing tools or opening a modal cancels unfinished road gestures', () => {
  const s = scene();
  s.press = { moved: true }; s.roadStart = [0, 0]; s.roadPath = [[0, 0, true]];
  s.setMode('idle');
  assert.equal(s.press, null);
  assert.equal(s.roadStart, null);
  assert.equal(s.roadPath, null);
  s.press = { moved: true }; s.roadStart = [0, 0]; s.modal = { id: 'menu' };
  s.cmd = () => { throw new Error('unexpected command'); };
  s.onPointerUp();
  assert.equal(s.press, null);
  assert.equal(s.roadStart, null);
});
