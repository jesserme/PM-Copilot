# PM Copilot — notes for Claude Code

- `pm-copilot-v1-spec.md` is the source of truth. Where anything else conflicts with it, the spec wins.
- `BUILD_PROMPT.md` governs the build: milestone order, checkpoints, and the definition of done (tsc clean, tests green, no console errors, committed). Stop at each milestone for review.
- Tests: `npm test` (vitest). Typecheck: `npm run typecheck`.
- The user-facing strings in spec §2 (check messages) and §1 (helper text) are product copy. Ship them verbatim — never paraphrase or "improve" them.
- No new dependencies without asking first. No database, no auth, no state-management library, no ORM.
- Character limits live in `INTAKE_LIMITS` in `lib/schema.ts` — the single source of truth. Never hardcode them elsewhere.
- Judgment calls and spec errata are logged in `DECISIONS.md`.
