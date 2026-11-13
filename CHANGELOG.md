# Changelog

## 1.1.0 (2026-11-13)

- **Read-only scripts.** The capture script and probes let pages load and read normally, but answer every request other than GET, HEAD or OPTIONS locally, so pages that save on load (marking an item read, analytics beacons) change nothing. Each script lists what it blocked. `allowNonGet` lets a named read-only endpoint through. The judge's brief tells it to block the same way.
- **Private project notes.** The skill reads `.claude/ui-ux-review-judge.local.md` as well as `.claude/ui-ux-review-judge.md`, and asks whether new notes should be committed.
- **README.** Adds a score chart from a real run, and a picture of what the probes catch.

## 1.0.0 (2026-11-13)

First release:

- the judged review loop, with a fresh read-only judge each round, scoring anchors and stop rules;
- the judge brief template;
- the scripts: screenshot matrix, collision and tap probes, sign-in, and the judge transcript check;
- plugin and marketplace manifests;
- fixture tests and CI.
