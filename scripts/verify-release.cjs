'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const tag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || `v${version}`;
if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${version}`) throw new Error(`태그 ${tag}와 package.json 버전 ${version}이 일치하지 않습니다.`);
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== version || lock.packages[''].version !== version) throw new Error('package-lock.json 버전을 먼저 동기화해 주세요.');
if (process.env.GITHUB_ACTIONS) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const tagCommit = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  if (commit !== tagCommit) throw new Error('빌드 커밋이 선택한 태그의 커밋과 다릅니다.');
}
console.log(`릴리스 버전 확인 완료: ${tag}`);
