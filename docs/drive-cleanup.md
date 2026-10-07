# 노션 리포트 삭제와 Drive PDF 정리

학회 Google 계정의 Apps Script가 5분마다 실행됩니다. 웹사이트 방문과 독립적이며 담당자의 컴퓨터가 꺼져 있어도 동작합니다. 코드 원본은 `scripts/drive-cleanup/Code.gs`입니다.

## 관리자가 사용하는 방법

- 잠시 숨기려면 Notion의 **공개** 체크를 해제합니다. 원본 PDF는 보관합니다.
- 자료를 제거하려면 **리포트 항목을 휴지통으로 이동**합니다. 연결된 PDF도 다음 점검에서 Drive 휴지통으로 이동합니다. 정상 상태에서는 대개 5분 안팎이며, Google 일정 지연이나 재시도가 있으면 더 걸릴 수 있습니다.
- 같은 PDF를 다른 리포트·공지의 속성이나 본문에서 참조하면 PDF를 보관합니다. 비공개 항목의 링크도 확인합니다.
- 대상은 설정된 **리포트 폴더와 그 하위 폴더의 PDF**입니다. 폴더 자체, 공지 사진, 다른 위치의 파일은 삭제하지 않습니다. Notion 공지 항목 삭제는 이번 자동 삭제 대상에 포함하지 않습니다.
- 파일 링크를 교체하거나 지우는 것만으로 옛 파일을 삭제하지 않습니다. 목록 정렬을 바꾸려고 항목을 삭제하지 마세요.
- 잘못 삭제했다면 Notion과 Drive의 휴지통에서 각각 복원합니다. 이 프로그램은 자동 복원을 수행하지 않습니다. Drive 휴지통은 통상 30일 뒤 영구 삭제됩니다.

## 작동 구조

1. 두 Notion 데이터 소스의 전체 목록을 읽습니다. 공개 필터를 적용하지 않습니다. 쿼리 실패, 반복 커서, 삭제된 DB는 정리를 중단합니다.
2. 기존에 등록됐지만 목록에서 사라진 리포트를 개별 조회합니다. **`in_trash === true`**와 리포트 DB 소속이 모두 확인된 경우만 후보가 됩니다. 조회 404나 권한 변경은 삭제로 간주하지 않습니다.
3. 속성·첨부·본문에 같은 Drive 파일 ID가 있는지 검사합니다. 본문은 마지막 수정 시각을 기준으로 재사용합니다. 최초 또는 대량 변경 시 회당 최대 60번의 본문 요청으로 나누며, 전체 검사가 끝나기 전에는 파일을 삭제하지 않습니다.
4. 실행 직전 Notion 삭제 상태를 다시 읽고, Drive의 파일 형식·소유자·상위 폴더를 확인합니다. `setTrashed(true)`만 사용하며 영구 삭제 API는 사용하지 않습니다.
5. 체크포인트는 Script Properties에 두 슬롯으로 저장하고 완성된 슬롯만 활성화합니다. 진행 상태에는 파일 ID·페이지 ID·수정 시각만 저장합니다. 공개 웹사이트나 Blob에 관리용 목록을 게시하지 않습니다.

기존 Notion 웹훅도 삭제된 페이지 ID를 Apps Script로 전달합니다. 이 경로는 5분 사이에 생성되고 삭제된 페이지도 놓치지 않도록 보완합니다. 웹사이트에서 Notion의 원문 서명을 검증한 후, 별도 용도의 HMAC으로 서명한 ID·시각만 보냅니다. Apps Script는 서명과 시각을 확인해 대기열에 넣습니다. 실제 삭제는 항상 위의 최신 상태 검사를 거칩니다.

## 최초 설치 / 담당자 인수인계

1. 학회 Google 계정으로 Apps Script 프로젝트를 만들고 `Code.gs`를 복사합니다. 개인 계정에 설치하지 않습니다.
2. **Project Settings → Script Properties**에 다음 값을 넣습니다. 비밀 값을 코드나 GitHub에 기록하지 않습니다.

