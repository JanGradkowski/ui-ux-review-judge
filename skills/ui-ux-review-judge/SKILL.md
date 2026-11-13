---
name: ui-ux-review-judge
description: Judged UI/UX review loop that polishes a web page until it scores 9/10. An independent, read-only judge subagent reviews fresh screenshots with the design:design-critique skill and scores the page out of 10. You check that it really used that skill, fix what it found, run your own layout probes, and send a fresh judge each round until the target score or the usage budget runs out. Use this whenever the user wants a page's design, UI or UX rated, scored, graded or judged (for example "how much out of 10"), wants to "fix and re-rate", "keep going until 9/10", "review, fix, review", or wants a page polished by an honest critic, even if they don't name this skill.
---

# UI/UX review judge

A loop for raising a page's design quality with an honest outside opinion. You do the fixing. A fresh judge subagent, with no stake in your fixes, scores the page each round.

The judge needs to be independent because you wrote the fixes and will see them kindly. The judge sees only screenshots and the live page. It must use `design:design-critique`, so every round uses the same structured framework: first impression, usability, visual hierarchy, consistency and accessibility. That skill gives no number, so the judge adds a calibrated score out of 10.

## 1. Settle the inputs

Take the inputs from the request and the conversation. Ask only for what you can't infer.

- **Pages:** the routes to judge, plus anything out of scope.
- **Target:** 9.0/10 unless the user says otherwise.
- **Stop rule:** by default, stop when you reach the target or the usage window is nearly drained. Use the user's own wording when they give one ("until 9/10 or you drain the 5-hour limit", "three rounds").
- **Matrix:**
  - viewports: desktop 1440×1000, tablet 820×1180, phone 390×844;
  - light and dark themes;
  - every language the app ships.
- **Constraints the judge must respect:** design-system references (the pages whose look is the standard), hardware limits, app-wide decisions.

**Project notes.** Look in the project for `.claude/ui-ux-review-judge.md`, or `.claude/ui-ux-review-judge.local.md` for notes kept out of version control, and read whichever exists now. It holds that project's review server, database, sign-in, theme and language setup, its constraints and its deliberate design choices. If neither exists, write one from `references/project-notes-template.md` once setup works, so the next loop starts in minutes rather than rediscovering it all. Ask the user whether the notes should be committed. If not, use the `.local.md` name and make sure the project's `.gitignore` covers it.

**Check that the judge's skill exists.** The judge needs the `design:design-critique` skill from Anthropic's `design` plugin. If that skill isn't in your skill list, stop and tell the user how to install it: `/plugin marketplace add anthropics/knowledge-work-plugins`, then `/plugin install design@knowledge-work-plugins`. Without it, rounds can't be verified, so no score would count.

## 2. Ground rules

These rules keep the loop safe and the score meaningful.

- **The judge is strictly read-only.** It runs against a signed-in session on a real server. It may load pages (GET) and do client-side things: focus, hover, keyboard, opening disclosures. It must never:
  - sign in;
  - submit forms or click anything that changes data or settings;
  - send POST, PUT, PATCH or DELETE requests;
  - edit project files.
  It writes only to its own scratch folder.
- **The scripts are read-only by construction.** Pages load and read normally, but every request other than GET, HEAD or OPTIONS is answered locally and never reaches the server. A page that marks an item read when it opens, or sends an analytics beacon, changes nothing. Each script ends by listing what it blocked. The judge's own probe scripts must block the same way; the brief gives the line to use.
- **Review against a review database, never a shared one.** Use a seeded copy or a separate schema, so neither you nor the judge can disturb anyone's data.
- **Use a fresh judge every round.** Never continue the previous judge with SendMessage. Don't tell the new judge the earlier scores or the target you're hoping for. Give it the previous findings to verify, and the deliberate choices with their reasons. This keeps scores from anchoring.
- **Report the judge's score exactly as given.** Don't coach it, argue with it, or edit its output.
- **Commit, push or merge only when the user explicitly asks.**
- **Never repeat credentials** in chat, briefs or logs. Scripts read them from the project's local file.

## 3. One-time setup

1. **Review server.** Run the app on its own port against the review database. Find out how it caches CSS and JS. Many servers serve assets under content-hash URLs and cache them until restart. In that case, restart after every CSS, JS, message or server-code edit, before capturing or probing. Otherwise you measure the old styles.
2. **Signed-in session.** Sign in once with `scripts/sign-in.cjs`. It saves a Playwright storage state that every script and the judge reuse. Sign-in endpoints are often rate-limited, so don't sign in per script. If the server keeps sessions in memory, a restart signs you out: delete the state file and sign in again.
3. **Config.** Write `review.config.json` in your scratchpad for the bundled scripts, starting from `assets/review.config.example.json`. `references/scripts.md` describes the format and every script. The scripts load Playwright from the project (`projectDir`); if the project doesn't have it, ask before adding it as a dev dependency.

## 4. One round

### a. Pre-flight your own probes

Do this before every rating, including the first. In the run this skill came from, two judge rounds were wasted on the fixer's own regressions: text collisions at 820–1025px, and a template that stopped rendering. A judge round costs about 10% of a Pro 5-hour window, while a probe costs almost nothing.

```bash
node scripts/collision-probe.cjs <config>
node scripts/tap-probe.cjs <config>
```

- **Collision probe:** checks every probe width (10 by default) in every language for:
  - overlapping text;
  - text spilling out of fixed boxes;
  - elements sticking out of their container;
  - horizontal page scroll.
- **Tap probe:** checks that a tap at the top, middle and bottom of each control lands on that control, and flags targets under 24×24px.
- **Load check:** both probes stop with an error if a page redirects to sign-in.

