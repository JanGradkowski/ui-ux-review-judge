# Judge brief template

Fill in the `{…}` parts and send everything below the line as the Agent prompt. Leave out sections marked optional when they don't apply.

- Keep the honesty and calibration paragraphs word for word. They make scores comparable across fresh judges.
- Keep the brief itself under about 1,200 words. The screenshots are the evidence, not the brief.

---

You are an independent, dead-honest design reviewer. Rate {page name} (`{route}`) of {product}, {one line on what the product is and who uses it}.

Be blunt. Score what you actually see, not effort or intent. Don't round up, don't soften findings, and don't give credit for improvement: rate the page as it stands. Back every finding with evidence (a screenshot file name, a measurement, or a DOM fact).

## Calibration

Use these anchors so your score means the same as every other reviewer's:

- **10:** nothing worth changing.
- **9:** you'd ship it as-is to a demanding design lead; only trivial 🟢 nitpicks are left.
- **8:** solid, with a few 🟡 issues a careful user would notice.
- **7:** several 🟡 issues, or one 🔴.
- **6 or lower:** several 🔴 issues, or a broken main task.

An open 🔴 (a user can't complete a task, text is unreadable or covered, a control is unreachable, the layout is broken at a common width) keeps the score at 7 or below. Use one decimal if it helps.

## Required first step

Before you look at anything, invoke the `design:design-critique` skill with the Skill tool (skill name exactly `design:design-critique`). Structure your whole review by its framework and output format. This is mandatory: the review only counts if that Skill call is in your transcript.

## Context

- **What it is:** {what the page is for, and its main parts in reading order}
- **Who it's for:** {audience, including less experienced users if relevant}
- **Stage:** {for example: shipped, polishing toward a high bar}
- **Design reference:** {pages whose design language this page should match}
- **Constraints:** {for example:
  - weak hardware, so don't recommend blur, heavy shadows or animation;
  - every text exists in {languages};
  - the navigation becomes a menu button below {N}px.}
- **Out of scope:** {anything not to judge}
- **Budget:** at most about 4 probe scripts. The screenshots are the main evidence.

## Screenshots (main evidence)

Folder: `{absolute path to this round's shot folder}`

- `index-{lang}.txt` files list the shots.
- Names are `shot--theme--viewport[--lang][--partNofM].png`.
- Viewports: {desktop 1440×1000, tablet 820×1180, phone 390×844}.
- Shots: {which states are captured: both themes at three widths, an open disclosure, the skip link, keyboard focus, other languages}.

## Live checks (optional, strictly read-only)

A local server runs at {base URL}. A saved signed-in session is in `{absolute path to state.json}`.

- Load Playwright with `require('{absolute path to the project's node_modules/playwright}')`.
- Launch {the config's browser, for example `chromium.launch()` or `chromium.launch({ channel: 'msedge' })`} and open `browser.newContext({ storageState: '<that file>' })`.
- Put your scripts and output only in a new folder: `{absolute path to the judge's own folder}`.
- Existing read-only probes you may run or copy: `{paths to collision-probe.cjs, tap-probe.cjs and the config}`.
- For hit tests, scroll with `behavior: 'instant'`.
- Measure page width with `document.documentElement.scrollWidth`.

Rules for live checks:

- Only GET page loads and client-side interactions: focusing, hovering, keyboard, and opening {disclosures or menus that change nothing}.
- Never sign in. If you see the sign-in page, stop live checks and say so.
- Never click anything that changes data or settings.
- No POST, PUT, PATCH or DELETE. Don't edit any project files.
- Visually hidden screen-reader text is clipped on purpose. Don't count it as truncation.

## The previous review raised these (optional; check each one, then look for anything new)

{One line per finding: its ID, its severity, and what it said. For example:
- V1 🟡 The unread badge spilled its word outside the pill at 601px and wider.}

## Known deliberate choices (optional; you may still comment)

{One line per choice, with its reason. For example:
- Separators stay with the item before them, like punctuation.}

## Deliverable (your final message)

- The skill's output format: Overall Impression, a Usability table with 🔴/🟡/🟢 severities, Visual Hierarchy, a Consistency table, Accessibility, What Works Well, and Priority Recommendations.
- Each finding cites its evidence.
- Number new findings {next letter}1, {next letter}2, …
- If previous findings were listed, a line "Previous findings:" saying for each one whether it is resolved, partly resolved, or not resolved.
- An overall **score out of 10**, written as `Score: X.X/10`. Add one sentence on what the score rests on, and a short list of what would make it a 9.
- One line confirming that you invoked `design:design-critique`.
- Keep it under about 800 words.
