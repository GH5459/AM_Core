const assert = require('node:assert/strict');
const { validate, caseRepositories } = require('./xiaoye-runtime-tools.cjs');
for (const [key, repository] of Object.entries(caseRepositories)) {
  validate('attach_artifact', { artifact_type: 'pull_request', url: `https://github.com/${repository}/pull/123` }, key);
  const wrong = repository === 'GH5459/AM_Core' ? 'GH5459/DailyLog' : 'GH5459/AM_Core';
  assert.throws(() => validate('attach_artifact', { artifact_type: 'pull_request', url: `https://github.com/${wrong}/pull/123` }, key));
  const [owner, repo] = repository.split('/');
  validate('pull_requests_checks', { pullRequest: { hostname: 'github.com', owner, repository: repo } });
}
for (const url of ['https://github.com/GH5459/AM_Core/pull/123?x=1', 'https://github.com/GH5459/AM_Core/pull/123/../../DailyLog/pull/2', 'http://github.com/GH5459/AM_Core/pull/123', 'https://github.com.evil/GH5459/AM_Core/pull/123']) {
  assert.throws(() => validate('attach_artifact', { artifact_type: 'pull_request', url }, 'am'));
}
assert.throws(() => validate('attach_artifact', { artifact_type: 'pull_request', url: 'https://github.com/GH5459/AM_Core/pull/123' }));
console.log(JSON.stringify({ serviceKeys: Object.keys(caseRepositories).length, uniqueRepositories: new Set(Object.values(caseRepositories)).size, crossRepoAndUrlGuards: 'passed' }));
