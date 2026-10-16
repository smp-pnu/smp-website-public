# SMP 운영 안내

2026-10-16 기준. 실제 운영은 Cloudflare Free, Notion, Google Drive, GitHub Actions입니다. 이전 Vercel 코드는 호환성 검증용으로 남아 있으며 [과거 기록](legacy-vercel-operations.md)은 현재 설정 지침이 아닙니다. 공개 README에는 사이트 소개만 유지합니다.

일상적인 노션 편집·게시 현황·모집 안내·비공개 백업은 [관리 안내](content-management.md)를, 코드 변경은 [개발 안내](development.md)를 따릅니다.

## 평상시 게시

1. Drive의 학기/발표 회차 폴더에 PDF를 저장하고 해당 파일 링크를 Notion 리포트에 넣습니다. 폴더 전체를 공개할 필요는 없습니다.
2. 제목·게시일·분류와 공개 체크를 확인합니다. 공지 사진은 [공지 사진 안내](notice-images.md)를 따릅니다.
3. 서명된 Notion 알림과 보조 동기화가 게시 상태를 갱신합니다. 목록과 본문·표지 준비는 별도 단계이므로 본문 준비에는 시간이 더 필요합니다.
4. 대기 중인 게시가 있으면 서버가 기존 GitHub 게시 워크플로를 직접 요청합니다. 요청은 15분 간격·하루 12회로 제한하고, 한 실행은 최대 4건을 처리합니다. 기존 15분 예약 실행도 보조로 남지만 GitHub가 지연하거나 생략할 수 있어 고정 완료 시각을 보장하지 않습니다.
5. 작업이 끝나면 사이트에서 대표 글·사진·PDF 다운로드를 확인합니다. 이미 준비된 이미지가 그대로면 이미지 변환과 배포를 건너뜁니다.

## 관리자가 직접 확인·복구

GitHub 저장소 → Actions → **Publish CMS on the free architecture** → **Run workflow** → `main` 선택. `operation`을 고르고 필요한 경우 Notion 페이지 ID를 넣습니다. 페이지 ID는 Notion 주소 끝의 32자리 식별자이며 전체 URL은 넣지 않습니다.

| operation | 용도 | page_id |
| --- | --- | --- |
| `status` | 동기화 시각·대기/중단 건수·실패 코드·금일 앱 사용량 확인. 글 처리·이미지 배포는 하지 않음 | 비움 |
| `publish` | 준비된 대기열 처리 | 비움 |
| `retry-failed` | 5회 실패로 중단된 글 1건을 다시 시도 | 해당 글 ID |
| `refresh-report` | 같은 Drive 파일 ID에 수정 PDF를 넣은 뒤 원문·표지를 다시 확인 | 공개 리포트 ID |

`refresh-report`는 Notion을 삭제하거나 다시 만들지 않습니다. PDF SHA-256이 같으면 표지를 재사용하고 달라졌을 때만 생성합니다. 비공개 글, 다른 종류의 글, 현재 다른 작업이 처리하는 글은 강제로 처리하지 않습니다. 원인을 고친 뒤 한 번 실행하고 결과를 확인하세요. 직접 D1 행을 수정하거나 실패 횟수를 반복 초기화하지 않습니다.

실행의 Summary에서 상태를 확인합니다. `upstream_busy`는 외부 한도/대기, `source_unavailable`는 원본·연결 문제, `asset_preparation`은 파일·이미지 처리 문제, `publication_failed`는 그 밖의 처리 실패입니다. 원문 오류·인증정보·파일 주소는 공개 실행 로그에 기록하지 않습니다. 날짜는 UTC이며 한국 시간은 9시간을 더합니다. 대기열의 오류는 성공하면 제거됩니다.

## 한도 보호와 공개 상태

- 변경 없는 Notion 조회는 종류별 2분 간격, 페이지네이션·실패 복구는 1분 간격입니다. 중복 Cron 이벤트·겹친 실행은 D1 잠금으로 억제합니다. 세 종류가 계속 유휴일 때 기본 조회는 계산상 하루 2,160회입니다.
- 앱이 Notion 호출을 방문자 1,800회/일, 동기화 4,500회/일, 게시 준비 1,200회/일, 웹훅 500회/일로 나눠 보호합니다. 합계 8,000회/일, 150회/분 이하이며 공급자의 무제한 이용 허용을 뜻하지 않습니다. 앱의 일 한도는 UTC 00:00(한국 09:00)에 초기화됩니다.
- 공개 API는 하루 24,000회, 게시 준비는 하루 50건 상한이 있습니다. PDF 조각·재시도도 요청이므로 24,000명이란 의미는 아닙니다. 한도 도달 시 대기 안내와 재시도 시각을 반환합니다.
- 상세·PDF는 단건 공개 검증을 최대 60초 공유합니다. DB의 현재 소속·버전과 매번 비교하므로 처리된 공개 해제/삭제 알림은 즉시 무효화합니다. 알림이 누락돼도 검증이 60초를 넘으면 새로 확인하며, 장애 때 만료 결과로 우회하지 않습니다. 게시 완료 직전에는 항상 새로 검증합니다.
- 목록은 동기화 확인이 5분 이상 오래되면 보류합니다. 방문 때 표지 렌더링이나 전체 Notion 목록 조회를 하지 않습니다. 회원·공지 사진과 표지는 정적 이미지입니다.
- 실제 Cloudflare 요청·CPU·D1 한도와 Google 원본 다운로드 제한은 별도입니다. 공격·오류 요청도 공급자 사용량에 포함됩니다. 앱 제한만으로 모든 정지나 외부 장애를 방지할 수는 없습니다.
- 확인 시점 Workers 요금제는 Free이며 결제수단은 등록돼 있습니다. 카드 등록 자체가 Workers Paid 가입은 아니지만 새 담당자는 유료 상품·구독을 켜지 않도록 확인해야 합니다. 한도를 우회할 계정 추가는 하지 않습니다.

