import fs from "node:fs";
import { chromium } from "playwright";
import { config, PROFILE_DIR } from "./config.js";

/**
 * A dedicated Chrome profile, signed into the Kalvium Google account once via
 * `npm run login`. It has to be dedicated: Chrome locks a profile directory while
 * it is open, so pointing at your everyday profile would fail whenever Chrome is
 * running. Using the real Chrome binary (channel: "chrome") rather than
 * Playwright's bundled Chromium matters too — Google blocks sign-in on the latter.
 */
export async function launch({ headless = config.headless } = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: config.browserChannel,
    headless,
    viewport: { width: 1280, height: 1000 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

export async function assertSignedIn(page) {
  const body = await page.textContent("body");
  if (/Sign in|Choose an account|to continue to Google Forms/i.test(body || "")) {
    throw new Error(
      "The browser profile is not signed into Google. Run `npm run login`, sign in as " +
        `${config.googleAccount}, then re-run.`
    );
  }
  if (config.googleAccount && !body.includes(config.googleAccount)) {
    throw new Error(
      `The form is open as a different Google account than ${config.googleAccount}. ` +
        "Run `npm run login` and switch accounts."
    );
  }
}
