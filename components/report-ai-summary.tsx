import { AI_SUMMARY_NOTE, summarySections, type PublicReportAiSummary } from "@/lib/report-ai-summary"

export function ReportAiSummary({ summary, onPage }: { summary: PublicReportAiSummary; onPage: (page: number) => void }) {
  return <section aria-label="AI 리포트 요약" className="report-ai-summary">
    <header className="report-ai-summary__header"><div><p className="report-ai-summary__eyebrow">REPORT INSIGHTS</p><h2>AI 리포트 요약</h2></div><span className="report-ai-summary__badge">시범 제공</span></header>
    <p className="report-ai-summary__date">게시일 {summary.reportDate} · PDF {summary.documentPages}쪽의 텍스트 기준</p>
    <div className="report-ai-summary__sections">{summarySections(summary).map(section => <section key={section.key}>
      <h3>{section.title}</h3>
      {section.claims.length ? <ul>{section.claims.map((claim, index) => <li key={index}>
        <span>{claim.text}</span><span className="report-ai-summary__sources" aria-label="PDF 근거 쪽수">{claim.pages.map(page => <button type="button" key={page} onClick={() => onPage(page)} aria-label={`PDF ${page}쪽 근거 보기`}>{page}쪽 ↗</button>)}</span>
      </li>)}</ul> : <p className="report-ai-summary__empty">원문에서 별도로 명시한 위험 요인을 확인하지 못했습니다.</p>}
    </section>)}</div>
    <p className="report-ai-summary__note">{AI_SUMMARY_NOTE}</p>
  </section>
}
