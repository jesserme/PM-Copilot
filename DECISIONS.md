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
