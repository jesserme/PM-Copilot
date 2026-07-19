import { z } from "zod";

import type { CheckId } from "./checks";
import { SYSTEM_PROMPT, USER_MESSAGE_TEMPLATE } from "./prompt-text";
import { GenerationPayloadSchema, type IntakeForm } from "./schema";

// Single exported const so the model is swappable (BUILD_PROMPT rule 2).
export const MODEL_ID = "claude-haiku-4-5";
export const TEMPERATURE = 0.25;

export interface ModelPrompt {
  system: string;
  user: string;
}

// Spec §3: the model receives the validated IntakeForm plus the fired rule
// check ids, so it doesn't waste critique slots duplicating the rules. The
// prompt text itself lives in lib/prompt-text.ts (runtime source of truth);
// app-system-prompt.md is the documentation copy.
export function buildPrompt(form: IntakeForm, firedCheckIds: readonly CheckId[]): ModelPrompt {
  const user = USER_MESSAGE_TEMPLATE.replace(
    "{{intake_json}}",
    JSON.stringify(form, null, 2),
  ).replace("{{fired_check_ids}}", JSON.stringify(firedCheckIds));
  return { system: SYSTEM_PROMPT, user };
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
