#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { config, today, shouldSkipToday, STATE_DIR } from "./config.js";
import { collectActivity } from "./github.js";
import { draftJournal } from "./draft.js";
import { submitJournal } from "./submit.js";
import { sendReceipt, sendAlert } from "./email.js";

const LOG = path.join(STATE_DIR, "submissions.json");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const readLog = () => (fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : {});
const writeLog = (log) => fs.writeFileSync(LOG, JSON.stringify(log, null, 2));

async function main() {
  const day = today();
  const log = readLog();

  if (log[day.date]?.submitted && !force) {
    console.log(`Already submitted for ${day.date}. Use --force to override.`);
    return;
  }

  const skip = shouldSkipToday(day);
  if (skip && !force) {
    console.log(`Skipping: ${skip}`);
    return;
  }

  console.log(
    `Collecting GitHub activity for ${day.date}${config.repo ? ` in ${config.repo}` : ""}…`
  );
  const activity = await collectActivity(day);
  console.log(
    `  ${activity.commits.length} commits, ${activity.pullRequests.length} PR events, ` +
      `${activity.reviews.length} reviews, ${activity.issues.length} issue events`
  );

  if (activity.totalEvents === 0 && config.onNoActivity === "skip" && !force) {
    await sendAlert(
      `⚠️ No GitHub activity found${config.repo ? ` in ${config.repo}` : ""} — ${day.date}`,
      "Nothing was submitted. If you did work today, or it was a campus holiday, or you were " +
        "on leave, fill the form in yourself — those are the three cases this bot will not guess at."
    );
    console.log("No activity found; skipped and alerted.");
    return;
  }

  console.log("Drafting…");
  const answers = await draftJournal(activity, day.date);

  console.log(dryRun ? "Dry run — walking the form without submitting…" : "Submitting…");
  const result = await submitJournal(answers, { dryRun });

  if (result.submitted) {
    log[day.date] = { submitted: true, at: new Date().toISOString(), answers };
    writeLog(log);
  }

  await sendReceipt({
    date: day.date,
    answers,
    activity,
    submitted: result.submitted,
    screenshot: result.screenshot,
  });
  console.log(result.submitted ? "Submitted." : "Dry run complete (nothing submitted).");
}

main().catch(async (err) => {
  console.error(err);
  await sendAlert(
    `🚨 Journal bot failed — ${today().date}`,
    `${String(err.message).slice(0, 900)}\n\nFill the form manually so you don't lose the mark.`,
    err.screenshot
  ).catch(() => {});
  process.exit(1);
});
