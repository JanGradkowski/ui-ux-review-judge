// Tests for the bundled scripts. A small server serves a clean fixture page and a deliberately broken one with a strict
// Content Security Policy; the probes must pass the first and catch every planted problem in the second.
// verify_judge.py is checked against synthetic judge transcripts.
// Env: PW_CHANNEL=msedge|chrome to use an installed browser; PLAYWRIGHT_PROJECT_DIR to load Playwright from elsewhere;
// PYTHON to pick the Python executable.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'skills', 'ui-ux-review-judge', 'scripts');
const FIXTURES = path.join(__dirname, 'fixtures');
const OUT = path.join(__dirname, '.out');
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css' };

let server;
let baseUrl;

function run(command, args) {
  return new Promise(resolve => {
    execFile(command, args, { cwd: OUT, timeout: 240000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr, out: stdout + stderr });
    });
  });
}

function config(name, overrides = {}) {
  const file = path.join(OUT, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({
    baseUrl,
    projectDir: process.env.PLAYWRIGHT_PROJECT_DIR || ROOT,
    browser: { engine: 'chromium', ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
    languages: ['en', 'de'],
    themes: ['light', 'dark'],
    waitFor: 'main',
    settleMs: 100,
    collisionScopes: ['.card', 'header'],
    tapScope: 'body',
    ...overrides,
  }, null, 2));
  return file;
}

const node = (script, ...args) => run(process.execPath, [path.join(SCRIPTS, script), ...args]);

before(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/private') { response.writeHead(302, { Location: '/login' }); return response.end(); }
    const file = url.pathname === '/login' ? 'clean.html' : url.pathname.slice(1);
    const full = path.join(FIXTURES, path.normalize(file));
    if (!full.startsWith(FIXTURES) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { response.writeHead(404); return response.end(); }
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream',
      // No inline styles allowed: the scripts' --css has to work under a strict policy.
      'Content-Security-Policy': "default-src 'self'",
    });
    fs.createReadStream(full).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

test('collision probe passes the clean page', async () => {
  const result = await node('collision-probe.cjs', config('clean', { pages: ['/clean.html'] }), '--widths', '390,1280');
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /no problems/);
  assert.match(result.out, /\(\d+ scopes\)/);
});

test('collision probe catches every planted layout problem', async () => {
  const result = await node('collision-probe.cjs', config('broken', { pages: ['/broken.html'] }), '--widths', '390', '--langs', 'en');
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /overlap "Apple Inc\." × "NEW SIGNAL"|overlap "NEW SIGNAL" × "Apple Inc\."/);
  assert.match(result.out, /spills "35 unread items"/);
  assert.match(result.out, /past "MSFT,2026-11-13/);
  assert.match(result.out, /page scrolls sideways by \d+px/);
});

test('collision probe reports when its scopes match nothing', async () => {
  const result = await node('collision-probe.cjs', config('noscope', { pages: ['/clean.html'], collisionScopes: ['.missing'] }), '--widths', '390', '--langs', 'en');
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /nothing was checked/);
});

test('--css applies a trial stylesheet despite a strict CSP', async () => {
  const css = '.pill { height: 10px; width: 30px; white-space: normal; line-height: 10px; }';
  const result = await node('collision-probe.cjs', config('trial', { pages: ['/clean.html'] }), '--widths', '390', '--langs', 'en', '--css', css);
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /spills "3 unread"/);
});

test('tap probe passes the clean page', async () => {
  const result = await node('tap-probe.cjs', config('clean-tap', { pages: ['/clean.html'] }), '--widths', '390,1280');
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /all taps land/);
  assert.match(result.out, /\([1-9]\d* controls\)/);
});

test('tap probe catches a covered control and a tiny one', async () => {
  const result = await node('tap-probe.cjs', config('broken-tap', { pages: ['/broken.html'] }), '--widths', '390', '--langs', 'en');
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /misses: .*"Covered"/);
  assert.match(result.out, /under 24px: .*"×" 16×16/);
});

test('probes stop when the session has expired', async () => {
  const result = await node('collision-probe.cjs', config('signed-out', { pages: ['/private'] }), '--widths', '390', '--langs', 'en');
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /signed out/);
});

