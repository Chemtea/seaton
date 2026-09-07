'use strict';

// Exercise the production layout/assignment functions. DOM rendering is stubbed;
// these tests do not claim to verify browser layout or pointer event delivery.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {validateState} = require('../desktop/validation.cjs');

function loadEngine() {
  const source = fs.readFileSync(path.join(__dirname, '../app/renderer.js'), 'utf8');
  new vm.Script(source);
  const marker = "      room.addEventListener('pointerdown'";
  assert.ok(source.includes(marker), 'renderer event boundary remains identifiable');
  const nodes = new Map();
  let created = 0;
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {
      value: '', checked: false, hidden: true, textContent: '', options: [],
      children: [], listeners: {},
      style: {setProperty() {}}, classList: {add() {}, remove() {}, toggle() {}},
      replaceChildren() {this.children = [];}, appendChild(child) {this.children.push(child);}, setAttribute() {}, focus() {},
      addEventListener(type, listener) {this.listeners[type] = listener;},
      querySelectorAll() {return [];}, querySelector() {return null;}
    });
    return nodes.get(key);
  };
  const context = {
    document: {getElementById() {return {querySelector: node, querySelectorAll() {return [];}};}, createElement() {return node('created-' + (++created));}},
    window: {seaton: {}, matchMedia() {return {matches: false};}},
    setTimeout, clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf(marker)) + `
    render = () => {};
    finishChange = () => {};
    globalThis.engine = {
      parseNames, lineGeometry, groupShape, groupGeometry, displayPoint,
      installGeometry, snapshot, loadState, transfer, movingSeats, moveCollection,
      randomPlan, assignmentsFrom, completePlanError, shouldShow, pendingStudents,
      setup(counts = [4, 5, 4, 4, 5, 4]) {
        students = Array.from({length: counts.reduce((sum, count) => sum + count, 0)}, (_, i) => ({id: 'p' + i, name: '학생' + (i + 1)}));
        seats = []; serial = 0; history = []; mode = 'group';
        layoutKind = 'groups'; groupCounts = [...counts]; groupExtraPositions = normalizeExtraPositions(counts);
        installGeometry(groupGeometry(counts, 8, 70, 3));
        seats.push({...newSeat(210, 101), temporary: true}, {...newSeat(790, 101), temporary: true});
      },
      mutate(fn) {fn(seats, students);},
      setMode(value) {mode = value;},
      configureGroups(counts, positions, columns = 3) {
        draftKind = 'groups'; draftGroups = [...counts]; draftExtraPositions = [...positions]; draftColumns = columns;
        $('#sg-inner-gap').value = '8'; $('#sg-outer-gap').value = '70';
      },
      draftPositions() {return [...draftExtraPositions];},
      historyCount() {return history.length;}
    };
    ${source.slice(source.indexOf("      $('.sg-apply').addEventListener"), source.indexOf("      $('.sg-shuffle').addEventListener"))}
    ${source.slice(source.indexOf("      $('.sg-undo').addEventListener"), source.indexOf("      $('.sg-view-student').addEventListener"))}
  })();`, context);
  context.engine.click = selector => node(selector).listeners.click({});
  return context.engine;
}

const plain = value => JSON.parse(JSON.stringify(value));
const geometry = plan => plain({...plan, students: undefined,
  seats: plan.seats.map(({studentId, ...seat}) => seat)});

test('pasted names retain duplicate identities and spaces within names', () => {
  const e = loadEngine();
  assert.deepEqual(plain(e.parseNames(' 김민준\r\n이 서연\t김민준,\n Alex Kim \n')), ['김민준', '이 서연', '김민준', 'Alex Kim']);
});

test('4–7 lines honor individual capacities including empty lines', () => {
  const e = loadEngine();
  for (const counts of [[7, 7, 6, 6], [4, 5, 6, 5, 6], [0, 4, 5, 6, 5, 6], [0, 4, 5, 6, 5, 6, 0]]) {
    const plan = e.lineGeometry(counts);
    assert.equal(plan.points.length, 26);
    counts.forEach((count, column) => {
      const x = 50 + (column + 0.5) * 900 / counts.length;
      assert.equal(plan.points.filter(p => p.x === x).length, count);
    });
  }
});

