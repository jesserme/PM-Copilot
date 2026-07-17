"use client";

import { useRef, useState } from "react";

import IntakeForm, { type GenerationHandoff } from "@/components/IntakeForm";
import PrdView from "@/components/PrdView";
import ReasoningPanel from "@/components/ReasoningPanel";
import { runChecks, type Flag } from "@/lib/checks";
import {
  GenerationResultSchema,
  IntakeFormSchema,
  type GenerationResult,
  type IntakeForm as Intake,
} from "@/lib/schema";

import focusedResult from "@/data/showcase/focused.json";
import fuzzyResult from "@/data/showcase/fuzzy.json";
import kitchenSinkResult from "@/data/showcase/kitchen_sink.json";
import showcaseInputs from "@/showcase-inputs.json";

type ShowcaseKey = "focused" | "fuzzy" | "kitchen_sink";
type PaneTab = "prd" | "panel";

// Spec §6 tab order. "Fuzzy" is the deliberate default — the differentiator
// should be the first pixel anyone sees.
const SHOWCASE_TABS: { key: ShowcaseKey; label: string }[] = [
  { key: "focused", label: "Focused" },
  { key: "fuzzy", label: "Fuzzy" },
  { key: "kitchen_sink", label: "Kitchen sink" },
];

interface ShowcaseEntry {
  form: Intake;
  result: GenerationResult;
  ruleFlags: Flag[];
}

// Static JSON in, validated objects out. Showcase mode never touches the API
// (BUILD_PROMPT rule 6) — results were pregenerated once by
// scripts/pregenerate.ts and committed — and nothing unvalidated is rendered.
// Rule flags are recomputed here with the same runChecks the live form uses.
function loadShowcase(): Record<ShowcaseKey, ShowcaseEntry> | null {
  const inputs = showcaseInputs as Record<string, unknown>;
  const sources: Record<ShowcaseKey, { input: unknown; result: unknown }> = {
    focused: { input: inputs.focused, result: focusedResult },
    fuzzy: { input: inputs.fuzzy, result: fuzzyResult },
    kitchen_sink: { input: inputs.kitchen_sink, result: kitchenSinkResult },
  };
  const entries = {} as Record<ShowcaseKey, ShowcaseEntry>;
  for (const key of Object.keys(sources) as ShowcaseKey[]) {
    const form = IntakeFormSchema.safeParse(sources[key].input);
    const result = GenerationResultSchema.safeParse(sources[key].result);
    if (!form.success || !result.success) return null;
    entries[key] = { form: form.data, result: result.data, ruleFlags: runChecks(form.data) };
  }
  return entries;
}

const SHOWCASE = loadShowcase();

export default function Home() {
  const [view, setView] = useState<"showcase" | "form" | "results">(
    SHOWCASE ? "showcase" : "form",
  );
  const [showcaseTab, setShowcaseTab] = useState<ShowcaseKey>("fuzzy");
  const [generation, setGeneration] = useState<GenerationHandoff | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [paneTab, setPaneTab] = useState<PaneTab>("prd");
  const highlightTimer = useRef<number | null>(null);

  // Spec §5: clicking a flag scrolls to and briefly highlights its PRD section.
  // Deliberately an instant jump: smooth scrolling (JS or CSS) is silently
  // dropped in some environments, and the amber highlight gives the eye its
  // landing cue. Reliability beats animation here.
  function focusSection(anchorId: string) {
    setPaneTab("prd");
    setHighlightId(anchorId);
    window.setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: "start" });
    }, 60);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 1800);
  }

  if (view === "results" && generation) {
    const { result, ruleFlags, form } = generation;
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {form.feature_name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{form.one_liner}</p>
          </div>
          {/* Spec §5: the panel's one affordance — back to the form, values
              intact (draft persists in localStorage). */}
          <button
            type="button"
            onClick={() => {
              setView("form");
              setHighlightId(null);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-500"
          >
            ← Edit inputs
          </button>
        </header>
        <ResultsGrid
          result={result}
          ruleFlags={ruleFlags}
          highlightId={highlightId}
          paneTab={paneTab}
          onPaneTab={setPaneTab}
          onFlagClick={focusSection}
        />
      </main>
    );
  }

  if (view === "form" || !SHOWCASE) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          {SHOWCASE && (
            <button
              type="button"
              onClick={() => setView("showcase")}
              className="mb-4 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
            >
              ← Back to samples
            </button>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">PM Copilot</h1>
          <p className="mt-1.5 text-sm leading-6 text-zinc-500">
            A structured intake in, a one-page PRD out — with an honest critique of the input.
          </p>
        </header>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <IntakeForm
            onGenerated={(g) => {
              setGeneration(g);
              setView("results");
            }}
          />
        </div>
      </main>
    );
  }

  const entry = SHOWCASE[showcaseTab];
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">PM Copilot</h1>
          <nav aria-label="Showcase examples" className="flex gap-1 rounded-lg bg-zinc-200/70 p-1">
            {SHOWCASE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setShowcaseTab(tab.key);
                  setHighlightId(null);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  showcaseTab === tab.key
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <p className="mt-1.5 text-sm leading-6 text-zinc-500">
          A structured intake in, a one-page PRD out — with an honest critique of the input.
        </p>
      </header>

      {/* Spec §6: every sample carries this banner. */}
      <button
        type="button"
        onClick={() => setView("form")}
        className="mb-5 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left text-sm text-indigo-900 transition hover:border-indigo-400"
      >
        Sample input ·{" "}
        <span className="font-semibold underline underline-offset-2">try your own →</span>
      </button>

      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          {entry.form.feature_name}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{entry.form.one_liner}</p>
      </div>

      <ResultsGrid
        result={entry.result}
        ruleFlags={entry.ruleFlags}
        highlightId={highlightId}
        paneTab={paneTab}
        onPaneTab={setPaneTab}
        onFlagClick={focusSection}
      />
    </main>
  );
}

// Shared results layout: PRD ~60% left / panel ~40% right on desktop; on
// mobile the panes stack behind a sticky tab bar (spec §5).
function ResultsGrid({
  result,
  ruleFlags,
  highlightId,
  paneTab,
  onPaneTab,
  onFlagClick,
}: {
  result: GenerationResult;
  ruleFlags: Flag[];
  highlightId: string | null;
  paneTab: PaneTab;
  onPaneTab: (tab: PaneTab) => void;
  onFlagClick: (anchorId: string) => void;
}) {
  const flagTotal = ruleFlags.length + result.critique.flags.length;
  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex gap-1 border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur lg:hidden">
        <TabButton active={paneTab === "prd"} onClick={() => onPaneTab("prd")}>
          PRD
        </TabButton>
        <TabButton active={paneTab === "panel"} onClick={() => onPaneTab("panel")}>
          Reasoning ({flagTotal})
        </TabButton>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className={`lg:col-span-3 ${paneTab === "prd" ? "" : "hidden lg:block"}`}>
          <PrdView prd={result.prd} meta={result.meta} highlightId={highlightId} />
        </div>
        <div className={`lg:col-span-2 ${paneTab === "panel" ? "" : "hidden lg:block"}`}>
          <ReasoningPanel
            ruleFlags={ruleFlags}
            critique={result.critique}
            outOfScope={result.prd.mvp.out_of_scope}
            onFlagClick={onFlagClick}
          />
        </div>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
