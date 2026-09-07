'use strict';

// Renderer state machine + real encrypted storage, with IPC and DOM rendering
// stubbed. This verifies data flow, not browser rendering or Windows dialogs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {SeatingStore} = require('../desktop/storage.cjs');
const {publicState} = require('../desktop/validation.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const geometry = plan => plain({...plan, students: undefined,
  seats: plan.seats.map(({studentId, ...seat}) => seat)});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const defer = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

async function harness(t) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'seaton-renderer-test-'));
  const store = await new SeatingStore(directory).init();
  const savedStates = [], published = [], frames = [], presentation = [];
  const safe = fn => async (...args) => {try {return await fn(...args);} catch (error) {return {ok: false, error: error.message};}};
  const bridge = {
    saveState: safe(async value => {await store.saveState(plain(value)); savedStates.push(plain(value)); return {ok: true};}),
    unlock: safe(async value => ({ok: true, prepared: await store.unlock(plain(value)), pinExists: store.pinExists})),
    lock: safe(async () => {store.lock(); return {ok: true};}),
    savePrepared: safe(async value => ({ok: true, prepared: await store.savePrepared(plain(value))})),
    choosePrepared: safe(async value => ({ok: true, target: store.choosePrepared(plain(value))})),
    getUpdateState: async () => ({status: 'current'}),
    publishDisplay: async value => {published.push(publicState(plain(value))); return {ok: true};},
    setPresentation: async value => {presentation.push(value); return {ok: true};}
  };
  const nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {
      value: key === '#sr-rounds' ? '7' : '', checked: key === '#sr-gentle' || key === '#app-landscape', hidden: true, textContent: '', options: [],
      style: {setProperty() {}}, classList: {add() {}, remove() {}, toggle() {}},
      replaceChildren() {}, appendChild() {}, setAttribute() {}, focus() {},
      querySelectorAll() {return [];}, querySelector() {return null;}
    });
    return nodes.get(key);
  };
  const context = {
    document: {getElementById() {return {querySelector: node};}},
    window: {seaton: bridge, matchMedia() {return {matches: false};}},
    setTimeout, clearTimeout, recordFrame: value => frames.push(plain(value))
  };
  const source = fs.readFileSync(path.join(__dirname, '../app/renderer.js'), 'utf8');
  const marker = "      room.addEventListener('pointerdown'";
  assert.ok(source.includes(marker)); new vm.Script(source); vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf(marker)) + `
    renderRoom = (target, teacher, editing, model) => {if (model) recordFrame(clone(model));};
    render = () => updatePreparedStatus();
    syncDraftControls = () => {}; switchTab = () => {}; updateImportCount = () => {};
    renderAssignmentDraft = () => {};
    globalThis.engine = {
      snapshot, loadState, assignmentsFrom, preparedError, chooseResult, instantShuffle,
      beginShow, commitShow, leaveStage, lockPublic, unlockSettings,
      openAssignmentEditor, changeDraftAssignment, saveAssignmentDraft, flushSave,
      setup() {
        students = Array.from({length: 26}, (_, i) => ({id: 'p' + i, name: '학생' + (i + 1)}));
        seats = []; serial = 0; history = []; groupCounts = [4, 5, 4, 4, 5, 4];
        installGeometry(groupGeometry(groupCounts, 8, 70, 3));
        seats.push({...newSeat(210, 101), temporary: true}, {...newSeat(790, 101), temporary: true});
        ready = true;
      },
      mutate(fn) {fn(seats, students);},
      get() {return {active: activeShow, history: history.length, prepared: clone(preparedAssignments),
        draft: clone(assignmentDraft), public: isPublic, unlocked: teacherUnlocked, busy: requestBusy};},
      async settled() {await saveChain.catch(() => {}); await lockChain.catch(() => {});},
      cancelPending() {commandEpoch += 1; lockPublic();},
      async cleanup() {if (activeShow) leaveStage(true); ready = false; clearTimeout(saveTimer); await saveChain.catch(() => {}); await lockChain.catch(() => {});}
    };
  })();`, context);
  const e = context.engine; e.setup();
  t.after(async () => {await e.cleanup(); await store.flush(); store.destroy(); await fsp.rm(directory, {recursive: true, force: true});});
  return {e, store, bridge, node, savedStates, published, frames, presentation};
}

