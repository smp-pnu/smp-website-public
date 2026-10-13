# 코드 구조와 변경 안내

실제 운영 진입점은 `free/`입니다. Next.js `app/`와 Vercel 관련 모듈은 이전 경로의 호환성 검사에 남아 있으며 현재 Cloudflare 요청을 처리하지 않습니다. 화면과 콘텐츠 규칙을 공유하므로 확인 없이 일괄 삭제하지 않습니다. [과거 구조 기록](legacy-vercel-architecture.md)은 현재 설정 지침이 아닙니다.

| 변경할 내용 | 담당 위치 |
| --- | --- |
| 운영 화면 조합·클라이언트 경로 | `free/client/` |
| 공통 화면 | `components/` |
| 공개·정렬·분류·검색·PDF 규칙 | `lib/content-model.ts`, `content-query.ts`, `wics.ts`, `pdf-*.ts` |
| HTTP 경로·웹훅·동기화 진입 | `free/server/worker.ts` |
| 종류별 변경 조회·중복 실행 방지 | `free/server/sync.ts` |
| D1 공개 목록·수정 버전·삭제 방어 | `free/server/catalog.ts` |
| Notion 요청·공통 예산·단건 검증 공유 | `free/server/notion.ts`, `budget.ts`, `publication.ts` |
| HTML/상세·검색엔진 메타데이터 | `free/server/pages.ts`, `free/seo/` |
| 작업 임대·실패 상태·완료 검증 | `free/server/jobs.ts`, `job-errors.ts` |
| 자동 게시 실행 요청 | `free/server/publisher.ts` |
| PDF·이미지 준비와 배포 | `free/jobs/prepare.ts`, `publish.ts`, `publication-assets.ts` |
| 전체 대조·예약 공개·누락 복구 | `free/jobs/reconcile.ts` |
| 관리 상태·중단 글 재시도·PDF 새로 확인 | `free/jobs/manage.ts`, `maintenance.ts` |
| 정적 빌드·Worker 배포 | `scripts/build-free.mjs`, `deploy-free.mjs` |
| Drive 휴지통 연동 | `scripts/drive-cleanup/Code.gs`, `lib/drive-cleanup-relay.ts` |

## 유지할 경계

- Worker는 요청/공개 확인/가벼운 동기화만 담당합니다. Sharp·Canvas·PDF 렌더러는 Node 게시 작업에만 둡니다. 방문자 조회가 이미지 생성이나 전체 CMS 조회를 유발하지 않도록 합니다.
- D1 변경 저장·목록 재작성·실제 게시 완료를 구분합니다. 원본 수정 버전이 바뀌면 오래된 본문은 숨깁니다. 웹훅 원문은 서명을 검증하고 이벤트 안의 과거 데이터 대신 현재 Notion을 읽습니다.
- 상세·PDF의 성공한 단건 검증은 최대 60초 재사용하고 매번 현재 DB 소속/버전을 확인합니다. 비공개/삭제 알림이 반영되면 캐시를 즉시 무효화하고 만료 후 장애 시 닫힌 상태로 실패합니다. 게시 완료 검사는 캐시를 쓰지 않습니다.
- D1 마이그레이션은 Worker 배포 전에 Node 게시 작업에서 보장합니다. 새 열/테이블은 기존 운영 데이터에 적용 가능한 방식으로 추가하고, 변경된 쿼리는 SQLite 기반 실제 SQL 테스트로 검증합니다.
- 관리자 작업은 보호된 GitHub 워크플로에서 실행합니다. 공개 `/api/internal/*` 경로는 404를 유지하고 임의 명령·브랜치·파일 주소를 입력받는 관리 API는 만들지 않습니다.
- 공개 상태·커버 재사용·삭제는 별개입니다. 삭제 자동화의 소유자·폴더·다른 글 참조 검사와 10건 안전 정지는 유지합니다. [운영 안내](operations.md), [표지](report-covers.md), [Drive 삭제](drive-cleanup.md)를 함께 갱신하세요.

## 개발과 확인

`pnpm dev`/`build`는 이전 Next.js 경로입니다. 현재 Cloudflare 화면은 `pnpm build:free:fixture`로 운영 자료와 분리해 빌드합니다. `free/client`와 공유 컴포넌트를 바꾸면 이 빌드 결과를 반드시 확인하세요.

기본 검사: `pnpm typecheck`, `pnpm test`, `pnpm build:free:fixture`. 공유 Next.js 화면 변경에는 `pnpm build`와 `pnpm test:bundles`도 실행합니다. CI가 이 검사와 의존성 보안 감사를 수행합니다. 운영 배포는 검증된 PR을 `main`에 병합하면 보호된 게시 워크플로가 수행합니다. 수동 운영 절차는 [운영 안내](operations.md)를 따릅니다.

`seed:free:fixture`, `test:free:http`는 합성 DB 전용입니다. 운영 DB를 테스트 데이터로 덮어쓰지 않고, 실제 Notion/Drive에 100명 부하를 발생시키지 않습니다. 테스트에서 단위 검증한 요청 감소율과 운영에서 측정한 결과를 구분해 기록합니다.
