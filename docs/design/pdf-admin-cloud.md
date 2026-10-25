# PDF 관리자 온라인 시험판

`feature/pdf-admin-cloud-trial-20261025`에서만 작업한다. 운영 `main`으로 병합하거나 기존 운영 Worker, Notion, Drive와 연결하지 않는다. 별도 Worker와 별도 D1에만 배포한다. 운영 게시 기능은 없으며 ‘시험 승인’은 초안의 검토 완료 상태다.

## 구성

- 관리자 화면: 별도 정적 Vite 빌드. PDF.js는 PDF를 선택할 때 불러온다.
- 인증: Cloudflare Access에서 지정한 관리자 이메일만 허용한다. Access가 전체 시험 호스트를 보호하고, Worker도 JWT의 서명·발급처·대상·만료·이메일을 독립 검증한다. 설정이 없거나 확인에 실패하면 자료 API를 닫는다.
- 로컬 서버의 비밀번호·사용자·자료를 자동 이전하지 않는다. 로컬의 scrypt와 파일 시스템 구현은 변경하지 않는다.
- 파일 처리: 브라우저에서 첫 3페이지 입력 후보·표지를 만들고, 256KiB씩 순차 전송한다. 서버는 조각의 실제 SHA-256과 전체 조각 목록의 해시를 확인한다. 해시는 일반적인 원본 SHA-256과 다른, 버전이 명시된 콘텐츠 식별자다.
- 저장: 제한된 시험 자료만 D1의 조각 테이블에 보관한다. 파일 조각은 base64 TEXT이며 최종 검증이 끝나야 목록에서 보인다. 저장 도중 끊기면 취소하거나 30분 뒤 다음 업로드 때 정리한다.
- 다운로드: 로그인 후 최대 3개 조각을 병렬 요청하고 전체 파일 식별자를 재검증한다. 원본과 표지는 정적 공개 폴더에 넣지 않는다.
- 초안 변경: 버전 충돌, 수정 후 승인 해제, 휴지통·복원·삭제를 서버에서 검사한다. 자료를 영구 삭제하면 관련 파일 조각도 DB 트랜잭션에서 삭제한다.

온라인 Worker는 PDF 전체 구조 검사나 표지 재인코딩을 하지 않는다. 헤더·끝 표시·바이트 수·내용 해시·표지 크기를 검증하며, 페이지 수와 추출 내용은 브라우저 분석 결과를 관리자가 검토한다. 원본은 첨부파일로 내려받으며 임의 HTML을 실행하지 않는다. 이 차이를 로컬의 서버 구조 검사와 혼동하지 않는다.

## 무료 한도와 운영 경계

2026-10-25 공식 문서 기준 Workers Free는 계정 전체 하루 10만 요청·호출당 CPU 10ms, D1 Free는 하루 500만 행 읽기·10만 행 쓰기·계정 저장 5GB·DB당 500MB다. 정적 파일은 Worker를 거치지 않는 별도 자산 경로로 전달한다. 기존 운영 사이트와 플랫폼의 계정 총량은 공유한다.

시험판 자체 제한:

| 항목 | 제한 |
| --- | --- |
| 원본 PDF | 32MiB, 브라우저 분석 120페이지 이하 |
| 파일·표지 총량 | 200MiB / 50개, 휴지통·예약 업로드 포함 |
| 표지 | 1MiB 이하 정적 WebP, 각 변 최대 2048px |
| API 요청 | 인증된 관리자 전체 하루 5,000회, 분당 600회 |
| 동시 업로드 | 1건, 브라우저에서 파일 순차 처리 |

base64로 약 33% 커지는 점을 포함해 200MiB 원문은 약 267MiB가 된다. DB 메타데이터·인덱스 여유를 두었지만 실제 D1 크기도 점검한다. 이 구성은 소규모 관리자 시험용이며 수백 개 PDF를 쌓는 운영 저장소가 아니다. 운영 전에는 파일 저장 어댑터·백업·복원·관리자 인수인계 및 권한 회수 절차를 별도 검증한다.

Workers Free와 D1 Free는 초과 시 요청이 실패할 수 있다. 앱 제한이 외부 서비스의 장애나 계정 전체 한도 초과까지 방지하지는 않는다. 유료 전환·R2 구독·AI·주기 작업을 사용하지 않는다. Access Free 가입은 별도 약관과 결제 정보 확인 절차가 있을 수 있으며 사용자 확인 후 진행한다. 정기 비용이나 유료 플랜으로 자동 변경되도록 설정하지 않는다.

## 배포와 중단

승인된 시험 자원 정보는 Git에서 제외된 `.smp-tools/admin-cloud-target.json`에 둔다. `databaseId`, `accessTeam`, `accessAud`를 지정하고 관리자 이메일은 해당 시험 Worker의 `ADMIN_EMAIL` secret에만 설정한다. 자격증명·초안·PDF를 Git에 넣지 않는다.

`pnpm build:admin:cloud`는 `dist/admin-cloud/`만 만든다. `node scripts/admin-cloud.mjs dry-run`으로 묶음을 확인한다. `pnpm deploy:admin:cloud`는 정확한 시험 Worker 이름·계정·DB ID·원격 DB 이름을 검증하고 운영·기존 미리보기 DB 및 도메인/스케줄/다른 서비스 연결이 있으면 거절한다. 스키마는 새 시험 D1에만 적용한다.

온라인 사용 전 Access에서 **전체 시험 호스트**에 지정한 이메일만 허용하는 정책이 있어야 한다. API 서명 검사만으로 전체 호스트의 접근 제어를 대체하지 않는다. 새 브라우저에서 무인증 차단·정상 로그인·PDF 업로드·새로고침 후 유지·원본 다운로드를 확인한다.

시험 중단은 해당 Access 앱을 차단 상태로 바꾸거나 시험 Worker만 비활성화한다. D1은 별도로 남겨 복구 가능하게 하고, 확인 없이 삭제하지 않는다. 운영 사이트에는 이 시험판으로 바꿀 연결 자체가 없다. 원본은 관리자의 별도 보관본을 유지한다.

## 검증

`pnpm test`, `pnpm typecheck`, `pnpm build:admin:cloud`, `pnpm test:admin:cloud`를 실행한다. 마지막 명령은 실제 workerd와 **로컬 임시 D1**에서 최대 32MiB 업로드·완성 처리·다운로드 바이트 일치·무인증 차단을 검사한다. Cloudflare 자격증명이나 배포 서버를 사용하지 않는다. 선택적으로 로컬 PDF 경로를 인자로 받아 같은 검증을 할 수 있다.

인증, 요청 출처/CSRF, 위조 JWT, 잘못된 파일, PDF EOF 경계, 중복·부분 업로드, 상태 충돌, 휴지통, 예약 용량, 요청 제한을 자동 테스트한다. Cloudflare의 실제 무료 CPU 한도는 배포 후 대표 파일로 추가 확인한다. 로컬 실행 시간은 Cloudflare CPU 시간이나 인터넷 전송 속도의 측정값이 아니다.

공식 근거: [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/), [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/), [D1 제한](https://developers.cloudflare.com/d1/platform/limits/), [Workers Access 보호](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [Zero Trust 가입](https://developers.cloudflare.com/learning-paths/clientless-access/initial-setup/create-zero-trust-org/).
