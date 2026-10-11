export function RecruitSteps({ steps }: { steps: string[] }) {
  return <ol className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
    {steps.map((step, index) => <li key={step} className="paper-divider border-t pt-4">
      <span className="paper-eyebrow">STEP 0{index + 1}</span>
      <p className="mt-2 text-sm font-medium leading-7 paper-copy">{step}</p>
    </li>)}
  </ol>
}
