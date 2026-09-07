'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { prepareUpdateConfig } = require('./scripts/prepare-update.cjs');
const feed = prepareUpdateConfig();

module.exports = {
  appId: 'kr.seaton.desktop',
  productName: '자리온',
  executableName: 'Seaton',
  asar: true,
  npmRebuild: false,
  toolsets: { wine: '1.0.1' },
  directories: { output: 'dist', buildResources: 'build' },
  files: ['app/**/*', 'desktop/**/*', 'package.json', '!**/*.test.cjs'],
  extraResources: [{ from: 'build/update-config.json', to: 'update-config.json' }],
  publish: feed.configured ? [{ provider: 'github', owner: feed.owner, repo: feed.repo, releaseType: 'release' }] : null,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }],
    artifactName: 'Seaton-${version}-${arch}.${ext}',
    // No certificate is embedded. Supply CSC_LINK/CSC_KEY_PASSWORD on the build runner to sign.
    signAndEditExecutable: process.platform === 'win32' || Boolean(process.env.CSC_LINK),
    ...(fs.existsSync(path.join(__dirname, 'build', 'icon.ico')) ? { icon: 'build/icon.ico' } : {}),
  },
  nsis: {
    artifactName: 'Seaton-Setup-${version}-${arch}.${ext}',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '자리온',
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    differentialPackage: true,
  },
  portable: { artifactName: 'Seaton-Portable-${version}-${arch}.${ext}' },
};
