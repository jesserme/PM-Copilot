"use client";

import { useRef, useState } from "react";

import IntakeForm, { type GenerationHandoff } from "@/components/IntakeForm";
import PrdView from "@/components/PrdView";
import ReasoningPanel from "@/components/ReasoningPanel";

// M4: form ↔ results. M5 makes showcase mode the default landing view and
// moves this flow behind "try your own →".
export default function Home() {
  const [generation, setGeneration] = useState<GenerationHandoff | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"prd" | "panel">("prd");
  const highlightTimer = useRef<number | null>(null);

  // Spec §5: clicking a flag scrolls to and briefly highlights its PRD section.
  function focusSection(anchorId: string) {
    setMobileTab("prd");
    setHighlightId(anchorId);
    // Deliberately an instant jump: smooth scrolling (JS or CSS) is silently
    // dropped in some environments, and the amber highlight already gives the
    // eye its landing cue. Reliability beats animation here.
    window.setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: "start" });
    }, 60);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 1800);
  }

  if (!generation) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">PM Copilot</h1>
          <p className="mt-1.5 text-sm leading-6 text-zinc-500">
            A structured intake in, a one-page PRD out — with an honest critique of the input.
          </p>
        </header>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <IntakeForm onGenerated={setGeneration} />
        </div>
      </main>
    );
  }

  const { result, ruleFlags, form } = generation;
  const flagTotal = ruleFlags.length + result.critique.flags.length;

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
            setGeneration(null);
            setHighlightId(null);
          }}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-500"
        >
          ← Edit inputs
        </button>
      </header>

      {/* Mobile: PRD and panel stack behind a sticky tab bar (spec §5). */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex gap-1 border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur lg:hidden">
        <TabButton active={mobileTab === "prd"} onClick={() => setMobileTab("prd")}>
          PRD
        </TabButton>
        <TabButton active={mobileTab === "panel"} onClick={() => setMobileTab("panel")}>
          Reasoning ({flagTotal})
        </TabButton>
      </div>

      {/* Desktop: PRD ~60% left, reasoning panel ~40% right (spec §5). */}
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className={`lg:col-span-3 ${mobileTab === "prd" ? "" : "hidden lg:block"}`}>
          <PrdView prd={result.prd} meta={result.meta} highlightId={highlightId} />
        </div>
        <div className={`lg:col-span-2 ${mobileTab === "panel" ? "" : "hidden lg:block"}`}>
          <ReasoningPanel
            ruleFlags={ruleFlags}
            critique={result.critique}
            outOfScope={result.prd.mvp.out_of_scope}
            onFlagClick={focusSection}
          />
        </div>
      </div>
    </main>
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
