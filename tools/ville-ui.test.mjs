import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATS, BUILDING_IDS } from '../public/js/villekit.js';

globalThis.location = { hostname: 'test.invalid' };
const { fitText, hitZone, CATEGORY_ICONS, BUILD_VISIBLE, HoverDelay, HOVER_DELAY } = await import('../public/js/villeui.js');
const { hasVIcon } = await import('../public/js/villeicons.js');
const { VilleScene } = await import('../public/js/ville.js');
delete globalThis.location;

function scene() {
  const s = Object.create(VilleScene.prototype);
  Object.defineProperty(s, 't', { value: 1 });
  Object.assign(s, {
    world: {}, ui: [], modal: null, uiModal: null, mouse: { x: 20, y: 50 },
    mode: 'idle', tab: null, sel: null, press: null, tabScroll: 0, filtersOpen: false,
    tileHover: new HoverDelay(), uiHover: new HoverDelay(), now: 0,
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

test('construction categories and management controls have pixel icons', () => {
  assert.equal(CATS.length, 10);
  for (const c of CATS) assert.ok(hasVIcon(CATEGORY_ICONS[c.id]), c.id);
  for (const id of ['filtres', 'edits', 'factions_m', 'commerce', 'almanach', 'objectif', 'maires', 'menu', 'aide', 'tourner', 'annuler', 'centrer']) assert.ok(hasVIcon(id), id);
});

test('hover waits one second and restarts when changing or leaving targets', () => {
  const hover = new HoverDelay();
  assert.equal(hover.ready('3:4', 100), false);
  assert.equal(hover.ready('3:4', 100 + HOVER_DELAY - 1), false);
  assert.equal(hover.ready('3:4', 100 + HOVER_DELAY), true);
  assert.equal(hover.ready('4:4', 1200), false);
  assert.equal(hover.ready(null, 1300), false);
  assert.equal(hover.ready('4:4', 2400), false);
  assert.equal(hover.ready('4:4', 2400 + HOVER_DELAY), true);
  hover.reset();
  assert.equal(hover.ready('4:4', 5000), false);
});

test('clicking terrain does not pin an inspector and restarts the hover delay', () => {
  const s = scene();
  s.tileHover.ready('3:4', 0);
  s.clickMap({ in: true, x: 3, y: 4 });
  assert.equal(s.sel, null);
  assert.equal(s.tileHover.ready('3:4', 2000), false);
  s.clickMap({ in: true, x: 3, y: 4, b: { id: 7 } });
  assert.deepEqual(s.sel, { b: 7 });
});

test('render shows a transient tile inspector only after sustained hover', () => {
  const s = scene(), inspected = [];
  const ctx = Object.fromEntries(['save', 'beginPath', 'rect', 'clip', 'translate', 'restore'].map((key) => [key, () => {}]));
  let tile = { in: true, x: 3, y: 4, b: null };
  s.mouse.in = true;
  s.world.byId = new Map();
  s.view = { pick: () => tile, draw() {} };
  for (const method of ['drawTop', 'drawBottom', 'drawNotes', 'drawMission', 'drawModal']) s[method] = () => {};
  s.drawInspector = (ctx, b, preview) => inspected.push(preview);
  s.render(ctx);
  s.now = HOVER_DELAY - 1; s.render(ctx);
  assert.equal(inspected.length, 0);
  s.now = HOVER_DELAY; s.render(ctx);
  assert.equal(inspected.length, 1);
  assert.equal(inspected[0], tile);
  assert.equal(s.sel, null);
  tile = { ...tile, x: 4 };
  s.now++; s.render(ctx);
  assert.equal(inspected.length, 1);
  s.now += HOVER_DELAY; s.render(ctx);
  assert.equal(inspected.length, 2);
  s.mouse.in = false; s.render(ctx);
  assert.equal(inspected.length, 2);
  s.mouse.in = true; s.now += HOVER_DELAY; s.render(ctx);
  assert.equal(inspected.length, 2);
  s.press = {}; s.now += HOVER_DELAY; s.render(ctx);
  assert.equal(inspected.length, 2);
});

test('render delays UI tooltips even though hit zones are rebuilt each frame', () => {
  const s = scene(), tips = [];
  const ctx = Object.fromEntries(['save', 'beginPath', 'rect', 'clip', 'translate', 'restore'].map((key) => [key, () => {}]));
  s.mouse.in = true;
  s.view = { pick: () => ({ in: false }), draw() {} };
  s.drawTop = () => s.zone(0, 20, 100, 100, null, ['FILTRES']);
  for (const method of ['drawBottom', 'drawNotes', 'drawMission']) s[method] = () => {};
  s.drawTip = (ctx, lines) => tips.push(lines);
  s.render(ctx);
  s.now = HOVER_DELAY - 1; s.render(ctx);
  assert.equal(tips.length, 0);
  s.now = HOVER_DELAY; s.render(ctx);
  assert.deepEqual(tips, [['FILTRES']]);
  s.resetHover(); s.render(ctx);
  assert.equal(tips.length, 1);
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
