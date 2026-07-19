// Generates the three showcase results (spec §6) by running each input in
// showcase-inputs.json through the real pipeline — the dev server's
// POST /api/generate — and writes data/showcase/<key>.json.
//
// Run ONCE and commit the outputs (BUILD_PROMPT rule 6): the app never calls
// the API for showcase content; showcase mode is static JSON.
//
// Usage:
//   1. npm run dev            (dev server on :3000, ANTHROPIC_API_KEY set)
//   2. node scripts/pregenerate.ts
//
// Node 23.6+ runs TypeScript natively (type stripping) — no extra tooling.
// Note the 5/hour/IP rate limit on the route: three inputs fit in one window.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runChecks } from "../lib/checks.ts";
import { GenerationResultSchema, IntakeFormSchema } from "../lib/schema.ts";

const ROOT = path.join(import.meta.dirname, "..");
const API_URL = process.env.PREGENERATE_URL ?? "http://localhost:3000/api/generate";
const OUT_DIR = path.join(ROOT, "data", "showcase");

const inputs = JSON.parse(
  readFileSync(path.join(ROOT, "showcase-inputs.json"), "utf8"),
) as Record<string, unknown>;

// Keys starting with _ are documentation, not inputs (see the file's _note).
// Pass key names as arguments to regenerate a subset, e.g.:
//   node scripts/pregenerate.ts kitchen_sink
const requested = process.argv.slice(2);
const entries = Object.entries(inputs).filter(
  ([key]) => !key.startsWith("_") && (requested.length === 0 || requested.includes(key)),
);
if (requested.length > 0 && entries.length !== requested.length) {
  throw new Error(`Unknown showcase key(s): ${requested.join(", ")}`);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [key, value] of entries) {
  const form = IntakeFormSchema.parse(value);
  const firedCheckIds = runChecks(form).map((flag) => flag.id);
  console.log(
    `${key}: fired checks = ${firedCheckIds.length > 0 ? firedCheckIds.join(", ") : "(none)"}`,
  );

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ form, fired_check_ids: firedCheckIds }),
  });
  if (!response.ok) {
    throw new Error(`${key}: HTTP ${response.status} — ${await response.text()}`);
  }

  const result = GenerationResultSchema.parse(await response.json());
  const outPath = path.join(OUT_DIR, `${key}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(
    `${key}: wrote ${path.relative(ROOT, outPath)} — ` +
      `${result.critique.flags.length} model flags, ` +
      `${result.prd.mvp.out_of_scope.length} cuts`,
  );
}

console.log("Done. Commit data/showcase/ — these files are the showcase.");
