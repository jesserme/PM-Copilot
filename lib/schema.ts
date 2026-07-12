import { z } from "zod";

// Single source of truth for intake character limits (spec §1). The zod schema,
// the form counters (M2), and the kitchen_sink check all read from here —
// never hardcode these numbers elsewhere.
export const INTAKE_LIMITS = {
  feature_name: 60,
  one_liner: 140,
  target_user: 120,
  problem: 600,
  evidence: 400,
  proposed_solution: 500,
  riskiest_assumption: 200,
} as const;

// ---------------------------------------------------------------------------
// Intake schema — spec §1
// ---------------------------------------------------------------------------

export const TimeframeSchema = z.enum(["2_weeks", "6_weeks", "quarter", "other"]);

export const SuccessMetricSchema = z.object({
  metric: z.string().min(1),
  target: z.string().optional(),
  timeframe: TimeframeSchema,
});

export const ConstraintsSchema = z.object({
  team: z.enum(["solo", "two_three", "squad_plus"]),
  platform: z.enum(["web", "mobile", "both"]),
});

export const IntakeFormSchema = z.object({
  feature_name: z.string().min(1).max(INTAKE_LIMITS.feature_name),
  one_liner: z.string().min(1).max(INTAKE_LIMITS.one_liner),
  target_user: z.string().min(1).max(INTAKE_LIMITS.target_user),
  problem: z.string().min(1).max(INTAKE_LIMITS.problem),
  evidence: z.string().max(INTAKE_LIMITS.evidence).optional(),
  proposed_solution: z.string().min(1).max(INTAKE_LIMITS.proposed_solution),
  success_metric: SuccessMetricSchema,
  constraints: ConstraintsSchema.optional(),
  riskiest_assumption: z.string().max(INTAKE_LIMITS.riskiest_assumption).optional(),
});

export type IntakeForm = z.infer<typeof IntakeFormSchema>;
export type SuccessMetric = z.infer<typeof SuccessMetricSchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type Timeframe = z.infer<typeof TimeframeSchema>;

// ---------------------------------------------------------------------------
// Output schema — spec §4. One object, one source of truth for the results view.
// ---------------------------------------------------------------------------

export const ScopeItemSchema = z.object({
  item: z.string(),
  rationale: z.string(),
});

export const OutOfScopeItemSchema = z.object({
  item: z.string(),
  reason: z.string(),
  revisit_when: z.string(),
});

export const PrdSuccessMetricSchema = z.object({
  metric: z.string(),
  target: z.string().nullable(),
  timeframe: z.string(),
  kind: z.enum(["primary", "guardrail"]),
});

export const RiskSchema = z.object({
  risk: z.string(),
  severity: z.enum(["low", "med", "high"]),
  mitigation: z.string(),
});

export const PrdSchema = z.object({
  summary: z.string().max(200),
  problem_statement: z.string().max(500),
  target_user: z.object({
    who: z.string(),
    situation: z.string(),
  }),
  mvp: z.object({
    in_scope: z.array(ScopeItemSchema).min(1).max(3),
    out_of_scope: z.array(OutOfScopeItemSchema).min(1),
  }),
  success_metrics: z
    .array(PrdSuccessMetricSchema)
    .refine((metrics) => metrics.filter((m) => m.kind === "primary").length === 1, {
      message: 'success_metrics must contain exactly one metric with kind "primary"',
    }),
  risks: z.array(RiskSchema),
  open_questions: z.array(z.string()).max(4),
  next_release: z.array(z.string()).max(3),
});

export const CritiqueFlagSchema = z.object({
  section: z.enum(["problem", "user", "scope", "metric", "risk"]),
  severity: z.enum(["info", "warn"]),
  issue: z.string(),
  why_it_matters: z.string(),
  suggested_fix: z.string(),
});

export const CritiqueSchema = z.object({
  flags: z.array(CritiqueFlagSchema),
  strongest_element: z.string(),
  weakest_element: z.string(),
});

export const MetaSchema = z.object({
  generated_at: z.iso.datetime(),
  model: z.string(),
  input_hash: z.string(),
});

export const GenerationResultSchema = z.object({
  prd: PrdSchema,
  critique: CritiqueSchema,
  meta: MetaSchema,
});

export type GenerationResult = z.infer<typeof GenerationResultSchema>;
export type Prd = z.infer<typeof PrdSchema>;
export type Critique = z.infer<typeof CritiqueSchema>;
export type CritiqueFlag = z.infer<typeof CritiqueFlagSchema>;
export type ScopeItem = z.infer<typeof ScopeItemSchema>;
export type OutOfScopeItem = z.infer<typeof OutOfScopeItemSchema>;