async function prepare(h) {
  assert.equal(await h.e.unlockSettings('482619', '482619'), '');
  h.e.openAssignmentEditor();
  h.e.changeDraftAssignment(h.e.snapshot().seats[0].id, 'p1');
  await h.e.saveAssignmentDraft();
  assert.match(h.node('.sr-preset-status').textContent, /저장됨/);
  return plain(h.e.get().prepared);
}

test('private assignment save leaves public seating intact and survives renderer locking', async t => {
  const h = await harness(t), before = plain(h.e.snapshot());
  const prepared = await prepare(h);
  assert.deepEqual(plain(h.e.snapshot()), before);
  assert.deepEqual(h.store.getPrepared().assignments, prepared);
  assert.equal(prepared.s1, 'p1'); assert.equal(prepared.s2, 'p0');
  assert.ok(Object.values(prepared).every(value => value === null || typeof value === 'string'));
  h.e.lockPublic(); await h.e.settled();
  assert.equal(h.e.get().prepared, null); assert.equal(h.e.get().draft, null);
  assert.equal(h.e.get().unlocked, false); assert.equal(h.store.unlocked, false);
  assert.equal(h.node('.sr-preset-status').textContent, '');
  assert.deepEqual(plain(h.store.choosePrepared(h.e.snapshot()).seats.map(s => s.studentId)), before.seats.map(s => prepared[s.id]));
  assert.ok(h.savedStates.every(state => !JSON.stringify(state).includes('assignments')));
});

test('Ctrl shuffle uses stored assignments while preserving current subpixel coordinates exactly', async t => {
  const h = await harness(t), prepared = await prepare(h);
  for (let i = 0; i < 3; i++) await h.e.instantShuffle(false);
  h.e.mutate(seats => {seats[0].x += 0.001; seats[1].y += 0.0007;});
  const before = h.e.snapshot();
  await h.e.instantShuffle(true); await h.e.settled();
  assert.deepEqual(geometry(h.e.snapshot()), geometry(before));
  assert.deepEqual(plain(h.e.assignmentsFrom(h.e.snapshot())), prepared);
  assert.deepEqual(h.store.state.seats.map(s => s.studentId), plain(h.e.snapshot().seats.map(s => s.studentId)));
  h.e.mutate(seats => seats.pop());
  const stale = plain(h.e.snapshot()), history = h.e.get().history;
  await h.e.instantShuffle(true);
  assert.deepEqual(plain(h.e.snapshot()), stale); assert.equal(h.e.get().history, history);
  assert.equal(h.node('.sg-status').textContent, '발표 준비를 확인해 주세요.');
});

test('seven-round reveal keeps geometry fixed and commits exactly one final stored result', async t => {
  const h = await harness(t), prepared = await prepare(h);
  await h.e.instantShuffle(false); await h.e.settled();
  const before = plain(h.e.snapshot()), history = h.e.get().history;
  h.frames.length = 0; h.savedStates.length = 0;
  await h.e.beginShow(true); const run = h.e.get().active;
  assert.ok(run); assert.equal(h.e.get().unlocked, false);
  assert.deepEqual(plain(h.e.snapshot()), before, 'intermediate draws never replace saved public seating');
  await h.e.beginShow(false); assert.equal(h.e.get().active, run);
  await pause(1400); await h.e.settled();
  assert.equal(run.finished, true); assert.equal(h.frames.length, 8, 'initial frame + six intermediate draws + one final');
  h.frames.forEach(frame => assert.deepEqual(geometry(frame), geometry(before)));
  assert.deepEqual(plain(h.e.assignmentsFrom(h.e.snapshot())), prepared);
  assert.equal(h.e.get().history, history + 1);
  assert.equal(h.savedStates.length, 1, 'only final changed result is persisted');
  assert.deepEqual(h.presentation, [true, false]);
  assert.ok(h.published.every(state => !Object.hasOwn(state, 'prepared') && !Object.hasOwn(state, 'assignments')));
  h.e.leaveStage(); await h.e.settled(); assert.equal(run.waits.size, 0);
});

