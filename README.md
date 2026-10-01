# journal-bot

Drafts and submits the Kalvium **Simulated Work Daily Journal** every evening, using what
you actually did on GitHub that day as the source material.

```
GitHub events ──▶ commits · PRs · reviews · issues · open work
                          │
                          ▼
               Gemini (or Claude) drafts the 4 answers
                          │
                          ▼
              Chrome (your signed-in profile) walks the form ──▶ Submit
                          │
                          ▼
                 Email receipt with what was filed
```

## Setup

**1 — Install**

```bash
npm install
```

`gh` must be authenticated (`gh auth status`) and Google Chrome must be installed.

**2 — Fill in `config.json`**

The only required change is `formUrl`: open the journal form, copy the `.../viewform`
URL from the address bar, paste it in.

Set `repo` to `"owner/name"` if the journal should cover a single project rather than
everything you push to that day; leaving it blank keeps the whole account in scope.

**3 — Secrets**

```bash
cp .env.example .env
```

- `GEMINI_API_KEY` — from https://aistudio.google.com/apikey (the default provider)
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — an **App Password**, not your normal password.
  Turn on [2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification),
  then create one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).

Email is optional — without it, receipts print to the console. Receipts go to `notifyEmail`
in `config.json`, or to `GMAIL_USER` if that is left blank.

To use Claude instead, set `"provider": "anthropic"` in `config.json` and put an
`ANTHROPIC_API_KEY` in `.env`. Nothing else changes — the prompt and schema are shared.

**3b — Pick a Gemini model**

```bash
npm run models
```

Lists what your key can actually reach. The default is `gemini-3.8-flash`; if your key offers
something newer, put it in `config.json` under `models.gemini`. A *flash* model is the right
pick — this is a small, once-a-day request and the free tier is generous.

**4 — Sign in to Google, once**

```bash
npm run login
```

A Chrome window opens on the form. Sign in as your kalvium.community account. The session
is saved to `~/.journal-bot/chrome-profile` and reused by every automated run — this is a
dedicated profile, not your everyday one, because Chrome locks a profile directory while
it is open.

**5 — Check the form still matches**

```bash
npm run discover
```

Prints every live question, its type, options, and `entry.` ID, then checks each string in
`config.json`'s `questions` block against them. Run this if a submission ever fails.

**6 — Dry run**

```bash
npm run dry
```

Does everything including walking to the Submit page — then screenshots it and stops
without clicking. Do this for a couple of days and read what it writes before you let it
submit on its own.

**7 — Schedule it**

```bash
npm run schedule
```

Installs a launchd agent for the time in `config.json` (`21:15` by default). launchd rather
than cron because it catches up on a run missed while the Mac was asleep. It only fires
while you are logged in — if the laptop is shut at 21:15, the run happens at the next wake,
which still counts as long as that is before midnight.

## Running remotely (GitHub Actions)

[.github/workflows/journal.yml](.github/workflows/journal.yml) runs on GitHub's servers every
day at 21:00 IST, so the laptop can be off. It collects the day's activity and drafts the
answers as usual, but it **does not submit**. Instead it emails you a link to the form with
every answer prefilled. Open it signed in, tick the email checkbox, read through, and press
Submit.

It can't submit by itself because that needs a signed-in Google session, and Google revokes
a session within minutes of seeing it from a datacenter IP. That signs out your laptop too.

It needs four repository secrets: `GH_PAT` (a classic token with `repo` scope — the
workflow's own token can't read your event feed), `GEMINI_API_KEY`, `GMAIL_USER` and
`GMAIL_APP_PASSWORD`. Gmail is required here, because the email is the only output and the
fallback would print the journal to the public Actions log.

The link is built from the question IDs in `form-meta.json`, which is committed for this
reason. If the form changes, run `npm run discover` and commit the updated file. Test from
the Actions tab → *Daily journal* → *Run workflow*. GitHub starts scheduled runs late under
load (once by over 4 hours), so it tries at 21:05, 21:35, 22:05 and 22:35 IST; the first
to run sends the link and the rest stop. A run that starts after midnight emails you that it
was too late instead of journaling the wrong day.

To get the link locally: `node src/index.js --link`.

## Running it by hand

```bash
npm run run              # normal run
node src/index.js --dry-run
node src/index.js --force   # ignore the "already submitted" guard and skip rules
```

## config.json

| Key | Meaning |
|---|---|
| `formUrl` | The `.../viewform` URL. **Required.** |
| `repo` | `"owner/name"` to journal only that repo. Blank (default) means every repo on the account. |
| `provider` | `gemini` (default) or `anthropic`. |
| `models` | The model id used for each provider. `npm run models` lists the Gemini ones. |
| `fallbackModels` | Tried in order if the primary model is overloaded or retired. |
| `notifyEmail` | Where receipts go. Blank means `GMAIL_USER`. |
| `questions` | A distinctive substring of each question's wording. Matching is case-insensitive substring, so short and stable beats exact. |
| `answers.present` | The radio option to select on page 1. |
| `schedule` | Hour/minute for `npm run schedule`. Re-run that script after changing it. |
| `skipWeekdays` | `0` = Sunday. Days the bot does nothing. |
| `holidays` | `["2026-03-25", ...]` — campus holidays to skip. |
| `onNoActivity` | `skip` (default) sends an email nudge and files nothing. `submit` files anyway. |
| `maxCommitDetail` | Cap on how many pushes get expanded through the compare API. |
| `headless` | `false` to watch it drive the form. |

## What the model is given

Per day: commit messages with the files each push touched and its diff size; PRs opened,
merged, or closed with titles, bodies, and diff stats; reviews you left; issues you opened
or closed; and your currently-open PRs and assigned issues, which is where the "not able to
solve" and "plan for next day" answers come from.

The system prompt forbids inventing anything not in that data. **Your journal is only as
specific as your commit history** — if a day's commits are all named `29`, `30`, `31`, the
model has nothing but filenames to work from, and it will show. Descriptive commit messages
and PR bodies are what make this read like you wrote it.

## Guardrails

- **Won't double-submit.** `state/submissions.json` records each filed date.
- **Won't invent a working day.** Zero GitHub activity means no submission — you get a
  email nudge with the form link instead. The first question ("holiday / present / on
  leave") isn't inferable from a commit log, so it's never guessed.
- **Won't submit a half-filled form.** If it reaches the Submit page with any answer
  unfilled, it aborts and tells you the wording probably changed.
- **Survives a busy model.** Gemini returns 503 "high demand" often enough that an
  unattended job has to handle it: each model gets 4 attempts with 3s/12s/30s backoff, then
  the run falls through `fallbackModels` before giving up.
- **Tells you when it breaks.** Any failure emails you the error and the form link, so a
  silent crash doesn't cost you the mark. A receipt that fails to send never masks a
  submission that succeeded.

## Known limits

- The `entry.` IDs from `npm run discover` are not used for submission — the bot drives the
  real DOM instead, which is what keeps the recorded email and the "response copy" email
  working. The IDs are there for validation and if you ever want prefilled links.
- GitHub's events feed lags a few minutes and holds 90 days / 300 events. Fine daily,
  useless for backfilling.
- Work that never reaches GitHub — pair programming, design docs, debugging someone else's
  machine, reading — is invisible to this. Those days are the ones to write yourself.
