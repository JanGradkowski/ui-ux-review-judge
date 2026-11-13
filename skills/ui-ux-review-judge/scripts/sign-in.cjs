// Signs in once with the project's local test account and saves the session for the other scripts and the judge. This is
// the only script that submits anything, so only the main agent runs it, never the judge, and only against a local or
// test server with a test account. Credentials are read from a local properties file and never printed. Sign-in is
// often rate-limited: run this once per server start, not per script.
// usage: node sign-in.cjs <review.config.json>
// config.signIn: { "path": "/login", "credentials": "<.properties file>",
//                  "fields": { "<input selector>": "<property name>", ... }, "submit": "<selector to press Enter in>" }
const fs = require('node:fs');
const { loadConfig, launch, urlFor } = require('./lib.cjs');

const config = loadConfig(process.argv[2]);
const signIn = config.signIn;
if (!signIn || !signIn.credentials || !signIn.fields) throw new Error('review.config.json needs "signIn" with "credentials" and "fields"');
const host = new URL(config.baseUrl).hostname;
if (!/^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|\.test$/.test(host) && !signIn.allowHost) {
  throw new Error(`refusing to sign in to ${host}: use a local review server, or set signIn.allowHost for a named test environment`);
}
const properties = Object.fromEntries(fs.readFileSync(config.resolve(signIn.credentials), 'utf8').split(/\r?\n/)
  .filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));

(async () => {
  const browser = await launch(config);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(urlFor(config, signIn.path || config.loginPattern));
  for (const [selector, key] of Object.entries(signIn.fields)) {
    if (!(key in properties)) throw new Error(`property "${key}" is missing from the credentials file`);
    await page.fill(selector, properties[key]);
  }
  const submit = signIn.submit || Object.keys(signIn.fields).pop();
  await Promise.all([
    page.waitForURL(url => !String(url).includes(config.loginPattern), { timeout: 20000 }).catch(() => {}),
    page.press(submit, 'Enter'),
  ]);
  if (page.url().includes(config.loginPattern)) {
    await browser.close();
    throw new Error('still on the sign-in page: wrong test credentials, or the sign-in limit was hit (wait before retrying)');
  }
  await context.storageState({ path: config.storageState });
  console.log(`signed in; session saved to ${config.storageState}`);
  await browser.close();
})().catch(error => { console.error(error.message || error); process.exit(1); });
