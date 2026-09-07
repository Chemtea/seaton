'use strict';

// CI fixture only: this file is outside electron-builder's app/desktop allowlist.
// No application storage, credentials, network, printer, or updater is used.
const {contextBridge} = require('electron');
const groupCounts = [5, 5, 4, 4, 4, 4];
const students = Array.from({length: 26}, (_, i) => ({id: 'example-' + (i + 1), name: '예시' + String(i + 1).padStart(2, '0')}));
students[0].name = students[1].name = '김예시';
let serial = 0;
const seats = groupCounts.flatMap((count, group) => Array.from({length: count}, (_, place) => {
  const index = serial++;
  return {id: 'fixture-' + (index + 1), studentId: students[index].id, temporary: false, groupId: 'g' + (group + 1),
    x: 110 + (group % 3) * 300 + (place < 4 ? place % 2 : 2) * 92,
    y: 220 + Math.floor(group / 3) * 210 + (place < 4 ? Math.floor(place / 2) * 64 : 32)};
}));
seats.push({id: 'fixture-left', x: 185, y: 101, temporary: true, studentId: null, groupId: null},
  {id: 'fixture-right', x: 815, y: 101, temporary: true, studentId: null, groupId: null});
const state = {students, seats, serial, worldHeight: 680, deskWidth: 82, layoutKind: 'groups',
  lineCounts: [7, 7, 6, 6], groupCounts, groupColumns: 3, groupExtraPositions: groupCounts.map(() => 'right'),
  appliedInnerGap: 8, appliedOuterGap: 70, rosterRevision: 0, className: '화면 확인 · 예시 학급',
  settings: {rounds: 7, sound: false, gentle: true, landscape: true}};
let unlockCount = 0;
const rendererErrors = [];
window.addEventListener('error', event => rendererErrors.push(event.message || String(event.error)));
window.addEventListener('unhandledrejection', event => rendererErrors.push(String(event.reason)));
const ok = async () => ({ok: true});
const unused = async () => {throw new Error('Unexpected native action in UI smoke test.');};
const subscription = () => () => {};
contextBridge.exposeInMainWorld('seaton', Object.freeze({
  getInitial: async () => ({role: 'control', pinExists: true, version: 'UI-CHECK', state}),
  unlock: async value => {unlockCount++; return value.pin === '123456' ? {ok: true, pinExists: true, prepared: null} : {ok: false, error: 'PIN 확인'};},
  lock: ok, saveState: ok, getPrepared: async () => ({ok: true, prepared: null}),
  savePrepared: ok, clearPrepared: ok, choosePrepared: unused,
  saveFile: unused, openFile: unused, exportPDF: unused, print: unused, exportPNG: unused,
  openDisplay: unused, publishDisplay: ok, setPresentation: ok, toggleFullscreen: unused,
  closeReady: ok, onBeforeClose: subscription, getUpdateState: async () => ({status: 'disabled'}),
  checkUpdate: unused, installUpdate: unused, onUpdate: subscription, onDisplay: subscription,
}));
contextBridge.exposeInMainWorld('seatonUiFixture', Object.freeze({
  inspect: () => ({unlockCount, rendererErrors: [...rendererErrors]}),
}));
