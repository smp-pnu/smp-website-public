# 검색 노출 관리

대표 주소는 `https://pnusmp.com`이며 사이트맵은 `https://pnusmp.com/sitemap.xml`이다. Google·네이버 등록 계정은 다음 운영자에게 인수인계할 학회 계정을 사용한다.

## 적용 구조

소개·커리큘럼 등 고정 페이지는 배포할 때 HTML을 미리 만든다. 리포트·공지 목록과 상세는 일반 방문자와 검색 로봇에게 같은 HTML을 제공한다. JavaScript 실행 전에도 제목, 요약, 작성자, 날짜, 준비된 Notion 본문과 링크를 읽을 수 있다. PDF 전체 문장을 HTML로 변환하는 기능은 포함하지 않는다. JavaScript 실행 후에는 기존 검색·필터·PDF 뷰어 화면이 동작한다.

각 페이지에 제목·설명·대표 주소(canonical)·공유 이미지와 Organization, WebSite, BreadcrumbList, Report/Article 구조화 데이터를 넣는다. 없는 정보나 평점은 만들어 넣지 않는다. 검색·필터 조합은 noindex로 처리하고, 일반 목록의 페이지 번호는 별도 대표 주소로 유지한다. 존재하지 않는 주소는 실제 HTTP 404를 반환한다.

`robots.txt`는 공개 페이지의 일반 크롤링을 허용하고 API와 내부 검색 경로는 제외한다. 검색용 봇 차단을 추가하지 않았으며, 학습용 봇 허용/차단은 별도의 운영 정책이다. 시험 배포는 robots와 응답 헤더로 검색 제외한다. robots는 접근 제어 수단이 아니다.

## 공개 여부와 무료 운영

고정 페이지는 정적 파일로 제공하므로 Worker와 Notion을 호출하지 않는다. 명단은 개인정보의 오래된 복사본이 남지 않도록 정적 HTML에 저장하지 않는다. 공개 목록과 사이트맵은 기존 동기화 문서를 사용하고, 동기화 확인이 오래되면 재시도 가능한 오류로 닫는다. 상세는 현재 Notion 공개 여부를 다시 확인하며, 본문 버전이 다르면 과거 본문을 내보내지 않는다. 브라우저는 HTML에 포함된 데이터를 처음 한 번 재사용해 동일 상세 API 중복 호출을 줄인다. 기존 요청 제한은 그대로 적용된다.

검색 로봇 방문도 동적 페이지 사용량에 포함된다. 검색 노출을 위해 요청 제한이나 보안 방화벽을 해제하지 않는다. 실제 봇 접근 차단이 확인되면 공급자의 검증된 봇/IP 기준을 사용해 필요한 범위만 검토한다. 검색엔진에 이미 수집된 정보는 사이트에서 비공개로 바꿔도 즉시 삭제되지 않으며, 급한 경우 각 검색엔진의 삭제 요청 기능을 이용한다.

## 최초 등록

1. Google Search Console에 학회 Google 계정으로 로그인한다. 도메인 속성 `pnusmp.com`의 DNS 인증 또는 URL 접두어 속성 `https://pnusmp.com/`의 파일/태그 인증을 완료한다. 화면에서 실제 발급한 인증 값만 사용하고 인증 파일·레코드는 유지한다.
2. Google의 Sitemaps에 `https://pnusmp.com/sitemap.xml`을 제출하고 홈페이지 및 대표 리포트를 URL 검사한다.
3. 네이버 서치어드바이저 웹마스터 도구에 `https://pnusmp.com`을 추가한다. 학회 네이버 계정에 발급된 HTML 파일/태그로 소유 확인하고, 요청 → 사이트맵 제출에 같은 사이트맵을 제출한다.
4. 공개 리포트를 작성할 때 기업명·종목코드·실제 제목·요약·발표일을 정확하게 작성한다. 공지는 핵심 안내를 이미지 안에만 넣지 말고 본문에도 적는다. 사이트맵은 공개 목록에서 자동 생성되므로 새 게시글마다 재등록하지 않는다.

등록은 수집과 상태 확인을 돕는 절차이며 색인·순위·AI 답변 인용을 보장하지 않는다. AI 노출만을 위한 별도 유료 서비스나 특수 스키마는 필요하지 않다.

## 공식 근거 (2026-10-11 확인)

- [Google AI 검색 기능과 웹사이트](https://developers.google.com/search/docs/appearance/ai-features): 기존 SEO, 텍스트 본문, 내부 링크와 접근 가능성이 기본이며 별도 AI 파일이나 특수 스키마는 요구하지 않는다.
- [네이버 JavaScript 검색 최적화](https://searchadvisor.naver.com/guide/seo-advanced-javascript): 검색 로봇이 주요 콘텐츠를 확인할 수 있도록 구성한다.
- [OpenAI 크롤러](https://developers.openai.com/api/docs/bots): 검색용 OAI-SearchBot과 학습용 GPTBot은 별도 용도다.
- [Perplexity 크롤러](https://docs.perplexity.ai/docs/resources/perplexity-crawlers): 검색용 봇 접근을 허용할 때 공식 IP와 봇 식별 정보를 함께 검증한다.

검증: 단위 테스트의 HTML/JSON 이스케이프, 현재 공개 여부·본문 버전·사이트맵 신선도 검사와 로컬 Cloudflare HTTP/브라우저 확인을 사용한다. 변경 시 `pnpm test`, `pnpm typecheck`, `pnpm build:free:fixture`를 실행한다.
