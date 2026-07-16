import type { CheckId, Flag } from "@/lib/checks";
import type { Critique, CritiqueFlag } from "@/lib/schema";
import { PRD_ANCHORS } from "./PrdView";

// Where a click lands (spec §5): every flag maps to a PRD section. Rule flags
// were raised against intake fields, so each check id maps to the section its
// field feeds.
const RULE_ANCHOR: Record<CheckId, string> = {
  vague_audience: PRD_ANCHORS.user,
  vanity_metric: PRD_ANCHORS.metric,
  no_target: PRD_ANCHORS.metric,
  no_evidence: PRD_ANCHORS.problem,
  no_assumption: PRD_ANCHORS.risk,
  kitchen_sink: PRD_ANCHORS.scope,
};

const RULE_SECTION: Record<CheckId, CritiqueFlag["section"]> = {
  vague_audience: "user",
  vanity_metric: "metric",
  no_target: "metric",
  no_evidence: "problem",
  no_assumption: "risk",
  kitchen_sink: "scope",
};

const MODEL_ANCHOR: Record<CritiqueFlag["section"], string> = {
  problem: PRD_ANCHORS.problem,
  user: PRD_ANCHORS.user,
  scope: PRD_ANCHORS.scope,
  metric: PRD_ANCHORS.metric,
  risk: PRD_ANCHORS.risk,
};

const DOT: Record<"info" | "warn", string> = {
  warn: "bg-amber-500",
  info: "bg-sky-500",
};

interface StreamFlag {
  key: string;
  source: "RULE" | "MODEL";
  severity: "info" | "warn";
  section: CritiqueFlag["section"];
  issue: string;
  why?: string;
  fix?: string;
  anchor: string;
}

// Spec §5: a single merged stream — rule-based checks and model critique in
// the same card anatomy, distinguished only by the badge.
function mergeFlags(ruleFlags: readonly Flag[], critique: Critique): StreamFlag[] {
  const rules: StreamFlag[] = ruleFlags.map((flag) => ({
    key: `rule-${flag.id}`,
    source: "RULE",
    severity: flag.severity,
    section: RULE_SECTION[flag.id],
    issue: flag.message,
    anchor: RULE_ANCHOR[flag.id],
  }));
  const model: StreamFlag[] = critique.flags.map((flag, index) => ({
    key: `model-${index}`,
    source: "MODEL",
    severity: flag.severity,
    section: flag.section,
    issue: flag.issue,
    why: flag.why_it_matters,
    fix: flag.suggested_fix,
    anchor: MODEL_ANCHOR[flag.section],
  }));
  return [...rules, ...model];
}

export default function ReasoningPanel({
  ruleFlags,
  critique,
  outOfScope,
  onFlagClick,
}: {
  ruleFlags: readonly Flag[];
  critique: Critique;
  outOfScope: Array<{ item: string; reason: string; revisit_when: string }>;
  onFlagClick: (anchorId: string) => void;
}) {
  const flags = mergeFlags(ruleFlags, critique);
  const warnCount = flags.filter((flag) => flag.severity === "warn").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Section 1 — Flags */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Flags</h2>
        <p className="mt-1 text-sm font-semibold text-zinc-900">
          {flags.length} {flags.length === 1 ? "flag" : "flags"} · {warnCount}{" "}
          {warnCount === 1 ? "warning" : "warnings"}
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {flags.map((flag) => (
            <li key={flag.key}>
              <button
                type="button"
                onClick={() => onFlagClick(flag.anchor)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-400 hover:shadow-sm"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[flag.severity]}`} />
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    {flag.section}
                  </span>
                  <span
                    title={flag.source === "RULE" ? "rule-based check" : "model critique"}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ${
                      flag.source === "RULE"
                        ? "bg-zinc-800 text-white"
                        : "bg-indigo-600 text-white"
                    }`}
                  >
                    {flag.source}
                  </span>
                </span>
                <span className="mt-2 block text-sm font-semibold text-zinc-900">{flag.issue}</span>
                {flag.why && <span className="mt-1 block text-sm italic text-zinc-600">{flag.why}</span>}
                {flag.fix && (
                  <span className="mt-1.5 block text-sm text-zinc-800">
                    <span className="font-medium">Fix:</span> {flag.fix}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Section 2 — The cut list */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          The cut list
        </h2>
        <p className="mt-1 text-sm font-bold text-zinc-900">
          What this MVP deliberately does not do.
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {outOfScope.map((cut, index) => (
            <li key={index} className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-900">{cut.item}</p>
              <p className="mt-1 text-sm text-zinc-600">{cut.reason}</p>
              <p className="mt-1.5 text-xs text-zinc-500">
                <span className="font-semibold uppercase tracking-wide">Revisit when</span> —{" "}
                {cut.revisit_when}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Section 3 — Verdict: two lines only. */}
      <section className="rounded-xl bg-zinc-900 p-4 text-white">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Verdict</h2>
        <p className="mt-2 text-sm leading-6">
          <span className="font-semibold text-emerald-400">Strongest</span> —{" "}
          {critique.strongest_element}
        </p>
        <p className="mt-2 text-sm leading-6">
          <span className="font-semibold text-amber-400">Weakest</span> —{" "}
          {critique.weakest_element}
        </p>
      </section>
    </div>
  );
}
