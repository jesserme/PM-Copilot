# PM Copilot — v1 Spec: Intake Schema & Reasoning Panel

**Artifact type:** One-page PRD (locked for v1)
**Working title:** PM Copilot — fine for now; if you want something less Microsoft-flavored later, candidates in the naming appendix.
**What this spec covers:** the intake form, the deterministic check layer, the LLM call contract, the output schema, and the reasoning panel UI. Everything else stays in your existing roadmap.

---

## 0. Design principles

These five decisions shape everything below. They are also the first five entries in your decisions log — each one had a real alternative you rejected.

1. **Every field earns its place.** An input exists only if it maps to an output section, forces a decision, or feeds a check. No "anything else?" fields.
2. **The tool advises, never blocks.** Flags are loud, but Generate always works. A tool that refuses to proceed is a linter; one that lets you proceed with eyes open is a colleague.
3. **Pushback starts before generation.** Cheap deterministic checks fire instantly, client-side, as the user types. The LLM critique arrives with the artifact. The demo moment is the form talking back.
4. **One LLM call, one schema.** PRD + critique + cut list return as a single validated JSON object. Cheaper, faster, and every pixel in the UI traces to a schema field.
5. **Honest critique only.** If the input is strong, the tool says so and flags less. Fabricated criticism trains users to ignore the panel — the panel's credibility *is* the product.

---

## 1. Intake schema

Target: completable in under 5 minutes. Nine fields, five required. Placeholder/helper text is part of the product voice — ship these strings, don't lorem-ipsum them.

| # | Field | Type | Req | Constraint | Helper text (ship this) | Why it exists |
|---|-------|------|-----|-----------|------------------------|---------------|
| 1 | `feature_name` | text | ✅ | ≤ 60 chars | "Name it like a real ticket, not a codename." | Title; keeps scope nameable |
| 2 | `one_liner` | text | ✅ | ≤ 140 chars | "What is it, in one sentence?" | Forces compression; becomes the PRD summary |
| 3 | `target_user` | text | ✅ | ≤ 120 chars | "Who exactly? 'Everyone' gets flagged." | Persona section; feeds vague-audience check |
| 4 | `problem` | textarea | ✅ | ≤ 600 chars | "What does this user do today instead, and what does that cost them?" | Problem statement; feeds status-quo critique |
| 5 | `evidence` | textarea | — | ≤ 400 chars | "Tickets, interviews, data, or honest 'personal experience.'" | Separates validated pain from hypothesis |
| 6 | `proposed_solution` | textarea | ✅ | ≤ 500 chars | "The smallest version that tests the idea." | Deliberately tight — overflow is a scope signal |
| 7 | `success_metric` | composite | ✅ | see below | — | Metrics section; vanity + no-target checks |
| 8 | `constraints` | composite | — | see below | — | Grounds MVP realism; LLM sizes scope against it |
| 9 | `riskiest_assumption` | text | — | ≤ 200 chars | "The thing that, if false, kills the idea." | Empty → flag; LLM proposes one regardless |

**Composite fields:**

```ts
interface IntakeForm {
  feature_name: string;
  one_liner: string;
  target_user: string;
  problem: string;
  evidence?: string;
  proposed_solution: string;
  success_metric: {
    metric: string;                 // "weekly active creators"
    target?: string;                // "30% of signups", "1.5k/wk"
    timeframe: "2_weeks" | "6_weeks" | "quarter" | "other";
  };
  constraints?: {
    team: "solo" | "two_three" | "squad_plus";
    platform: "web" | "mobile" | "both";
  };
  riskiest_assumption?: string;
}
```

Character limits are enforced with visible counters. The limits are a feature, not a cage — they're the first act of scope discipline the user experiences.

---

## 2. Deterministic check layer (client-side, instant, zero API cost)

Runs on field blur and on submit. Renders as small chips under the offending field, plus a summary bar above the Generate button:

> **3 flags · 2 warnings** — Generate anyway, or tighten first?

Each chip carries a tooltip labeled **"rule-based check"** — being transparent that these are heuristics, not model output, is part of the credibility story and sets up the visual distinction in the reasoning panel later.

| id | Trigger | Severity | User-facing message |
|----|---------|----------|---------------------|
| `vague_audience` | `target_user` matches `/\b(everyone|anyone|all users?|general public)\b/i` | warn | "'Everyone' is not a user. Narrow to whoever feels this most." |
| `vanity_metric` | metric matches `(sign.?ups|downloads|installs|page ?views|impressions|registered users)` AND lacks `(retention|activation|weekly|daily|repeat|paid|conversion)` | warn | "This counts activity, not value. Pair it with activation or retention." |
| `no_target` | `success_metric.target` empty | info | "Directional metric — you'll never be able to call this a win or a loss." |
| `no_evidence` | `evidence` empty | info | "Hypothesis-only PRD. Legit for a v0 — the document will say so out loud." |
| `no_assumption` | `riskiest_assumption` empty | info | "Every idea has one. Not being able to name it is itself the risk." |
| `kitchen_sink` | `proposed_solution` joins ≥ 3 clauses with "and"/commas, OR length > 90% of limit | warn | "Reads like several features. Expect the generator to cut — the out-of-scope list will be long." |

Implementation note: pure functions, `(form) => Flag[]`, unit-tested. This table is also portfolio material — it shows you encoded PM judgment as testable logic, which is exactly the "guardrails, not vibes" story.

---

## 3. LLM call contract

