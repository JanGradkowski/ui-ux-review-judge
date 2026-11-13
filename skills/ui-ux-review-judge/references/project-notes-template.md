# Project notes template

Copy this to `.claude/ui-ux-review-judge.md` in the project and fill it in once the first loop's setup works. The next loop reads it first and skips the rediscovery. Keep secrets out of it: name the file that holds the test account, never the values.

If the project's `.claude/` folder is committed, decide with the user whether these notes belong in the repo (useful to teammates) or should be ignored. Use a `.local.md` name if they should stay private.

---

# UI/UX review judge: {project name}

{One line on what the app is and who uses it.}

## Review server

- **Start:** {how to start it, for example a launch config name or a command}.
- **URL:** {for example `http://localhost:3000`}.
- **Database:** {the review database or schema. Name the shared databases it must never touch.}
- **Turned off for reviews:** {for example scheduled jobs and outgoing email}.
- **Restarts:** {what reloads live, and what needs a restart. For example: templates reload live; CSS and JS are content-hashed and cached until restart.}

## Sign-in

- **Credentials file:** {path}, keys {for example `test.email` / `test.password`}. Never repeat the values.
- **Rate limit:** {for example 10 sign-ins per 15 minutes}. Sign in once per server start and reuse `state.json`.
- **Sessions:** {kept in memory, so a restart signs you out? Or persisted?}

## Matrix

- **Languages:** {for example English and German, through `Accept-Language`}. Every text needs all of them.
- **Theme:** {how it is set: `prefers-color-scheme`, a localStorage key, or an account setting (use the `replace` method)}.
- **Browser:** {for example `chromium` with `"channel": "msedge"`}.
- **Breakpoints that matter:** {for example: the navigation becomes a menu below 1025px}.

## Constraints for the judge

- {For example: users may have weak hardware, so no blur, heavy shadows or animation.}
- **Design references:** {the pages whose look is the standard}.

## Tests

- {the commands for the affected test suites, and how long they take}.

## Known deliberate choices

Pass these to judges as "known deliberate choices" when they apply:

- {a decision, with its reason}.

## Config

- {where a working `review.config.json` lives, or what to change in the example: pages, shots, scopes}.

## History

- {date, page: the scores by round, and the lesson learned}.