test('skip commits the locked target once; cancel leaves the old state and no late result', async t => {
  const h = await harness(t); await prepare(h); await h.e.instantShuffle(false);
  const history = h.e.get().history;
  await h.e.beginShow(true); const skipped = h.e.get().active, target = plain(skipped.target);
  h.e.commitShow(skipped); h.e.commitShow(skipped); h.e.leaveStage();
  await pause(160); await h.e.settled();
  assert.equal(h.e.get().history, history + 1); assert.deepEqual(plain(h.e.snapshot()), target); assert.equal(skipped.waits.size, 0);
  const before = plain(h.e.snapshot()), cancelHistory = h.e.get().history;
  await h.e.beginShow(false); const cancelled = h.e.get().active; h.e.leaveStage(true);
  await pause(160); await h.e.settled();
  assert.deepEqual(plain(h.e.snapshot()), before); assert.equal(h.e.get().history, cancelHistory); assert.equal(cancelled.waits.size, 0);
});

test('late PIN verification cannot reopen teacher settings after public locking', async t => {
  const h = await harness(t), gate = defer(), originalUnlock = h.bridge.unlock;
  h.bridge.unlock = async value => {await gate.promise; return originalUnlock(value);};
  const pending = h.e.unlockSettings('482619', '482619');
  await pause(0); h.e.lockPublic(); gate.resolve(); await pending; await h.e.settled();
  assert.equal(h.e.get().unlocked, false); assert.equal(h.e.get().public, true); assert.equal(h.e.get().prepared, null);
  assert.equal(h.store.unlocked, false);
});

test('cancelling a pending prepared-result request prevents a later reveal from starting', async t => {
  const h = await harness(t); await prepare(h);
  const gate = defer(), originalChoose = h.bridge.choosePrepared;
  h.bridge.choosePrepared = async value => {await gate.promise; return originalChoose(value);};
  const before = plain(h.e.snapshot()), pending = h.e.beginShow(true);
  assert.equal(h.e.get().busy, true);
  const duplicate = h.e.beginShow(false); await duplicate;
  h.e.cancelPending(); gate.resolve(); await pending; await h.e.settled();
  assert.equal(h.e.get().active, null); assert.equal(h.e.get().busy, false);
  assert.deepEqual(plain(h.e.snapshot()), before); assert.equal(h.e.get().history, 0);
});

test('a failed presentation IPC start restores the public screen and allows another attempt', async t => {
  const h = await harness(t); await prepare(h);
  const before = plain(h.e.snapshot()), originalSet = h.bridge.setPresentation;
  h.bridge.setPresentation = async active => {if (active) throw new Error('발표 시작 연결 실패'); return originalSet(active);};
  await h.e.beginShow(true); await h.e.settled();
  assert.equal(h.e.get().active, null); assert.equal(h.e.get().busy, false); assert.equal(h.e.get().public, true);
  assert.deepEqual(plain(h.e.snapshot()), before); assert.equal(h.e.get().history, 0);
  h.bridge.setPresentation = originalSet;
  await h.e.beginShow(true); assert.ok(h.e.get().active); h.e.leaveStage(true);
});

test('literal ID and class selectors used by the renderer exist in the app document', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
  const classes = new Set([...html.matchAll(/\bclass=["']([^"']+)["']/g)].flatMap(match => match[1].split(/\s+/)));
  const dynamicClasses = new Set(['sg-seat', 'sg-seat-name', 'sg-group-label']);
  const selectors = [...source.matchAll(/\$\(['"]([.#][\w-]+)['"]\)/g)].map(match => match[1]);
  for (const selector of selectors) {
    const name = selector.slice(1);
    assert.ok(selector[0] === '#' ? ids.has(name) : classes.has(name) || dynamicClasses.has(name), selector + ' must exist');
  }
});