| 속성 | 값 |
| --- | --- |
| `NOTION_TOKEN` | 웹사이트와 같은 Notion 읽기 전용 연결 토큰 |
| `REPORTS_DATA_SOURCE_ID` | 리포트 데이터 소스 ID |
| `NOTICES_DATA_SOURCE_ID` | 공유 파일 참조를 확인할 공지 데이터 소스 ID |
| `DRIVE_REPORTS_ROOT_ID` | 리포트 전용 상위 폴더 ID |

3. `previewCleanup`을 실행하고 Drive 접근·외부 요청·예약 실행 권한을 승인합니다. 이것은 파일을 삭제하지 않는 사전 점검입니다. `pendingReferences: true`면 초기 본문 검사가 남은 상태이므로 다시 실행해 이어서 검사합니다.
4. `enableCleanup`을 실행합니다. 같은 함수의 트리거를 중복 생성하지 않으며, **Triggers**에서 `syncDeletedReports` 시간 기반 트리거 1개를 확인합니다.
5. 웹 앱으로 배포합니다. **Execute as: Me**, **Who has access: Anyone**로 설정합니다. 웹 앱은 인증된 삭제 힌트만 받으며 파일 읽기·다운로드·임의 삭제 API를 제공하지 않습니다.
6. 웹 앱의 `/exec` URL을 Vercel Production 환경변수 `DRIVE_CLEANUP_WEB_APP_URL`에 넣고 배포합니다. Notion 웹훅 구독에 `page.deleted` 이벤트가 포함됐는지 확인합니다.
7. 임시 비공개 리포트와 임시 PDF로 공개 해제 시 보존, 항목 삭제 시 휴지통 이동을 확인합니다. 실사용 자료로 시험하지 않습니다.

같은 학회 Google 계정을 넘겨주면 설치된 트리거도 그 계정으로 계속 실행됩니다. Google 계정을 바꿀 때는 새 담당 계정의 파일 소유권과 폴더 권한을 확인하고 트리거를 새로 설치해야 합니다. Notion 토큰을 교체하면 Vercel과 Script Properties 양쪽을 함께 수정합니다. 프로그램을 수정하면 GitHub 코드와 Apps Script 편집기를 맞추고 웹 앱도 새 버전으로 배포합니다.

## 상태 확인과 중단

- 삭제 후보가 한 번에 **11개 이상**이면 `safetyStop: true`로 Drive 정리를 전부 보류합니다. 실수로 지운 Notion 항목을 복원해 후보가 10개 이하가 되면 정상 동작합니다. 의도한 대량 정리는 관리자가 Notion·Drive 항목을 직접 대조한 뒤 처리합니다. 체크포인트를 지워 우회하지 마세요.
- `cleanupStatus` 실행: 활성화 여부, 최근 실행 결과, 트리거 수를 확인합니다. 비밀 값은 출력하지 않습니다.
- **Executions**: 실패 원인과 실행 시간을 확인합니다. Google의 기본 실패 알림도 학회 계정으로 전달될 수 있습니다.
- `disableCleanup` 실행: 자동 정리를 중단하고 이 프로그램의 트리거만 제거합니다. 원본 파일과 Notion 글은 변경하지 않습니다.
- 참조 검사가 여러 번 이어지거나 Notion/Drive 권한 문제가 발생하면 삭제를 보류합니다. 오류가 있는 상태에서 체크포인트를 임의로 초기화하지 마세요.

기본 실행의 Notion 호출은 데이터 소스 확인 2회와 전체 목록 페이지 수만큼입니다. 600개 리포트·300개 공지라면 정상 상태에서 약 11회/5분이며, 본문 수정·삭제 후보가 있을 때만 추가 호출합니다. 이는 웹사이트 트래픽과 별개입니다. 초기 본문 수집은 나눠 수행합니다. 무료 할당량과 API 정책은 바뀔 수 있으므로 인수인계 때 실행 기록을 확인합니다.

근거: [Apps Script 예약 실행](https://developers.google.com/apps-script/guides/triggers/installable), [할당량](https://developers.google.com/apps-script/guides/services/quotas), [Drive 휴지통](https://developers.google.com/apps-script/reference/drive/file#setTrashed(Boolean)), [Notion 삭제 이벤트](https://developers.notion.com/reference/webhooks-events-delivery).
