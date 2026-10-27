// Only the code is sent to the existing recovery endpoint; file text stays local.
export function normalizeAdminCode(value: string) {
  const code = value.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(code)) throw new Error("64자리 복구 코드 또는 초기 설정 키를 입력해 주세요. 로컬 시험판의 비밀번호와는 다릅니다.")
  return code
}

export function parseRecoveryFile(text: string) {
  if (text.length > 4096) throw new Error("관리자 등록 때 저장한 작은 복구 코드 .txt 파일을 선택해 주세요.")
  const codes = text.split(/\r?\n/).map(line => line.trim()).filter(line => /^[a-f0-9]{64}$/i.test(line))
  if (codes.length !== 1) throw new Error("복구 코드를 하나만 확인할 수 있는 .txt 파일을 선택해 주세요.")
  return normalizeAdminCode(codes[0])
}
