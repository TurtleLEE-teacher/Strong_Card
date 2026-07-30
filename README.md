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

### 3. 환경변수

```bash
cp .env.example .env.local
# .env.local 을 열어 NOTION_API_KEY 등을 채운다
```

데이터 소스 ID는 `.env.example`에 이미 채워져 있다.

### 4. 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 계산 엔진 테스트
```

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

- [개발 계획](docs/PLAN.md)
