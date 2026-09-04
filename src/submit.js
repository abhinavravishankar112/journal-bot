import path from "node:path";
import { config, STATE_DIR } from "./config.js";
import { launch, assertSignedIn } from "./browser.js";

const Q = config.questions;

/** A question block whose heading contains `snippet`, and that is currently on screen. */
function questionBlock(page, snippet) {
  return page.getByRole("listitem").filter({ hasText: snippet }).first();
}

async function fillIfPresent(page, snippet, value) {
  const block = questionBlock(page, snippet);
  if ((await block.count()) === 0 || !(await block.isVisible().catch(() => false))) return false;
  const field = block.locator('input[type="text"], textarea').first();
  await field.waitFor({ state: "visible", timeout: 5000 });
  await field.fill(value);
  return true;
}

async function chooseIfPresent(page, snippet, optionLabel) {
  const block = questionBlock(page, snippet);
  if ((await block.count()) === 0 || !(await block.isVisible().catch(() => false))) return false;
  const radio = block.getByRole("radio", { name: optionLabel, exact: false }).first();
  await radio.waitFor({ state: "visible", timeout: 5000 });
  await radio.click();
  return true;
}

/**
 * Forms with "Collect email addresses" set to "Verified" show a required consent
 * checkbox ("Record you@x.com as the email...") ahead of the real questions. It
 * isn't a form question — it doesn't appear in FB_PUBLIC_LOAD_DATA_, so `discover`
 * never lists it — but it silently blocks every Next click until it's ticked.
 */
async function tickEmailConsentIfPresent(page) {
  const box = page.getByRole("checkbox", { name: /email to be included/i }).first();
  if ((await box.count()) === 0) return false;
  if (await box.isChecked().catch(() => true)) return false;
  await box.click();
  return true;
}

/**
 * Walks the form page by page rather than assuming three sections, so a section
 * being added or reordered upstream does not break the run.
 */
export async function submitJournal(answers, { dryRun = false } = {}) {
  const { context, page } = await launch();
  const filled = new Set();
  try {
    await page.goto(config.formUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    await assertSignedIn(page);

    for (let step = 0; step < 8; step++) {
      await tickEmailConsentIfPresent(page);
      if (await chooseIfPresent(page, Q.workingDay, config.answers.present)) filled.add("workingDay");
      if (await fillIfPresent(page, Q.keyTasks, answers.key_tasks)) filled.add("keyTasks");
      if (await fillIfPresent(page, Q.solved, answers.solved)) filled.add("solved");
      if (await fillIfPresent(page, Q.unsolved, answers.unsolved)) filled.add("unsolved");
      if (await fillIfPresent(page, Q.plan, answers.plan)) filled.add("plan");

      const submitBtn = page.getByRole("button", { name: "Submit", exact: true });
      const nextBtn = page.getByRole("button", { name: "Next", exact: true });

      if (await submitBtn.isVisible().catch(() => false)) {
        const missing = Object.keys(Q).filter((k) => !filled.has(k));
        if (missing.length) {
          throw new Error(
            `Reached the Submit page without filling: ${missing.join(", ")}. ` +
              "The form's question wording probably changed — run `npm run discover` to see the live questions."
          );
        }
        if (dryRun) {
          const shot = path.join(STATE_DIR, "dry-run.png");
          await page.screenshot({ path: shot, fullPage: true });
          return { submitted: false, dryRun: true, screenshot: shot };
        }
        await submitBtn.click();
        await page.waitForURL(/formResponse/, { timeout: 30000 });

        let screenshot = null;
        if (config.screenshotReceipt) {
          screenshot = path.join(STATE_DIR, "receipt.png");
          await page.screenshot({ path: screenshot, fullPage: true });
        }
        return { submitted: true, screenshot };
      }

      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(1200);
        continue;
      }

      throw new Error("No Next or Submit button found — the form layout is not what was expected.");
    }
    throw new Error("Walked 8 pages without reaching Submit; aborting rather than looping.");
  } finally {
    await context.close();
  }
}
