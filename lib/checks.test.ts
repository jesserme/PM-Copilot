import { describe, expect, it } from "vitest";

import {
  kitchenSink,
  noAssumption,
  noEvidence,
  noTarget,
  runChecks,
  vagueAudience,
  vanityMetric,
} from "./checks";
import { INTAKE_LIMITS, type IntakeForm } from "./schema";

// A deliberately strong input: no check should fire on it (spec §0.5 — honest
// critique only; a strong input gets no fabricated flags).
const strongForm: IntakeForm = {
  feature_name: "Bulk photo reorder",
  one_liner: "Drag-to-reorder listing photos in one screen.",
  target_user: "Airbnb hosts managing 10+ listings",
  problem:
    "Hosts reorder photos one at a time across screens; support logs ~40 tickets/month about it.",
  evidence: "40 support tickets in Q2; 6 host interviews.",
  proposed_solution: "A single drag-to-reorder screen for listing photos.",
  success_metric: {
    metric: "weekly active hosts using reorder",
    target: "30% of multi-listing hosts",
    timeframe: "6_weeks",
  },
  constraints: { team: "two_three", platform: "web" },
  riskiest_assumption: "Hosts care enough about photo order to curate it.",
};

const form = (overrides: Partial<IntakeForm> = {}): IntakeForm => ({
  ...strongForm,
  ...overrides,
});

const withMetric = (
  metric: string,
  target?: string,
): IntakeForm => form({ success_metric: { ...strongForm.success_metric, metric, target } });

describe("vague_audience", () => {
  it.each([
    "everyone",
    "Everyone with a phone",
    "ANYONE",
    "anyone who shops online",
    "all users",
    "all user segments",
    "the general public",
    "Basically everyone in the US",
  ])("fires on %j", (target_user) => {
    const flags = vagueAudience(form({ target_user }));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      id: "vague_audience",
      field: "target_user",
      severity: "warn",
      message: "'Everyone' is not a user. Narrow to whoever feels this most.",
    });
  });

  it.each([
    "Airbnb hosts managing 10+ listings",
    "power users of our API", // "users" alone is not "all users"
    "overall usership in the app", // "all" inside "overall" must not match
    "solo consultants in Austin",
  ])("does not fire on %j", (target_user) => {
    expect(vagueAudience(form({ target_user }))).toEqual([]);
  });
});

describe("vanity_metric", () => {
  it.each([
    "signups",
    "sign-ups",
    "sign ups per month",
    "Downloads",
    "app installs",
    "page views",
    "pageviews",
    "ad impressions",
    "registered users",
  ])("fires on activity-only metric %j", (metric) => {
    const flags = vanityMetric(withMetric(metric));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      id: "vanity_metric",
      field: "success_metric",
      severity: "warn",
      message: "This counts activity, not value. Pair it with activation or retention.",
    });
  });

  it.each([
    "weekly signups", // vanity term present but paired with a value signal
    "signups with 30-day retention",
    "downloads to paid conversion",
    "installs with day-7 activation",
  ])("does not fire when a value signal is paired: %j", (metric) => {
    expect(vanityMetric(withMetric(metric))).toEqual([]);
  });

  it.each([
    "weekly active creators",
    "revenue per account",
    "median time-to-first-artifact",
  ])("does not fire on non-vanity metric %j", (metric) => {
    expect(vanityMetric(withMetric(metric))).toEqual([]);
  });
});

describe("no_target", () => {
  it.each([undefined, "", "   "])("fires when target is %j", (target) => {
    const flags = noTarget(withMetric(strongForm.success_metric.metric, target));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      id: "no_target",
      field: "success_metric",
      severity: "info",
      message: "Directional metric — you'll never be able to call this a win or a loss.",
    });
  });

  it("does not fire when a target is set", () => {
    expect(noTarget(withMetric("weekly active hosts", "1.5k/wk"))).toEqual([]);
  });
});

describe("no_evidence", () => {
  it.each([undefined, "", "  "])("fires when evidence is %j", (evidence) => {
    const flags = noEvidence(form({ evidence }));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      id: "no_evidence",
      field: "evidence",
      severity: "info",
      message: "Hypothesis-only PRD. Legit for a v0 — the document will say so out loud.",
    });
  });

  it("does not fire when evidence is present", () => {
    expect(noEvidence(form({ evidence: "12 tickets in May; 3 interviews." }))).toEqual([]);
  });
});

describe("no_assumption", () => {
  it.each([undefined, "", "  "])("fires when riskiest_assumption is %j", (riskiest_assumption) => {
    const flags = noAssumption(form({ riskiest_assumption }));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      id: "no_assumption",
      field: "riskiest_assumption",
      severity: "info",
      message: "Every idea has one. Not being able to name it is itself the risk.",
    });
  });

  it("does not fire when an assumption is named", () => {
    expect(
      noAssumption(form({ riskiest_assumption: "Hosts will record on mobile." })),
    ).toEqual([]);
  });
});

describe("kitchen_sink", () => {
  const expectedFlag = {
    id: "kitchen_sink",
    field: "proposed_solution",
    severity: "warn",
    message:
      "Reads like several features. Expect the generator to cut — the out-of-scope list will be long.",
  };

  it.each([
    "Add dashboards, CSV export, and Slack alerts",
    "Build an editor and a publish flow and analytics",
    "Uploads, tagging, search",
  ])("fires when ≥ 3 clauses are joined: %j", (proposed_solution) => {
    const flags = kitchenSink(form({ proposed_solution }));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual(expectedFlag);
  });

  it("fires when length exceeds 90% of the limit even as a single clause", () => {
    const overLimit = "x".repeat(Math.floor(INTAKE_LIMITS.proposed_solution * 0.9) + 1);
    const flags = kitchenSink(form({ proposed_solution: overLimit }));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual(expectedFlag);
  });

  it("does not fire at exactly 90% of the limit", () => {
    const atLimit = "x".repeat(INTAKE_LIMITS.proposed_solution * 0.9);
    expect(kitchenSink(form({ proposed_solution: atLimit }))).toEqual([]);
  });

  it.each([
    "A single drag-to-reorder screen for listing photos.",
    "Record calls and transcribe them", // two clauses is fine
    "A drag-and-drop editor for photos", // hyphenated "and" is not a clause join
  ])("does not fire on %j", (proposed_solution) => {
    expect(kitchenSink(form({ proposed_solution }))).toEqual([]);
  });
});

describe("runChecks", () => {
  it("returns no flags for a strong input", () => {
    expect(runChecks(strongForm)).toEqual([]);
  });

  it("returns all six flags, in spec table order, for a weak input", () => {
    const weakForm: IntakeForm = {
      feature_name: "Super app",
      one_liner: "An app that does it all.",
      target_user: "everyone",
      problem: "People are busy.",
      evidence: undefined,
      proposed_solution: "Dashboards, exports, alerts, and AI summaries",
      success_metric: { metric: "signups", timeframe: "other" },
      riskiest_assumption: undefined,
    };
    expect(runChecks(weakForm).map((f) => f.id)).toEqual([
      "vague_audience",
      "vanity_metric",
      "no_target",
      "no_evidence",
      "no_assumption",
      "kitchen_sink",
    ]);
  });

  it("severities match the spec table", () => {
    const weakForm = form({
      target_user: "anyone",
      evidence: undefined,
      riskiest_assumption: undefined,
    });
    const severityById = Object.fromEntries(
      runChecks(weakForm).map((f) => [f.id, f.severity]),
    );
    expect(severityById).toEqual({
      vague_audience: "warn",
      no_evidence: "info",
      no_assumption: "info",
    });
  });
});
