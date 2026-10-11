export function RecruitSteps({ steps }: { steps: string[] }) {
  return <ol className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
    {steps.map((step, index) => <li key={step}>
      <span className="text-2xl font-light tabular-nums text-site-accent">0{index + 1}</span>
      <p className="mt-3 border-t border-site-line pt-3 text-sm leading-7 text-site-body">{step}</p>
    </li>)}
  </ol>
}
