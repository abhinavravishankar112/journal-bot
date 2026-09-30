import fs from "node:fs";
import { config, FORM_META } from "./config.js";

const ANSWER_FOR = {
  workingDay: () => config.answers.present,
  keyTasks: (a) => a.key_tasks,
  solved: (a) => a.solved,
  unsolved: (a) => a.unsolved,
  plan: (a) => a.plan,
};

/**
 * A prefilled viewform link, for runs where no signed-in browser is available.
 * The user opens it signed in, ticks the email-consent box, and presses Submit
 * themselves — so Google still records the verified email and sends the copy.
 */
export function prefillUrl(answers) {
  if (!fs.existsSync(FORM_META)) {
    throw new Error("form-meta.json is missing. Run `npm run discover` and commit the file.");
  }
  const meta = JSON.parse(fs.readFileSync(FORM_META, "utf8"));
  if (meta.formUrl !== config.formUrl) {
    throw new Error("form-meta.json is for a different form than config.json. Run `npm run discover` and commit it.");
  }

  const params = new URLSearchParams({ usp: "pp_url" });
  for (const [key, snippet] of Object.entries(config.questions)) {
    const q = meta.questions.find(
      (q) => q.entryId && q.title.toLowerCase().includes(snippet.toLowerCase())
    );
    if (!q) {
      throw new Error(
        `No question matching "${snippet}" in form-meta.json. Run \`npm run discover\` and commit it.`
      );
    }
    const value = ANSWER_FOR[key](answers);
    if (q.type === "radio" && !q.options.includes(value)) {
      throw new Error(
        `"${value}" is not an option of "${q.title}". Fix config.json's answers, or run \`npm run discover\`.`
      );
    }
    params.append(q.entryId, value);
  }
  return `${config.formUrl}?${params}`;
}
