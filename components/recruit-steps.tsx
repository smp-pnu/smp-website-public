export function RecruitSteps({ steps }: { steps: string[] }) {
  return <ol className="mt-7 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
    {steps.map((step, index) => <li key={step} className="border-t border-slate-300 pt-4">
      <span className="text-[11px] font-medium tracking-[.12em] text-slate-500">STEP 0{index + 1}</span>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-900">{step}</p>
    </li>)}
  </ol>
}
