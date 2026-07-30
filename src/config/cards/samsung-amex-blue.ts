import { BRAND_GROUPS } from '../merchants';
import type { Card, TierCap } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 삼성카드 American Express Blue
 *
 * 2024년 8월에 혜택이 상향됐다. 그 전 기준으로 적어두면 한도를 3~6배
 * 낮게 잡게 되므로 반드시 상향 후 값을 써야 한다.
 *
 *   편의점·배달앱  7% 적립    월 15,000P
 *   교통·통신     5% 적립    월 15,000P
 *   쇼핑         1.5% 적립  월 30,000P
 *   해외         5% 적립    월 30,000P  ← 전월실적 조건 없음
 *   스타벅스·이디야 20% 할인   월 5,000원
 *   OTT 정기결제   20% 할인   월 5,000원
 *
 * 해외 결제만 전월실적과 무관하다. 그래서 이 카드는 구간별 **통합** 한도를
 * 두지 않고(totalBenefitCap = null) 항목별 한도로만 제어한다. 통합 한도를
 * 두면 실적 미달일 때 해외 적립까지 0원이 되어버린다.
 *
 * 출처: 아메리칸 익스프레스 코리아, 삼성카드 2024-08 혜택 개선 보도
 * https://www.americanexpress.com/ko-kr/network/credit-cards/samsung/blue-card.html
 */

/** 전월 30만원 미만이면 0. 해외 적립을 제외한 모든 혜택에 적용된다. */
function tierCap(cap: number): TierCap[] {
  return [
    { threshold: 0, cap: 0 },
    { threshold: 300_000, cap },
  ];
}

export const SAMSUNG_AMEX_BLUE: Card = {
  id: 'samsung-amex-blue',
  notionOption: 'Amex Blue',
  issuer: '삼성',
  name: '삼성카드 American Express Blue',
  shortName: 'Amex Blue',
  last4: ['2055'],
  active: true,
  annualFee: 20_000,
  slot: 3,
  productPageUrl:
    'https://www.americanexpress.com/ko-kr/network/credit-cards/samsung/blue-card.html',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tierConfidence: 'confirmed',
    tiers: [
      // 통합 한도를 두지 않는다 — 해외 적립은 실적과 무관하기 때문이다.
      { threshold: 0, label: '실적 미달', totalBenefitCap: null },
      { threshold: 300_000, label: '30만원', totalBenefitCap: null },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    {
      id: 'ab-overseas',
      // 이 카드의 진짜 강점. 2024-08에 1.5% → 5%로 올랐다.
      // 숫자 한도라 구간과 무관하게 항상 살아 있다.
      label: '해외 결제 5% 적립',
      type: 'point',
      rate: 0.05,
      match: { paymentKinds: ['해외'] },
      capPerMonth: 30_000,
      priority: 5,
      confidence: 'confirmed',
      notes: '전월실적 조건 없음',
    },
    {
      id: 'ab-starbucks',
      label: '스타벅스·이디야 20% 할인',
      type: 'discount',
      rate: 0.2,
      match: { brands: ['STARBUCKS', 'EDIYA'] }, // 이 두 곳만 대상
      capPerMonth: tierCap(5_000),
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'ab-ott',
      label: 'OTT 정기결제 20% 할인',
      type: 'discount',
      rate: 0.2,
      match: { brands: [...BRAND_GROUPS.SUBSCRIPTION], categories: ['구독'] },
      capPerMonth: tierCap(5_000),
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'ab-cvs-delivery',
      label: '편의점·배달앱 7% 적립',
      type: 'point',
      rate: 0.07,
      match: { brands: [...BRAND_GROUPS.CONVENIENCE, ...BRAND_GROUPS.DELIVERY] },
      capPerMonth: tierCap(15_000),
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'ab-transit-telecom',
      label: '교통·통신 5% 적립',
      type: 'point',
      rate: 0.05,
      match: {
        brands: [...BRAND_GROUPS.TRANSIT, ...BRAND_GROUPS.TELECOM],
        categories: ['교통'],
      },
      capPerMonth: tierCap(15_000),
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'ab-shopping',
      label: '쇼핑 1.5% 적립',
      type: 'point',
      rate: 0.015,
      match: {
        brands: [...BRAND_GROUPS.ONLINE_SHOPPING, ...BRAND_GROUPS.MART, ...BRAND_GROUPS.LIVING],
        categories: ['생활', '여가'],
      },
      capPerMonth: tierCap(30_000),
      priority: 50,
      confidence: 'confirmed',
    },
  ],
};
