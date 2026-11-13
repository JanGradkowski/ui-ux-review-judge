// Read-only: for every visible control, does a tap near its top, middle and bottom land on that control? A miss means
// another element covers it, or a neighbour's tap area overlaps it. Also lists controls smaller than 24×24 CSS px
// (WCAG 2.2 target size), except links inside running text.
// usage: node tap-probe.cjs <review.config.json> [--pages /a,/b] [--langs en,pl] [--widths 360,390,820,1180,1440]
//        [--css "<rule>" | --css trial.css]   (try a fix without editing files or restarting the server)
const { loadConfig, launch, openContext, load, options, list, trialCss } = require('./lib.cjs');

const args = options(process.argv.slice(2));
const config = loadConfig(args._[0]);
const css = trialCss(args.css);
const pages = list(args.pages, config.pages);
const langs = list(args.langs, config.languages);
const widths = list(args.widths, ['360', '390', '820', '1180', '1440']).map(Number);

(async () => {
  const browser = await launch(config);
  let bad = 0;
  for (const route of pages) for (const lang of langs) for (const width of widths) {
    const context = await openContext(browser, config, { viewport: { width, height: 900 }, theme: config.themes[0], lang });
    const page = await context.newPage();
    await load(page, config, route, lang, css);
    const { misses, small, checked } = await page.evaluate(async ({ scope, selector, ignore }) => {
      const misses = [];
      const small = [];
      let checked = 0;
      const label = el => `"${(el?.textContent || el?.getAttribute?.('aria-label') || el?.tagName || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
      const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      for (const root of document.querySelectorAll(scope)) for (const el of root.querySelectorAll(selector)) {
        if (!el.checkVisibility?.({ visibilityProperty: true }) || el.closest(ignore) || el.disabled) continue;
        let r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        // Instant scrolling: smooth scrolling would move the element between scrolling and hit testing.
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        await frame();
        r = el.getBoundingClientRect();
        checked++;
        const x = r.left + Math.min(12, r.width / 2);
        for (const y of [r.top + 2, r.top + r.height / 2, r.bottom - 2]) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(hit === el || el.contains(hit) || hit.closest('label') === el.closest('label') && el.closest('label'))) {
            misses.push(`${label(el)} at ${Math.round(y - r.top)}px hits ${label(hit)}`);
          }
        }
        const inline = getComputedStyle(el).display === 'inline' && el.closest('p, li, td, dd, figcaption');
        if (!inline && (r.width < 24 || r.height < 24)) small.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return { misses: [...new Set(misses)], small: [...new Set(small)], checked };
    }, { scope: config.tapScope, selector: config.tapSelector, ignore: config.ignoreSelector });
    bad += misses.length + small.length;
    const where = `${route} ${lang || ''} ${width} (${checked} controls)`.replace(/\s+/g, ' ');
    console.log(where, misses.length ? `misses: ${misses.join(' | ')}` : 'all taps land', small.length ? `| under 24px: ${small.join(', ')}` : '');
    await context.close();
  }
  await browser.close();
  console.log(bad ? `${bad} problems` : 'no problems');
  process.exitCode = bad ? 2 : 0;
})().catch(error => { console.error(error.message || error); process.exit(1); });
