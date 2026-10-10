# Cloudflare의 Notion 게시 알림 연결

평소 글 작성과 담당자 교체에는 이 절차가 필요하지 않습니다. Notion 웹훅 URL을 바꾸거나 구독을 다시 만들 때만 진행합니다. 기존 구독은 인증 후 URL을 수정할 수 없으므로, 사용 중인 구독의 이벤트 종류를 기록하고 교체합니다. Notion DB·글·API 연결 자체는 삭제하지 않습니다.

1. 운영 D1에 `0005_webhook_setup.sql`까지 적용하고 현재 코드를 배포합니다. 기존 공개 목록의 매분 동기화와 GitHub 게시 작업은 계속 켜 둡니다.
2. 홈페이지 Worker의 임시 Secret `NOTION_WEBHOOK_SETUP`에 JSON 객체 `{ "secret": "새로운 32바이트 이상의 난수", "expiresAt": 만료시각의_UNIX_밀리초 }`를 등록합니다. 만료는 등록 시점에서 10분 뒤로 설정하며, 서버는 15분보다 긴 유효기간을 거절합니다. 이 값과 아래 검증 토큰은 공개 로그·Git·채팅에 남기지 않습니다.
3. Notion **SMP Website → 웹훅**에서 목적지를 현재 홈페이지의 `/api/notion/webhook`으로 설정합니다. `page.created`, `page.content_updated`, `page.properties_updated`, `page.deleted`, `page.undeleted`, `page.moved`를 구독합니다. 원래 구독 삭제는 관리자 확인을 거칩니다.
4. 최초 인증 요청은 D1 `free_webhook_setup`에 암호화되어 저장됩니다. 인증 후보를 읽는 공개 API는 없습니다. 관리자가 D1에서 해당 행을 비공개로 조회하고 `lib/webhook-security.ts`의 `openToken`으로 복호화합니다. 기존 HMAC 검증 토큰은 이 요청만으로 바뀌지 않습니다.
5. 새 검증 토큰을 홈페이지 Worker의 `NOTION_WEBHOOK_VERIFICATION_TOKEN` Secret에 반영하고, Notion 구독 인증 창에 같은 토큰을 입력해 인증합니다. 임시 `NOTION_WEBHOOK_SETUP` Secret과 D1 인증 후보 행, 로컬 임시 파일을 제거합니다. 만료된 후보는 예약 Worker에서도 정리합니다. 인증 실패 시 운영 토큰을 되돌리고 새 난수로 다시 시작합니다.
6. Notion의 비공개 시험 항목을 수정하고 실제 웹훅 응답이 200인지 확인합니다. `page.deleted` 전달은 기존 `DRIVE_CLEANUP_WEB_APP_URL`의 Apps Script 대기열로 연결됩니다. 실제 파일 정리 시험은 비공개 임시 자료로만 진행합니다.

임시 인증 창은 검증 토큰 후보를 한 번만 저장합니다. 서명 없는 일반 이벤트는 항상 거절하며, 후보를 저장한 것만으로 게시나 삭제를 실행하지 않습니다. 잘못된 후보가 먼저 도착하면 Notion 자체의 인증을 통과할 수 없으므로 구독을 활성화하지 않고 재시도합니다.

Drive relay는 Notion **API 연결 토큰**을 별도 HMAC 용도로 사용합니다. 웹훅 **검증 토큰**을 교체하는 작업은 Apps Script 설정이나 Drive 권한 변경을 요구하지 않습니다. API 연결 토큰 자체를 바꾸는 경우에는 [Drive 인수인계 절차](drive-cleanup.md)를 따릅니다.

공식 절차: [Notion 웹훅 생성·인증·URL 교체](https://developers.notion.com/reference/webhooks).
