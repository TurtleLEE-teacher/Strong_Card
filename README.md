# Strong Card 💳

노션에 자동 적재되는 카드 결제 내역을 읽어, **카드별 전월실적 진행률**과 **혜택 한도 소진 현황**을
Bar 형태로 보여주는 개인용 PWA. 실적·혜택 알림 포함.

> 레퍼런스: 예전 "더쎈카드" 앱

## 관리 대상 카드

| 카드 | 뒷4자리 | 전월실적 | 실적 바 |
|---|---|---|---|
| KB국민 탄탄대로 Miz&Mr 티타늄 | 6089 | 30/70/100/150만 | ✅ |
| KB국민 쿠팡 와우 | 3211 | 없음 | ❌ |
| 삼성 American Express Blue | 2055 | 30만 | ✅ |
| 현대 ZERO Edition2 (포인트형) | 7316 | 없음 | ❌ |
| 신한 Discount Plan | 6359 | 40/80/120/180만 | ✅ |
| 신한 EV | 4401 | 30/60만 | ✅ |

## 핵심 개념 — 실적과 혜택은 한 달 어긋나 있다

```
6월 실적  ──────────────▶  7월 혜택 한도 (확정, 못 바꿈)
7월 실적  ──────────────▶  8월 혜택 한도 (지금 채우는 중)
```

대시보드는 이 둘을 **항상 분리해서** 보여준다. 섞으면 반드시 헷갈린다.

## 설정

### 1. Notion 통합 토큰 발급

1. https://www.notion.so/profile/integrations 접속
2. **New integration** → 이름 입력 (예: `Strong Card`)
3. Capabilities에서 **Read content**, **Update content**, **Insert content** 체크
4. **Internal Integration Secret** 복사 (`ntn_...`)

### 2. 통합을 DB에 연결

토큰만 발급하면 아무것도 못 읽는다. **DB마다 따로 연결**해야 한다.

1. `💳 Card_Transactions` DB 페이지 열기
2. 우측 상단 `⋯` → **연결(Connections)** → 위에서 만든 통합 선택
3. `🔔 Card_Alert_Log` DB에도 동일하게 반복

노션 DB는 세 개다. **셋 다** 연결해야 한다.

| DB | 용도 |
|---|---|
| `💳 Card_Transactions` | 거래 원본 |
| `🔔 Card_Alert_Log` | 알림 중복 방지 |
| `📲 Card_Push_Subscriptions` | 푸시 구독 기기 |

### 3. VAPID 키 생성 (알림용)

```bash
npx web-push generate-vapid-keys
```

출력된 Public Key / Private Key를 각각 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY`에 넣는다.

### 4. 환경변수

```bash
cp .env.example .env.local
# .env.local 을 열어 채운다
```

데이터 소스 ID는 `.env.example`에 이미 채워져 있다.

### 5. 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 계산 엔진 + 알림 규칙 테스트
```

### 6. 배포 후 — 크론 설정

`Vercel Hobby 플랜의 크론은 하루 1회 제한`이라 15분 간격 동기화가 불가능하다.
그래서 GitHub Actions가 앱의 크론 엔드포인트를 호출한다.

저장소 Secrets에 두 개를 넣는다.

| Secret | 값 |
|---|---|
| `APP_BASE_URL` | 배포된 앱 주소 (예: `https://strong-card.vercel.app`) |
| `CRON_SECRET` | 앱 환경변수의 `CRON_SECRET`과 **같은 값** |

- `*/15 * * * *` → 거래 동기화 + 혜택 적용 알림
- `0 0 * * *` (KST 09:00) → 실적 미달·달성·한도 소진 알림

### 7. 알림 켜기

배포된 앱의 `/settings`에서 **알림 켜기**를 누른다.

> ⚠️ **iOS는 홈 화면에 추가해야 알림이 온다.** Safari 탭에서는 Web Push API 자체가
> 없어서 버튼이 동작하지 않는다. 공유 → '홈 화면에 추가' → 홈 화면 아이콘으로 다시
> 연 다음 알림을 켜야 한다. `/settings`가 이 상황을 감지해 안내해 준다.

## 알림 4종

| 알림 | 시점 | 중복 방지 |
|---|---|---|
| 혜택 적용 | 동기화 시 새 혜택 발견 | 거래 행의 `알림 상태` |
| 실적 미달 | 월말 D-7 / D-3 / D-1 | Alert_Log 멱등 키 |
| 실적 구간 달성 | 구간 돌파 시 | Alert_Log 멱등 키 |
| 한도 소진 임박 | 통합 한도 80% / 100% | Alert_Log 멱등 키 |

크론이 몇 번을 돌아도 같은 알림은 한 번만 나간다.

## 구조

```
src/
  config/
    cards/          카드 마스터 + 혜택 룰 (카드당 1파일)
    merchants.ts    가맹점명 → 브랜드 정규화 사전
    exclusions.ts   실적 제외 규칙
  lib/
    types.ts        도메인 타입
    date.ts         KST 월 경계 (여기가 틀리면 월말 결제가 옆 달로 샌다)
    fx.ts           외화 → 원화 환산
    parse/sms.ts    카드사 승인 문자 파서 (뒷4자리·누적실적)
    notion/         Notion 읽기/역기입
    engine/
      performance.ts  실적 계산 + 구간 판정
      benefits.ts     혜택 매칭 + 3중 한도(건당/월/통합)
      snapshot.ts     카드 × 월 스냅샷 조립
```

## 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Notion API · Web Push (PWA) · Vercel

## 문서

- [배포 가이드](docs/DEPLOY.md)
- [개발 계획](docs/PLAN.md)
