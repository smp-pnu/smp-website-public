export function RecruitSteps({ steps }: { steps: string[] }) {
  return <ol className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
    {steps.map((step, index) => <li key={step} className="rounded border border-slate-200 bg-slate-50 p-4">
      <span className="text-xs font-semibold tracking-[.12em] text-sky-800">STEP 0{index + 1}</span>
      <p className="mt-3 text-sm font-medium leading-6 text-slate-900">{step}</p>
    </li>)}
  </ol>
}
