# Bundled scripts

Every script reads one `review.config.json`. Keep it in your scratchpad, next to the saved session. The Playwright scripts load Playwright from the project's own `node_modules` (`projectDir`), so the project needs `playwright` as a dev dependency.

Pick the browser with `browser`:

- `{ "engine": "chromium" }` (the default) uses Playwright's own Chromium, after `npx playwright install chromium`.
- Add `"channel": "msedge"` or `"channel": "chrome"` to use an installed Edge or Chrome instead. This helps where security software blocks Playwright's bundled browsers.
- `"engine": "webkit"` and `"engine": "firefox"` work too.

Every script is read-only except `sign-in.cjs`.

| Script | What it does | Exit code |
|---|---|---|
| `sign-in.cjs <config>` | Signs in once with the local test account and saves the session. It refuses to run against hosts other than local or `.test` ones unless `signIn.allowHost` is set. It never prints credentials. Only the main agent runs it, never the judge. | 1 on failure |
| `capture.cjs <config> <outDir> [--shots a,b] [--themes …] [--viewports …] [--langs …] [--full]` | Takes the screenshot matrix and writes `index-<lang>.txt`. | 1 on sign-out |
| `collision-probe.cjs <config> [--pages …] [--langs …] [--widths …]` | Finds overlapping text, spilling text, elements sticking out of their scope, and sideways page scroll. Lists text cut with an ellipsis as notes. | 2 when it finds problems |
| `tap-probe.cjs <config> [--pages …] [--langs …] [--widths …]` | Hit-tests each control's top, middle and bottom, and lists targets under 24×24px. | 2 when it finds problems |
| `verify_judge.py <agentId\|latest> [--allow <judge folder>] [--projects <dir>]` | Checks the judge's transcript: the Skill call and its timing, unsafe actions, and the score. It looks under `~/.claude/projects/*/*/subagents/` unless `--projects` names another folder. | 1 when the skill call is missing, 2 when there are flags |

## Config

`assets/review.config.example.json` is a full example:

```json
{
  "baseUrl": "http://localhost:3000",
  "projectDir": "/path/to/your/project",
  "pages": ["/dashboard"],
  "storageState": "state.json",
  "browser": { "engine": "chromium" },
  "languages": ["en", "de"],
  "language": { "method": "header" },
  "themes": ["light", "dark"],
  "theme": { "method": "colorScheme" },
  "loginPattern": "/login",
  "waitFor": "main",
  "collisionScopes": ["main li", "main .card", "header"],
  "tapScope": "main",
  "signIn": {
    "path": "/login",
    "credentials": "/path/to/your/project/.claude/test-account.local.properties",
    "fields": { "input[type=email]": "test.email", "input[type=password]": "test.password" }
  },
  "shots": [
    { "name": "dashboard", "path": "/dashboard" },
    { "name": "dashboard-menu-open", "path": "/dashboard", "steps": [{ "click": "summary.menu" }] },
    { "name": "dashboard-skip-link", "path": "/dashboard", "steps": [{ "press": "Tab" }] },
    { "name": "dashboard-keyboard-focus", "path": "/dashboard", "viewports": ["desktop"], "steps": [{ "press": "Tab", "times": 14 }] }
  ]
}
```

Relative paths resolve from the config's own folder. Only `baseUrl` is required.

| Field | Default |
|---|---|
| `projectDir` | the current folder |
| `pages` | `["/"]` |
| `storageState` | `state.json` |
| `browser` | `{ "engine": "chromium" }` |
| `languages` | none (the server's default) |
| `language` | `{ "method": "header", "param": "lang" }` |
| `themes` | `["light", "dark"]` |
| `theme` | `{ "method": "colorScheme" }` |
| `viewports` | desktop 1440×1000, tablet 820×1180, mobile 390×844 |
| `probeWidths` | 360, 390, 600, 820, 900, 1024, 1100, 1180, 1280, 1440 |
| `loginPattern` | `/login` |
| `waitFor` | `main` |
| `settleMs` | 800 |
| `ignoreSelector` | `.visually-hidden, .sr-only, .screen-reader-text` |
| `collisionScopes` | `["main"]` |
| `tapScope` | `body` |
| `tapSelector` | links, buttons, `[role=button]`, inputs, selects, textareas, summaries |
| `shots` | one full-page shot per entry in `pages` |

The credentials file is a plain `key=value` properties file. Keep it out of version control, for example by naming it `*.local.properties` and ignoring that pattern.

### Language: `language.method`

- `header`: sends `Accept-Language`.
- `query`: adds `?<param>=<lang>`.
- `cookie`: sets the cookie `<param>`.

### Theme: `theme.method`

- `colorScheme`: emulates `prefers-color-scheme`.
- `localStorage`: sets `theme.key` before the page loads.
- `replace`: rewrites each HTML document as it arrives, using `pattern` (a regex) and `replacement`, with `{theme}` as the placeholder. Use `replace` when the theme is an account setting, so it never needs changing.

### Scopes

`collisionScopes` should name the repeated units: rows, cards, panel headers, the hero. Overlap is checked only between texts inside one scope. A whole-page scope like `main` works, but it is noisier, because anything positioned on purpose counts as overlap.

### Shots

- Shots without `steps` are cut into viewport-height slices.
- Shots with `steps` take a single viewport screenshot.
- Set `"mode": "slices"` or `"mode": "viewport"` to override either default.
- `viewports` and `themes` limit a shot to some of the matrix.

Steps are client-side only: `click`, `hover`, `focus`, `press` with `times`, `scrollTo`, and `wait`. Use `click` only on disclosures, menus and tabs, never on anything that saves.

## Trying a fix before editing: `--css`

`capture.cjs`, `collision-probe.cjs` and `tap-probe.cjs` accept `--css "<rules>"` or `--css trial.css`. The rules are added to each page as a constructed stylesheet; a strict Content Security Policy blocks an injected `<style>` tag, but not this. Uses:

- **Check a CSS fix at every width and language** before touching the project's files. This avoids a server restart for each attempt when assets are cached.
- **Break a layout on purpose** to confirm that a probe catches the problem you're hunting. A clean result only means something if the probe could have failed.

Both scripts print what they checked (`24 scopes`, `32 controls`). A count of 0 means the selectors matched nothing, and the collision probe treats that as a problem.

## Gotchas

- **Content-hash asset caching:** if the server serves CSS and JS under hashed URLs and caches them, restart it after editing them. Otherwise the probes measure the old styles.
- **Smooth scrolling:** a page with `scroll-behavior: smooth` moves elements between `scrollIntoView` and the hit test. The tap probe scrolls with `behavior: 'instant'` for this reason. Do the same in any probe you write.
- **Visually hidden text** for screen readers is clipped on purpose. Add its class to `ignoreSelector` if it isn't one of `.visually-hidden`, `.sr-only` or `.screen-reader-text`.
- **Sign-in after a restart:** if the server keeps sessions in memory, a restart signs you out. The scripts then stop with "signed out". Delete the state file and run `sign-in.cjs` again.
