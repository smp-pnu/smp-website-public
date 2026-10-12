# AI 리포트 요약 시범 운영

공개 리포트 3개의 PDF 텍스트를 Workers AI로 요약하고, 원문과 대조한 결과만 PDF 아래에 제공합니다. 방문자 요청이나 정기 동기화에서는 AI를 실행하지 않습니다. 기존 리포트 전체에 대한 자동 생성은 비활성 상태입니다.

## 공개 조건

- `lib/report-ai-summary.ts`의 시범 대상 ID만 허용합니다.
- `data/report-ai-summaries.json`에 원문 대조를 마친 요약과 `reviewedAt`을 기록합니다.
- 현재 공개 상태, 최신 본문 준비 완료, 검증된 PDF 해시 일치가 모두 필요합니다.
- 같은 PDF의 공개를 껐다 켜면 재사용합니다. PDF가 교체되면 기존 요약은 숨기며, 별도로 새 요약을 준비해야 합니다.
- 기존 자동 원문 발췌만 요약으로 대체하고, 관리자가 직접 작성한 Notion 본문은 보존합니다.

화면의 날짜는 게시일입니다. 요약은 PDF 작성 당시 주장으로 표현하며, 현재의 투자 판단이나 목표주가를 새로 제시하지 않습니다. 이미지로만 들어간 도표는 해석하지 않습니다. 쪽수 버튼은 기존 PDF 뷰어의 해당 페이지로 이동합니다.

## 무료 운영 제한

현재 모델은 `@cf/google/gemma-4-26b-a4b-it`으로 고정합니다. 게시 준비 도구는 운영 D1에 하루 최대 5회의 시도를 원자적으로 예약한 뒤 AI를 호출합니다. 실패·시간 초과도 횟수에 포함하고 자동 재시도하지 않습니다. 한국 시간 오전 9시(00:00 UTC)에 새 날짜의 한도가 시작됩니다. 여러 실행자가 동시에 실행해도 같은 D1의 한도를 공유해야 하며, 카운터를 삭제하거나 다른 DB로 우회하지 않습니다.

한 요청은 전체 JSON 입력 160,000 UTF-8 바이트, 출력 4,096 토큰, PDF 80쪽 이내로 제한합니다. 긴 문서를 잘라 전체 요약인 것처럼 표시하지 않습니다. 본문 추출이나 근거 검증 실패 시 원문 게시 상태를 바꾸지 않습니다. 모델·가격이 바뀌면 한도를 재검토해야 합니다.

[Cloudflare 공식 정책](https://developers.cloudflare.com/workers-ai/platform/pricing/)상 Workers Free에는 계정당 하루 10,000 Neurons가 포함되며, 초과 시 추가 AI 요청이 실패합니다. 이 도구는 유료 플랜 전환, 결제, AI Gateway 크레딧을 설정하지 않습니다. 다른 AI 작업도 계정 무료량을 함께 사용하므로 대시보드 사용량을 확인합니다. 요약 열람 자체는 AI 사용량을 소비하지 않으며 기존 웹사이트 요청 한도는 그대로 적용됩니다.

## 관리자의 준비 절차

1. 공개 PDF의 본문·표지 준비가 끝난 상태에서 운영 계정의 AI 실행 권한과 운영 D1 권한을 가진 자격 증명을 안전하게 환경변수로 제공합니다. 값은 소스, 채팅, 작업 로그에 넣지 않습니다.
2. `CLOUDFLARE_ACCOUNT_ID`, `SMP_FREE_DATABASE_ID`, `CLOUDFLARE_API_TOKEN`(D1), `CLOUDFLARE_AI_TOKEN`(Workers AI)을 설정합니다. 시범 운영에는 GitHub Secrets나 방문자 Worker에 AI 자격 증명을 추가할 필요가 없습니다.
3. `node --import tsx --conditions=react-server scripts/prepare-report-ai.ts <시범 대상 ID>`를 실행합니다. 결과는 Git에서 제외된 `.smp-cache/ai-pilot/`에 저장됩니다. 검증된 동일 PDF 초안은 재사용합니다.
4. 근거 검증이 실패하면 `.rejected.json`을 확인합니다. 자동으로 재생성하지 말고 원문과 대조해 문제를 수정합니다. `validateSummaryEvidence`를 다시 통과시킨 뒤 공개 승인을 기록합니다.
5. 모든 문장을 해당 PDF 페이지와 시각적으로 대조합니다. 근거 인용 일치 검사는 숫자·오탈자 필터일 뿐 의미상 정확성을 보장하지 않습니다. 조건부 전망을 확정 사실로 만들거나 빠진 위험 요인을 임의로 보충하지 않습니다.
6. 승인된 레코드만 `data/report-ai-summaries.json`에 추가하고 테스트·배포합니다. PDF 해시가 운영 표지 준비 데이터의 해시와 다르면 표시되지 않습니다.

`--from-cache`는 원본 PDF, 메타데이터, 해시가 모두 로컬에 준비된 검수 작업에만 사용합니다. 저장된 PDF와 최신 공개 메타데이터의 일치를 검사하지만, 같은 Drive 주소에서 파일 내용만 바뀌었을 가능성이 있으면 다시 내려받습니다.

## 변경 시 확인

- `node --import tsx --conditions=react-server --test tests/report-ai-summary.test.ts tests/free-seo.test.ts`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node scripts/build-free.mjs --fixture` (시험 빌드이며 운영 배포 금지)
- 공개·비공개 전환, PDF 변경, 근거 쪽수 이동, 모바일 읽기, AI 실패 후 원문 유지 확인
