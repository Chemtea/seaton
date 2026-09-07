'use strict';

// Build-only Linux adapter for the pinned electron-builder 26.15.3.
// The stock NSIS target executes an intermediate Windows program only to write
// its embedded uninstaller. electron-builder already provides a static PE/NSIS
// reader for macOS. Use that exact reader on Linux, without executing an EXE.
// Windows release builds keep the stock pipeline; this file is never packaged.
if (process.platform === 'linux') {
  const path = require('node:path');
  const { WineVmManager } = require('app-builder-lib/out/vm/WineVm');
  const { UninstallerReader } = require('app-builder-lib/out/targets/nsis/nsisUtil');
  const original = WineVmManager.prototype.exec;
  const outputDir = path.resolve(__dirname, '..', 'dist');
  WineVmManager.prototype.exec = async function (file, args = [], options = {}, ...rest) {
    const target = path.resolve(file);
    const eligible = path.dirname(target) === outputDir
      && /^Seaton-Setup-\d+\.\d+\.\d+-x64\.exe$/.test(path.basename(target))
      && args.length === 0
      && options.env?.__COMPAT_LAYER === 'RunAsInvoker';
    if (!eligible) return original.call(this, file, args, options, ...rest);
    const uninstaller = path.join(outputDir, `${path.basename(target, 'exe')}__uninstaller.exe`);
    await UninstallerReader.exec(target, uninstaller);
    console.log('  • extracted NSIS uninstaller with electron-builder static reader (no EXE execution)');
    return '';
  };
}
