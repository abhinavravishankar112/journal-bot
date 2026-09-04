import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM, JOURNAL_JSON_SCHEMA, buildUserMessage } from "../prompt.js";

export async function draft({ model, activity, dateStr }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  const client = new Anthropic();

  const response = await client.beta.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content: buildUserMessage(activity, dateStr) }],
    output_config: {
      format: { type: "json_schema", schema: { ...JOURNAL_JSON_SCHEMA, additionalProperties: false } },
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to draft the journal (${response.stop_details?.category}).`);
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Claude returned no text content.");
  return text;
}