**Route:** `POST /api/generate` (Next.js API route — key stays server-side).
**Rate limit:** 5 generations/hour/IP. Showcase mode never touches this route.
**Model settings:** a small/fast model, temperature ~0.2–0.3, structured output enforced against the schema in §4 (both Anthropic and OpenAI APIs support schema-constrained JSON via tool-use / structured output modes — verify the current mechanism at docs.claude.com before wiring it).
**Request body:** the `IntakeForm` JSON **plus the array of fired check IDs**, so the model doesn't waste critique slots duplicating what the rules already caught.

**System prompt requirements** (we'll draft the full prompt next session; these are the contractual rules it must encode):

1. Role: a skeptical senior PM reviewing a junior PM's intake. Direct and specific, never rude.
2. Never invent data, users, quotes, or evidence. Anything inferred is explicitly labeled an assumption.
3. `mvp.in_scope` holds **max 3 items**. At least 1 `out_of_scope` item with a reason and a revisit condition — more if `kitchen_sink` fired.
4. Respect constraints: `solo` + short timeframe means brutal cuts, and the reasoning should say so.
5. Critique calibration: 2–5 flags for weak inputs. For genuinely strong inputs, fewer flags, and `strongest_element` should be specific praise. Never fabricate problems to seem rigorous.
6. Every string respects the max lengths baked into the schema.

**Failure handling:** validate the response with zod on the server. On parse failure, retry once with the validation error appended to the prompt; on second failure, return a friendly error state ("The model returned something malformed — try again"). Never render unvalidated output.

---

## 4. Output schema

One object, one source of truth for the entire results view:

```jsonc
{
  "prd": {
    "summary": "string",                       // ≤ 200 chars
    "problem_statement": "string",             // ≤ 500 chars
    "target_user": {
      "who": "string",
      "situation": "string"                    // when/where the pain hits
    },
    "mvp": {
      "in_scope": [                             // max 3
        { "item": "string", "rationale": "string" }
      ],
      "out_of_scope": [                         // min 1
        { "item": "string", "reason": "string", "revisit_when": "string" }
      ]
    },
    "success_metrics": [
      {
        "metric": "string",
        "target": "string | null",
        "timeframe": "string",
        "kind": "primary | guardrail"           // exactly one primary
      }
    ],
    "risks": [
      { "risk": "string", "severity": "low | med | high", "mitigation": "string" }
    ],
    "open_questions": ["string"],               // max 4
    "next_release": ["string"]                  // max 3
  },
  "critique": {
    "flags": [
      {
        "section": "problem | user | scope | metric | risk",
        "severity": "info | warn",
        "issue": "string",
        "why_it_matters": "string",
        "suggested_fix": "string"
      }
    ],
    "strongest_element": "string",
    "weakest_element": "string"
  },
  "meta": {
    "generated_at": "ISO-8601",
    "model": "string",
    "input_hash": "string"                      // sha of IntakeForm
  }
}
```

`input_hash` costs one line now and unlocks your best metric later: when editing ships, "regenerated after input change" and "artifact edited after generation" both key off it.

---

## 5. Reasoning panel — UI spec

**Layout:** PRD left (~60%), panel right (~40%). Mobile: stacked, panel reachable via sticky tab bar. The panel is not a sidebar afterthought — it gets equal visual weight in the design, because it *is* the differentiator.

**Section 1 — Flags.** A single merged stream:

- Rule-based checks carry a `RULE` badge; model critique carries a `MODEL` badge. Same card anatomy for both: severity dot · section chip · issue · *why it matters* · suggested fix.
- Clicking a flag scrolls to and briefly highlights the related PRD section (or intake field, for rule flags).
- Header shows the count: "5 flags · 2 warnings."

**Section 2 — The cut list.** `out_of_scope` rendered as its own artifact, not buried in the PRD: item / reason / revisit when. Framing line above it, verbatim:

> **What this MVP deliberately does not do.**

**Section 3 — Verdict.** Two lines only: strongest element, weakest element. This is the screenshot people share, and the fastest way for a recruiter to see judgment.

**v1 interaction budget:** the panel is read-only. One affordance: **"Edit inputs"** returns to the form with values intact (state, or localStorage). "Apply fix" buttons belong to the editable-sections release — resist them now; it's a good decisions-log entry.

---

## 6. Showcase mode (the default landing view)

Three canned examples, **pre-generated and stored as static JSON** — instant load, zero API cost, and the first thing a recruiter sees. Each carries a banner: *"Sample input · try your own →"*

| Tab | Input character | What it proves |
|-----|-----------------|----------------|
| **"Focused"** | Tight input, real evidence, honest metric | 1–2 info flags, positive verdict — proves the critic doesn't fabricate problems |
| **"Fuzzy"** ← default tab | Vague audience + vanity metric | The pushback is visible within 5 seconds of page load |
| **"Kitchen sink"** | Five features crammed into one solution field | A long, reasoned cut list — scope discipline on display |

The *Fuzzy* tab is the default deliberately: the differentiator should be the first pixel anyone sees.

---

## 7. Decisions-log seeds

This spec already contains the log's first entries. Write each as *decision → alternatives considered → why → revisit when*:

1. Structured form over freeform chat
2. Advise, never block
3. Deterministic checks layered under LLM critique (and visually distinguished)
4. One call, one schema — no multi-step agent chain
5. Showcase-first landing, live generation second
6. Three-item in-scope cap
7. Read-only panel in v1 (no "apply fix")

---

## 8. Explicitly out of scope for v1

Practicing what it preaches: auth, saved drafts, version history, editable sections, multiple artifact types, apply-fix actions, team features, analytics dashboards. The only persistence is localStorage "restore my last inputs."

---

## Appendix: naming candidates

Only if "PM Copilot" starts to feel generic on the portfolio page: **SpecCheck**, **Redline**, **FirstCut**, **OnePager**. All lean into the critique/cut identity rather than the generation identity — which is the right brand for this build.
