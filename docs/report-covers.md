# 리포트 표지 자동화 설정과 인수인계

## 구성

Notion의 읽기 전용 연결이 리포트 변경 웹훅을 보냅니다. 서버는 서명을 검증하고 현재 공개 상태를 다시 읽은 다음, Drive의 첫 페이지 미리보기를 최대 너비 720px WebP로 압축해 Vercel Blob에 저장합니다. 목록에서는 PDF와 Drive를 거치지 않고 저장된 이미지 주소를 사용합니다.

`report-covers/<페이지 ID>/<이미지 해시>.webp`는 내용별 이미지이고, `current.json`은 파일 출처의 해시·Notion 수정 시각·표지 주소·크기만 담습니다. Drive 원본 주소, API 토큰, 본문이나 비공개 글은 저장하지 않습니다. 새 원본/수정 시각이 감지되면 이전 표지를 그대로 연결하지 않습니다. Notion 조회 실패 시 삭제나 공개 상태 변경을 추정하지 않습니다.

## 한 번만 하는 설정

1. 학회 Vercel 프로젝트에 **Public Blob** 저장소를 생성·연결합니다. Production에 `BLOB_READ_WRITE_TOKEN`을 연결하고 Preview에는 운영 저장소 토큰을 주지 않습니다. 기존 `.env.local`은 덮어쓰지 않습니다.
2. 암호학적으로 안전한 32바이트 이상의 임의 값을 `CRON_SECRET`으로 생성하여 Production과 관리자 로컬 `.env.local`에 저장합니다. 값은 채팅·Git·Notion 본문·로그에 기록하지 않습니다.
3. 코드를 배포합니다. 저장소가 설정되지 않은 상태에서도 기존 미리보기는 작동하지만 자동 저장은 아직 활성화되지 않습니다.
4. Notion 개발자 도구의 기존 `SMP Website` 연결 → 웹훅에서 구독을 추가합니다. URL은 `https://<운영 도메인>/api/notion/webhook`입니다. URL에는 비밀값을 넣지 않습니다. API 버전 `2025-09-03`과 `page.created`, `page.properties_updated`, `page.content_updated`, `page.deleted`, `page.undeleted`, `page.moved` 이벤트를 선택합니다. API 읽기 권한을 삽입·수정 권한으로 바꿀 필요가 없습니다.
5. 최초 Notion 확인 토큰은 암호화된 임시 파일 `setup/notion-verification.enc`로만 저장됩니다. 같은 `CRON_SECRET`을 Bearer 인증에 사용해 `GET /api/notion/webhook`에서 토큰을 안전하게 받아 Notion 구독 확인란에 입력합니다. 서버의 `NOTION_WEBHOOK_VERIFICATION_TOKEN`에도 저장한 뒤 재배포합니다. 이 시점부터 모든 이벤트의 원문 HMAC-SHA256 서명이 필수입니다. 토큰이 설정된 뒤에는 GET으로 토큰을 다시 노출하지 않습니다.
6. `CRON_SECRET` Bearer 인증으로 `GET /api/cron/report-covers`를 한 번 호출해 기존 리포트 표지를 준비합니다. 응답의 `failed`가 0인지 확인합니다. 작업은 이미지 파생본만 생성/삭제하고 원본 PDF나 Notion 글을 수정하지 않습니다.
7. 저장소의 임시 `setup/notion-verification.enc` 파일을 삭제합니다. 활성 웹훅은 환경변수의 확인 토큰을 사용하므로 이 파일이 필요 없습니다.
8. 테스트 리포트를 공개하고 웹훅 전달·WebP 생성·목록 이미지·PDF 뷰어와 다운로드를 확인합니다. PDF 링크 교체와 공개 해제도 확인합니다.

확인 토큰은 비밀값이며, `CRON_SECRET`은 서버와 관리자 로컬에만 둡니다. 새 구독으로 교체할 경우 기존 구독을 제거하고 확인 토큰도 함께 갱신합니다. Notion의 최초 확인 요청에는 서명이 없으므로 토큰이 미설정인 동안에는 확인 토큰을 암호화해 임시 보관만 합니다. 이벤트는 이 단계에서 실행되지 않습니다. 이미 받은 확인 토큰은 다른 값으로 덮어쓰지 않으며, 관리자가 Notion에서 확인을 성공한 토큰만 서버 환경변수로 설치합니다. Notion 확인이 실패하면 임시 파일을 삭제하고 Notion에서 토큰을 재전송합니다. 환경변수 설정 뒤에는 최초 확인 요청도 받지 않고 모든 이벤트에 서명이 필요합니다.

## 자동 동기화와 비용

`vercel.json`은 하루 한 번 동기화를 예약합니다(UTC 19:17, 한국 시간 다음 날 04:17 기준). Hobby 실행 시각에는 지연이 있을 수 있습니다. 이 작업은 같은 Drive 파일 ID의 내용 변경, 놓친 웹훅, 예약 게시를 확인합니다. 개별 리포트 실패는 다른 리포트 처리를 막지 않고, 실패 건수가 있으면 503을 반환합니다. 24시간이 지난 사용하지 않는 표지 파생본도 정리합니다. 최대 실행 시간에 가까워지면 실패 상태를 반환하므로 많은 리포트가 쌓이면 작업 분할이 필요합니다.

Vercel Blob Hobby 포함량은 확인일 2026-10-03 기준 저장 1GB, 전송 10GB, 단순 작업 10,000회, 고급 작업 2,000회입니다. 무료 한도 초과 시 추가 청구 대신 Blob 접근이 중단되며, 사이트는 가능한 경우 Drive 미리보기로 대체합니다. 플랜을 Pro로 변경하면 과금 방식이 달라지므로 다음 담당자가 계획 변경 전에 확인해야 합니다. [Blob 요금·한도](https://vercel.com/docs/vercel-blob/usage-and-pricing), [Notion 웹훅](https://developers.notion.com/reference/webhooks).

## 장애 확인

- 표지만 늦게 뜨면 Notion 웹훅의 활성 상태·전달 결과, Vercel 함수 상태, Blob 사용량과 `BLOB_READ_WRITE_TOKEN`을 확인합니다.
- 표지와 PDF 모두 안 열리면 Drive 파일의 개별 공개 권한을 확인합니다. 폴더는 비공개로 유지합니다.
- 원본만 교체했다면 일일 동기화를 기다리거나 Notion 속성을 수정합니다. 동일 주소를 유지한 채 교체하면 Notion 자체에는 변경 이벤트가 발생하지 않습니다.
- 저장된 이미지 주소는 공개 CDN 주소입니다. Notion 비공개 전환은 이미 받은 이미지의 회수 기능이 아닙니다.

학회 Vercel 프로젝트·Blob 저장소·Notion 연결과 Google Drive 접근을 함께 인계합니다. 평상시에는 이 설정을 만질 필요가 없습니다.
