# 코드 구조와 변경 안내

## 현재 운영 경로 — Cloudflare (2026-10-10)

리포트 표지는 공개 게시 데이터와 별도로 보관합니다. 공개를 해제해도 표지 캐시는 유지되며, 다시 게시하는 작업에서 PDF 전체의 SHA-256을 비교합니다. 같은 내용이면 목록용·상세용 WebP를 재사용하고, 같은 Drive 링크의 파일을 교체했어도 내용이 달라지면 새로 생성합니다. 확인과 변환은 GitHub 게시 작업에서만 실행하며 방문자 요청에서는 실행하지 않습니다. 기존 표지는 PDF 해시가 없으므로 처음 처리될 때 한 번 검증·생성하여 캐시를 갱신합니다. 실제 Notion 항목 삭제·CMS 이탈 시에는 표지 캐시도 제거합니다. 공개 해제는 목록·본문 접근을 막지만 이미 공개된 이미지 주소나 내려받은 자료의 회수를 뜻하지 않습니다.

운영 화면은 `free/client`, API·변경 동기화는 `free/server`, PDF 표지·공지 이미지 준비와 배포는 `free/jobs`입니다. 기존 `components/`와 `lib/`의 화면·업무 규칙을 재사용하지만 `app/`의 Next.js 서버 라우트와 Vercel Blob은 현재 방문자 요청을 처리하지 않습니다. 자세한 한도와 인수인계는 [README](../README.md)의 무료 운영 구조를 먼저 확인합니다.

| 변경할 내용 | 현재 담당 위치 |
| --- | --- |
| 정적 페이지 조합·클라이언트 경로·목록 요청 캐시 | `free/client/` |
| 경량 API·현재 공개 여부 확인·PDF 전달 | `free/server/worker.ts`, `notion.ts` |
| D1 목록 구성·Notion 변경 조회 | `free/server/catalog.ts` |
| 계정 공통 요청 예산·외부 서비스 대기 | `free/server/budget.ts`, `notion.ts` |
| 본문·표지·사진 준비·게시 작업 | `free/jobs/` |
| 일일 전체 대조·예약 게시·지연 복구 | `free/jobs/reconcile.ts` |
| 정적 빌드·Worker별 배포 설정 | `scripts/build-free.mjs`, `scripts/deploy-free.mjs` |
| 자동 게시·검증 워크플로 | `.github/workflows/free-publish.yml`, `checks.yml` |
| Notion 알림 주소 교체 | `free/server/webhook-setup.ts`, [연결 절차](free-webhook.md) |

PDF 변환·Sharp·Canvas를 Worker에 추가하지 않습니다. 무거운 준비는 GitHub 게시 작업에서 수행합니다. PDF 전달은 `lib/pdf-response.ts`의 Cloudflare 기본 스트림 경로를 보존합니다. 상세·PDF에는 목록의 공개 상태 캐시를 권한 근거로 쓰지 않으며, 서명 없는 웹훅은 거절합니다. 기존 카드/검색/PDF 컴포넌트 수정 시 정적 화면에서도 함께 검증합니다.

## 이전 Next.js/Vercel 경로의 기록

2026-10-07 점검. 콘텐츠 정렬·공개 검증·캐시·PDF 스트리밍은 이미 별도 모듈로 분리되어 있었습니다. 이번에는 일반 화면과 표지 생성의 의존성을 끊고, 목록 계산과 화면을 분리하며, 독립적인 화면 영역을 스트리밍하도록 개선했습니다. 프레임워크나 운영 계정을 교체하지 않았습니다.

## 어디를 수정하는가