공식 기준: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [정적 파일](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Notion](https://developers.notion.com/reference/request-limits), [Apps Script](https://developers.google.com/apps-script/guides/services/quotas), [GitHub 예약 실행](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). 정책은 변경될 수 있으므로 학기 인수인계 때 다시 확인합니다.

## 연결과 인수인계

- GitHub 게시 요청 전용 토큰은 지정 저장소의 Actions 읽기·쓰기와 필수 Metadata 읽기만 가집니다. Cloudflare의 웹사이트/리포트 동기화 Worker Secret `GITHUB_PUBLISH_TOKEN`에 저장하며 코드·Notion 본문에 기록하지 않습니다. 이번 발급 토큰 만료일은 **2027-10-13**입니다.
- 인수인계 때 토큰 발급자와 조직 권한, 만료일을 확인합니다. 발급자의 권한이 사라지면 만료 전에도 실행이 중단될 수 있습니다. 새 담당자는 같은 최소 범위로 토큰을 발급해 두 Worker Secret을 교체하고 실제 게시 성공 후 이전 토큰을 폐기합니다. 자동 게시 권한이 실패해도 대기열은 남고 GitHub 수동 게시가 가능합니다.
- Notion 연결 값은 Cloudflare/GitHub Secrets와 Apps Script의 Script Properties에서 관리합니다. 연결 교체 시 세 위치의 영향을 함께 확인하고 외부 PR에 운영 비밀값을 주지 않습니다.
- Drive 삭제 연동은 [별도 Apps Script](drive-cleanup.md)입니다. 웹사이트 배포만으로 스크립트 코드가 바뀌지 않습니다. 서명된 삭제 알림은 다음 5분 실행에서 검사하고, 알림 없는 유휴 전체 대조는 하루 한 번입니다. 후보가 10건을 넘으면 중단합니다. 휴지통 이동만 사용합니다.
- 공개 해제는 이미 내려받은 자료·이미지 URL·Drive 공유 권한까지 회수하지 않습니다. 자료 회수는 원본 공유 권한도 별도 확인합니다.
- 학기마다 계정 2단계 인증·복구 수단·관리자 접근, 마지막 게시 성공, 대표 PDF, 공개/비공개 전환, Drive 저장공간을 확인합니다. Notion 내보내기와 PDF 원본을 같은 계정 밖에도 백업하고 실제로 열어봅니다. 연 1회 이상 의존성/보안 경고와 공급자 정책을 점검합니다. 10년 무점검 운영은 보장하지 않습니다.

## 장애 대응

| 증상 | 우선 확인 |
| --- | --- |
| 표지/본문이 준비 중 | `status` → GitHub 마지막 실행 → `last_error` 원인 수정 → 필요한 글만 재시도 |
| 전체 목록 대기 | 동기화 `checked_at`·외부 장애·Cloudflare 사용량. 공개 검사를 끄지 않음 |
| PDF만 안 열림 | Drive 파일별 공유 권한·파일 형식·다운로드 제한 |
| 수정 PDF 표지가 그대로 | `refresh-report` 한 번 실행 후 완료 확인 |
| 사진만 안 보임 | 게시 작업 결과와 [공지 사진 안내](notice-images.md) |
| 자동 게시 요청만 멈춤 | 전용 토큰 만료·발급자 조직 접근·Actions 활성 상태. 우선 수동 `publish` |
| Drive 정리 지연 | Apps Script 실행 로그의 `idle`/`deferred`/`safetyStop`, [삭제 안내](drive-cleanup.md) |

`/api/health`는 정적 응답이고 CMS 건강 상태를 보장하지 않습니다. 실제 운영 검사는 `status`와 공개 목록·대표 PDF로 합니다. 대량 부하 검사는 운영 Notion/Drive 대신 테스트 데이터로 실행합니다.
