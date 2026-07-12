"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import FlagChip from "./FlagChip";
import { runChecks, type Flag } from "@/lib/checks";
import {
  ConstraintsSchema,
  INTAKE_LIMITS,
  IntakeFormSchema,
  TimeframeSchema,
  type Constraints,
  type IntakeForm,
  type Timeframe,
} from "@/lib/schema";

// The only persistence in v1 (spec §8): restore my last inputs.
const STORAGE_KEY = "pm-copilot:last-inputs";

// Flat editing state. Composite/optional intake fields are assembled from it
// in toIntakeForm; empty string means "not provided".
type Draft = {
  feature_name: string;
  one_liner: string;
  target_user: string;
  problem: string;
  evidence: string;
  proposed_solution: string;
  metric: string;
  target: string;
  timeframe: Timeframe;
  team: Constraints["team"] | "";
  platform: Constraints["platform"] | "";
  riskiest_assumption: string;
};

const EMPTY_DRAFT: Draft = {
  feature_name: "",
  one_liner: "",
  target_user: "",
  problem: "",
  evidence: "",
  proposed_solution: "",
  metric: "",
  target: "",
  timeframe: "6_weeks",
  team: "",
  platform: "",
  riskiest_assumption: "",
};

const TIMEFRAME_VALUES = TimeframeSchema.options;
const TEAM_VALUES = ConstraintsSchema.shape.team.options;
const PLATFORM_VALUES = ConstraintsSchema.shape.platform.options;

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "2_weeks": "2 weeks",
  "6_weeks": "6 weeks",
  quarter: "Quarter",
  other: "Other",
};

const TEAM_LABELS: Record<Constraints["team"], string> = {
  solo: "Solo",
  two_three: "2–3 people",
  squad_plus: "Squad+",
};

const PLATFORM_LABELS: Record<Constraints["platform"], string> = {
  web: "Web",
  mobile: "Mobile",
  both: "Both",
};

const ALL_FIELDS: readonly (keyof IntakeForm)[] = [
  "feature_name",
  "one_liner",
  "target_user",
  "problem",
  "evidence",
  "proposed_solution",
  "success_metric",
  "constraints",
  "riskiest_assumption",
];

const opt = (value: string): string | undefined => (value.trim() === "" ? undefined : value);

function toIntakeForm(d: Draft): IntakeForm {
  return {
    feature_name: d.feature_name,
    one_liner: d.one_liner,
    target_user: d.target_user,
    problem: d.problem,
    evidence: opt(d.evidence),
    proposed_solution: d.proposed_solution,
    success_metric: {
      metric: d.metric,
      target: opt(d.target),
      timeframe: d.timeframe,
    },
    constraints:
      d.team !== "" && d.platform !== "" ? { team: d.team, platform: d.platform } : undefined,
    riskiest_assumption: opt(d.riskiest_assumption),
  };
}

// Guards a possibly stale/corrupt localStorage payload back into a valid Draft.
function fromStored(raw: unknown): Draft {
  if (typeof raw !== "object" || raw === null) return EMPTY_DRAFT;
  const stored = raw as Partial<Record<keyof Draft, unknown>>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | "" =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : "";
  return {
    feature_name: str(stored.feature_name),
    one_liner: str(stored.one_liner),
    target_user: str(stored.target_user),
    problem: str(stored.problem),
    evidence: str(stored.evidence),
    proposed_solution: str(stored.proposed_solution),
    metric: str(stored.metric),
    target: str(stored.target),
    timeframe: pick(stored.timeframe, TIMEFRAME_VALUES) || EMPTY_DRAFT.timeframe,
    team: pick(stored.team, TEAM_VALUES),
    platform: pick(stored.platform, PLATFORM_VALUES),
    riskiest_assumption: str(stored.riskiest_assumption),
  };
}

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 " +
  "placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10";

