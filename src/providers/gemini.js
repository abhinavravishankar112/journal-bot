import { GoogleGenAI } from "@google/genai";
import { SYSTEM, JOURNAL_JSON_SCHEMA, buildUserMessage } from "../prompt.js";

export async function draft({ model, activity, dateStr }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env");

  const ai = new GoogleGenAI({
    apiKey,
    // GEMINI_BASE_URL exists so the request shape can be exercised against a local
    // stub without spending a real call; unset in normal use.
    ...(process.env.GEMINI_BASE_URL
      ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } }
      : {}),
  });

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: buildUserMessage(activity, dateStr),
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: JOURNAL_JSON_SCHEMA,
        temperature: 0.4,
      },
    });
  } catch (err) {
    if (/not found|not supported|NOT_FOUND/i.test(err.message || "")) {
      throw new Error(
        `Gemini rejected the model "${model}". Run \`npm run models\` to list what your key ` +
          `can actually use, then set models.gemini in config.json.`
      );
    }
    throw err;
  }

  const blocked = response.promptFeedback?.blockReason;
  if (blocked) throw new Error(`Gemini blocked the request (${blocked}).`);

  const text = response.text;
  if (!text) {
    const reason = response.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned no text${reason ? ` (finishReason: ${reason})` : ""}.`);
  }
  return text;
}