| 변경할 내용 | 담당 파일 |
| --- | --- |
| Notion 속성 이름, 공개 조건, 학기/순번 정렬 | `lib/content-model.ts` |
| WICS 분류/산업 필터 | `lib/wics.ts` |
| 기업정보 자동 입력/정합성 검사 | `lib/report-metadata-service.ts`, `report-identity.ts`, `company-lookup.ts` |
| 업로드 시 PDF 텍스트 추출 | `lib/report-pdf-text.ts` |
| Notion API, 재시도, 페이지네이션 | `lib/notion-request.ts` |
| 목록·단일 페이지·본문 조회, DB 범위 검사와 동시 요청 합치기 | `lib/notion.ts` |
| 공개 목록/본문의 60초 캐시와 120초 오래된 데이터 제한 | `lib/content-catalog.ts` |
| 검색어 매칭, 분류 필터, 페이지 계산 | `lib/content-query.ts` |
| 목록/상세 주소와 목록 복귀 문맥 | `lib/content-navigation.ts` |
| 목록 화면 조합 | `components/content-list.tsx` |
| 공지·홈의 행 목록 / 리포트 카드 / 번호 버튼 | `components/content-rows.tsx`, `research-grid.tsx`, `content-pagination.tsx` |
| 검색 입력, 키보드 자동완성, 분류 변경 | `components/content-search-form.tsx` |
| 상세 공개 확인·제목·본문 / 첨부파일과 뷰어 배치 | `components/content-detail.tsx`, `content-attachments.tsx` |
| Notion 본문 서식 렌더링 | `components/notion-content.tsx` |
| PDF 로딩 상태 / 현재 한 페이지 렌더링 | `components/pdf-viewer.tsx`, `pdf-canvas.tsx` |
| PDF 원본 주소 검증 / 안전한 HTTP 스트리밍 | `lib/pdf-source.ts`, `pdf-response.ts`, `pdf-range.ts` |
| 저장된 표지 읽기·동시 조회 합치기·메모리 캐시 | `lib/saved-cover-reader.ts` |
| 표지 메타데이터 타입·검증·원본 식별 | `lib/cover-metadata.ts` |
| WebP 변환·저장·동시 수정 충돌 처리 | `lib/cover-generation.ts` |
| 표지 생성 요청·웹훅 동기화·일일 점검 | `lib/cover-service.ts` |
| Blob 저장소 접근 | `lib/cover-store.ts` |
| Notion 삭제 → Drive 휴지통 자동화 | `lib/drive-cleanup-relay.ts`, `scripts/drive-cleanup/Code.gs`, `docs/drive-cleanup.md` |

API 라우트는 요청 파라미터와 인증을 확인하고 위 모듈을 호출합니다. 화면 컴포넌트에서 Notion 토큰이나 Drive 삭제 로직을 다루지 않습니다. 업무 규칙을 수정할 때는 해당 `lib` 파일과 동작 테스트를 함께 변경합니다.

## 읽기와 생성의 경계

일반 화면은 `saved-cover-reader → cover-metadata / cover-store`만 사용합니다. `cover-service`, `cover-generation`, `pdf-preview-render`를 일반 페이지에서 import하지 마세요. Sharp·PDF.js·네이티브 Canvas는 표지 API, 서명된 웹훅, 일일 복구 작업에서만 서버 생성에 사용합니다. 브라우저 PDF 뷰어의 지연 로딩은 별도로 유지합니다.

홈의 최근 리포트는 `content-rows`를 직접 가져옵니다. 목록 전체를 조합하는 `content-list`를 통해 가져오지 않습니다. 화면 공용 컴포넌트를 무거운 서비스와 함께 재수출하는 파일을 만들지 않는 것이 이 경계를 유지하는 데 도움이 됩니다.

`pnpm test:bundles`는 실제 프로덕션 빌드의 파일 추적 결과를 검사합니다. 홈·공지·리포트 일반 페이지에 서버용 생성 의존성이 다시 포함되면 실패합니다. GitHub Actions에서도 빌드 직후 이 검사를 실행합니다.

## 기다리는 영역을 작게 유지

