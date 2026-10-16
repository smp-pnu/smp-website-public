# 개발과 검증

Node 24와 저장소에 지정된 pnpm을 사용합니다.

- `pnpm install --frozen-lockfile`
- `pnpm dev`: 실제 Cloudflare 라우팅·Worker·로컬 D1로 실행합니다. 가상 리포트 600건과 공지 300건을 생성하며 운영 Notion/Drive는 호출하지 않습니다. 기본 주소는 `http://127.0.0.1:3005`입니다.
- 코드 수정 후 중단하고 `pnpm dev`를 다시 실행해 빌드를 갱신합니다. 정적 모집 설정도 테스트용 기본값을 사용합니다.
- `pnpm typecheck && pnpm test`: 데이터 변환·공개 검증·동기화·한도·백업 규칙을 확인합니다.
- 로컬 서버가 켜져 있을 때 `pnpm test:free:http`: 목록·검색·상세·PDF 범위 요청·표지와 가상 데이터 100개 동시 요청을 검증합니다.
- `pnpm build:free:fixture`: 가상 데이터용 빌드. `pnpm build:free`와 `pnpm deploy:free`는 운영 설정과 배포 허용 값이 필요합니다.
- `pnpm dev:next`, `pnpm build:next`(기존 `pnpm build`): 공유 화면의 과거 Next.js 호환성 확인용입니다. 실제 운영 검증은 Cloudflare 경로로 합니다.

PR/코드 배포와 매주 예약 점검에서 전체 테스트·빌드를 실행합니다. 콘텐츠 게시만 하는 15분 예약 실행은 같은 코드의 전체 테스트를 매번 반복하지 않습니다. 본문·표지가 바뀌지 않으면 기존처럼 이미지 배포를 생략합니다.

운영 시크릿·원문 덤프·회원 개인정보·백업 파일을 커밋하지 않습니다. 백업 코드는 자동으로 Apps Script에 배포되지 않으므로 운영 스크립트 반영과 실행 검증을 별도로 기록합니다.
