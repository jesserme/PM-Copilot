import type { GenerationResult, Prd } from "@/lib/schema";
import type { ReactNode } from "react";

// Anchor ids for flag-click navigation (spec §5): the reasoning panel maps
// every flag — rule or model — to one of these sections.
export const PRD_ANCHORS = {
  summary: "prd-summary",
  problem: "prd-problem",
  user: "prd-user",
  scope: "prd-scope",
  metric: "prd-metric",
  risk: "prd-risk",
  questions: "prd-questions",
  next: "prd-next",
} as const;

const KIND_BADGE: Record<"primary" | "guardrail", string> = {
  primary: "bg-zinc-900 text-white",
  guardrail: "bg-zinc-100 text-zinc-600",
};

const RISK_BADGE: Record<"low" | "med" | "high", string> = {
  low: "bg-zinc-100 text-zinc-600",
  med: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-700",
};

function Section({
  id,
  title,
  highlighted,
  children,
}: {
  id: string;
  title: string;
  highlighted: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-xl border p-5 transition-all duration-500 ${
        highlighted
          ? "border-amber-400 bg-amber-50 ring-2 ring-amber-300"
          : "border-zinc-200 bg-white"
      }`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
      <div className="mt-2 text-sm leading-6 text-zinc-800">{children}</div>
    </section>
  );
}

export default function PrdView({
  prd,
  meta,
  highlightId,
}: {
  prd: Prd;
  meta: GenerationResult["meta"];
  highlightId: string | null;
}) {
  const lit = (id: string) => highlightId === id;
  return (
    <div className="flex flex-col gap-4">
      <Section id={PRD_ANCHORS.summary} title="Summary" highlighted={lit(PRD_ANCHORS.summary)}>
        {prd.summary}
      </Section>

      <Section id={PRD_ANCHORS.problem} title="Problem" highlighted={lit(PRD_ANCHORS.problem)}>
        {prd.problem_statement}
      </Section>

      <Section id={PRD_ANCHORS.user} title="Target user" highlighted={lit(PRD_ANCHORS.user)}>
        <p className="font-medium">{prd.target_user.who}</p>
        <p className="mt-1 text-zinc-600">{prd.target_user.situation}</p>
      </Section>

      <Section id={PRD_ANCHORS.scope} title="MVP — in scope" highlighted={lit(PRD_ANCHORS.scope)}>
        <ol className="flex flex-col gap-3">
          {prd.mvp.in_scope.map((entry, index) => (
            <li key={index}>
              <p className="font-medium">
                {index + 1}. {entry.item}
              </p>
              <p className="mt-0.5 text-zinc-600">{entry.rationale}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-zinc-400">
          Cuts live in the reasoning panel — see the cut list.
        </p>
      </Section>

      <Section id={PRD_ANCHORS.metric} title="Success metrics" highlighted={lit(PRD_ANCHORS.metric)}>
        <ul className="flex flex-col gap-3">
          {prd.success_metrics.map((metric, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${KIND_BADGE[metric.kind]}`}
              >
                {metric.kind}
              </span>
              <span className="font-medium">{metric.metric}</span>
              <span className="text-zinc-500">
                {metric.target ?? "no target"} · {metric.timeframe}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id={PRD_ANCHORS.risk} title="Risks" highlighted={lit(PRD_ANCHORS.risk)}>
        {prd.risks.length === 0 && <p className="text-zinc-400">None identified.</p>}
        <ul className="flex flex-col gap-3">
          {prd.risks.map((risk, index) => (
            <li key={index}>
              <p className="font-medium">
                <span
                  className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${RISK_BADGE[risk.severity]}`}
                >
                  {risk.severity}
                </span>
                {risk.risk}
              </p>
              <p className="mt-0.5 text-zinc-600">{risk.mitigation}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id={PRD_ANCHORS.questions}
        title="Open questions"
        highlighted={lit(PRD_ANCHORS.questions)}
      >
        {prd.open_questions.length === 0 && <p className="text-zinc-400">None.</p>}
        <ul className="list-disc pl-5">
          {prd.open_questions.map((question, index) => (
            <li key={index} className="mt-1 first:mt-0">
              {question}
            </li>
          ))}
        </ul>
      </Section>

      <Section id={PRD_ANCHORS.next} title="Next release" highlighted={lit(PRD_ANCHORS.next)}>
        {prd.next_release.length === 0 && <p className="text-zinc-400">Nothing deferred.</p>}
        <ul className="list-disc pl-5">
          {prd.next_release.map((item, index) => (
            <li key={index} className="mt-1 first:mt-0">
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <p className="px-1 text-xs text-zinc-400">
        Generated {new Date(meta.generated_at).toLocaleString()} · {meta.model}
      </p>
    </div>
  );
}
