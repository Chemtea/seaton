'use strict';

// Windows-only, real Chromium DOM/CSS regression check with a synthetic IPC
// fixture. Run with `node scripts/verify-ui.cjs` after npm ci. It intentionally
// does not test native printing, production storage, or update installation.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.platform !== 'win32') {
  console.error('The native UI check must run on Windows.');
  process.exit(1);
}

if (!process.versions.electron) {
  const {spawn} = require('node:child_process');
  const child = spawn(require('electron'), [__filename], {stdio: 'inherit', windowsHide: true});
  const watchdog = setTimeout(() => {child.kill(); process.exit(1);}, 25000);
  child.once('error', error => {clearTimeout(watchdog); console.error(error); process.exit(1);});
  child.once('exit', code => {clearTimeout(watchdog); process.exit(code === 0 ? 0 : 1);});
} else {
  const {app, BrowserWindow} = require('electron');
  const output = path.join(__dirname, '../dist/ui-check');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'seaton-ui-check-'));
  app.setPath('userData', profile);
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.disableHardwareAcceleration();
  fs.mkdirSync(output, {recursive: true});
  let window;
  let ended = false;
  const report = {platform: process.platform, electron: process.versions.electron, checks: [], screenshots: []};
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const evaluate = (fn, ...args) => window.webContents.executeJavaScript('(' + fn.toString() + ')(' + args.map(value => JSON.stringify(value)).join(',') + ')');
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    report.checks.push(label);
    console.log('PASS ' + label);
  };
  async function until(fn, label) {
    const start = Date.now();
    while (Date.now() - start < 2500) {
      if (await evaluate(fn)) return;
      await sleep(35);
    }
    throw new Error('Timed out: ' + label);
  }
  async function screenshot(name) {
    await sleep(100);
    const capture = await window.webContents.capturePage();
    if (capture.isEmpty()) throw new Error('The UI screenshot is empty.');
    fs.writeFileSync(path.join(output, name + '.png'), capture.toPNG());
    report.screenshots.push(name + '.png');
  }
  async function finish(error) {
    if (ended) return;
    ended = true;
    clearTimeout(watchdog);
    if (error) {
      report.error = error.stack || String(error);
      console.error(report.error);
      try {if (window && !window.isDestroyed()) await screenshot('failure');} catch {}
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    app.exit(error ? 1 : 0);
  }
  const watchdog = setTimeout(() => finish(new Error('Native UI check exceeded 18 seconds.')), 18000);
  process.on('uncaughtException', finish);
  process.on('unhandledRejection', finish);
  app.whenReady().then(async () => {
    window = new BrowserWindow({width: 1366, height: 900, useContentSize: true, show: false,
      webPreferences: {preload: path.join(__dirname, 'verify-ui-preload.cjs'), nodeIntegration: false,
        contextIsolation: true, sandbox: true, backgroundThrottling: false}});
    window.webContents.on('render-process-gone', (_event, details) => finish(new Error('Renderer exited: ' + details.reason)));
    window.webContents.on('did-fail-load', (_event, code, description) => finish(new Error('Load failed: ' + code + ' ' + description)));
    await window.loadFile(path.join(__dirname, '../app/index.html'));
    await until(() => document.querySelector('.app-version').textContent === 'vUI-CHECK' &&
      document.querySelectorAll('.sg-editor-room .sg-seat-name').length === 26, 'application initialization');
    check(await evaluate(() => document.querySelector('.sp-private').hidden), 'private preparation starts hidden');
    const typography = await evaluate(() => {
      const names = [...document.querySelectorAll('.sg-editor-room .sg-seat-name')];
      const styles = names.map(name => ({size: parseFloat(getComputedStyle(name).fontSize),
        weight: parseInt(getComputedStyle(name).fontWeight, 10), font: getComputedStyle(name).fontFamily,
        color: getComputedStyle(name).color, visible: name.getBoundingClientRect().width > 0}));
      return {width: innerWidth, height: innerHeight, names: styles};
    });
    report.typography = typography;
    check(typography.width === 1366 && typography.height === 900, 'desktop viewport is 1366 by 900 CSS pixels');
    check(typography.names.every(name => name.size >= 19 && name.weight >= 700 && name.visible), 'all student names are visible, at least 19px and bold');
    await screenshot('01-public');

    await evaluate(() => document.querySelector('.sp-settings-open').click());
    check(await evaluate(() => !document.querySelector('.sp-auth').hidden && document.querySelector('.sp-private').hidden), 'normal settings asks for PIN without revealing private controls');
    await evaluate(() => {document.querySelector('#sp-pin').value = '123456'; document.querySelector('.sp-auth-form').requestSubmit();});
    await until(() => !document.querySelector('.sg-sidebar').hidden, 'normal settings unlock');
    check(await evaluate(() => document.querySelector('.sp-private').hidden &&
      document.querySelector('.sp-assignments').childElementCount === 0 &&
      document.querySelector('.sr-preset-status').textContent === '' &&
      !/준비 배정|자리별 학생 지정|Ctrl \+/.test(document.body.innerText)), 'normal editor contains no visible preparation controls or status');
    await screenshot('02-normal-editor');
    await evaluate(() => {for (let i = 0; i < 4; i++) document.querySelector('.sp-private-trigger').click();});
    check(await evaluate(() => document.querySelector('.sp-auth').hidden && document.querySelector('.sp-private').hidden), 'four brand clicks do not open preparation');
    await evaluate(() => document.querySelector('.sp-private-trigger').click());
    check(await evaluate(() => !document.querySelector('.sp-auth').hidden && document.querySelector('.sp-private').hidden &&
      document.querySelector('#sp-pin').value === '' && window.seatonUiFixture.inspect().unlockCount === 1), 'fifth brand click requires fresh PIN even after settings unlock');
    await evaluate(() => {document.querySelector('#sp-pin').value = '123456'; document.querySelector('.sp-auth-form').requestSubmit();});
    await until(() => !document.querySelector('.sp-private').hidden, 'private PIN unlock');
    check(await evaluate(() => document.querySelectorAll('.sp-assignments select').length === 28 &&
      window.seatonUiFixture.inspect().unlockCount === 2), 'fresh PIN opens per-seat preparation selectors');
    const privateNameFit = await evaluate(() => [...document.querySelectorAll('.sp-private-room .sg-seat:not(.sg-empty)')].map(seat => {
      const name = seat.querySelector('.sg-seat-name');
      const outer = seat.getBoundingClientRect(), inner = name.getBoundingClientRect();
      return {name: name.textContent, width: inner.width, height: inner.height, seatWidth: seat.clientWidth,
        seatHeight: seat.clientHeight, fits: inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
          inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 && name.scrollWidth <= seat.clientWidth + 1};
    }));
    report.privateNameFit = privateNameFit;
    check(privateNameFit.every(name => name.fits), 'private names, seat numbers, and duplicate labels fit within their desks');
    await screenshot('03-private-editor');
    await evaluate(() => document.querySelector('.sp-discard').click());
    check(await evaluate(() => document.querySelector('.sp-private').hidden &&
      document.querySelector('.sp-assignments').childElementCount === 0 &&
      document.querySelector('.sp-private-room').childElementCount === 0 &&
      document.querySelector('.sr-preset-status').textContent === '' &&
      document.querySelector('.sp-draft-status').textContent === ''), 'closing preparation clears private names, status, and geometry from DOM');

    await evaluate(() => {
      document.querySelector('.sg-settings').open = true;
      document.querySelector('#sg-group-tab').click();
      const front = document.querySelector('[aria-label="1모둠 추가석 위치"]');
      const back = document.querySelector('[aria-label="2모둠 추가석 위치"]');
      front.value = 'front'; front.dispatchEvent(new Event('change', {bubbles: true}));
      back.value = 'back'; back.dispatchEvent(new Event('change', {bubbles: true}));
      document.querySelector('.sg-apply').click();
    });
    const positions = await evaluate(() => {
      const seats = [...document.querySelectorAll('.sg-editor-room [data-seat-id]')];
      return ['fixture-5', 'fixture-10'].map(id => {
        const start = id === 'fixture-5' ? 1 : 6;
        const points = Array.from({length: 5}, (_, index) => {
          const seat = seats.find(item => item.dataset.seatId === 'fixture-' + (start + index));
          return {x: parseFloat(seat.style.left), y: parseFloat(seat.style.top)};
        });
        return {base: points.slice(0, 4), extra: points[4]};
      });
    });
    report.groupPositions = positions;
    check(positions[0].base.every(point => positions[0].extra.y < point.y), 'first five-member group places extra seat toward the board');
    check(positions[1].base.every(point => positions[1].extra.y > point.y), 'second five-member group places extra seat behind the four seats');
    check(positions.every(group => Math.abs(group.extra.x - group.base.reduce((sum, point) => sum + point.x, 0) / 4) < 0.001), 'front and back seats are centered on their own group');
    await screenshot('04-front-back-groups');
    await evaluate(() => document.querySelector('.sg-public-toggle').click());
    check(await evaluate(() => document.querySelectorAll('.sg-editor-room .sg-seat').length === 26 &&
      document.querySelector('.sg-sidebar').hidden && document.querySelector('.sp-private').hidden), 'returning to public view hides unused temporary seats and all preparation');
    await screenshot('05-public-front-back');
    report.rendererErrors = await evaluate(() => window.seatonUiFixture.inspect().rendererErrors);
    check(report.rendererErrors.length === 0, 'renderer has no uncaught errors or unhandled rejections');
    await finish();
  }).catch(finish);
}