test('any selected groups can hold five; sixth group can reflow between 3×2 and 2×3', () => {
  const e = loadEngine();
  const counts = [4, 5, 4, 4, 5, 4];
  for (const columns of [3, 2]) {
    const plan = e.groupGeometry(counts, 8, 70, columns);
    assert.equal(plan.points.length, 26);
    counts.forEach((count, index) => assert.equal(plan.points.filter(p => p.groupId === 'g' + (index + 1)).length, count));
    const tops = counts.map((_, index) => Math.min(...plan.points.filter(p => p.groupId === 'g' + (index + 1)).map(p => p.y)));
    assert.equal(new Set(tops).size, Math.ceil(6 / columns));
  }
  const five = e.groupShape(5, 8).points;
  assert.equal(five[4].y, (five[0].y + five[2].y) / 2, 'fifth desk fits between the paired rows');
  assert.ok(five[4].x > five[1].x);
});

test('group reflow preserves seat IDs and assigned students while changing positions', () => {
  const e = loadEngine(); e.setup();
  const before = e.snapshot();
  e.installGeometry(e.groupGeometry([4, 5, 4, 4, 5, 4], 0, 24, 2), true);
  const after = e.snapshot();
  assert.deepEqual(plain(e.assignmentsFrom(after)), plain(e.assignmentsFrom(before)));
  assert.deepEqual(after.seats.map(s => s.id), before.seats.map(s => s.id));
  assert.notDeepEqual(geometry(after), geometry(before));
  assert.deepEqual(plain(after.seats.filter(s => s.temporary)), plain(before.seats.filter(s => s.temporary)));
});

test('odd groups put the extra desk in front, behind, left or right while retaining paired desks', () => {
  const e = loadEngine();
  for (const count of [3, 5, 7]) {
    for (const position of ['front', 'back', 'left', 'right']) {
      const shape = e.groupShape(count, 8, position), paired = shape.points.slice(0, -1), extra = shape.points.at(-1);
      const xs = paired.map(point => point.x), ys = paired.map(point => point.y);
      assert.equal(shape.points.length, count);
      if (position === 'front' || position === 'back') {
        assert.equal(extra.x, (Math.min(...xs) + Math.max(...xs)) / 2);
        assert.ok(position === 'front' ? extra.y < Math.min(...ys) : extra.y > Math.max(...ys));
      } else {
        assert.equal(extra.y, (Math.min(...ys) + Math.max(...ys)) / 2);
        assert.ok(position === 'left' ? extra.x < Math.min(...xs) : extra.x > Math.max(...xs));
      }
      assert.equal(shape.width, Math.max(...shape.points.map(point => point.x)) + 105);
      assert.equal(shape.height, Math.max(...shape.points.map(point => point.y)) + 54);
    }
  }
  for (const count of [1, 2, 4, 6, 8]) {
    const regular = plain(e.groupShape(count, 8));
    for (const position of ['front', 'back', 'left']) assert.deepEqual(plain(e.groupShape(count, 8, position)), regular);
  }
});

test('mixed group shapes reserve their full bounds with one, two or three groups across', () => {
  const e = loadEngine();
  const counts = [5, 7, 3, 8, 1, 6, 2, 4, 5, 5], positions = ['front', 'right', 'left', 'back', 'front', 'right', 'left', 'back', 'back', 'front'];
  for (const columns of [1, 2, 3]) {
    for (const [inner, outer] of [[0, 24], [8, 70], [22, 120]]) {
      const plan = e.groupGeometry(counts, inner, outer, columns, positions);
      assert.equal(plan.points.length, 46);
      for (let i = 0; i < plan.points.length; i++) {
        const a = plan.points[i];
        assert.ok(a.x - plan.width / 2 >= -1e-9 && a.x + plan.width / 2 <= 1000 + 1e-9);
        assert.ok(a.y - 27 >= 140 && a.y + 27 < plan.height);
        for (let j = i + 1; j < plan.points.length; j++) {
          const b = plan.points[j];
          assert.ok(Math.abs(a.x - b.x) + 1e-9 >= plan.width || Math.abs(a.y - b.y) + 1e-9 >= 54, `${columns} columns: ${i} and ${j} overlap`);
        }
      }
    }
  }
});