Fix anything they report, then rerun them, before spending a judge round.

### b. Check the budget

Read the remaining usage if you have a tool for it (in the Claude desktop app, `mcp__ccd_session_mgmt__get_usage`). If you don't, budget from these numbers:

- A judge round uses about 145–180k tokens, roughly 10% of a Claude Pro 5-hour window. Larger plans have proportionally more room.
- A fix round uses about 3–12%.

Every turn you take re-reads your whole context, so waiting costs as much as working. Never stream probe or capture output through a Monitor. In one run, 73 monitor events took the window from 32% to 84% before the first judge round. Instead, run long scripts as one background command, wait for its single completion notice, and read the output once. Check the budget before the probes as well as before each judge.

If the remaining window can't cover one more round plus its fixes, stop and report (section 6). Watch your own context too. Before it fills, finish the round you're in, write the report, and save a memory note so a later session can continue.

### c. Capture fresh screenshots

```bash
node scripts/capture.cjs <config> <scratch>/<page>-shots-<round>
```

This writes the full matrix into a new folder, with `index-<lang>.txt` files listing the shots. Each tall page is cut into viewport-sized slices, so fixed headers sit where a reader sees them. Add state shots for whatever the page hides behind interaction, using the config's `steps`. Examples:
- an open disclosure or menu;
- the skip link;
- keyboard focus after N Tabs.

### d. Brief and spawn the judge

Fill in the template in `references/judge-brief.md` and spawn it with the Agent tool, as a general-purpose subagent.

- Round 1 has no "previous findings" section.
- From round 2 on, list the previous findings with their IDs and severities, so the judge verifies each one before looking for new ones.
- Keep a short "known deliberate choices" list. Each entry is a decision you won't change, with a reason. The judge may still comment on them.

### e. Verify the judge

```bash
python scripts/verify_judge.py <agentId> --allow <judge's own folder>
```

The `agentId` comes from the Agent tool's result, or pass `latest` for the newest subagent transcript. The script reads the judge's transcript and reports:

- whether `design:design-critique` was invoked through the Skill tool, and whether that happened before the judge looked at screenshots;
- any file writes outside its folder, and any commands or scripts that look like sign-in, form submission, non-GET requests, git, database or package operations;
- the score it gave.

What to do with the result:

- **No Skill call:** the round is invalid. Discard the score, tell the user, and rerun with a fresh judge.
- **Flagged actions:** read them in the transcript. If the judge really changed data, settings or files, stop and tell the user exactly what happened.

### f. Log the round

Append a line to `<scratch>/judge-log.md` with:

- the round number;
- the score;
- the 🔴/🟡/🟢 counts;
- the main findings;
- whether the judge was verified.

The final report is built from this log, and it survives context compaction.

### g. Decide, then fix

- **Done:** the score is at or above the target, the judge was verified, and no 🔴 remains open.
- **Otherwise, fix in this order:**
  1. every 🔴;
  2. every 🟡;
  3. 🟢 findings when they're cheap and safe.

For each fix:

- **Reproduce it first.** Measure the problem with a small probe instead of trusting the description. Judges sometimes misread a screenshot.
- **Trial CSS fixes with `--css`** on the probes or capture before editing files. When assets are cached, this saves a server restart for each attempt.
- **Fix the root cause.** For example, choose a breakpoint where the layout really breaks, rather than adding a one-width patch.
- **Check by measuring** at every width, theme and language the finding could touch. Every text change needs all the app's languages.
- **Handle conflicting advice.** If two judges disagree, choose one convention and add it to the deliberate choices with its reason. Flip-flopping costs rounds and never converges.
- **Reject a finding only for a reason.** A finding that conflicts with the user's constraints or an app-wide decision becomes a deliberate choice, stated honestly.
- **Run the affected tests.** Restart the server if assets are cached.

Then go back to step a.

## 5. When to stop

- **Target reached:** you have a verified judge's score at or above the target.
- **Budget:** the remaining window can't pay for another round. The user's stop rule decides how close to the edge you go.
- **Context:** your context is nearly full. Stop cleanly at the end of a round.
- **Plateau:** three verified rounds in a row without beating the best score. Fresh judges keep finding new nitpicks; in the original run, scores sat at 8.0–8.3 for six rounds. Say so in a line. Keep going only if the user's instruction says to continue until the target or the budget runs out; otherwise ask.

## 6. Final report

Write it in plain prose with short lists:

1. **Result:** whether the target was reached, the last score, and the honest reason the loop stopped.
2. **Scores by round,** each verified, for example `5.5 → 7.3 → 7.3 → 8.2 → …`. Add one sentence on why the scores moved or stalled.
3. **What changed,** grouped by area. Write user-visible outcomes, not file names.
4. **Still open** from the last judge, with severities.
5. **State:**
   - branch and commit status (normally uncommitted);
   - tests and probes, and what was not run;
   - whether the review server is still running.

Then add any lesson that would make the next loop cheaper to the project notes file, and save a memory note with the trajectory if you keep memory.

## Files

- `references/judge-brief.md`: the judge brief template. Read it when you brief a round.
- `references/scripts.md`: the config format and how to use each bundled script.
- `references/project-notes-template.md`: the template for a project's notes file (`.claude/ui-ux-review-judge.md` or `.claude/ui-ux-review-judge.local.md`).
- `assets/review.config.example.json`: a starting config for the scripts.
- `scripts/`:
  - `capture.cjs`, `collision-probe.cjs`, `tap-probe.cjs` and `sign-in.cjs`, which use Playwright from the project's `node_modules`;
  - `verify_judge.py`, which needs Python 3.8 or later and no packages.
