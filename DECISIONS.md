# Decisions log

Format per spec §7: **decision → alternatives considered → why → revisit when.**

## Spec errata

1. **2026-07-12 — §1 required-field count.** Prose said "Nine fields, five required"; the field table and the TS interface both mark six fields required (`success_metric` carries the ✅). Corrected the prose to "six required." The table was right, the prose was not.
2. **2026-07-12 — §2 `vanity_metric` case sensitivity.** Shipped behavior matches both patterns case-insensitively (judgment call 2). Spec table row left as written — the bare patterns there read as illustrative, not as a case-sensitivity mandate.
3. **2026-07-16 — §2 `kitchen_sink` trigger.** The clause-splitting trigger ("joins ≥ 3 clauses with 'and'/commas") false-positived on prose enumerations, including two of the three showcase inputs. Spec table row replaced with the comma-count trigger (≥ 4 commas, or ≥ 3 commas and a ":"); the > 90%-length trigger, severity, and user-facing message are unchanged. See decision 11.
4. **2026-07-19 — §6 Focused showcase row.** Expectation updated from "1–2 info flags, positive verdict" to "≤3 legitimate flags, zero RULE chips, verdict opens with specific praise" — the calibration promise updated to match committed evidence. See decision 12.
5. **2026-07-19 — §4 `meta` gains `fired_check_ids`.** The rule checks that fired for an input are recorded in the output at generation time, as the showcase drift guard. See decision 14.

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

## Post-M3 ruling

### 11. `kitchen_sink` v2 — comma-count trigger; " and " removed as a signal

- **Decision:** (2026-07-16, resolving the M3 open item, option b) Fire on ≥ 4 commas, or ≥ 3 commas plus a ":", in `proposed_solution`; the > 90%-length trigger, severity, and user-facing message are unchanged. Clause splitting on " and " is deleted, and with it the hyphenated-compound special case it required. Showcase inputs stay exactly as written and are promoted to permanent test fixtures, pinned verbatim (fire: CampusHub; no-fire: Fuzzy, Focused).
- **Alternatives considered:** Keep the v1 clause-splitting trigger (false-positives on showcase prose); reword the showcase solutions to dodge the trigger (hides the bug and edits product fixtures to fit a heuristic).
- **Why:** The rule layer is tuned for precision because the costs are asymmetric: a false RULE chip presents itself as deterministic fact and erodes the credibility the panel is built on, while a missed enumeration is backstopped by the model layer, which owns semantic scope judgment — and since the model receives the fired-ids list, an un-fired `kitchen_sink` leaves it free to raise scope itself. " and " is removed as a signal because prose conjunctions are overwhelmingly benign connectors, not feature seams.
- **Revisit when:** Real inputs show list-style solutions with ≤ 3 commas slipping past both layers, or the corpus gains cases the comma rule cannot separate.

## M5 rulings

### 12. Focused output kept; calibration promises follow evidence

- **Decision:** The committed `focused.json` stays as generated (3 legitimate flags, 2 warn). The spec §6 row was updated to match (erratum 4) rather than the output re-rolled to match the promise.
- **Alternatives considered:** Re-roll until an output matches the old "1–2 info flags" promise.
- **Why:** Calibration promises get updated by evidence; committed outputs are never re-rolled for taste. Cherry-picking generations until they flatter the marketing would quietly undermine the honest-critique brand the panel sells.
- **Revisit when:** Model calibration drifts enough that "legitimate" no longer describes the Focused flags.

### 13. Constraints-fidelity rule; kitchen_sink regenerated under audit

- **Decision:** The system prompt's field guidance gains: "Constraints fidelity: reference platform, team size, and timeline exactly as the intake states them; never assume one that isn't given." `kitchen_sink.json` was regenerated through the same pregenerate path, and every model flag in the new output was audited against the raw input before committing — all passed; the new scope flag quotes `'both'` and "2–3 person team" exactly as stated.
- **Alternatives considered:** Hand-edit the committed JSON (falsifies provenance); leave the fabricated flag.
- **Why:** The prior roll's flag ("iOS-only launch is a hard constraint") cited a constraint the input never stated — a hard-rule-1 violation sitting in the portfolio's front window.
- **Revisit when:** Any future output's flag cites a fact absent from its input.

### 14. Drift guard: `fired_check_ids` recorded in `meta`

- **Decision:** `/api/generate` appends the request's `fired_check_ids` to `meta` (erratum 5). The three committed showcase files were backfilled with today's `runChecks` output — valid because no rule changes landed between their generation and the backfill. A test asserts, per showcase pair, `runChecks(input)` equals the committed `meta.fired_check_ids`.
- **Alternatives considered:** Recompute-only at render time (drift stays invisible); no guard at all.
- **Why:** Committed results embed the rule layer's behavior at generation time; recording it makes drift fail in CI instead of surfacing in a production demo.
- **Revisit when:** A rule change is intentional — regenerate the showcase, or re-backfill with a logged justification here.

### 15. "Back to samples" link (M5 addition, approved)

- **Decision:** The form view carries a small "← Back to samples" link whenever showcase data is present.
- **Alternatives considered:** No path back (the spec is silent).
- **Why:** With showcase as the default landing view, returning to it is basic navigation, not a feature addition.
- **Revisit when:** Navigation is reworked (e.g., real routes instead of view state).

### 16. Prompt promoted to `lib/prompt-text.ts`; markdown is documentation

- **Decision:** `SYSTEM_PROMPT` and `USER_MESSAGE_TEMPLATE` are exported consts and the single runtime source; `app-system-prompt.md` carries a pointer header and mirrors the content for reading. No runtime fs reads of markdown.
- **Alternatives considered:** Keep the fs read and configure serverless file tracing (`outputFileTracingIncludes`) at deploy time.
- **Why:** Serverless bundling reliability over file-loading purity — every bundler traces module imports; loose files get traced only sometimes, and the failure mode is a 500 in production.
- **Revisit when:** The prompt grows variants or versions worth loading dynamically.
