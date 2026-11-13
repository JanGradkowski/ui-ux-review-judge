// Read-only: finds layout breakage before a judge does. For each page, language and probe width it reports:
//   overlap   text from two different elements drawn on top of each other inside one scope;
//   spills    text running out of a box that doesn't scroll or clip (a fixed-height pill that wrapped);
//   past      an element sticking out past the right edge of its scope;
//   page      the page scrolling sideways.
// Text cut short with an ellipsis is listed as a note, since it is often deliberate.
// usage: node collision-probe.cjs <review.config.json> [--pages /a,/b] [--langs en,pl] [--widths 360,1440] [--height 900]
//        [--css "<rule>" | --css trial.css]   (try a fix without editing files or restarting the server)
const { loadConfig, launch, openContext, load, options, list, trialCss } = require('./lib.cjs');

const args = options(process.argv.slice(2));
const config = loadConfig(args._[0]);
const css = trialCss(args.css);
const pages = list(args.pages, config.pages);
const langs = list(args.langs, config.languages);
const widths = list(args.widths, config.probeWidths).map(Number);
const height = Number(args.height || 900);

(async () => {
  const browser = await launch(config);
  let problems = 0;
  for (const route of pages) for (const lang of langs) for (const width of widths) {
    const context = await openContext(browser, config, { viewport: { width, height }, theme: config.themes[0], lang });
    const page = await context.newPage();
    await load(page, config, route, lang, css);
    const { found, notes, checked } = await page.evaluate(({ scopes, ignore }) => {
      const out = [];
      const cut = [];
      let checked = 0;
      const ignored = el => !el || el.closest(ignore) || (() => { const r = el.getBoundingClientRect(); return r.width <= 1 || r.height <= 1; })();
      const label = text => `"${text.trim().replace(/\s+/g, ' ').slice(0, 28)}"`;
      const lineBoxes = root => {
        const boxes = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const el = node.parentElement;
          if (!node.nodeValue.trim() || !el || !el.checkVisibility?.({ visibilityProperty: true }) || ignored(el)) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) boxes.push({ r, text: node.nodeValue, el });
        }
        return boxes;
      };
      for (const selector of scopes) for (const scope of document.querySelectorAll(selector)) {
        if (!scope.checkVisibility?.()) continue;
        checked++;
        const boxes = lineBoxes(scope);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.el === b.el) continue;
          const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (x > 2 && y > 2) out.push(`overlap ${label(a.text)} × ${label(b.text)}`);
        }
        const scopeRight = scope.getBoundingClientRect().right;
        for (const el of scope.querySelectorAll('*')) {
          if (!el.checkVisibility?.() || ignored(el)) continue;
          const style = getComputedStyle(el);
          if (!el.children.length && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2
              && style.overflowY === 'visible' && !/\d/.test(style.webkitLineClamp || '')) {
            out.push(`spills ${label(el.textContent)} ${el.scrollHeight}>${el.clientHeight}px`);
          }
          if (el.getBoundingClientRect().right > scopeRight + 1) {
            // Inside a sideways scroller or a clipping box (the scope included), sticking out is by design.
            const clipped = [...ancestors(el, scope)].some(a => getComputedStyle(a).overflowX !== 'visible');
            if (!clipped) out.push(`past ${label(el.textContent || el.tagName)} by ${Math.round(el.getBoundingClientRect().right - scopeRight)}px`);
          }
          if (style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) cut.push(label(el.textContent));
        }
      }
      function* ancestors(el, stop) { for (let a = el.parentElement; a; a = a.parentElement) { yield a; if (a === stop) return; } }
      const wider = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      if (wider > 0) out.push(`page scrolls sideways by ${wider}px`);
      return { found: [...new Set(out)], notes: [...new Set(cut)], checked };
    }, { scopes: config.collisionScopes, ignore: config.ignoreSelector });
    problems += found.length;
    if (!checked) { problems++; found.push('no visible scope matched collisionScopes: nothing was checked'); }
    const where = `${route} ${lang || ''} ${width} (${checked} scopes)`.replace(/\s+/g, ' ');
    console.log(where, found.length ? found.join(' | ') : 'clean', notes.length ? `(cut with ellipsis: ${notes.slice(0, 6).join(', ')}${notes.length > 6 ? ', …' : ''})` : '');
    await context.close();
  }
  await browser.close();
  console.log(problems ? `${problems} problems` : 'no problems');
  process.exitCode = problems ? 2 : 0;
})().catch(error => { console.error(error.message || error); process.exit(1); });
