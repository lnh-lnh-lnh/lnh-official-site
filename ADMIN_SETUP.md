# LNH 신청자 관리 시스템 설정

이 문서는 `apply.html` 신청 폼, Brief 후속 설문, `/admin/` 신청자 관리 화면을 Cloudflare Pages에서 활성화하기 위한 운영 체크리스트입니다.

## 현재 구현 범위

- Brief, Curation, Care, Partnership 사전 신청 접수
- 신청자 검색, 서비스·상태 필터, 관리 메모, CSV 내보내기, 삭제
- Brief 신청자용 14일 유효 후속 설문 링크 생성
- 페이지뷰, 체류시간, CTA, 폼 시작·제출을 익명 세션 단위로 집계
- 신청자 개인정보와 익명 이용 분석 데이터의 테이블 분리
- 새 신청 접수 시 `info@lnh-universe.com`으로 최소 정보 알림

새 신청 알림에는 접수번호, 서비스, 접수시각과 관리자 링크만 포함합니다. 신청자 이름, 연락처, 고민 내용은 이메일로 보내지 않습니다. Brief 상세 설문 링크는 현재 관리자가 생성해 직접 전달합니다.

## 1. D1 데이터베이스

Cloudflare에서 `lnh-applications`라는 D1 데이터베이스를 만들고 Pages 프로젝트의 Production과 Preview 환경에 바인딩합니다.

- Variable name: `DB`
- Database: `lnh-applications`

CLI를 사용한다면 다음 순서입니다.

```sh
npx wrangler d1 create lnh-applications
npx wrangler d1 migrations apply lnh-applications --remote
```

생성 명령이 출력한 `database_id`는 Cloudflare 대시보드의 Pages 바인딩에 사용합니다. 저장소의 `wrangler.toml`에는 실제 ID가 확정된 뒤 D1 바인딩을 추가합니다.

## 2. 환경 변수

Cloudflare Pages > Settings > Variables and Secrets에 다음 값을 설정합니다.

- `PUBLIC_SITE_URL`: `https://www.lnh-universe.com`
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile을 활성화할 때만 설정

관리자 로그인에는 아래 **Secret** 두 개가 필요합니다. 원문 비밀번호를 넣지 않고, 브라우저에서 생성한 PBKDF2 해시만 저장합니다.

- `ADMIN_PASSWORD_SALT`: 비밀번호별 무작위 문자열
- `ADMIN_PASSWORD_HASH`: PBKDF2-SHA-256, 210,000회 처리 결과

`tools/admin-password-setup.html`을 브라우저에서 열어 두 값을 생성한 뒤, Cloudflare Pages > Settings > Variables and Secrets > Production의 Secret으로 직접 입력합니다. 이 도구는 비밀번호를 서버로 전송하지 않습니다.

`TURNSTILE_SECRET_KEY`를 설정하기 전에 `apply.html`에 실제 Turnstile 사이트 키와 위젯을 연결해야 합니다. 둘 중 하나만 설정하면 신청 제출이 실패합니다.

## 3. 관리자 비밀번호 접근

`/admin/`과 `/api/admin/*`은 자체 비밀번호 세션으로 보호됩니다. 비밀번호는 8시간 뒤 자동 로그아웃되고, 같은 네트워크에서 15분 안에 5회 틀리면 15분 동안 잠깁니다. 로그인 성공·실패와 신청자 조회·수정·삭제 등의 관리 동작은 D1에 기록됩니다.

Cloudflare Access 이메일 인증은 담당자가 늘어날 때 선택적으로 함께 사용할 수 있습니다. 초기 운영에는 카드 등록이 필요하지 않습니다.

관리자 비밀번호 원문을 채팅·메일·저장소에 넣지 않습니다.

## 4. 신청 알림 이메일

Cloudflare Email Service에 `lnh-universe.com` 발신 도메인을 등록하고 `info@lnh-universe.com`을 확인합니다. 이후 알림 Worker를 먼저 배포합니다.

```sh
npx wrangler deploy --config wrangler.mailer.toml
```

Pages 프로젝트에 Service binding을 추가합니다.

- Variable name: `MAILER`
- Service: `lnh-application-mailer`

Cloudflare Email Service의 발신 도메인이 확인되지 않으면 이메일 알림만 실패하며 신청 데이터는 D1에 정상 저장됩니다.

## 5. 개인정보 문서 확정

`public/privacy.html`은 시스템 구조에 맞춘 초안입니다. 공개 운영 전에 아래 항목을 실제 정보로 확정해야 합니다.

- Cloudflare 등 처리위탁 업체와 처리 업무
- 국외 이전 국가, 시점·방법, 보유기간
- 실제 파기 절차

현재 반영 정보:

- 개인정보처리자: LNH 이승일
- 문의: `info@lnh-universe.com` / `010-3656-2269`
- 기본 보유기간: 문의 처리 종료일로부터 1년

법률 검토가 끝나기 전에는 개인정보 신청 폼을 운영 배포하지 않습니다.

## 6. 스팸·보안·보존

- Cloudflare Turnstile 사이트 키를 발급하고 신청 폼에 연결
- D1 백업과 관리자 접근 로그 확인
- 보유기간이 지난 신청자를 정기 삭제하는 작업 추가
- 관리자 비밀번호를 공유하지 않고, 담당자가 늘면 개인별 이메일 계정과 다중 인증으로 전환
- 신청자 정보가 GitHub, 브라우저 분석 도구, 로그 메시지에 포함되지 않는지 점검

## 7. 배포 전 확인

1. 신청 제출 후 접수번호가 표시되는지 확인
2. `/admin/`이 비밀번호 없는 사용자에게는 로그인 화면만 보이는지 확인
3. 상태와 메모 저장, CSV, 삭제가 동작하는지 확인
4. Brief 설문 링크가 14일 뒤 만료되는지 확인
5. 설문 제출 후 상태가 `설문 완료`로 바뀌는지 확인
6. 분석 화면에서 페이지뷰와 신청 제출 수가 집계되는지 확인
7. 개인정보 처리방침의 초안 문구를 제거하고 실제 운영 정보로 교체
