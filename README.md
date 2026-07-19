# PM Copilot

A portfolio web app that turns a structured intake form into a one-page PRD — plus an honest critique of the input. The landing page is a pre-generated showcase (three canned inputs: Focused, Fuzzy, Kitchen sink); "try your own" runs the live pipeline.

**Live:** https://pm-copilot-black.vercel.app

- **Spec (source of truth):** [pm-copilot-v1-spec.md](./pm-copilot-v1-spec.md)
- **Judgment calls & spec errata:** [DECISIONS.md](./DECISIONS.md)
- **In-app LLM prompt:** runtime source in [lib/prompt-text.ts](./lib/prompt-text.ts), documented in [app-system-prompt.md](./app-system-prompt.md)

## The RULE / MODEL layering

The first layer is deterministic: six pure-function checks ([lib/checks.ts](./lib/checks.ts)) run client-side on field blur and on submit — vague audience, vanity metric, missing target, missing evidence, missing riskiest assumption, kitchen-sink scope. They cost nothing, fire instantly, and are unit-tested down to their boundary conditions, because they encode PM judgment as testable logic rather than vibes. Every chip they produce is labeled **RULE** and tooltipped "rule-based check": the app is explicit that these are heuristics, and the heuristics are deliberately tuned for precision over recall — a false deterministic flag would erode the credibility the whole panel depends on (see DECISIONS.md #11).

The second layer is the model: one schema-constrained call per generation (`claude-haiku-4-5`, structured outputs, temperature 0.25) that returns the PRD, the critique, and the cut list as a single validated object — the schema guarantees the format, the prompt supplies the judgment, and the server re-validates with zod and retries exactly once on a malformed response. The model receives the list of rule checks that already fired so it never wastes critique slots repeating them; its flags carry **MODEL** badges in the same card anatomy as the rule chips. The two layers are complementary by design: the rules catch what is mechanically checkable, and the model owns the semantic judgment — like whether a solution *reads* like five features — that the precision-tuned rules deliberately leave to it.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest — checks corpus + showcase drift guard
npm run typecheck  # tsc --noEmit
```

`.env.local`:

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | for live generation | Read only inside `app/api/generate/route.ts` — never reaches the client |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | no | Shared 5/hour/IP rate limit; without them the route falls back to a per-instance in-memory limiter (fine for dev, weak on serverless) |

Showcase mode needs no keys at all — it renders committed JSON and makes zero API calls.

## Showcase data

The three results in [data/showcase/](./data/showcase) were generated once by [scripts/pregenerate.ts](./scripts/pregenerate.ts) through the real `/api/generate` pipeline and committed. Each result records the rule checks that fired at generation time (`meta.fired_check_ids`), and a drift-guard test fails the suite if the rule layer ever disagrees with a committed result — regenerate (`node scripts/pregenerate.ts <key>`, dev server running) or re-justify in DECISIONS.md.

## Rate limiting

`POST /api/generate` is limited to **5 generations/hour/IP** (Upstash sliding window when configured; in-memory fallback otherwise). Request validation runs before the limiter, so malformed requests never consume quota.
