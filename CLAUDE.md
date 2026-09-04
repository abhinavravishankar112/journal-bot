# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A once-a-day unattended job: it reads the user's GitHub activity for today, has an LLM draft four
short-answer journal entries from it, then drives a real Chrome session through a Google Form and
submits them. There is no server, no build step, and no test suite — ES modules run straight from
`src/` on Node ≥ 20.

Because it runs unattended from launchd at 21:15, two properties matter more than they normally
would: **every failure path must email the user** (a silent crash costs them a graded mark), and
**nothing may be invented** — the model is only ever allowed to describe activity present in the
GitHub dump.

## Commands

```bash
npm install                 # then: gh auth status, and Google Chrome must be installed
npm run login               # one-time: opens Chrome, sign in to Google, session persisted
npm run models              # list models the GEMINI_API_KEY can actually reach
npm run discover            # print live form questions + validate config.json against them
npm run dry                 # full run, walks to Submit, screenshots, does NOT click
npm run run                 # real run
npm run schedule            # (re)install the launchd agent from config.json's schedule block
node src/index.js --force   # ignore the already-submitted guard, holidays, and skipWeekdays
```

There are no tests, no linter, and no build. To verify a change, use `npm run dry` — it exercises
GitHub collection, the model call, and the whole form walk, stopping one click short of submitting.
For form-selector work specifically, set `"headless": false` in `config.json` to watch it drive.

launchd logs land in `state/launchd.{out,err}.log`; `launchctl start com.journalbot.daily` fires a
run immediately.

## Architecture

`src/index.js` is the whole pipeline, in order: guard → collect → draft → submit → receipt.

**`config.js`** loads `config.json` and derives paths. Two of them are outside the repo or
gitignored: `state/` (the submission log, dry-run and receipt screenshots) and
`~/.journal-bot/chrome-profile`. `env.js` is a deliberately separate 19-line `.env` loader so that
tools needing only a key (`bin/models.js`) don't trip `config.js`'s form-URL placeholder guard.

**`github.js`** builds the activity dump entirely through `gh api` subprocesses — no token handling
of its own. The `users/:login/events` feed is used because it is the one source that spans private
repos, all branches, and every contribution type in a single authenticated call. Two shapes of that
feed have to be worked around and the code exists mainly to do so:

- `PushEvent` payloads no longer carry commit messages, only before/head SHAs, so each push is
  expanded through the compare API (`expandPush`), with a single-commit fallback for new branches
  and force pushes where compare 404s.
- `pull_request` payloads are trimmed to `{base, head, id, number, url}`, so PRs referenced by push
  or review events must be re-fetched (`hydratePr`), deduped to one call per distinct PR.

`config.json`'s `repo` narrows the whole run to one `owner/name`: events are filtered by repo
name (case-insensitively) as they come off the feed, and both searches gain a `repo:` qualifier,
so every downstream count — including the zero-activity guard — sees only that repo. Blank keeps
the account-wide behaviour.

Open PRs and assigned open issues are fetched separately via search — they are what the `unsolved`
and `plan` answers are grounded in, since today's events alone say nothing about what is still open.
`softGh` swallows per-item failures: one unreachable repo must not fail the whole run.

**`prompt.js`** is the single source of truth for the system prompt and the four-field schema, in
both Zod (`JournalSchema`, used to validate the parsed reply) and plain JSON Schema
(`JOURNAL_JSON_SCHEMA`, handed to whichever provider). Both providers share it; changing the fields
means changing them here, in `config.json`'s `questions` block, and in `submit.js`'s fill calls.

**`draft.js`** owns provider selection and all retry policy — the providers themselves are thin. The
chain is `models[provider]` followed by `fallbackModels[provider]`, each model retried on transient
errors with 3s/12s/30s backoff, then abandoned. The three-way error classification is the important
part: transient (retry), model-unavailable (skip straight to the next model), everything else
(throw). Provider replies are re-parsed defensively — a ```json fence or trailing prose is stripped
before `JSON.parse`, because neither provider reliably honours the JSON instruction.

**`submit.js`** walks the form page by page (up to 8) rather than assuming a fixed section count, so
an upstream section being added or reordered doesn't break it. Questions are located by
case-insensitive *substring* of their heading text — that is what `config.json`'s `questions` block
holds, so keep those strings short and stable. Each answered question is recorded in a `filled` set;
reaching Submit with any of `config.questions` unfilled is a hard abort with a pointer to
`npm run discover`, never a partial submission.

Two form quirks are handled explicitly: the verified-email consent checkbox (a required control that
is *not* a form question, so it never appears in `discover`'s output, yet silently blocks every Next
click), and the requirement to use the real Chrome binary via `channel: "chrome"` — Google blocks
sign-in on Playwright's bundled Chromium.

**`bin/discover.js`** parses `FB_PUBLIC_LOAD_DATA_` out of the page to enumerate questions, types,
options, and `entry.` IDs. The entry IDs are written to `form-meta.json` for validation only —
submission deliberately drives the real DOM instead, which is what keeps Google's recorded-email and
response-copy behaviour intact. Don't "optimise" this into a direct POST.

**`email.js`** sends via Gmail with an App Password, or prints to the console when unset. `send()`
swallows its own errors on purpose: a failed receipt must never mask a submission that succeeded.

## Conventions

- No comments that restate the code. The comments that exist explain a *why* that isn't visible
  locally — a GitHub API shape, a Google Forms quirk, a deliberate swallowed error. Match that bar.
- Errors thrown at the user are instructions, not diagnoses: they name the command that fixes the
  problem (`npm run login`, `npm run discover`, `gh auth login`).
- `config.json` is the only place behaviour is tuned; avoid adding constants to source that a user
  would plausibly want to change.

## Guardrails not to weaken

- `state/submissions.json` is the double-submit guard, keyed by local date, and is only written when
  a submission actually succeeded.
- Zero GitHub activity means no submission (`onNoActivity: "skip"`) — the first form question
  (holiday / present / on leave) is not inferable from a commit log and is never guessed.
- Everything the model sees is truncated before it goes in the dump (PR bodies 800 chars, issues
  500, review comments 400, 15 files per push, 30 PRs, `maxCommitDetail` pushes expanded).
