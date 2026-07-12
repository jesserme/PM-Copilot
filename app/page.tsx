import IntakeForm from "@/components/IntakeForm";

// M2: the "try your own" form is the whole page. M5 makes showcase mode the
// default landing view and moves this behind "try your own →".
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">PM Copilot</h1>
        <p className="mt-1.5 text-sm leading-6 text-zinc-500">
          A structured intake in, a one-page PRD out — with an honest critique of the input.
        </p>
      </header>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <IntakeForm />
      </div>
    </main>
  );
}
