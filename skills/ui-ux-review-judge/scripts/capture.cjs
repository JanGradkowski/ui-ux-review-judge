// Read-only: captures the review screenshot matrix for the judge.
// usage: node capture.cjs <review.config.json> <outDir> [--shots a,b] [--themes dark,light] [--viewports desktop,mobile]
//        [--langs en,pl] [--full]
// Every shot is taken in every theme and viewport in the first language. The other languages are taken in the first
// theme only, unless --full is given. Tall pages are cut into viewport-height slices (scrolled screenshots), so fixed
// and sticky parts sit where a reader sees them. Writes index-<lang>.txt and prints any console errors.
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, launch, openContext, load, options, list, trialCss, blockedSummary } = require('./lib.cjs');

const args = options(process.argv.slice(2));
const config = loadConfig(args._[0]);
const out = args._[1];
if (!out) throw new Error('usage: node capture.cjs <review.config.json> <outDir>');
fs.mkdirSync(out, { recursive: true });

const shots = (config.shots || config.pages.map(route => ({ name: route.replace(/^\/|\/$/g, '').replace(/[^\w-]+/g, '-') || 'index', path: route })))
  .filter(shot => !args.shots || list(args.shots).includes(shot.name));
const themes = list(args.themes, config.themes);
const viewportNames = list(args.viewports, Object.keys(config.viewports));
const langs = list(args.langs, config.languages);
const css = trialCss(args.css);
const MAX_PARTS = 12;

// Client-side steps only: nothing here may change data or settings. Use "click" only on disclosures, menus and tabs.
async function runSteps(page, steps = []) {
  for (const step of steps) {
    if (step.click) { const target = page.locator(step.click).first(); await target.scrollIntoViewIfNeeded(); await target.click(); }
    if (step.hover) await page.locator(step.hover).first().hover();
    if (step.focus) await page.locator(step.focus).first().focus();
    if (step.press) for (let i = 0; i < (step.times || 1); i++) await page.keyboard.press(step.press);
    if (step.scrollTo) await page.locator(step.scrollTo).first().scrollIntoViewIfNeeded();
    if (step.wait) await page.waitForTimeout(step.wait);
    await page.waitForTimeout(step.settle ?? 250);
  }
}

(async () => {
  const browser = await launch(config);
  const errors = [];
  const index = {};
  for (const [langIndex, lang] of langs.entries()) {
    const langThemes = langIndex === 0 || args.full ? themes : themes.slice(0, 1);
    for (const theme of langThemes) {
      for (const label of viewportNames) {
        const viewport = config.viewports[label];
        if (!viewport) throw new Error(`unknown viewport "${label}"`);
        const context = await openContext(browser, config, { viewport, theme, lang });
        for (const shot of shots) {
          if (shot.viewports && !shot.viewports.includes(label)) continue;
          if (shot.themes && !shot.themes.includes(theme)) continue;
          const page = await context.newPage();
          const where = `${shot.name} ${theme} ${label}${lang ? ' ' + lang : ''}`;
          page.on('console', message => { if (message.type() === 'error') errors.push(`${where}: ${message.text()}`); });
          page.on('pageerror', error => errors.push(`${where}: ${error.message}`));
          try {
            await load(page, config, shot.path, lang, css);
            await runSteps(page, shot.steps);
            const base = `${shot.name}--${theme}--${label}${lang && langIndex > 0 ? '--' + lang : ''}`;
            const files = (index[lang || 'default'] ||= []);
            // "viewport" (the default for shots with steps) shows the screen as the user sees it after the steps;
            // "slices" (the default otherwise) covers the whole page.
            const mode = shot.mode || (shot.steps && shot.steps.length ? 'viewport' : 'slices');
            if (mode === 'viewport') {
              await page.screenshot({ path: path.join(out, `${base}.png`) });
              files.push(`${base}.png`);
            } else {
              const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
              const parts = Math.min(MAX_PARTS, Math.max(1, Math.ceil((height - 40) / viewport.height)));
              for (let i = 0; i < parts; i++) {
                await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), i * viewport.height);
                await page.waitForTimeout(200);
                const file = parts === 1 ? `${base}.png` : `${base}--part${i + 1}of${parts}.png`;
                await page.screenshot({ path: path.join(out, file) });
                files.push(file);
              }
            }
          } catch (error) {
            if (/signed out/.test(error.message)) throw error;
            errors.push(`${where}: capture failed: ${error.message.split('\n')[0]}`);
          }
          await page.close();
        }
        await context.close();
      }
    }
  }
  await browser.close();
  let total = 0;
  for (const [lang, files] of Object.entries(index)) {
    fs.writeFileSync(path.join(out, `index-${lang}.txt`), files.join('\n') + '\n');
    total += files.length;
  }
  console.log(`${total} images in ${out}`);
  console.log(blockedSummary());
  console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
})().catch(error => { console.error(error.message || error); process.exit(1); });
