# PDF 관리자 인증·서버 저장 시험판

구현 브랜치: `feature/pdf-admin-server-20261024`. 기존 로컬 시험판 `ed5a3fe`에서 분리했다. 운영 `main`·Notion·Drive·Cloudflare에는 연결하지 않으며 배포하지 않는다.

## 실행과 첫 관리자

Node 24.9 이상의 로컬 시험 환경에서 다음을 실행한다. 이 버전의 `node:sqlite`는 실험적 API이며 향후 운영 런타임으로 확정한 것이 아니다.

```sh
pnpm build:admin:server
pnpm start:admin:server
```

`http://127.0.0.1:3013/`를 연다. 관리자 1명이 등록되기 전에는 비공개 서버 폴더 `.smp-admin-data/setup-key.txt`의 일회용 키가 필요하다. 브라우저에 키를 입력하고 별도 관리자 아이디와 10~128자 비밀번호를 직접 정한다. 기존 학회 계정의 비밀번호는 재사용하지 않는다. 등록 후 키는 폐기하고 추가 계정 등록은 거부한다.

로그아웃한 뒤 같은 아이디·비밀번호로 로그인할 수 있다. 세션은 30분 미사용 또는 발급 8시간 후 만료된다. 로그인은 한 서버에서 15분당 10회까지 허용하며 성공·실패를 모두 센다. 동시에 처리하는 비밀번호 검증은 1건이다. 비밀번호는 브라우저 저장소·로그·Git에 기록하지 않는다.

현재 비밀번호 변경·분실 복구·2단계 인증·네이버 로그인은 범위 밖이다. 시험 계정 비밀번호를 안전하게 보관하며, 분실 시 PDF가 든 서버 폴더를 통째로 지우지 않는다. 운영 전에는 인수인계·계정 회수·복구 절차를 구현해야 한다.

## 실제 저장 위치와 동작

- `.smp-admin-data/admin.sqlite`: 관리자 비밀번호 해시, 세션 검증값, 초안, 제한 카운터, 최근 작업 이력 최대 1,000개.
- `.smp-admin-data/files/<서버가 만든 UUID>/original.pdf`: 원본 PDF.
- 같은 폴더의 `cover.webp`: 서버에서 형식을 확인하고 다시 인코딩한 표지.
- 폴더 권한은 0700, 비밀/자료 파일은 0600. 전체 폴더는 Git에서 제외한다.

이전 `3012` 브라우저 시험판의 IndexedDB 자료는 자동 이관하지 않는다. 서버 시험판은 별도 빈 저장소에서 시작한다. PDF를 올리면 브라우저가 후보와 표지를 준비하고, 로그인된 API를 통해 서버에 저장한다. 브라우저 데이터를 지워도 서버 자료는 남으며, 같은 시험 서버에 다시 로그인하면 확인할 수 있다.

원본 PDF와 표지는 정적 파일 폴더 밖에 둔다. 목록·읽기·쓰기·원본 다운로드·표지 조회 모두 서버 세션 검사를 거친다. 다운로드는 첨부파일로 전달하며 임의 PDF의 링크나 스크립트를 서버에서 실행하지 않는다. 미리보기와 시험 승인은 실제 사이트 게시와 연결되지 않는다.

같은 바이트의 PDF는 SHA-256 해시와 DB 고유 제약으로 중복 저장을 막는다. 초안 수정은 버전 충돌을 검사하며 시험 승인을 해제한다. 휴지통 자료도 용량에 포함된다. 영구 삭제는 휴지통에서만 가능하다. 파일과 DB를 한 번에 트랜잭션으로 묶을 수 없으므로, 파일 저장 후 DB 커밋을 공개 여부의 경계로 삼고 실패 시 정리한다. 크래시 후 DB에 참조가 없는 앱 생성 파일 폴더는 다음 시작 때 정리한다.

백업할 때는 서버를 정상 종료하고 `.smp-admin-data` 폴더 전체를 비공개 위치에 복사한다. SQLite의 WAL 파일까지 함께 보존하며 PDF·DB 중 하나만 복사하지 않는다. 백업에는 인증 해시와 미승인 PDF가 있으므로 공개 저장소·GitHub 아티팩트·공유 링크에 넣지 않는다. 복원은 서버 종료 상태에서 전체 폴더로 수행한다.

## 인증과 요청 보호

