'use strict';
const MAX_BYTES = 2 * 1024 * 1024;
const clone = value => JSON.parse(JSON.stringify(value));
function fail(message) { throw new Error(message); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, max, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(label + ' 형식을 확인해 주세요.');
  return value;
}
function number(value, min, max, label, fallback, integer = false) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(label + ' 값을 확인해 주세요.');
  return value;
}
function id(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) fail(label + ' 식별자를 확인해 주세요.');
  return value;
}
function counts(value, fallback) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) fail('배치 인원을 확인해 주세요.');
  return value.map(v => number(v, 0, 200, '인원', undefined, true));
}
function validateState(input) {
  if (!object(input) || Buffer.byteLength(JSON.stringify(input)) > MAX_BYTES) fail('자리표 파일 형식 또는 크기를 확인해 주세요.');
  if (!Array.isArray(input.students) || input.students.length > 200 || !Array.isArray(input.seats) || input.seats.length > 400) fail('학생 또는 책상 목록을 확인해 주세요.');
  const students = input.students.map(s => {
    if (!object(s)) fail('학생 정보를 확인해 주세요.');
    return { id: id(s.id, '학생'), name: text(s.name, 100, '이름').trim() };
  });
  if (students.some(s => !s.name) || new Set(students.map(s => s.id)).size !== students.length) fail('이름 또는 중복 학생 식별자를 확인해 주세요.');
  const studentIds = new Set(students.map(s => s.id));
  const seats = input.seats.map(s => {
    if (!object(s)) fail('책상 정보를 확인해 주세요.');
    const studentId = s.studentId === null || s.studentId === undefined || s.studentId === '' ? null : id(s.studentId, '학생');
    if (studentId && !studentIds.has(studentId)) fail('명단에 없는 학생이 배치되어 있습니다.');
    return { id: id(s.id, '책상'), x: number(s.x, -20000, 20000, '책상 위치'), y: number(s.y, -20000, 20000, '책상 위치'), temporary: Boolean(s.temporary), studentId, groupId: s.groupId ? id(String(s.groupId), '모둠') : null };
  });
  const placed = seats.map(s => s.studentId).filter(Boolean);
  if (new Set(seats.map(s => s.id)).size !== seats.length || new Set(placed).size !== placed.length) fail('중복된 책상 또는 학생 배정을 확인해 주세요.');
  if (!['lines', 'groups', 'free'].includes(input.layoutKind)) fail('배치 종류를 확인해 주세요.');
  const settings = {};
  if (object(input.settings)) {
    for (const [key, val] of Object.entries(input.settings)) {
      if (['rounds', 'revealRounds', 'shuffleCount'].includes(key)) settings[key] = number(val, 1, 15, '발표 횟수', undefined, true);
      if (['sound', 'gentle', 'reducedMotion', 'teacherView', 'landscape'].includes(key)) settings[key] = Boolean(val);
    }
  }
  return { students, seats, serial: number(input.serial, 0, 10000000, '책상 번호', seats.length, true), worldHeight: number(input.worldHeight, 100, 20000, '교실 높이', 680), deskWidth: number(input.deskWidth, 10, 1000, '책상 너비', 155), layoutKind: input.layoutKind, lineCounts: counts(input.lineCounts, [7, 7, 6, 6]), groupCounts: counts(input.groupCounts, [5, 5, 4, 4, 4, 4]), groupColumns: number(input.groupColumns, 1, 12, '가로 모둠 수', 3, true), appliedInnerGap: number(input.appliedInnerGap, 0, 1000, '책상 간격', 8), appliedOuterGap: number(input.appliedOuterGap, 0, 1000, '모둠 간격', 70), className: text(input.className, 100, '학급명', ''), rosterRevision: number(input.rosterRevision, 0, Number.MAX_SAFE_INTEGER, '명단 버전', 0, true), settings };
}
function signature(state) {
  return JSON.stringify({revision: state.rosterRevision || 0, students: state.students.map(s => [s.id, s.name]).sort((a,b) => a[0].localeCompare(b[0])), seats: state.seats.map(s => [s.id, Boolean(s.temporary), s.groupId || null, s.temporary ? Boolean(s.studentId) : null]).sort((a,b) => a[0].localeCompare(b[0]))});
}
function validatePrepared(value, state) {
  if (!object(value) || !object(value.assignments) || typeof value.signature !== 'string' || value.signature.length > MAX_BYTES / 2) fail('준비 배정 형식을 확인해 주세요.');
  const keys = Object.keys(value.assignments);
  if (keys.length > 400) fail('준비 배정이 너무 큽니다.');
  const assignments = {};
  for (const key of keys) { id(key, '책상'); const studentId = value.assignments[key]; assignments[key] = studentId === null ? null : id(studentId, '학생'); }
  const result = { assignments, signature: value.signature };
  if (state) {
    if (result.signature !== signature(state)) fail('명단이나 책상 구성이 달라졌습니다. 준비 배정을 다시 저장해 주세요.');
    if (keys.length !== state.seats.length || state.seats.some(s => !Object.hasOwn(assignments, s.id))) fail('준비 배정의 책상 목록을 확인해 주세요.');
    const values = Object.values(assignments).filter(Boolean), expected = new Set(state.students.map(s => s.id));
    if (values.length !== expected.size || new Set(values).size !== expected.size || values.some(v => !expected.has(v))) fail('모든 학생을 한 자리씩 배정해 주세요.');
    if (state.seats.some(s => s.temporary && Boolean(s.studentId) !== Boolean(assignments[s.id]))) fail('임시 자리의 사용 여부가 달라졌습니다. 준비 배정을 다시 저장해 주세요.');
  }
  return result;
}
function choosePrepared(current, prepared) {
  const target = validateState(current);
  const checked = validatePrepared(prepared, target);
  target.seats.forEach(seat => { seat.studentId = checked.assignments[seat.id]; });
  return target;
}
function publicState(input) {
  const state = validateState(input);
  // A display gets coordinates and names only. No settings, signature, or prepared metadata.
  const result={...state, rosterRevision:0, settings:{}};
  if(object(input.presentation)) {
    const p=input.presentation;
    result.presentation={active:Boolean(p.active),phase:text(p.phase,120,'발표 문구',''),count:text(p.count===undefined?'':String(p.count),12,'카운트다운'),round:text(p.round===undefined?'':String(p.round),24,'발표 회차'),progress:number(p.progress,0,100,'발표 진행',0),maskNames:Boolean(p.maskNames),final:Boolean(p.final),view:p.view==='teacher'?'teacher':'student'};
  }
  return result;
}
module.exports = { MAX_BYTES, validateState, validatePrepared, signature, choosePrepared, publicState, clone };
