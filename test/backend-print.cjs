'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureRole } = require('../desktop/main.cjs');
const { seatingSVG, printHTML } = require('../desktop/print.cjs');

function fixture() {
  return {
    students: [{ id: 'p1', name: '가람' }, { id: 'p2', name: '가람' }, { id: 'p3', name: '별빛' }],
    seats: [
      { id: 's1', x: 102.125, y: 214.875, studentId: 'p1', groupId: 'g1' },
      { id: 's2', x: 280.625, y: 214.875, studentId: 'p2', groupId: 'g1' },
      { id: 's3', x: 458.625, y: 214.875, studentId: null, groupId: 'g1' },
      { id: 't1', x: 55.375, y: 101.125, studentId: 'p3', temporary: true },
      { id: 't2', x: 803.5, y: 101.125, studentId: null, temporary: true },
    ],
    worldHeight: 680, deskWidth: 155, layoutKind: 'groups', className: '2학년 3반',
  };
}
function blocks(svg, kind) {
  const matches = [...svg.matchAll(new RegExp('<g class="' + kind + '"><rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"[^>]*\/><text x="([^"]+)" y="([^"]+)"[^>]*>([^<]*)<\\/text><\\/g>', 'g'))];
  return matches.map(match => ({ x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]), textX: Number(match[5]), textY: Number(match[6]), label: match[7] }));
}

test('display and unknown roles cannot invoke private data, mutation, file, presentation or updater actions', () => {
  assert.doesNotThrow(() => ensureRole('display', 'getInitial'));
  assert.doesNotThrow(() => ensureRole('control', 'getInitial'));
  const privateActions = ['unlock', 'lock', 'saveState', 'getPrepared', 'savePrepared', 'clearPrepared', 'choosePrepared', 'saveFile', 'openFile', 'exportPDF', 'print', 'exportPNG', 'openDisplay', 'publishDisplay', 'setPresentation', 'getUpdateState', 'checkUpdate', 'installUpdate', 'toggleFullscreen', 'closeReady'];
  for (const action of privateActions) {
    assert.doesNotThrow(() => ensureRole('control', action), action);
    assert.throws(() => ensureRole('display', action), /사용할 수 없는/, action);
  }
  for (const role of ['student', '', null, undefined]) {
    assert.throws(() => ensureRole(role, 'getInitial'));
    assert.throws(() => ensureRole(role, 'unlock'));
  }
  assert.throws(() => ensureRole('control', 'evaluateJavaScript'));
  assert.throws(() => ensureRole('control', '__proto__'));
});

test('teacher print rotates geometry 180 degrees while labels remain upright and unused temporary seats disappear', () => {
  const state = fixture();
  const studentSVG = seatingSVG(state, false), teacherSVG = seatingSVG(state, true);
  const studentSeats = blocks(studentSVG, 'seat'), teacherSeats = blocks(teacherSVG, 'seat');
  assert.equal(studentSeats.length, 3);
  assert.equal(teacherSeats.length, 3);
  assert.deepEqual(studentSeats.map(seat => seat.label), ['가람 · 1', '가람 · 2', '별빛']);
  for (let index = 0; index < studentSeats.length; index++) {
    const student = studentSeats[index], teacher = teacherSeats[index];
    assert.equal(teacher.label, student.label);
    assert.equal(student.x + student.width / 2 + teacher.x + teacher.width / 2, 1000);
    assert.equal(student.y + student.height / 2 + teacher.y + teacher.height / 2, state.worldHeight);
    assert.equal(teacher.textX, teacher.x + teacher.width / 2);
    assert.equal(teacher.width, student.width);
  }
  assert.equal(blocks(studentSVG, 'empty').length, 1, 'only the ordinary empty desk remains');
  assert.equal(blocks(teacherSVG, 'empty').length, 1);
  assert.equal(studentSVG.includes('빈자리'), false);
  assert.equal(teacherSVG.includes('transform='), false, 'individual text is not rotated or mirrored');
  assert.equal(blocks(studentSVG, 'board')[0].y, 11);
  assert.equal(blocks(teacherSVG, 'board')[0].y, state.worldHeight - 31 - 20);
  assert.equal(blocks(studentSVG, 'podium')[0].y, 77);
  assert.equal(blocks(teacherSVG, 'podium')[0].y, state.worldHeight - 101 - 24);
});

test('print HTML escapes student names and classroom titles with no injected elements or private metadata', () => {
  const state = fixture();
  state.students[0].name = '<script>alert("x")</script> & \'name\'';
  state.className = '</h1><img src=x onerror="attack()">';
  state.prepared = { assignments: { s1: 'private-assignment-marker' } };
  state.settings = { teacherPin: '123456789', rounds: 7 };
  const html = printHTML({ state, type: 'both' });
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;name&#39;'), true);
  assert.equal(html.includes('&lt;/h1&gt;&lt;img src=x onerror=&quot;attack()&quot;&gt;'), true);
  assert.equal(html.includes('private-assignment-marker'), false);
  assert.equal(html.includes('123456789'), false);
  assert.equal(html.includes('Content-Security-Policy'), true);
});

test('both print produces exactly two separately labeled pages and single views honor A4 orientation', () => {
  const state = fixture();
  const both = printHTML({ state, type: 'both', landscape: true });
  assert.equal((both.match(/<section class="page">/g) || []).length, 2);
  assert.equal((both.match(/aria-label="학생용 자리표"/g) || []).length, 1);
  assert.equal((both.match(/aria-label="교탁용 자리표"/g) || []).length, 1);
  assert.equal(both.includes('size:A4 landscape'), true);
  const student = printHTML({ state, type: 'student', landscape: false });
  assert.equal((student.match(/<section class="page">/g) || []).length, 1);
  assert.equal(student.includes('aria-label="교탁용 자리표"'), false);
  assert.equal(student.includes('size:A4 portrait'), true);
  const teacher = printHTML({ state, type: 'teacher', landscape: true });
  assert.equal((teacher.match(/<section class="page">/g) || []).length, 1);
  assert.equal(teacher.includes('aria-label="학생용 자리표"'), false);
  assert.throws(() => printHTML({ state, type: 'unknown' }), /인쇄 방향/);
});
