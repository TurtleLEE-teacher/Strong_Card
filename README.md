# Strong Card 💳

노션에 자동 적재되는 카드 결제 내역을 읽어, **카드별 전월실적 진행률**과 **혜택 한도 소진 현황**을
Bar 형태로 보여주는 개인용 PWA. 실적/혜택 알림 포함.

> 레퍼런스: 예전 "더쎈카드" 앱

## 관리 대상 카드

| 카드 | 실적 조건 |
|---|---|
| KB국민 탄탄대로 Miz&Mr 티타늄 | 구간별 |
| 삼성 American Express Blue | 30만원 |
| 신한카드 Discount Plan | 40/80/120/180만 |
| 신한카드 EV | 30/60만 |
| KB국민 쿠팡 와우 | 없음 |
| 현대카드 ZERO Edition2 (포인트형) | 없음 |

## 상태

🚧 **계획 수립 단계** — [docs/PLAN.md](docs/PLAN.md) 참조

## 스택

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Notion API · Web Push (PWA) · Vercel
