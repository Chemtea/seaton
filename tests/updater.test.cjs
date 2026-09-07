'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUpdater } = require('../desktop/updater.cjs');
const { parseRepository } = require('../scripts/prepare-update.cjs');

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seaton-updater-'));
  const configPath = path.join(directory, 'update-config.json');
  fs.writeFileSync(configPath, JSON.stringify({ schema: 1, configured: true, owner: 'example', repo: 'seaton' }));
  const service = new EventEmitter();
  let checks = 0, installs = 0;
  service.checkForUpdates = async () => { checks++; service.emit('checking-for-update'); };
  service.quitAndInstall = () => { installs++; };
  const controller = createUpdater({ app: { isPackaged: true, getVersion: () => '1.0.0' }, configPath, platform: 'win32', environment: {}, updaterFactory: () => service, ...overrides });
  t.after(() => { controller.dispose(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { service, controller, calls: () => ({ checks, installs }) };
}

test('configured installer checks and downloads, but never installs on ordinary quit', async t => {
  const f = fixture(t);
  await f.controller.check();
  assert.equal(f.service.autoDownload, true);
  assert.equal(f.service.autoInstallOnAppQuit, false);
  assert.equal(f.service.allowDowngrade, false);
  f.service.emit('update-downloaded', { version: '1.0.1' });
  assert.equal(f.controller.getState().status, 'downloaded');
  assert.equal(f.calls().installs, 0);
});

test('presentation blocks both check and install; install saves before restart', async t => {
  let busy = true, saves = 0;
  const f = fixture(t, { isBusy: () => busy, beforeInstall: async () => { saves++; } });
  await f.controller.check(); assert.equal(f.calls().checks, 0);
  busy = false; await f.controller.check(); f.service.emit('update-downloaded', { version: '1.0.1' });
  busy = true; await f.controller.install(); assert.equal(f.calls().installs, 0); assert.equal(saves, 0);
  busy = false; await f.controller.install(); assert.equal(saves, 1); assert.equal(f.calls().installs, 1);
});

test('failed save keeps downloaded update and never restarts', async t => {
  const f = fixture(t, { beforeInstall: async () => { throw new Error('disk unavailable'); } });
  await f.controller.check(); f.service.emit('update-downloaded', { version: '1.0.1' });
  await f.controller.install();
  assert.equal(f.calls().installs, 0); assert.equal(f.controller.getState().status, 'downloaded');
});

test('a presentation starting during save prevents restart and double installs', async t => {
  let busy = false, releaseSave;
  const f = fixture(t, { isBusy: () => busy, beforeInstall: () => new Promise(resolve => { releaseSave = resolve; }) });
  await f.controller.check(); f.service.emit('update-downloaded', { version: '1.0.1' });
  const first = f.controller.install(); await f.controller.install();
  busy = true; releaseSave(); await first;
  assert.equal(f.calls().installs, 0); assert.equal(f.controller.getState().status, 'downloaded');
});

test('portable and unconfigured builds never touch update service', async t => {
  const portable = fixture(t, { environment: { PORTABLE_EXECUTABLE_FILE: 'C:\\Seaton.exe' } });
  assert.equal(portable.controller.getState().status, 'manual'); await portable.controller.check();
  assert.equal(portable.calls().checks, 0);
  const unconfigured = fixture(t, { configPath: path.join(os.tmpdir(), 'seaton-not-present.json') });
  assert.equal(unconfigured.controller.getState().status, 'unconfigured'); await unconfigured.controller.check();
  assert.equal(unconfigured.calls().checks, 0);
});

test('repository parsing accepts GitHub remotes and rejects URLs with credentials or other hosts', () => {
  for (const value of ['Chemtea/seaton', 'https://github.com/Chemtea/seaton.git', 'git@github.com:Chemtea/seaton.git']) assert.deepEqual(parseRepository(value), { owner: 'Chemtea', repo: 'seaton' });
  for (const value of ['https://token@github.com/Chemtea/seaton', 'https://example.com/a/b', 'Chemtea/..', 'a/b/c']) assert.equal(parseRepository(value), null);
});
