#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "../src/config.js";
import { launch, assertSignedIn } from "../src/browser.js";

const OUT = path.join(os.homedir(), ".journal-bot", "google-session.json");

const { context, page } = await launch({ headless: true });
try {
  await page.goto(config.formUrl, { waitUntil: "networkidle" });
  await assertSignedIn(page);
  // Only Google's cookies: the rest of the profile is irrelevant to the form and
  // would push the file past GitHub's 48 KB secret limit.
  const cookies = (await context.cookies()).filter((c) => /(^|\.)google\.com$/.test(c.domain));
  fs.writeFileSync(OUT, JSON.stringify(cookies), { mode: 0o600 });
  console.log(`✅ Exported ${cookies.length} Google cookies to ${OUT}`);
  console.log(`\nUpload it as the GOOGLE_SESSION secret, then delete the local copy:`);
  console.log(`  gh secret set GOOGLE_SESSION < ${OUT} && rm ${OUT}`);
} finally {
  await context.close();
}
