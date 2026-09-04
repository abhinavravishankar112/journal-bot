#!/usr/bin/env node
/** Lists the models your Gemini key can actually use, newest-looking first. */
import { GoogleGenAI } from "@google/genai";
import "../src/env.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const rows = [];
for await (const m of await ai.models.list()) {
  const actions = m.supportedActions || m.supportedGenerationMethods || [];
  if (actions.length && !actions.includes("generateContent")) continue;
  rows.push({ name: (m.name || "").replace(/^models\//, ""), display: m.displayName || "" });
}

rows.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
console.log(`\n${rows.length} models available to this key:\n`);
for (const r of rows) console.log(`  ${r.name.padEnd(42)} ${r.display}`);
console.log(`\nPut the one you want in config.json under models.gemini.`);
console.log(`A "flash" model is the right default — fast, and the free tier is generous.\n`);
