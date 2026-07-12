import { INTAKE_LIMITS, type IntakeForm } from "./schema";

// Deterministic check layer — spec §2. Pure functions, (form) => Flag[]:
// no React, no side effects. Runs client-side on field blur and on submit.
// User-facing messages are shipped verbatim from the spec — do not rephrase.

export type CheckId =
  | "vague_audience"
  | "vanity_metric"
  | "no_target"
  | "no_evidence"
  | "no_assumption"
  | "kitchen_sink";

export type FlagSeverity = "info" | "warn";

export interface Flag {
  id: CheckId;
  /** Intake field the chip renders under. */
  field: keyof IntakeForm;
  severity: FlagSeverity;
  message: string;
}

const isBlank = (value: string | undefined): boolean =>
  value === undefined || value.trim().length === 0;

const VAGUE_AUDIENCE = /\b(everyone|anyone|all users?|general public)\b/i;

export function vagueAudience(form: IntakeForm): Flag[] {
  if (!VAGUE_AUDIENCE.test(form.target_user)) return [];
  return [
    {
      id: "vague_audience",
      field: "target_user",
      severity: "warn",
      message: "'Everyone' is not a user. Narrow to whoever feels this most.",
    },
  ];
}

const VANITY_METRIC = /(sign.?ups|downloads|installs|page ?views|impressions|registered users)/i;
const VALUE_SIGNAL = /(retention|activation|weekly|daily|repeat|paid|conversion)/i;

export function vanityMetric(form: IntakeForm): Flag[] {
  const { metric } = form.success_metric;
  if (!VANITY_METRIC.test(metric) || VALUE_SIGNAL.test(metric)) return [];
  return [
    {
      id: "vanity_metric",
      field: "success_metric",
      severity: "warn",
      message: "This counts activity, not value. Pair it with activation or retention.",
    },
  ];
}

export function noTarget(form: IntakeForm): Flag[] {
  if (!isBlank(form.success_metric.target)) return [];
  return [
    {
      id: "no_target",
      field: "success_metric",
      severity: "info",
      message: "Directional metric — you'll never be able to call this a win or a loss.",
    },
  ];
}

export function noEvidence(form: IntakeForm): Flag[] {
  if (!isBlank(form.evidence)) return [];
  return [
    {
      id: "no_evidence",
      field: "evidence",
      severity: "info",
      message: "Hypothesis-only PRD. Legit for a v0 — the document will say so out loud.",
    },
  ];
}

export function noAssumption(form: IntakeForm): Flag[] {
  if (!isBlank(form.riskiest_assumption)) return [];
  return [
    {
      id: "no_assumption",
      field: "riskiest_assumption",
      severity: "info",
      message: "Every idea has one. Not being able to name it is itself the risk.",
    },
  ];
}

// Splits on commas and on " and " surrounded by whitespace, so hyphenated
// compounds like "drag-and-drop" don't count as clause joins.
const CLAUSE_JOIN = /,|\s+and\s+/i;

export function kitchenSink(form: IntakeForm): Flag[] {
  const text = form.proposed_solution;
  const clauses = text.split(CLAUSE_JOIN).filter((c) => c.trim().length > 0);
  const nearLimit = text.length > INTAKE_LIMITS.proposed_solution * 0.9;
  if (clauses.length < 3 && !nearLimit) return [];
  return [
    {
      id: "kitchen_sink",
      field: "proposed_solution",
      severity: "warn",
      message:
        "Reads like several features. Expect the generator to cut — the out-of-scope list will be long.",
    },
  ];
}

// Spec §2 table order.
export const CHECKS = [
  vagueAudience,
  vanityMetric,
  noTarget,
  noEvidence,
  noAssumption,
  kitchenSink,
] as const;

export function runChecks(form: IntakeForm): Flag[] {
  return CHECKS.flatMap((check) => check(form));
}
