# Decisions log

Format per spec §7: **decision → alternatives considered → why → revisit when.**

## Spec errata

- **2026-07-12 — §1 required-field count.** Prose said "Nine fields, five required"; the field table and the TS interface both mark six fields required (`success_metric` carries the ✅). Corrected the prose to "six required." The table was right, the prose was not.

## M1 judgment calls

### 1. Required-field count follows the table (six), not the prose (five)

- **Decision:** `IntakeFormSchema` treats six fields as required: `feature_name`, `one_liner`, `target_user`, `problem`, `proposed_solution`, `success_metric`.
- **Alternatives considered:** Follow the prose ("five required") by making `success_metric` optional.
- **Why:** The field table and the TS interface — the two precise artifacts in §1 — agree on six. An optional success metric would also undermine the `vanity_metric` and `no_target` checks, which assume the composite exists.
- **Revisit when:** Spec §1 changes the required set. (Prose erratum logged above.)

### 2. Case-insensitive matching for `vanity_metric` patterns

- **Decision:** Both the vanity pattern and the value-signal pattern are applied with the `i` flag.
- **Alternatives considered:** Literal reading of spec §2, which writes `/i` on `vague_audience` but bare patterns for `vanity_metric` — i.e. case-sensitive matching.
- **Why:** "Signups" and "signups" express identical PM judgment; missing the capitalized form would be a false negative a user would rightly call a bug. The `/i` on the neighboring check reads as the table's intent, not an exception.
- **Revisit when:** A metric string appears where case legitimately changes meaning (none known).

### 3. "Exactly one primary" enforced in the schema, not just the prompt

- **Decision:** `GenerationResultSchema` carries a zod refine: `success_metrics` must contain exactly one entry with `kind: "primary"`.
- **Alternatives considered:** Leave it as prompt-level guidance only — the §4 annotation is a comment, not a field constraint.
- **Why:** The schema is the format guarantee (design principle §0.4); a comment the validator ignores is a rule the model will eventually break silently. On violation the refine's error message feeds the one retry with a precise correction.
- **Revisit when:** Parse-failure retries spike because the model can't satisfy the invariant.

### 4. `mvp.in_scope` requires at least one item

- **Decision:** `in_scope` is `.min(1).max(3)`; the spec only states "max 3."
- **Alternatives considered:** Max-only, permitting an empty in-scope list.
- **Why:** A PRD whose MVP builds nothing is malformed output, not honest critique — the cut list is where "build almost nothing" belongs. An empty array would also render a blank PRD section.
- **Revisit when:** A deliberate "don't build this at all" verdict becomes a supported product behavior.

### 5. `kitchen_sink` splits clauses on commas and whitespace-surrounded "and"

- **Decision:** Clause joins are `,` or `\s+and\s+` (case-insensitive); the field fires at ≥ 3 resulting non-empty clauses, or at > 90% of the length limit.
- **Alternatives considered:** `\band\b`, the literal word-boundary reading — which also matches hyphenated compounds, so "drag-and-drop editor" would count as three clauses and false-positive.
- **Why:** Prose clause joins have spaces around "and"; hyphenated feature names are common and must not trip a scope warning. Both behaviors are pinned by unit tests.
- **Revisit when:** Real inputs show missed enumerations (e.g. "and"-less comma splices already fire) or noisy false positives from commas inside numbers like "1,000".

## M3 judgment calls

### 6. Raw `fetch` instead of `@anthropic-ai/sdk`

- **Decision:** `app/api/generate/route.ts` calls `POST /v1/messages` with native fetch.
- **Alternatives considered:** The official TypeScript SDK (typed client, built-in retries).
- **Why:** BUILD_PROMPT forbids new dependencies without asking first. One endpoint with spec-defined retry semantics (exactly one retry, on parse failure only) stays small and auditable over raw HTTP. Swappable on request.
- **Revisit when:** The app needs more of the API surface (streaming, batches) or SDK-only conveniences.

### 7. The model returns `prd` + `critique`; the server assembles `meta`

- **Decision:** Structured output is constrained to `GenerationPayloadSchema` (= `GenerationResultSchema` minus `meta`). The server adds `generated_at`, `model`, and the sha256 `input_hash`, then re-validates the complete object before responding.
- **Alternatives considered:** Have the model echo `meta` fields.
- **Why:** The model cannot know the true timestamp, model id, or input hash — asking it to produce them invites fabrication, which the system prompt's "never invent" rule exists to prevent.
- **Revisit when:** `meta` gains fields the model should legitimately author.

### 8. Length limits enforced by zod post-parse, not by the wire schema

- **Decision:** The structured-outputs API rejects `maxLength`/`maxItems`-style keywords, so they are stripped from the JSON schema sent to the API (`OUTPUT_SCHEMA` in `lib/prompt.ts`); zod re-enforces all lengths plus "exactly one primary" server-side, and the single retry carries any violations back to the model.
- **Alternatives considered:** None viable — the API rejects those keywords outright.
- **Why:** Matches spec §3's layering: the schema is the format guarantee, the prompt supplies judgment, and validation + one retry covers the residue.
- **Revisit when:** Structured outputs starts accepting length constraints.

### 9. In-memory rate limiter (Upstash credentials not provided)

- **Decision:** Module-level `Map`, sliding one-hour window, 5/IP, `429` + `Retry-After`; body validation runs *before* the limiter so malformed requests don't consume quota.
- **Alternatives considered:** `@upstash/ratelimit` + Upstash Redis — BUILD_PROMPT's stated default.
- **Why:** BUILD_PROMPT rule 3's explicit fallback when the Upstash env vars are absent. The loud comment in the route documents the per-instance weakness on serverless and the upgrade path.
- **Revisit when:** `UPSTASH_REDIS_REST_URL`/`TOKEN` are provided (deploy, M6).

### 10. Two friendly errors: transport failure vs malformed output

- **Decision:** Network/HTTP/refusal/truncation failures return 502 "Generation failed — try again." The spec's verbatim string — "The model returned something malformed — try again" — is reserved for the double parse-failure path it describes.
- **Alternatives considered:** One string for both.
- **Why:** The spec ties its string to the parse-retry flow; reusing it for transport errors would misreport what happened.
- **Revisit when:** Error-state copy is finalized in M6.

## Open item — needs a ruling (raised at the M3 checkpoint)

- **`kitchen_sink` vs the showcase expectations.** The literal spec §2 trigger (≥ 3 clauses joined by "and"/commas) fires on prose enumerations inside both showcase inputs — fuzzy's "…progress, goals, and available equipment" and focused's "save…, insert one…, and variables auto-fill…". `showcase-inputs.json`'s `_note` expects fuzzy to fire five checks (no kitchen_sink) and focused ~0–1. Spec table and note conflict; implementation follows the spec table and is unit-tested. Decision affects M5 pregeneration. Options presented at checkpoint.
