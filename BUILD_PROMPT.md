# BUILD_PROMPT — PM Copilot v1

**How to use this file**

1. Create a new GitHub repo (public — it's portfolio evidence) and clone it.
2. Drop `pm-copilot-v1-spec.md`, `app-system-prompt.md`, and `showcase-inputs.json` into the repo root.
3. Open Claude Code (or Cursor) in the repo and paste everything below the line as your first message.
4. Stop at each milestone checkpoint and verify before saying "continue."

Adaptations for Lovable / v0 are at the bottom.

---

You are building **PM Copilot v1**, a portfolio web app that turns a structured intake form into a one-page PRD plus an honest critique of the input.

**Source of truth:** read `./pm-copilot-v1-spec.md` in full before writing any code. Where this prompt and the spec conflict, the spec wins. The in-app LLM system prompt lives in `./app-system-prompt.md` — load it, don't rewrite it.

## Stack (fixed)

- Next.js (App Router) + TypeScript + Tailwind CSS
- `zod` for all validation, `vitest` for unit tests
- shadcn/ui is allowed for form primitives if it saves time
- **No other dependencies without asking me first.** No database, no auth library, no state-management library, no ORM.

## Architecture

```
lib/schema.ts          zod schemas for IntakeForm + GenerationResult
                       (mirror spec §1 and §4 exactly, incl. max lengths and enums)
lib/checks.ts          the six deterministic checks from spec §2 as pure
                       functions (form) => Flag[] — no React, no side effects
lib/checks.test.ts     unit tests: every trigger AND non-trigger case per check
lib/prompt.ts          builds model messages from app-system-prompt.md +
                       intake JSON + fired check ids
app/api/generate/route.ts   POST: validate body → rate limit → call model →
                       zod-parse → retry once on parse failure → typed response
app/page.tsx           showcase mode (default view) + "try your own" form
components/            IntakeForm, FlagChip, PrdView, ReasoningPanel
                       (Flags / CutList / Verdict sections)
data/showcase/*.json   three pre-generated GenerationResults (committed)
scripts/pregenerate.ts runs the three inputs in showcase-inputs.json through
                       the real pipeline once and writes data/showcase/
```

## Non-negotiable rules

1. **API key stays server-side.** Env var `ANTHROPIC_API_KEY`, read only inside the API route. If any key ever reaches client code, that is a bug.
2. **Model call:** default model `claude-haiku-4-5` (cheap + fast; keep the model id as a single exported const so it's swappable — verify the current model list and structured-output mechanism at docs.claude.com before wiring). Temperature 0.25. The response format is constrained to the `GenerationResult` schema via the API's structured-output / tool-schema mode — the schema is the format guarantee, the prompt supplies the judgment.
3. **Rate limit `/api/generate` at 5 requests/hour/IP.** Default implementation: `@upstash/ratelimit` + Upstash Redis free tier (env vars `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`). If I haven't provided those, fall back to an in-memory Map and leave a loud comment explaining that per-instance memory is a weak limiter on serverless, with the Upstash upgrade path noted.
4. **Parse failure handling:** zod-validate the model output server-side. On failure, retry exactly once with the validation error appended to the message; on second failure return a friendly 502-style JSON error. Never render unvalidated model output.
5. **No auth, no database, no version history.** The only persistence is localStorage "restore my last inputs."
6. **Showcase JSON is generated once** by `scripts/pregenerate.ts` and committed. The app never regenerates it at runtime; showcase mode makes zero API calls.
7. **Mobile:** PRD and reasoning panel stack vertically with a sticky tab bar, per spec §5.
8. **Commit at every milestone** with a descriptive message (`M1: schemas + deterministic checks with tests`, …). The commit history is part of the portfolio.

## Milestones — stop after each and tell me what to verify

- **M1 — Foundations.** `lib/schema.ts`, `lib/checks.ts`, full test suite green. Show me the test output.
- **M2 — Intake form.** All nine fields from spec §1 with char counters and helper text, live rule chips on blur, summary bar ("3 flags · 2 warnings — Generate anyway, or tighten first?"). Generate button always enabled.
- **M3 — Generation pipeline.** API route end-to-end with one real generation from my terminal (curl or a tiny script). Show me the raw JSON that came back.
- **M4 — Results view.** PRD left / reasoning panel right; merged flag stream with RULE vs MODEL badges; clicking a flag scrolls to and highlights its section; cut list under the heading "What this MVP deliberately does not do"; two-line Verdict.
- **M5 — Showcase mode.** Run `scripts/pregenerate.ts` against `showcase-inputs.json`, commit the three results, make showcase the default landing view with "Fuzzy" as the default tab and a "Sample input · try your own →" banner.
- **M6 — Ship.** Empty/error/loading states, a README that links the spec and explains the RULE/MODEL layering in two paragraphs, deploy to Vercel, verify rate limiting works in production.

**Definition of done per milestone:** `tsc` clean, tests pass, no console errors, committed.

## Do not

- Add features beyond the spec (no dark mode detours, no extra artifact types, no "apply fix" buttons — those are explicitly out of scope for v1).
- Paraphrase or "improve" the user-facing check messages or helper text — ship the strings from spec §2 verbatim.
- Duplicate validation logic: the zod schemas are the single source of truth for limits.

---

## Adaptations

**Lovable:** paste the spec and this prompt into the project chat. Replace the Next.js API route with a Supabase Edge Function that holds the key and does the rate limiting; keep `lib/checks.ts` and its tests identical on the client. Connect GitHub sync in the first session so the repo exists from day one, and review the generated check functions line by line — they're the differentiator.

**v0:** use it only for M2 and M4 (visual scaffolding of the form and results layout). Export the code to your repo, then continue M1/M3/M5/M6 with Claude Code or Cursor. Don't build the API route inside v0.
