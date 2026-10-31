import { GoogleGenAI } from "@google/genai";

export type LlmProvider = "gemini" | "groq-first" | "groq-only";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 22000);
export const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 20000);

const GROQ_FAST_MODELS = [
  "qwen/qwen3.8-27b",
  "llama-3.1-8b-instant",
  "groq/compound-mini",
  "llama-3.3-70b-versatile",
];

const GROQ_EXTENDED_MODELS = [
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
  "qwen/qwen3-32b",
];

export function resolveLlmProvider(): LlmProvider {
  const pref = process.env.LLM_PROVIDER?.toLowerCase();
  if (pref === "groq-first" || pref === "groq") return "groq-first";
  if (pref === "groq-only") return "groq-only";
  return "gemini";
}

export function hasLiveGeminiKey(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return !!apiKey && apiKey !== "mock" && apiKey !== "xxx";
}

export function hasLlmConfigured(): boolean {
  return hasLiveGeminiKey() || !!process.env.GROQ_API_KEY;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function callGroq(
  prompt: string,
  isJson = false,
  options: { fastOnly?: boolean } = {}
): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error("Groq API key missing");
  }

  const models = options.fastOnly
    ? GROQ_FAST_MODELS
    : [...GROQ_FAST_MODELS, ...GROQ_EXTENDED_MODELS];

  for (const modelName of models) {
    try {
      const payload: Record<string, unknown> = {
        model: modelName,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      };
      if (isJson) {
        payload.response_format = { type: "json_object" };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (process.env.NODE_ENV !== "production") {
          const errorText = await response.text();
          console.warn(`Groq model failed [${modelName}]: ${errorText.substring(0, 200)}`);
        }
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return content;
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (process.env.NODE_ENV !== "production") {
        console.error(`Groq error on ${modelName}:`, message);
      }
    }
  }

  throw new Error("All Groq models exhausted");
}

async function callGemini(prompt: string, json = false): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0,
      ...(json
        ? {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
          }
        : { maxOutputTokens: 2048 }),
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Empty response from Gemini API");
  }
  return text;
}

/** Primary LLM entry: Gemini with timeout, optional Groq-first mode, fast Groq fallback. */
export async function generateLlmText(
  prompt: string,
  options: { json?: boolean; fastGroqFallback?: boolean } = {}
): Promise<string> {
  const { json = false, fastGroqFallback = true } = options;
  const provider = resolveLlmProvider();

  if (provider === "groq-first" || provider === "groq-only") {
    return callGroq(prompt, json, { fastOnly: true });
  }

  if (!hasLiveGeminiKey()) {
    if (process.env.GROQ_API_KEY) {
      return callGroq(prompt, json, { fastOnly: fastGroqFallback });
    }
    throw new Error("No LLM configured");
  }

  try {
    return await withTimeout(callGemini(prompt, json), GEMINI_TIMEOUT_MS, "Gemini");
  } catch (error) {
    if (process.env.GROQ_API_KEY) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Gemini failed or timed out, falling back to Groq:", error);
      }
      return callGroq(prompt, json, { fastOnly: fastGroqFallback });
    }
    throw error;
  }
}
