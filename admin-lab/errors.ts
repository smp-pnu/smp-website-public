export function adminError(error: unknown) {
  const message = error instanceof Error ? error.message : "파일을 처리하지 못했어요."
  if (/dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i.test(message)) {
    return "PDF 분석기를 불러오지 못했어요. 저장한 초안은 유지됩니다. 인터넷 연결을 확인하고 화면을 새로고침한 뒤 다시 시도해 주세요."
  }
  return message
}
