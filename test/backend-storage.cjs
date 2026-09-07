'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  validateState, validatePrepared, choosePrepared, signature, publicState, clone,
} = require('../desktop/validation.cjs');
const { SeatingStore, validateDocument, validateVault, FORMAT } = require('../desktop/storage.cjs');

function fixture() {
  return validateState({
    students: [{ id: 'p1', name: '김하늘' }, { id: 'p2', name: '김하늘' }, { id: 'p3', name: '이바다' }],
    seats: [
      { id: 's1', x: 102.125, y: 214.875, studentId: 'p1', groupId: 'g1' },
      { id: 's2', x: 280.625, y: 214.875, studentId: 'p2', groupId: 'g1' },
      { id: 't1', x: 55.375, y: 32.125, studentId: 'p3', temporary: true },
      { id: 't2', x: 803.5, y: 32.125, studentId: null, temporary: true },
    ],
    layoutKind: 'groups', className: '2학년 3반', rosterRevision: 5,
    groupCounts: [2], groupColumns: 1, lineCounts: [1, 1, 1, 0],
    settings: { rounds: 7, sound: false, teacherView: false },
  });
}
function prepared(state = fixture()) {
  return { signature: signature(state), assignments: { s1: 'p2', s2: 'p1', t1: 'p3', t2: null } };
}
async function newStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seaton-storage-test-'));
  const store = await new SeatingStore(directory).init();
  t.after(async () => { store.destroy(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, store };
}
async function configuredStore(t) {
  const result = await newStore(t);
  await result.store.saveState(fixture());
  await result.store.unlock({ pin: '482619', confirm: '482619' });
  await result.store.savePrepared(prepared());
  return result;
}

test('prepared result changes identities only, preserving every coordinate and temporary-seat visibility', () => {
  const state = fixture(), plan = prepared(state);
  // Arbitrary classroom dragging after preparation must never restore old coordinates.
  state.seats[0].x += 0.001;
  state.seats[0].y -= 1.25;
  state.seats[1].x += 88.75;
  const original = clone(state), result = choosePrepared(state, plan);
  assert.deepEqual(state, original, 'selection cannot mutate the current classroom');
  assert.deepEqual(result.seats.map(({ studentId, ...seat }) => seat), original.seats.map(({ studentId, ...seat }) => seat));
  assert.deepEqual(result.seats.map(s => s.studentId), ['p2', 'p1', 'p3', null]);
  assert.equal(result.students[0].name, result.students[1].name, 'duplicate names remain distinct student IDs');
  assert.equal(result.seats[2].temporary, true);
  assert.equal(result.seats[3].studentId, null);
});

test('signatures allow rearranging names and coordinates but invalidate changed roster or seat topology', () => {
  const state = fixture(), plan = prepared(state);
  const reorder = clone(state);
  reorder.students.reverse(); reorder.seats.reverse();
  assert.equal(signature(reorder), signature(state));
  const moved = clone(state);
  moved.seats[0].studentId = 'p2'; moved.seats[1].studentId = 'p1';
  moved.seats[0].x = 0.0001;
  assert.doesNotThrow(() => choosePrepared(moved, plan));
  for (const [description, change] of [
    ['roster reimport', s => s.rosterRevision++],
    ['student rename', s => { s.students[0].name = '박별'; }],
    ['student added', s => s.students.push({ id: 'p4', name: '최빛' })],
    ['seat added', s => s.seats.push({ id: 's3', x: 50, y: 50, studentId: null, temporary: false, groupId: 'g1' })],
    ['seat deleted', s => s.seats.pop()],
    ['seat identity replaced', s => { s.seats[0].id = 'replacement'; }],
    ['group membership changed', s => { s.seats[0].groupId = 'g2'; }],
    ['temporary seat type changed', s => { s.seats[0].temporary = true; }],
    ['temporary seat becomes empty', s => { s.seats[2].studentId = null; }],
  ]) {
    const changed = clone(state); change(changed);
    assert.throws(() => choosePrepared(changed, plan), /달라졌습니다/, description);
  }
});

test('invalid assignments, duplicate records, unknown students and out-of-range state cannot be loaded', () => {
  const state = fixture();
  for (const [description, change] of [
    ['duplicate student IDs', s => { s.students[1].id = 'p1'; }],
    ['duplicate seat IDs', s => { s.seats[1].id = 's1'; }],
    ['duplicate placement', s => { s.seats[1].studentId = 'p1'; }],
    ['unknown placement', s => { s.seats[1].studentId = 'outsider'; }],
    ['invalid coordinate', s => { s.seats[1].x = NaN; }],
    ['blank student name', s => { s.students[1].name = '   '; }],
    ['invalid rounds', s => { s.settings.rounds = 16; }],
    ['invalid layout', s => { s.layoutKind = 'javascript:alert(1)'; }],
    ['unsafe seat ID', s => { s.seats[1].id = '<script>'; }],
  ]) {
    const changed = clone(state); change(changed);
    assert.throws(() => validateState(changed), undefined, description);
  }
  for (const change of [
    p => { p.assignments.s1 = 'p1'; },
    p => { p.assignments.s1 = 'outsider'; },
    p => { delete p.assignments.s1; },
    p => { p.assignments.extra = null; },
    p => { p.assignments.t1 = null; p.assignments.t2 = 'p3'; },
  ]) {
    const changed = prepared(state); change(changed);
    assert.throws(() => validatePrepared(changed, state));
  }
  assert.throws(() => validateDocument({ format: FORMAT, version: 2, state, vault: null }));
  assert.throws(() => validateVault({ version: 1, cipher: 'aes-256-gcm', kdf: 'scrypt', salt: 'oops', iv: '', tag: '', data: '' }));
});

test('public projection strips injected metadata and cannot mutate stored state or pollute prototypes', () => {
  const state = fixture();
  state.prepared = prepared(state); state.pin = '482619'; state.key = 'private-key';
  state.students[0].privateNotes = 'private-student-note';
  state.seats[0].preparedStudentId = 'p2';
  state.settings.privateSecret = 'private-setting';
  Object.assign(state, JSON.parse('{"__proto__":{"polluted":"yes"}}'));
  const display = publicState(state), serialized = JSON.stringify(display);
  assert.deepEqual(Object.keys(display).sort(), ['students', 'seats', 'serial', 'worldHeight', 'deskWidth', 'layoutKind', 'lineCounts', 'groupCounts', 'groupExtraPositions', 'groupColumns', 'appliedInnerGap', 'appliedOuterGap', 'className', 'rosterRevision', 'settings'].sort());
  assert.deepEqual(display.settings, {}, 'display settings contain no private presentation or teacher preferences');
  assert.equal(display.rosterRevision, 0, 'internal roster revision is redacted');
  for (const secret of ['prepared', 'signature', '482619', 'private-key', 'private-student-note', 'private-setting']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal({}.polluted, undefined);
  display.students[0].name = 'changed';
  display.seats[0].x = -999;
  assert.equal(state.students[0].name, '김하늘');
  assert.equal(state.seats[0].x, 102.125);
});

test('PIN and prepared assignment are encrypted at rest, survive restart and remain locked', async t => {
  const { directory, store } = await configuredStore(t);
  const raw = await fs.readFile(store.file, 'utf8'), disk = JSON.parse(raw);
  assert.equal(raw.includes('482619'), false);
  assert.equal(raw.includes('assignments'), false);
  assert.equal(raw.includes('signature'), false);
  assert.equal(disk.vault.cipher, 'aes-256-gcm');
  assert.equal(disk.vault.kdf, 'scrypt');
  assert.deepEqual(disk.state, fixture());
  assert.equal(typeof disk.vault.data, 'string');
  const restarted = await new SeatingStore(directory).init();
  t.after(() => restarted.destroy());
  assert.equal(restarted.pinExists, true);
  assert.equal(restarted.unlocked, false);
  assert.equal(restarted.key, null);
  assert.throws(() => restarted.getPrepared(), /잠금/);
  assert.throws(() => restarted.choosePrepared(fixture()), /발표 준비/);
  assert.deepEqual(await restarted.unlock({ pin: '482619' }), prepared());
});

test('wrong PIN is rejected and throttled; locking denies private reads/writes but allows chosen final result', async t => {
  const { directory, store } = await configuredStore(t);
  const restart = await new SeatingStore(directory).init();
  t.after(() => restart.destroy());
  await assert.rejects(restart.unlock({ pin: '111111' }), /PIN/);
  assert.equal(restart.unlocked, false);
  assert.equal(restart.key, null);
  await assert.rejects(restart.unlock({ pin: '482619' }), /잠시 후/);
  assert.throws(() => restart.getPrepared(), /잠금/);
  store.lock();
  assert.throws(() => store.getPrepared(), /잠금/);
  await assert.rejects(store.savePrepared(prepared()), /잠금/);
  await assert.rejects(store.clearPrepared(), /잠금/);
  const result = store.choosePrepared(fixture());
  assert.deepEqual(result, choosePrepared(fixture(), prepared()));
  const key = store.key;
  store.destroy();
  assert.equal(store.key, null);
  assert.equal(key.every(byte => byte === 0), true, 'destroy zeroes the retained encryption key');
  assert.throws(() => store.choosePrepared(fixture()), /발표 준비/);
});

test('PIN creation rejects weak or mismatched input without creating a vault', async t => {
  const { store } = await newStore(t);
  await assert.rejects(store.unlock({ pin: '1234', confirm: '1234' }), /6~12/);
  await assert.rejects(store.unlock({ pin: '123456', confirm: '654321' }), /일치/);
  assert.equal(store.pinExists, false);
  assert.equal(store.unlocked, false);
  await store.unlock({ pin: '482619', confirm: '482619' });
  assert.equal(store.pinExists, true);
  assert.equal(store.getPrepared(), null);
});

test('atomic saves leave a parseable prior backup and recover it when the current file is corrupt', async t => {
  const { directory, store } = await configuredStore(t);
  const original = store.state, latest = clone(original);
  latest.className = '2학년 4반';
  await store.saveState(latest);
  const backup = JSON.parse(await fs.readFile(store.file + '.bak', 'utf8'));
  assert.equal(backup.state.className, original.className);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['classroom.json', 'classroom.json.bak']);
  await fs.writeFile(store.file, '{broken-json', 'utf8');
  const recovered = await new SeatingStore(directory).init();
  t.after(() => recovered.destroy());
  assert.deepEqual(recovered.state, original);
  assert.match(recovered.recoveryNotice, /백업/);
  assert.deepEqual(await recovered.unlock({ pin: '482619' }), prepared());
});

test('corrupt primary and backup fail without replacing the original files', async t => {
  const { directory, store } = await newStore(t);
  await fs.writeFile(store.file, 'original-corrupt-data', 'utf8');
  await fs.writeFile(store.file + '.bak', 'backup-corrupt-data', 'utf8');
  await assert.rejects(new SeatingStore(directory).init(), /읽지 못했습니다/);
  assert.equal(await fs.readFile(store.file, 'utf8'), 'original-corrupt-data');
  assert.equal(await fs.readFile(store.file + '.bak', 'utf8'), 'backup-corrupt-data');
});

test('export/import retains encrypted vault and closes access until the source PIN is supplied', async t => {
  const source = await configuredStore(t), destination = await newStore(t);
  const raw = await source.store.exportDocument(fixture());
  const exported = JSON.parse(raw);
  assert.deepEqual(exported.vault, source.store.document.vault);
  assert.equal(raw.includes('assignments'), false);
  await destination.store.unlock({ pin: '619284', confirm: '619284' });
  const oldKey = destination.store.key;
  const imported = await destination.store.importDocument(raw);
  assert.deepEqual(imported, fixture());
  assert.deepEqual(destination.store.document.vault, exported.vault);
  assert.equal(destination.store.unlocked, false);
  assert.equal(destination.store.key, null);
  assert.equal(oldKey.every(byte => byte === 0), true);
  assert.throws(() => destination.store.getPrepared(), /잠금/);
  assert.throws(() => destination.store.choosePrepared(fixture()), /발표 준비/);
  assert.deepEqual(await destination.store.unlock({ pin: '482619' }), prepared());
  destination.store.lock();
  await assert.rejects(destination.store.exportDocument(fixture()), /잠금/);
  await assert.rejects(destination.store.importDocument(raw), /잠금/);
});

test('tampered authenticated ciphertext cannot unlock or expose a prepared assignment', async t => {
  const { directory, store } = await configuredStore(t);
  const disk = JSON.parse(await fs.readFile(store.file, 'utf8'));
  const bytes = Buffer.from(disk.vault.data, 'base64');
  bytes[0] ^= 1;
  disk.vault.data = bytes.toString('base64');
  await fs.writeFile(store.file, JSON.stringify(disk), 'utf8');
  const corrupted = await new SeatingStore(directory).init();
  t.after(() => corrupted.destroy());
  await assert.rejects(corrupted.unlock({ pin: '482619' }), /손상/);
  assert.equal(corrupted.key, null);
  assert.equal(corrupted.unlocked, false);
  assert.throws(() => corrupted.getPrepared(), /잠금/);
});

test('saving or clearing private preparation concurrently with autosave cannot restore old classroom coordinates', async t => {
  const { store } = await configuredStore(t);
  for (const operation of ['save', 'clear']) {
    const current = store.state;
    const edited = clone(current);
    edited.className = operation + '-latest-class';
    edited.seats[0].x += 123.456;
    edited.seats[1].y -= 0.001;
    const privateSave = operation === 'save' ? store.savePrepared(prepared(current)) : store.clearPrepared();
    await Promise.all([privateSave, store.saveState(edited)]);
    assert.deepEqual(store.state, edited, operation + ' must merge against the newest classroom inside the write queue');
    assert.deepEqual(JSON.parse(await fs.readFile(store.file, 'utf8')).state, edited);
    if (operation === 'save') assert.deepEqual(store.getPrepared(), prepared(current));
    else assert.equal(store.getPrepared(), null);
  }
});
