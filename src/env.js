import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Minimal .env loader — kept separate from config.js so tools that only need
 * credentials (listing models, say) don't trip the form-URL guard.
 */
const file = path.join(ROOT, ".env");
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} else {
  console.warn(`[env] No .env found at ${file}`);
}
