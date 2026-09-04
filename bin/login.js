#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config, PROFILE_DIR } from "../src/config.js";
import { launch } from "../src/browser.js";

const { context, page } = await launch({ headless: false });
await page.goto(config.formUrl, { waitUntil: "domcontentloaded" });

console.log(`\nA Chrome window is open on the journal form.`);
console.log(`Sign in as ${config.googleAccount} if prompted, until you can see the form itself.`);
console.log(`The session is saved to ${PROFILE_DIR} and reused for every automated run.\n`);

const rl = readline.createInterface({ input: stdin, output: stdout });
await rl.question("Press Enter here once the form is visible… ");
rl.close();

const body = (await page.textContent("body")) || "";
if (body.includes(config.googleAccount)) console.log("✅ Signed in and the form loads.");
else console.log("⚠️  Could not confirm the account on the page — check the window before closing.");

await context.close();
