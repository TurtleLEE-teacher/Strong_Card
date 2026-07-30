/**
 * 데모 거래 데이터.
 *
 * NOTION_API_KEY가 없을 때만 쓴다. 토큰 설정 전에도 화면이 어떻게 생겼는지
 * 확인할 수 있어야 하고, 계산 엔진이 실제로 도는지도 눈으로 봐야 한다.
 * 6월(지난달 실적)과 7월(이번 달) 두 달치가 들어 있다.
 */

import type { CardId, Transaction, TxCategory } from '@/lib/types';

let n = 0;

function make(
  cardId: CardId,
  title: string,
  krwAmount: number,
  day: string,
  category: TxCategory | null = null,
): Transaction {
  n += 1;
  return {
    id: `demo-${n}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    // 'MM-DD' → KST 정오 기준 UTC
    approvedAt: new Date(`2026-${day}T03:00:00Z`).toISOString(),
    issuer: null,
    last4: null,
    cardId,
    category,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
  };
}

export const DEMO_TRANSACTIONS: Transaction[] = [
  // ── 6월: 지난달 실적 (이번 달 혜택 구간을 결정) ──────────────────────
  make('kb-tantandaero', '이마트 성수점', 420_000, '06-08', '생활'),
  make('kb-tantandaero', '신세계백화점', 310_000, '06-14'),
  make('kb-tantandaero', '스타벅스 강남점', 48_000, '06-20', '카페'),
  make('samsung-amex-blue', 'GS25 역삼점', 180_000, '06-05'),
  make('samsung-amex-blue', '배달의민족', 150_000, '06-18'),
  make('shinhan-discount-plan', 'SK텔레콤', 89_000, '06-10'),
  make('shinhan-discount-plan', '이마트24', 620_000, '06-22', '생활'),
  make('shinhan-discount-plan', '스타벅스', 130_000, '06-26', '카페'),
  make('shinhan-ev', '환경부전기차충전', 210_000, '06-11'),
  make('shinhan-ev', '이마트', 260_000, '06-19', '생활'),

  // ── 7월: 이번 달 (다음 달 구간을 채우는 중) ─────────────────────────
  make('kb-tantandaero', '이마트 성수점', 180_000, '07-03', '생활'),
  make('kb-tantandaero', '스타벅스 강남점', 32_000, '07-05', '카페'),
  make('kb-tantandaero', '헤어살롱 청담', 120_000, '07-09'),
  make('kb-tantandaero', '롯데백화점', 240_000, '07-16'),
  make('kb-tantandaero', '스타벅스 역삼점', 28_000, '07-22', '카페'),
  make('kb-tantandaero', 'GS칼텍스 주유소', 90_000, '07-25'),
  make('kb-tantandaero', '서울시청 지방세', 340_000, '07-26'), // 실적 제외

  make('kb-coupang-wow', '쿠팡', 380_000, '07-04'),
  make('kb-coupang-wow', '쿠팡이츠', 62_000, '07-12', '식비'),
  make('kb-coupang-wow', '올리브영', 45_000, '07-19', '생활'),

  make('samsung-amex-blue', 'CU 편의점', 68_000, '07-06'),
  make('samsung-amex-blue', 'NETFLIX', 17_000, '07-08', '구독'),
  make('samsung-amex-blue', '스타벅스', 41_000, '07-14', '카페'),
  make('samsung-amex-blue', '배달의민족', 96_000, '07-21', '식비'),

  make('hyundai-zero-ed2', '홈플러스', 210_000, '07-07', '생활'),
  make('hyundai-zero-ed2', '무신사', 158_000, '07-15'),
  make('hyundai-zero-ed2', 'SK에너지', 78_000, '07-23'),

  make('shinhan-discount-plan', '이디야커피', 36_000, '07-02', '카페'),
  make('shinhan-discount-plan', 'KT', 92_000, '07-10'),
  make('shinhan-discount-plan', 'GS25', 74_000, '07-17'),
  make('shinhan-discount-plan', '한식당 미가', 185_000, '07-24', '식비'),

  make('shinhan-ev', '환경부전기차충전', 88_000, '07-05'),
  make('shinhan-ev', '차지비 충전소', 64_000, '07-13'),
  make('shinhan-ev', '한국도로공사 하이패스', 42_000, '07-18'), // 실적 제외, 캐시백은 받음
  make('shinhan-ev', '이마트', 190_000, '07-20', '생활'),
];
