#!/usr/bin/env node
/**
 * Reads the live form and prints its questions, types, options, and entry IDs.
 * Run this whenever a submission fails with a "question wording changed" error —
 * the strings in config.json's `questions` block must each appear in a live heading.
 */
import fs from "node:fs";
import { config, FORM_META } from "../src/config.js";
import { launch, assertSignedIn } from "../src/browser.js";

const TYPES = { 0: "short answer", 1: "paragraph", 2: "radio", 3: "dropdown", 4: "checkbox", 6: "section header", 9: "date" };

const { context, page } = await launch({ headless: true });
await page.goto(config.formUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1500);
await assertSignedIn(page);

const raw = await page.evaluate(() => {
  const el = [...document.querySelectorAll("script")].find((s) =>
    s.textContent.includes("FB_PUBLIC_LOAD_DATA_")
  );
  if (!el) return null;
  const m = el.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);?\s*$/);
  return m ? m[1] : null;
});
await context.close();

if (!raw) {
  console.error("Could not find FB_PUBLIC_LOAD_DATA_ on the page.");
  process.exit(1);
}

const data = JSON.parse(raw);
const items = data?.[1]?.[1] ?? [];
const questions = items.map((it) => ({
  title: it[1],
  type: TYPES[it[3]] ?? `type ${it[3]}`,
  entryId: it[4]?.[0]?.[0] ? `entry.${it[4][0][0]}` : null,
  required: !!it[4]?.[0]?.[2],
  options: (it[4]?.[0]?.[1] || []).map((o) => o[0]).filter(Boolean),
}));

fs.writeFileSync(FORM_META, JSON.stringify({ formUrl: config.formUrl, questions }, null, 2));

console.log(`\n${questions.length} items on the form:\n`);
for (const q of questions) {
  console.log(`  ${q.required ? "*" : " "} [${q.type}] ${q.title}`);
  if (q.entryId) console.log(`      ${q.entryId}`);
  for (const o of q.options) console.log(`      • ${o}`);
}

console.log("\nChecking config.json against the live form:");
let ok = true;
for (const [key, snippet] of Object.entries(config.questions)) {
  const hit = questions.find((q) => (q.title || "").toLowerCase().includes(snippet.toLowerCase()));
  console.log(`  ${hit ? "✓" : "✗"} ${key}: "${snippet}"`);
  if (!hit) ok = false;
}
const radio = questions.find((q) => q.options.length);
if (radio && !radio.options.some((o) => o.includes(config.answers.present))) {
  console.log(`  ✗ answers.present: "${config.answers.present}" is not one of the live options`);
  ok = false;
} else if (radio) {
  console.log(`  ✓ answers.present: "${config.answers.present}"`);
}
console.log(ok ? "\nAll good.\n" : "\nFix the ✗ lines in config.json before the next run.\n");
console.log(`Written to ${FORM_META}`);