- 비밀번호: 무작위 salt + scrypt(N=131072, r=8, p=1), 평문 저장 없음. 비밀번호 검증은 비동기이며 동시 1건 제한.
- 세션: 256비트 난수. DB에는 해시만 저장. `HttpOnly; SameSite=Strict; Path=/api` 쿠키, 세션 만료·로그아웃을 서버에서 강제.
- 변경 요청: 정확한 Origin과 CSRF 토큰 검사. Host 검사 및 127.0.0.1 바인딩으로 원격 접속과 DNS rebinding 경로 제한.
- 쿠키의 Secure 속성은 HTTP loopback 시험에서만 생략한다. 외부 배포에는 HTTPS와 Secure 쿠키가 필수다. 현 서버는 외부 origin 설정 자체를 거부한다.
- 본문 크기 제한은 Content-Length 유무와 무관하게 스트림을 읽으며 적용한다. 파일명·필드·버전·표지 형식·실제 PDF 해시·페이지 수를 서버에서 검사한다.
- PDF 구조 검사는 별도 worker thread에서 최대 20초, 한 번에 업로드 1개. 검증 후 세션을 다시 확인하므로 업로드 도중 로그아웃/만료되면 저장하지 않는다.
- CSP, no-store, noindex, nosniff, no-referrer 적용. 초안 본문과 파일명은 React 텍스트로만 표시하며 임의 HTML 삽입 없음.

기준: [OWASP 비밀번호 저장](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [세션 관리](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). 런타임 API는 [Node 24.9 SQLite](https://nodejs.org/download/release/v24.9.0/docs/api/sqlite.html), [crypto](https://nodejs.org/download/release/v24.9.0/docs/api/crypto.html)를 확인했다.

## 무료 운영 범위

이번 시험은 이 Mac의 CPU·디스크만 사용한다. Cloudflare·Notion·Drive·유료 AI 요청을 보내지 않고 새로운 클라우드 자원·구독을 만들지 않는다. 외부 라이브러리도 추가 설치하지 않았다.

| 제한 | 값 |
| --- | --- |
| PDF 한 개 | 32 MiB / 120페이지 |
| 한 번에 선택 | 최대 5개, 브라우저 순차 처리 |
| 서버 전체 자료 | PDF+표지 200 MiB / 50개, 휴지통 포함 |
| 표지 | 1 MiB 이하 WebP / 최대 약 200만 픽셀 |
| 후보 분석 | 브라우저에서 첫 3페이지, 30초 제한 |
| 서버 PDF 검사 | 20초, 동시 1건 |
| 변경 요청 | 서버 전체 분당 120회 |

**이 Node/SQLite/디스크 시험 서버를 그대로 Workers Free에 배포할 수 있다는 의미는 아니다.** 로컬 파일 시스템, SQLite 및 scrypt는 현재 로컬 검증용 구현이다. 운영 연결 전에는 계정 인증을 외부 인증 제공자로 이전하거나 별도 비용을 평가하고, 초안은 분리된 D1, 파일은 비공개 Drive 어댑터로 교체한다. PDF 구조 검사도 Workers의 CPU 한도에서 그대로 수행하면 안 된다. 해당 연결·권한·실사용량 검증은 배포 승인 이후 별도 단계다.

## 코드 경계와 검증

- `admin-server/auth.ts`: 설정·로그인·세션·요청 인증.
- `store.ts`: SQLite 및 비공개 파일 저장, 용량·중복·버전 검사.
- `validation.ts`, `uploads.ts`, `pdf-check.mjs`: 입력과 실제 파일 검증.
- `app.ts`, `http.ts`: HTTP API·보호된 파일 전달·loopback 서버.
- `admin-lab/server-storage.ts`, `auth.tsx`: 인증 UI와 서버 저장 어댑터.
- 기존 IndexedDB 어댑터는 `admin-lab/local-storage.ts`로 유지한다.
- `scripts/admin-server.mjs`: 별도 빌드/시작만 제공. 운영 배포 명령 없음.

`pnpm typecheck`, `pnpm test`, `pnpm build:admin:server`로 확인한다. 서버 테스트는 매번 별도 임시 폴더와 무작위 자격증명을 사용한다. 무로그인 접근, 설정 키 재사용, 잘못된 로그인, CSRF/Origin/Host, 세션 폐기·만료, 서버 재시작, 실제 파일 바이트, 중복, 버전 충돌, 승인 해제, 휴지통·복원·영구 삭제, 파일 위장·손상·용량 제한을 검증한다. 브라우저 UI 결과는 저장소 밖의 작업 증거 폴더에 보관한다.

최종 검증: 타입 검사, 282개 테스트, 서버 시험 빌드가 통과했다. 임시 계정의 실제 브라우저 로그인·합성 PDF 2개·실제 PDF 3개 업로드와 표지, 승인 후 수정, 실제 HTTP 서버 재시작, 로그아웃·재로그인, 원본 다운로드를 확인했다. 다운로드한 인바디 원문과 서버에 저장된 세 원문은 소스 파일과 SHA-256이 일치했다. 390px 모바일 화면은 가로 넘침이 없었다.
