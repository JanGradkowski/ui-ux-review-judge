// Shared helpers for the review scripts. They read review.config.json, load Playwright from the project, and open a
// browser context at a given viewport, theme and language with the saved signed-in session. See references/scripts.md.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};
const DEFAULT_WIDTHS = [360, 390, 600, 820, 900, 1024, 1100, 1180, 1280, 1440];

function loadConfig(file) {
  if (!file) throw new Error('usage: node <script> <review.config.json> [options]');
  const configPath = path.resolve(file);
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const dir = path.dirname(configPath);
  const resolve = p => (p ? (path.isAbsolute(p) ? p : path.join(dir, p)) : p);
  if (!raw.baseUrl) throw new Error('review.config.json needs "baseUrl"');
  return {
    file: configPath,
    baseUrl: raw.baseUrl.replace(/\/$/, ''),
    projectDir: resolve(raw.projectDir) || process.cwd(),
    pages: raw.pages || ['/'],
    storageState: resolve(raw.storageState || 'state.json'),
    browser: { engine: 'chromium', ...(raw.browser || {}) },
    languages: raw.languages && raw.languages.length ? raw.languages : [null],
    language: { method: 'header', param: 'lang', ...(raw.language || {}) },
    themes: raw.themes && raw.themes.length ? raw.themes : ['light', 'dark'],
    theme: { method: 'colorScheme', ...(raw.theme || {}) },
    viewports: raw.viewports || DEFAULT_VIEWPORTS,
    probeWidths: raw.probeWidths || DEFAULT_WIDTHS,
    loginPattern: raw.loginPattern || '/login',
    waitFor: raw.waitFor || 'main',
    settleMs: raw.settleMs ?? 800,
    ignoreSelector: raw.ignoreSelector || '.visually-hidden, .sr-only, .screen-reader-text',
    collisionScopes: raw.collisionScopes || ['main'],
    tapScope: raw.tapScope || 'body',
    tapSelector: raw.tapSelector || 'a[href], button, [role=button], input:not([type=hidden]), select, textarea, summary',
    shots: raw.shots,
    signIn: raw.signIn,
    resolve,
  };
}

function playwright(config) {
  const entry = require.resolve('playwright', { paths: [config.projectDir, process.cwd()] });
  return require(entry);
}

async function launch(config) {
  const pw = playwright(config);
  const { engine, ...options } = config.browser;
  return pw[engine].launch(options);
}

function urlFor(config, route, lang) {
  const url = new URL(route, config.baseUrl + '/');
  if (lang && config.language.method === 'query') url.searchParams.set(config.language.param, lang);
  return url.toString();
}

// A context at one viewport, theme and language. Touch and mobile emulation apply below 800px.
async function openContext(browser, config, { viewport, theme, lang, signedIn = true }) {
  const touch = viewport.width < 800;
  const options = { viewport, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch };
  if (signedIn && config.storageState && fs.existsSync(config.storageState)) options.storageState = config.storageState;
  if (lang && config.language.method === 'header') options.extraHTTPHeaders = { 'Accept-Language': lang };
  if (theme && config.theme.method === 'colorScheme') options.colorScheme = theme;
  const context = await browser.newContext(options);
  if (lang && config.language.method === 'cookie') {
    await context.addCookies([{ name: config.language.param, value: lang, url: config.baseUrl }]);
  }
  if (theme && config.theme.method === 'localStorage') {
    await context.addInitScript(([key, value]) => { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } }, [config.theme.key, theme]);
  }
  if (theme && config.theme.method === 'replace') {
    // Rewrite the theme in each HTML document as it arrives, so the account's saved setting is never changed.
    const pattern = new RegExp(config.theme.pattern);
    const origin = new URL(config.baseUrl).origin;
    await context.route(url => new URL(url).origin === origin, async route => {
      const request = route.request();
      if (request.resourceType() !== 'document' || request.method() !== 'GET') return route.continue();
      const response = await route.fetch({ maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) return route.continue();
      const body = (await response.text()).replace(pattern, config.theme.replacement.split('{theme}').join(theme));
      return route.fulfill({ response, body });
    });
  }
  return context;
}

// Loads a page and waits for it to settle. Throws when the session has expired (the page redirected to sign-in).
// `css` (from --css: a rule or a .css file) is added to the page, to try a fix without editing files or restarting.
async function load(page, config, route, lang, css) {
  await page.goto(urlFor(config, route, lang));
  if (page.url().includes(config.loginPattern)) {
    throw new Error(`signed out: ${route} redirected to ${page.url()}. Delete the state file and run sign-in.cjs again.`);
  }
  await page.waitForSelector(config.waitFor, { timeout: 20000 }).catch(() => {});
  // A constructed stylesheet, because a strict Content Security Policy blocks injected <style> tags.
  if (css) await page.evaluate(rules => { const sheet = new CSSStyleSheet(); sheet.replaceSync(rules); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }, css);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(config.settleMs);
}

const trialCss = value => (typeof value !== 'string' ? null : fs.existsSync(value) ? fs.readFileSync(value, 'utf8') : value);

// Parses --name value and --flag options after the positional arguments.
function options(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true; else { out[key] = next; i++; }
    } else out._.push(argv[i]);
  }
  return out;
}

const list = (value, fallback) => (typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : fallback);

module.exports = { loadConfig, launch, openContext, load, urlFor, options, list, trialCss, DEFAULT_VIEWPORTS, DEFAULT_WIDTHS };
