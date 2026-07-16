import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { CheckId } from "./checks";
import { GenerationPayloadSchema, type IntakeForm } from "./schema";

// Single exported const so the model is swappable (BUILD_PROMPT rule 2).
export const MODEL_ID = "claude-haiku-4-5";
export const TEMPERATURE = 0.25;

// app-system-prompt.md is the product's LLM contract. It is loaded verbatim —
// never rewritten here (BUILD_PROMPT: "load it, don't rewrite it"). The file
// contains both the system message and the user-message template; this module
// slices them out of the markdown.
const PROMPT_PATH = path.join(process.cwd(), "app-system-prompt.md");

interface PromptFile {
  system: string;
  userTemplate: string;
}

let promptFile: PromptFile | null = null;

function loadPromptFile(): PromptFile {
  if (promptFile) return promptFile;
  const raw = readFileSync(PROMPT_PATH, "utf8");

  const systemStart = raw.indexOf("## SYSTEM MESSAGE");
  const templateStart = raw.indexOf("## USER MESSAGE TEMPLATE");
  if (systemStart === -1 || templateStart === -1 || templateStart < systemStart) {
    throw new Error(
      "app-system-prompt.md: expected '## SYSTEM MESSAGE' followed by '## USER MESSAGE TEMPLATE'",
    );
  }

  const system = raw
    .slice(systemStart + "## SYSTEM MESSAGE".length, templateStart)
    .replace(/---\s*$/, "")
    .trim();

  const fenced = raw.slice(templateStart).match(/```([\s\S]*?)```/);
  if (!fenced) {
    throw new Error("app-system-prompt.md: expected a fenced user-message template");
  }

  promptFile = { system, userTemplate: fenced[1].trim() };
  return promptFile;
}

export interface ModelPrompt {
  system: string;
  user: string;
}

// Spec §3: the model receives the validated IntakeForm plus the fired rule
// check ids, so it doesn't waste critique slots duplicating the rules.
export function buildPrompt(form: IntakeForm, firedCheckIds: readonly CheckId[]): ModelPrompt {
  const { system, userTemplate } = loadPromptFile();
  const user = userTemplate
    .replace("{{intake_json}}", JSON.stringify(form, null, 2))
    .replace("{{fired_check_ids}}", JSON.stringify(firedCheckIds));
  return { system, user };
}

// The response format is constrained to the GenerationResult schema via the
// API's structured-output mode (spec §3) — the schema is the format guarantee,
// the prompt supplies the judgment. Structured outputs reject length/count
// keywords (maxLength, maxItems, …), so those are stripped from the wire
// schema; zod re-enforces them server-side when the response is parsed.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
]);

function sanitizeForStructuredOutput(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeForStructuredOutput);
  if (typeof node !== "object" || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    out[key] = sanitizeForStructuredOutput(value);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}

export const OUTPUT_SCHEMA = sanitizeForStructuredOutput(
  z.toJSONSchema(GenerationPayloadSchema),
) as Record<string, unknown>;
