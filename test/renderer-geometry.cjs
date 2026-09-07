'use strict';

// Exercise the production layout/assignment functions. DOM rendering is stubbed;
// these tests do not claim to verify browser layout or pointer event delivery.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEngine() {
  const source = fs.readFileSync(path.join(__dirname, '../app/renderer.js'), 'utf8');
  new vm.Script(source);
  const marker = "      room.addEventListener('pointerdown'";
  assert.ok(source.includes(marker), 'renderer event boundary remains identifiable');
  const nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {
      value: '', checked: false, hidden: true, textContent: '', options: [],
      style: {setProperty() {}}, classList: {add() {}, remove() {}, toggle() {}},
      replaceChildren() {}, appendChild() {}, setAttribute() {}, focus() {},
      querySelectorAll() {return [];}, querySelector() {return null;}
    });
    return nodes.get(key);
  };
  const context = {
    document: {getElementById() {return {querySelector: node};}},
    window: {seaton: {}, matchMedia() {return {matches: false};}},
    setTimeout, clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf(marker)) + `
    render = () => {};
    finishChange = () => {};
    globalThis.engine = {
      parseNames, lineGeometry, groupShape, groupGeometry, displayPoint,
      installGeometry, snapshot, transfer, movingSeats, moveCollection,
      randomPlan, assignmentsFrom, completePlanError, shouldShow, pendingStudents,
      setup(counts = [4, 5, 4, 4, 5, 4]) {
        students = Array.from({length: 26}, (_, i) => ({id: 'p' + i, name: '학생' + (i + 1)}));
        seats = []; serial = 0; history = []; mode = 'group';
        groupCounts = [...counts];
        installGeometry(groupGeometry(counts, 8, 70, 3));
        seats.push({...newSeat(210, 101), temporary: true}, {...newSeat(790, 101), temporary: true});
      },
      mutate(fn) {fn(seats, students);},
      setMode(value) {mode = value;},
      historyCount() {return history.length;}
    };
  })();`, context);
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
