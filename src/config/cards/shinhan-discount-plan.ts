import { BRAND_GROUPS } from '../merchants';
import type { Card, TierCap } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 신한카드 Discount Plan (2025-04-17 출시)
 *
 * 카드 앱 화면 기준 혜택 구성:
 *   외식·배달·편의점    10% 할인
 *   쇼핑·주유·생활      5~10% 할인
 *   공과금·디지털구독   10~20% 할인
 *
 * 서비스는 세 갈래로 나뉜다.
 *   Time Plan    승인 시각대별 — DAY(카페·음식점) 07~15시 /
 *                              NIGHT(편의점·배달앱) 18~22시
 *   Daily Plan   마트·온라인쇼핑·아울렛·잡화 10%
 *   Monthly Plan 공과금 10% / 디지털구독·멤버십 20% (정기결제)
 *
 * 이 카드의 두 가지 특이점:
 *
 * 1) **승인 시각대**로 할인 영역이 갈린다. 시각을 안 보면 점심에 산
 *    편의점 물건과 밤에 산 것이 뒤섞인다.
 *
 * 2) **공과금이 할인 대상**이다. 공과금은 보통 실적·혜택에서 모두
 *    빠지는데 이 카드는 할인을 준다. 실적에는 여전히 안 잡히므로
 *    applyToExcludedSpend로 예외 처리한다.
 *
 * 출처: 카드 앱 상품 화면(사용자 제공), 신한카드 공식 안내, 뱅크샐러드
 * https://www.shinhancard.com/pconts/html/card/apply/credit/1232369_2207.html
 */

/**
 * 구간별 통합 할인한도.
 *
 * ⚠️ **구간 경계(40/80/120/150/180만)는 확인됐지만 각 구간의 한도 금액은
 *    추정치다.** 공개 자료에서 확인된 건 "CGV·롯데시네마 전월 40만원 이상
 *    최대 5천원"뿐이다. 이용대금명세서로 확정해야 한다.
 *    설정 화면에 '확인 필요'로 노출된다.
 */
const TIER_CAPS: TierCap[] = [
  { threshold: 0, cap: 0 },
  { threshold: 400_000, cap: 10_000 },
  { threshold: 800_000, cap: 20_000 },
  { threshold: 1_200_000, cap: 30_000 },
  { threshold: 1_500_000, cap: 40_000 },
  { threshold: 1_800_000, cap: 50_000 },
];

export const SHINHAN_DISCOUNT_PLAN: Card = {
  id: 'shinhan-discount-plan',
  notionOption: 'Discount Plan',
  issuer: '신한',
  name: '신한카드 Discount Plan',
  shortName: 'Discount Plan',
  last4: ['6359'],
  active: true,
  annualFee: 15_000, // 국내전용·Mastercard 모두 1만5천원 (카드 앱 확인)
  slot: 5,
  productPageUrl:
    'https://www.shinhancard.com/pconts/html/card/apply/credit/1232369_2207.html',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full', // 전월(1일~말일) 일시불 + 할부 기준
    // 구간 경계는 확인됐으나 한도 금액은 추정.
    tierConfidence: 'estimated',
    tiers: [
      { threshold: 0, label: '실적 미달', totalBenefitCap: 0 },
      { threshold: 400_000, label: '40만원', totalBenefitCap: 10_000 },
      { threshold: 800_000, label: '80만원', totalBenefitCap: 20_000 },
      { threshold: 1_200_000, label: '120만원', totalBenefitCap: 30_000 },
      { threshold: 1_500_000, label: '150만원', totalBenefitCap: 40_000 },
      { threshold: 1_800_000, label: '180만원', totalBenefitCap: 50_000 },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // ── Monthly Plan: 공과금·디지털구독 ────────────────────────────────
    {
      id: 'dp-subscription',
      label: '디지털구독·멤버십 20% 할인',
      type: 'discount',
      rate: 0.2,
      match: { brands: [...BRAND_GROUPS.SUBSCRIPTION], categories: ['구독'] },
      // 할인 전 이용금액 1만원까지가 대상 → 건당 최대 2,000원
      capPerTx: 2_000,
      capPerMonth: TIER_CAPS,
      priority: 10,
      confidence: 'confirmed',
      notes: '공식 홈페이지 정기결제(자동납부)만 대상. 일/월 횟수 제한 없음',
    },
    {
      id: 'dp-utility',
      label: '공과금 10% 할인',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: [...BRAND_GROUPS.UTILITY],
        keywords: ['전기요금', '도시가스', '상하수도', '수도요금', '관리비', '공과금'],
      },
      // 할인 전 이용금액 5만원까지가 대상 → 건당 최대 5,000원
      capPerTx: 5_000,
      capPerMonth: TIER_CAPS,
      priority: 10,
      // 공과금은 실적에서는 빠지지만 이 카드에서는 할인 대상이다.
      applyToExcludedSpend: true,
      confidence: 'confirmed',
    },

    // ── Time Plan: 시각대별 10% ────────────────────────────────────────
    {
      id: 'dp-day-dining',
      label: '카페·음식점 10% 할인 (07~15시)',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: [...BRAND_GROUPS.CAFE, ...BRAND_GROUPS.DINING],
        categories: ['카페', '식비'],
      },
      timeWindow: { startHour: 7, endHour: 15, label: '07~15시' },
      capPerMonth: TIER_CAPS,
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'dp-night-convenience',
      label: '편의점·배달앱 10% 할인 (18~22시)',
      type: 'discount',
      rate: 0.1,
      match: { brands: [...BRAND_GROUPS.CONVENIENCE, ...BRAND_GROUPS.DELIVERY] },
      timeWindow: { startHour: 18, endHour: 22, label: '18~22시' },
      capPerMonth: TIER_CAPS,
      priority: 20,
      confidence: 'confirmed',
    },

    // ── Daily Plan: 쇼핑·생활 ──────────────────────────────────────────
    {
      id: 'dp-shopping',
      label: '마트·온라인쇼핑·아울렛 10% 할인',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: [
          ...BRAND_GROUPS.MART,
          ...BRAND_GROUPS.ONLINE_SHOPPING,
          ...BRAND_GROUPS.LIVING,
          'STARFIELD',
        ],
        categories: ['생활'],
      },
      capPerMonth: TIER_CAPS,
      priority: 30,
      confidence: 'confirmed',
    },
    {
      id: 'dp-cinema',
      label: '영화 할인 (CGV·롯데시네마)',
      type: 'discount',
      rate: 0.2,
      match: { brands: ['CGV', 'LOTTE_CINEMA'] },
      // 전월 40만원 이상에서 최대 5천원
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 400_000, cap: 5_000 },
      ],
      priority: 25,
      confidence: 'confirmed',
      notes: '요율은 미확인 — 최대 5천원 한도만 확인됨',
    },
    {
      id: 'dp-fuel',
      label: '주유 5% 할인',
      type: 'discount',
      rate: 0.05,
      match: { brands: [...BRAND_GROUPS.FUEL] },
      capPerMonth: TIER_CAPS,
      priority: 40,
      confidence: 'estimated',
    },
  ],
};