function FieldShell({
  id,
  label,
  required,
  helper,
  value,
  max,
  error,
  flags,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  helper?: string;
  value?: string;
  max?: number;
  error?: string;
  flags: Flag[];
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-zinc-900">
          {label}
          {required && <span className="text-zinc-400"> *</span>}
        </label>
        {max !== undefined && value !== undefined && (
          <span
            className={`text-xs tabular-nums ${
              value.length > max * 0.9 ? "text-amber-600" : "text-zinc-400"
            }`}
          >
            {value.length} / {max}
          </span>
        )}
      </div>
      <div className="mt-1.5">{children}</div>
      {helper && (
        <p id={`${id}-helper`} className="mt-1.5 text-xs text-zinc-500">
          {helper}
        </p>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
      {flags.length > 0 && (
        <div aria-live="polite" className="mt-2 flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <FlagChip key={f.id} flag={f} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function IntakeForm() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<keyof IntakeForm>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "ready">("idle");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // localStorage is client-only; restoring after mount keeps hydration consistent.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setDraft(fromStored(JSON.parse(raw)));
    } catch {
      // Corrupt stored draft — start clean.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Storage blocked or full — restore is best-effort.
    }
  }, [draft, loaded]);

  const intake = useMemo(() => toIntakeForm(draft), [draft]);
  // Spec §2: checks run on field blur and on submit. They are recomputed live,
  // but a field's chips only render once that field has been touched (blurred)
  // or the form submitted — so fixing an issue clears its chip immediately.
  const flags = useMemo(() => runChecks(intake), [intake]);
  const visibleFlags = useMemo(
    () => flags.filter((f) => touched.has(f.field)),
    [flags, touched],
  );

  // Hard validity (empty required fields) is separate from advisory flags:
  // flags never block, but the API will reject an invalid IntakeForm.
  const errors = useMemo<Record<string, string>>(() => {
    if (!showErrors) return {};
    const result = IntakeFormSchema.safeParse(intake);
    if (result.success) return {};
    return Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join("."),
        issue.code === "too_small" ? "Required." : issue.message,
      ]),
    );
  }, [intake, showErrors]);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSubmitState("idle");
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const touch = (field: keyof IntakeForm) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(new Set(ALL_FIELDS));
    if (!IntakeFormSchema.safeParse(intake).success) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setSubmitState("ready"); // M3 replaces this with POST /api/generate.
  }

  const flagsFor = (field: keyof IntakeForm) => visibleFlags.filter((f) => f.field === field);
  const warnCount = visibleFlags.filter((f) => f.severity === "warn").length;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldShell
        id="feature_name"
        label="Feature name"
        required
        helper="Name it like a real ticket, not a codename."
        value={draft.feature_name}
        max={INTAKE_LIMITS.feature_name}
        error={errors.feature_name}
        flags={flagsFor("feature_name")}
      >
        <input
          id="feature_name"
          type="text"
          className={INPUT_CLASS}
          value={draft.feature_name}
          maxLength={INTAKE_LIMITS.feature_name}
          aria-required
          aria-describedby="feature_name-helper"
          onChange={(e) => setField("feature_name", e.target.value)}
          onBlur={() => touch("feature_name")}
        />
      </FieldShell>

      <FieldShell
        id="one_liner"
        label="One-liner"
        required
        helper="What is it, in one sentence?"
        value={draft.one_liner}
        max={INTAKE_LIMITS.one_liner}
        error={errors.one_liner}
        flags={flagsFor("one_liner")}
      >
        <input
          id="one_liner"
          type="text"
          className={INPUT_CLASS}
          value={draft.one_liner}
          maxLength={INTAKE_LIMITS.one_liner}
          aria-required
          aria-describedby="one_liner-helper"
          onChange={(e) => setField("one_liner", e.target.value)}
          onBlur={() => touch("one_liner")}
        />
      </FieldShell>

      <FieldShell
        id="target_user"
        label="Target user"
        required
        helper="Who exactly? 'Everyone' gets flagged."
        value={draft.target_user}
        max={INTAKE_LIMITS.target_user}
        error={errors.target_user}
        flags={flagsFor("target_user")}
      >
        <input
          id="target_user"
          type="text"
          className={INPUT_CLASS}
          value={draft.target_user}
          maxLength={INTAKE_LIMITS.target_user}
          aria-required
          aria-describedby="target_user-helper"
          onChange={(e) => setField("target_user", e.target.value)}
          onBlur={() => touch("target_user")}
        />
      </FieldShell>

      <FieldShell
        id="problem"
        label="Problem"
        required
        helper="What does this user do today instead, and what does that cost them?"
        value={draft.problem}
        max={INTAKE_LIMITS.problem}
        error={errors.problem}
        flags={flagsFor("problem")}
      >
        <textarea
          id="problem"
          rows={4}
          className={INPUT_CLASS}
          value={draft.problem}
          maxLength={INTAKE_LIMITS.problem}
          aria-required
          aria-describedby="problem-helper"
          onChange={(e) => setField("problem", e.target.value)}
          onBlur={() => touch("problem")}
        />
      </FieldShell>

      <FieldShell
        id="evidence"
        label="Evidence"
        helper="Tickets, interviews, data, or honest 'personal experience.'"
        value={draft.evidence}
        max={INTAKE_LIMITS.evidence}
        error={errors.evidence}
        flags={flagsFor("evidence")}
      >
        <textarea
          id="evidence"
          rows={3}
          className={INPUT_CLASS}
          value={draft.evidence}
          maxLength={INTAKE_LIMITS.evidence}
          aria-describedby="evidence-helper"
          onChange={(e) => setField("evidence", e.target.value)}
          onBlur={() => touch("evidence")}
        />
      </FieldShell>

      <FieldShell
        id="proposed_solution"
        label="Proposed solution"
        required
        helper="The smallest version that tests the idea."
        value={draft.proposed_solution}
        max={INTAKE_LIMITS.proposed_solution}
        error={errors.proposed_solution}
        flags={flagsFor("proposed_solution")}
      >
        <textarea
          id="proposed_solution"
          rows={3}
          className={INPUT_CLASS}
          value={draft.proposed_solution}
          maxLength={INTAKE_LIMITS.proposed_solution}
          aria-required
          aria-describedby="proposed_solution-helper"
          onChange={(e) => setField("proposed_solution", e.target.value)}
          onBlur={() => touch("proposed_solution")}
        />
      </FieldShell>

      <fieldset>
        <legend className="text-sm font-medium text-zinc-900">
          Success metric<span className="text-zinc-400"> *</span>
        </legend>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="metric" className="text-xs font-medium text-zinc-600">
              Metric
            </label>
            <input
              id="metric"
              type="text"
              className={`mt-1 ${INPUT_CLASS}`}
              value={draft.metric}
              placeholder="weekly active creators"
              aria-required
              onChange={(e) => setField("metric", e.target.value)}
              onBlur={() => touch("success_metric")}
            />
            {errors["success_metric.metric"] && (
              <p className="mt-1.5 text-xs font-medium text-red-600">
                {errors["success_metric.metric"]}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="target" className="text-xs font-medium text-zinc-600">
              Target
            </label>
            <input
              id="target"
              type="text"
              className={`mt-1 ${INPUT_CLASS}`}
              value={draft.target}
              placeholder="30% of signups"
              onChange={(e) => setField("target", e.target.value)}
              onBlur={() => touch("success_metric")}
            />
          </div>
          <div>
            <label htmlFor="timeframe" className="text-xs font-medium text-zinc-600">
              Timeframe
            </label>
            <select
              id="timeframe"
              className={`mt-1 ${INPUT_CLASS}`}
              value={draft.timeframe}
              onChange={(e) => setField("timeframe", e.target.value as Timeframe)}
              onBlur={() => touch("success_metric")}
            >
              {TIMEFRAME_VALUES.map((value) => (
                <option key={value} value={value}>
                  {TIMEFRAME_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {flagsFor("success_metric").length > 0 && (
          <div aria-live="polite" className="mt-2 flex flex-wrap gap-1.5">
            {flagsFor("success_metric").map((f) => (
              <FlagChip key={f.id} flag={f} />
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-zinc-900">Constraints</legend>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="team" className="text-xs font-medium text-zinc-600">
              Team
            </label>
            <select
              id="team"
              className={`mt-1 ${INPUT_CLASS}`}
              value={draft.team}
              onChange={(e) => setField("team", e.target.value as Draft["team"])}
              onBlur={() => touch("constraints")}
            >
              <option value="">Select…</option>
              {TEAM_VALUES.map((value) => (
                <option key={value} value={value}>
                  {TEAM_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="platform" className="text-xs font-medium text-zinc-600">
              Platform
            </label>
            <select
              id="platform"
              className={`mt-1 ${INPUT_CLASS}`}
              value={draft.platform}
              onChange={(e) => setField("platform", e.target.value as Draft["platform"])}
              onBlur={() => touch("constraints")}
            >
              <option value="">Select…</option>
              {PLATFORM_VALUES.map((value) => (
                <option key={value} value={value}>
                  {PLATFORM_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <FieldShell
        id="riskiest_assumption"
        label="Riskiest assumption"
        helper="The thing that, if false, kills the idea."
        value={draft.riskiest_assumption}
        max={INTAKE_LIMITS.riskiest_assumption}
        error={errors.riskiest_assumption}
        flags={flagsFor("riskiest_assumption")}
      >
        <input
          id="riskiest_assumption"
          type="text"
          className={INPUT_CLASS}
          value={draft.riskiest_assumption}
          maxLength={INTAKE_LIMITS.riskiest_assumption}
          aria-describedby="riskiest_assumption-helper"
          onChange={(e) => setField("riskiest_assumption", e.target.value)}
          onBlur={() => touch("riskiest_assumption")}
        />
      </FieldShell>

      <div className="border-t border-zinc-200 pt-5">
        {visibleFlags.length > 0 && (
          <div
            aria-live="polite"
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              warnCount > 0
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-zinc-200 bg-zinc-50 text-zinc-700"
            }`}
          >
            <span className="font-semibold">
              {visibleFlags.length} {visibleFlags.length === 1 ? "flag" : "flags"} · {warnCount}{" "}
              {warnCount === 1 ? "warning" : "warnings"}
            </span>{" "}
            — Generate anyway, or tighten first?
          </div>
        )}
        {/* Advise, never block (spec §0.2): the button is always enabled. */}
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 sm:w-auto"
        >
          Generate
        </button>
        {submitState === "ready" && (
          <p className="mt-3 text-sm text-zinc-500">
            Inputs are valid. The generation pipeline arrives in M3.
          </p>
        )}
      </div>
    </form>
  );
}