test('capture writes the matrix, state shots and an index per language', async () => {
  const shots = [
    { name: 'clean', path: '/clean.html' },
    { name: 'clean-skip-link', path: '/clean.html', steps: [{ press: 'Tab' }] },
  ];
  const dir = path.join(OUT, 'shots');
  const result = await node('capture.cjs', config('capture', { shots }), dir, '--viewports', 'mobile');
  assert.equal(result.code, 0, result.out);
  const en = fs.readFileSync(path.join(dir, 'index-en.txt'), 'utf8').trim().split('\n');
  const de = fs.readFileSync(path.join(dir, 'index-de.txt'), 'utf8').trim().split('\n');
  // First language: both themes. Other languages: the first theme only, unless --full.
  assert.ok(en.some(f => /^clean--light--mobile(--part1of\d+)?\.png$/.test(f)), en.join(' '));
  assert.ok(en.some(f => /^clean--dark--mobile(--part1of\d+)?\.png$/.test(f)), en.join(' '));
  assert.ok(en.includes('clean-skip-link--light--mobile.png'), en.join(' '));
  assert.ok(de.every(f => f.includes('--light--') && f.includes('--de')), de.join(' '));
  for (const file of [...en, ...de]) assert.ok(fs.statSync(path.join(dir, file)).size > 1000, file);
});

// ---------------------------------------------------------------- verify_judge.py

function transcript(id, blocks) {
  const dir = path.join(OUT, 'projects', 'project', 'session', 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  const lines = blocks.map(block => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [block] } }));
  fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), lines.join('\n') + '\n');
}
const tool = (name, input) => ({ type: 'tool_use', name, input });
const verify = (id, ...args) => run(PYTHON, [path.join(SCRIPTS, 'verify_judge.py'), id, '--projects', path.join(OUT, 'projects'), ...args]);
const JUDGE_DIR = path.join(OUT, 'judge');

test('verify_judge accepts a judge that used the skill first and stayed read-only', async () => {
  transcript('good', [
    tool('Skill', { skill: 'design:design-critique' }),
    tool('Read', { file_path: path.join(OUT, 'shots', 'home--light--mobile.png') }),
    tool('Write', { file_path: path.join(JUDGE_DIR, 'probe.cjs'), content: "await page.goto(url); if (page.url().includes('/login')) process.exit(0);" }),
    tool('SubagentHandback', { message: '## Design critique\n...\n**Score: 8.4/10**. Rests on the layout.' }),
  ]);
  const result = await verify('good', '--allow', JUDGE_DIR);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /SKILL: ok/);
  assert.match(result.out, /score: 8\.4\/10/);
  assert.match(result.out, /flags: none/);
});

test('verify_judge rejects a judge that never invoked the skill', async () => {
  transcript('missing', [tool('Read', { file_path: 'a.png' }), { type: 'text', text: 'Score: 9.5/10' }]);
  const result = await verify('missing');
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /SKILL: MISSING/);
});

test('verify_judge rejects a skill call made after looking at screenshots', async () => {
  transcript('late', [tool('Read', { file_path: 'a.png' }), tool('Skill', { skill: 'design:design-critique' }), { type: 'text', text: 'Score: 8/10' }]);
  const result = await verify('late');
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, /SKILL: LATE/);
});

test('verify_judge flags writes outside its folder and non-GET requests', async () => {
  transcript('risky', [
    tool('Skill', { skill: 'design:design-critique' }),
    tool('Bash', { command: 'curl -X POST http://localhost:3000/api/settings -d theme=dark' }),
    tool('Edit', { file_path: path.join(ROOT, 'README.md'), old_string: 'a', new_string: 'b' }),
    tool('Write', { file_path: path.join(JUDGE_DIR, 'login.cjs'), content: "await page.goto(base + '/login'); await page.fill('#password', x);" }),
    { type: 'text', text: 'Overall score 7.5 / 10' },
  ]);
  const result = await verify('risky', '--allow', JUDGE_DIR);
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /non-GET request/);
  assert.match(result.out, /outside the allowed folder/);
  assert.match(result.out, /sign-in or sign-out/);
  assert.match(result.out, /types into fields/);
  assert.match(result.out, /score: 7\.5\/10/);
});