- 상세는 현재 공개 여부를 확인한 후 제목과 다운로드 링크를 먼저 보냅니다. Notion 본문과 첫 페이지 미리보기는 각자의 Suspense 영역에서 준비합니다. 본문 오류는 본문 위치에만 표시하므로 첨부 PDF는 계속 사용할 수 있습니다.
- 리포트 카드의 제목·분류·작성자는 저장소 응답과 무관하게 표시합니다. 표지는 카드별로 준비하므로 느린 표지 하나가 전체 그리드를 막지 않습니다. 고정된 종이 비율의 빈 영역을 사용해 표지가 도착할 때 카드 높이가 변하지 않습니다.
- 홈의 최신 리포트 조회는 별도 영역에서 처리하므로 Notion 지연이 홈 전체의 최초 응답을 막지 않습니다.
- 검색·분류는 Next.js Form으로 이동합니다. 전체 문서를 새로 로딩하지 않고 목록을 갱신하며, 사전 조회는 꺼 두었습니다. JS가 없어도 GET 검색 폼은 동작합니다. [Next.js Form 문서](https://nextjs.org/docs/app/api-reference/components/form).
- 목록과 자동완성은 동일한 검색 규칙을 사용합니다. 브라우저는 전달받은 검색 자료를 한 번 정규화하고, 선택한 분류에서 최대 6건을 찾으면 탐색을 멈춥니다. 타이핑할 때 Notion API를 호출하지 않습니다. 한글 조합 중 Enter는 추천 항목 선택으로 처리하지 않습니다.

본문이 긴 공지에서는 스트리밍 본문 도착 시 아래 첨부 영역의 위치가 바뀔 수 있습니다. 본문 전체 높이를 미리 알 수 없기 때문입니다. 표지의 종이 비율은 고정하되, 가변 본문을 위해 임의의 큰 높이를 예약하지 않았습니다.

## 유지해야 할 데이터 규칙

1. 목록 캐시를 상세·첨부파일 접근 권한으로 사용하지 않습니다. 상세·PDF·파일·표지 API는 현재 페이지의 DB 소속, 공개, 게시일, 삭제 여부를 확인합니다. 같은 시점의 요청만 합치며 공개 상태를 지속 캐시하지 않습니다.
2. 저장된 본문은 위 공개 확인 뒤에만 읽습니다. 본문 장애를 비공개나 삭제로 해석하지 않습니다. 실제 비공개 상세·PDF는 계속 404로 응답합니다.
3. 표지 메모리 캐시는 최대 256건, 60초입니다. 원본 파일이나 Notion 수정 시점이 달라지면 재사용하지 않습니다. 누락된 표지나 오류를 성공 결과처럼 캐시하지 않습니다.
4. 목록은 리포트 12건, 공지 10건 단위입니다. 정렬은 `content-model`에서 끝내고 검색/페이지 계산은 그 순서를 보존합니다. 페이지·검색·분류는 주소에 유지하여 상세에서 돌아갈 때 복구합니다.
5. 표지 생성은 저장 직전에 현재 공개 상태와 원본을 다시 확인합니다. 작업 중 비공개 전환이나 PDF 교체가 일어나면 이전 결과를 저장하지 않습니다.
6. Drive 원본 삭제는 기존의 서명된 알림, 소유자·폴더·다른 글 참조 검사, 휴지통 이동 절차를 유지합니다. 이번 구조 개선에서 그 동작과 권한은 변경하지 않았습니다.

## 검증 및 재현

기본 검사:

```sh
pnpm test
pnpm build
pnpm test:bundles
pnpm typecheck
```

운영 서비스를 호출하지 않는 HTTP 검사는 다음과 같이 실행합니다. 포트 3004를 비워 두고, 실행마다 새로운 `SMP_TEST_RUN` 값을 사용해야 기존 테스트 캐시와 분리됩니다. fixture는 운영 Vercel 환경에서 실행을 거부합니다.

```sh
# 터미널 1: pnpm build 완료 후
SMP_TEST_FIXTURES=1 SMP_TEST_RUN="audit-$(date +%s)" \
SMP_TEST_STATE=/tmp/smp-test-state.json SMP_TEST_STATS=/tmp/smp-test-stats.jsonl \
node --import ./tests/scale-fixture.mjs node_modules/next/dist/bin/next start -p 3004

# 터미널 2: 먼저 다른 브라우저로 테스트 서버에 접속하지 말고 실행
SMP_TEST_STATE=/tmp/smp-test-state.json SMP_TEST_STATS=/tmp/smp-test-stats.jsonl \
node tests/scale-http.mjs
SMP_TEST_STATE=/tmp/smp-test-state.json node tests/streaming-http.mjs
```

`scale-http.mjs`는 리포트 600건·공지 300건에서 100개 동시 요청, Notion 호출 수, 비공개 전환, 웹훅 목록 갱신을 검사합니다. `streaming-http.mjs`는 홈 목록 지연, 본문 지연 2초, 본문 API 실패, 비공개 전환 시 제목·다운로드·PDF 접근을 검사합니다. 종료 후 터미널 1의 서버를 Ctrl+C로 중지합니다.

점검 결과: 단위/서비스 테스트 87개, 빌드·타입 검사, 일반 페이지 5개 의존성 검사를 통과했습니다. 동일한 모의 본문 지연 2초에서 제목·다운로드 HTML 도착은 개선 전 2,209ms, 첫 개선 빌드 107ms였습니다. 이는 한 대의 로컬 환경에서 측정한 결과이며 운영 속도 보장이 아닙니다. 홈·리포트 목록·상세의 서버 추적 파일에서 생성 관련 의존성 447개, 63,072,447바이트가 제거되었습니다. 이 수치는 서버 배포 의존성 기준이며 브라우저 다운로드 감소량이 아닙니다.

실서비스 배포 후에는 실제 리포트의 표지, 분류·검색, 상세 PDF·다운로드, 목록 복귀를 확인합니다. 무료 저장/전송량과 외부 API 변경 등 장기 운영 조건은 [운영 점검](operations.md)을 참고하세요.

최종 로컬 빌드의 동시 HTTP 검사 결과입니다. 각 행은 100개 동시 요청이며, 모의 Notion은 기본 응답 지연 20ms입니다. PDF는 작은 테스트 파일이므로 실제 대용량 파일의 전송 속도를 뜻하지 않습니다.

| 경로 | p95 응답 완료 | 해당 묶음의 Notion 호출 |
| --- | --- | --- |
| 리포트 600건, 빈 캐시 | 1,116ms | 목록 페이지 6회 |
| 리포트 600건, 채워진 캐시 | 669ms | 0회 |
| 공지 300건 | 539ms | 목록 페이지 3회 |
| 동일 리포트 상세 | 155ms | 페이지 1회 + 본문 1회 |
| 동일 PDF | 43ms | 페이지 1회 |

검색 입력은 `components/search-field.tsx`, 분류·기수 선택은 `filter-select.tsx`, 보기 방식·네트워크 탭은 `segmented-control.tsx`를 공유합니다. 공통 크기·테두리·선택 상태를 바꿀 때에는 이 컴포넌트를 먼저 수정합니다.

사이트의 기본 색상은 `app/globals.css`의 `--site-*` 변수에서 관리합니다. 바탕은 중립적인 `#080a0c`, 표면은 `#141517`, 본문은 `#e4e4e7`입니다. 사진은 검정 바탕 위에서 원래 색을 유지하며, 일반 페이지·홈 하단은 불투명도 28%, 공지는 30%, 홈 첫 화면은 65%를 사용합니다. 홈 제목 뒤에는 별도 검정 패널로 대비를 확보합니다. 남색 바탕 위에 사진을 낮은 불투명도로 겹쳐 색이 탁해지지 않도록 합니다. 일반 페이지의 제목·설명은 `PageIntro`, 공지 목록은 이전 구성을 보존하는 `NoticeListing`을 사용합니다. 공지 본문은 박스 없이 유지하고, 검색·필터는 가벼운 반투명 바탕을 공유합니다.

커리큘럼도 `HomeBackground`의 고정 사진을 사용합니다. 본문에 별도 검정 바탕이나 스크롤 배경을 겹치지 않으며, `CurriculumMotion`은 단계 표시와 앵커 이동만 담당합니다.
