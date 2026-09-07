'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const projectRoot = path.resolve(__dirname, '..');

function parseRepository(input) {
  const value = String(input || '').trim();
  const match = value.match(/^(?:https:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!match || match[2] === '.' || match[2] === '..') return null;
  return { owner: match[1], repo: match[2] };
}

function resolveRepository(env = process.env, cwd = projectRoot) {
  const configured = env.SEATON_UPDATE_REPOSITORY || env.GITHUB_REPOSITORY || env.GH_REPOSITORY;
  if (configured) {
    const parsed = parseRepository(configured);
    if (!parsed) throw new Error('업데이트 저장소는 GitHub의 OWNER/REPO 형식이어야 합니다.');
    return parsed;
  }
  try {
    return parseRepository(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { /* Source archives may not contain git metadata. */ }
  try {
    const planned = JSON.parse(fs.readFileSync(path.join(cwd, 'release-repository.json'), 'utf8'));
    const parsed = parseRepository(planned.repository);
    return parsed ? { ...parsed, awaitingFirstRelease: planned.awaitingFirstRelease === true } : null;
  } catch { return null; }
}

function prepareUpdateConfig(env = process.env, cwd = projectRoot) {
  const repo = resolveRepository(env, cwd);
  const config = repo ? { schema: 1, configured: true, ...repo, releaseUrl: `https://github.com/${repo.owner}/${repo.repo}/releases/latest` } : { schema: 1, configured: false };
  fs.mkdirSync(path.join(cwd, 'build'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'build', 'update-config.json'), JSON.stringify(config, null, 2) + '\n');
  return config;
}

if (require.main === module) {
  const config = prepareUpdateConfig();
  console.log(config.configured ? `업데이트 배포 경로: ${config.owner}/${config.repo}` : 'GitHub 저장소가 연결되지 않았습니다. 이 빌드의 자동 업데이트는 비활성화됩니다.');
}
module.exports = { parseRepository, resolveRepository, prepareUpdateConfig };
