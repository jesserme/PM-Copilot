import type { Flag } from "@/lib/checks";

// Spec §2: every rule chip carries a tooltip labeled "rule-based check" —
// being transparent that these are heuristics, not model output, is part of
// the credibility story.
const STYLES: Record<Flag["severity"], { chip: string; dot: string }> = {
  warn: { chip: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  info: { chip: "border-zinc-200 bg-zinc-50 text-zinc-600", dot: "bg-sky-500" },
};

export default function FlagChip({ flag }: { flag: Flag }) {
  const style = STYLES[flag.severity];
  return (
    <span
      title="rule-based check"
      className={`inline-flex items-start gap-1.5 rounded-md border px-2 py-1 text-xs leading-5 ${style.chip}`}
    >
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      {flag.message}
    </span>
  );
}