test('shape settings survive save/load and undo without changing student assignments or seat IDs', () => {
  const e = loadEngine(), counts = [5, 5, 4, 4, 4, 4], positions = ['front', 'back', 'left', 'right', 'front', 'back'];
  e.setup(counts);
  const original = plain(e.snapshot());
  e.configureGroups(counts, positions); e.click('.sg-apply');
  const changed = plain(e.snapshot());
  assert.deepEqual(changed.groupExtraPositions, positions);
  assert.deepEqual(changed.seats.map(seat => [seat.id, seat.studentId]), original.seats.map(seat => [seat.id, seat.studentId]));
  assert.notDeepEqual(changed.seats.map(seat => [seat.x, seat.y]), original.seats.map(seat => [seat.x, seat.y]));
  const loaded = loadEngine(); loaded.loadState(validateState(changed));
  assert.deepEqual(plain(loaded.snapshot()), changed);
  assert.deepEqual(plain(loaded.draftPositions()), positions);
  e.click('.sg-undo');
  assert.deepEqual(plain(e.snapshot()), original);
  assert.deepEqual(plain(e.draftPositions()), original.groupExtraPositions);
});

test('old seat plans keep their right-side extra desk and invalid new shape metadata is rejected', () => {
  const e = loadEngine(); e.setup();
  const saved = plain(e.snapshot()); delete saved.groupExtraPositions;
  const checked = validateState(saved);
  assert.deepEqual(checked.groupExtraPositions, Array(saved.groupCounts.length).fill('right'));
  e.loadState(saved);
  assert.deepEqual(plain(e.snapshot().groupExtraPositions), checked.groupExtraPositions);
  assert.deepEqual(plain(e.snapshot().seats), saved.seats, 'loading does not recalculate old coordinates');
  for (const positions of [null, [], ['front'], Array(saved.groupCounts.length).fill('diagonal')]) {
    assert.throws(() => validateState({...saved, groupExtraPositions: positions}), /모둠 추가석/);
  }
});

test('moving a group preserves all relative desk offsets and clamps at the room edge', () => {
  const e = loadEngine(); e.setup();
  const group = plain(e.movingSeats(e.snapshot().seats.find(s => s.groupId === 'g2').id));
  const beforeOthers = e.snapshot().seats.filter(s => s.groupId !== 'g2');
  e.moveCollection(group, 10000, 10000);
  const after = e.snapshot(), moved = after.seats.filter(s => s.groupId === 'g2');
  const dx = moved[0].x - group[0].x, dy = moved[0].y - group[0].y;
  moved.forEach((seat, i) => {
    assert.ok(Math.abs((seat.x - group[i].x) - dx) < 1e-9);
    assert.ok(Math.abs((seat.y - group[i].y) - dy) < 1e-9);
    assert.ok(seat.x + after.deskWidth / 2 <= 995 + 1e-9);
    assert.ok(seat.y + 27 <= after.worldHeight - 8 + 1e-9);
  });
  assert.deepEqual(plain(after.seats.filter(s => s.groupId !== 'g2')), plain(beforeOthers));
});

test('student transfer swaps assignments without changing desk geometry', () => {
  const e = loadEngine(); e.setup();
  const before = e.snapshot();
  e.transfer(before.seats[0].id, before.seats[7].id);
  const after = e.snapshot();
  assert.deepEqual(geometry(after), geometry(before));
  assert.equal(after.seats[0].studentId, before.seats[7].studentId);
  assert.equal(after.seats[7].studentId, before.seats[0].studentId);
  assert.equal(e.historyCount(), 1);
});

test('shuffle restores pending students, keeps occupied temporary seats, and rejects insufficient desks', () => {
  const e = loadEngine(); e.setup();
  e.mutate(seats => {seats.at(-1).studentId = seats[0].studentId; seats[0].studentId = null; seats[1].studentId = null;});
  assert.equal(e.pendingStudents().length, 1);
  const before = e.snapshot(), shuffled = e.randomPlan(before);
  assert.deepEqual(geometry(shuffled), geometry(before));
  assert.equal(shuffled.seats.at(-1).studentId, 'p0');
  assert.equal(shuffled.seats.at(-2).studentId, null);
  assert.equal(e.shouldShow(shuffled.seats.at(-2), false), false);
  assert.equal(e.shouldShow(shuffled.seats.at(-1), false), true);
  assert.equal(e.completePlanError(shuffled), '');
  const tooSmall = plain(before); tooSmall.seats.splice(0, 2);
  assert.throws(() => e.randomPlan(tooSmall), /부족/);
});

test('teacher view rotates positions twice back to the original coordinates', () => {
  const e = loadEngine(), point = {x: 285.125, y: 406.75};
  assert.deepEqual(plain(e.displayPoint(e.displayPoint(point, true, 900), true, 900)), point);
});
