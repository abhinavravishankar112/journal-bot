import { config } from "./config.js";
import { JournalSchema } from "./prompt.js";
import { draft as gemini } from "./providers/gemini.js";
import { draft as anthropic } from "./providers/anthropic.js";

const PROVIDERS = { gemini, anthropic };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Overload, rate limit, and gateway errors are worth waiting out; a bad key is not. */
function isTransient(err) {
  const status = err.status ?? err.statusCode;
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    err.message || ""
  );
}

/** The named model is gone or not visible to this key — no amount of retrying helps. */
function isModelUnavailable(err) {
  const status = err.status ?? err.statusCode;
  return status === 404 || /NOT_FOUND|not found|not supported/i.test(err.message || "");
}

function parseJournal(text, provider) {
  // Neither provider is trusted to have obeyed the JSON instruction — a stray
  // ```json fence or a trailing sentence is the usual failure.
  const json = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JournalSchema.parse(JSON.parse(json));
  } catch (err) {
    throw new Error(`Could not parse the ${provider} draft: ${err.message}\n---\n${text.slice(0, 500)}`);
  }
}

export async function draftJournal(activity, dateStr) {
  const provider = PROVIDERS[config.provider];
  if (!provider) {
    throw new Error(
      `config.json: provider "${config.provider}" is not one of ${Object.keys(PROVIDERS).join(", ")}`
    );
  }

  const chain = [config.models[config.provider], ...(config.fallbackModels?.[config.provider] ?? [])];
  const backoff = [3000, 12000, 30000];
  let last;

  for (const model of chain) {
    for (let attempt = 0; attempt <= backoff.length; attempt++) {
      try {
        const text = await provider({ model, activity, dateStr });
        if (model !== chain[0]) console.log(`  (fell back to ${model})`);
        return parseJournal(text, config.provider);
      } catch (err) {
        last = err;
        if (isModelUnavailable(err)) {
          console.warn(`  ${model} unavailable — trying the next model`);
          break;
        }
        if (!isTransient(err) || attempt === backoff.length) {
          if (isTransient(err)) break; // exhausted this model; try the next one
          throw err;
        }
        const wait = backoff[attempt];
        console.warn(`  ${model} ${err.status ?? ""} — retrying in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
  }

  throw new Error(
    `Every model in the chain (${chain.join(", ")}) failed. Last error: ${last?.message ?? last}`
  );
}
