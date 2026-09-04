import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ROOT } from "./env.js";

export { ROOT };
export const STATE_DIR = path.join(ROOT, "state");
export const PROFILE_DIR = path.join(os.homedir(), ".journal-bot", "chrome-profile");
export const FORM_META = path.join(ROOT, "form-meta.json");


export const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

if (config.formUrl.startsWith("PASTE_")) {
  throw new Error(
    "config.json: formUrl is still a placeholder. Open the journal form, copy the " +
      "URL from the address bar (the .../viewform one), and paste it into config.json."
  );
}

if (config.repo && !/^[^/\s]+\/[^/\s]+$/.test(config.repo)) {
  throw new Error(
    `config.json: repo must be "owner/name" (e.g. "${config.githubLogin}/my-project"), ` +
      `got "${config.repo}". Leave it as "" to journal every repo on the account.`
  );
}

fs.mkdirSync(STATE_DIR, { recursive: true });

/** Journal date = the local date we are submitting for. No backdating. */
export function today() {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return { date: iso, weekday: d.getDay(), start: new Date(`${iso}T00:00:00`), now: d };
}

export function shouldSkipToday({ date, weekday }) {
  if (config.holidays.includes(date)) return `${date} is listed as a holiday in config.json`;
  if (config.skipWeekdays.includes(weekday)) return `${date} falls on a skipped weekday`;
  return null;
}
