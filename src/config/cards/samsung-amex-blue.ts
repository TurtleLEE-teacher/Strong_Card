import { BRAND_GROUPS } from '../merchants';
import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 삼성카드 American Express Blue
 *
 * 전월 30만원 이상: 멤버십리워즈 적립 + 스벅/OTT 할인
 * 해외 결제 혜택은 전월실적 조건 없음.
 * https://www.americanexpress.com/ko-kr/network/credit-cards/samsung/blue-card.html
 *
 * 요율 출처: 스벅·OTT 20%, 편의점·배달 7%, 교통·통신 5%, 쇼핑 1.5% 확인.
 */
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
    // 전월 30만원, 항목별 월 5천원 한도는 공식 안내로 확인됨.
    tierConfidence: 'confirmed',
    tiers: [
      { threshold: 0, label: '실적 미달', totalBenefitCap: 0 },
      { threshold: 300_000, label: '30만원', totalBenefitCap: null },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    {
      id: 'ab-starbucks',
      label: '스타벅스·이디야 20% 할인',
      type: 'discount',
      rate: 0.2,
      match: { brands: ['STARBUCKS', 'EDIYA'] }, // 이 두 곳만 대상
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'ab-ott',
      label: 'OTT 정기결제 20% 할인',
      type: 'discount',
      rate: 0.2,
      match: {
        brands: [...BRAND_GROUPS.SUBSCRIPTION],
        categories: ['구독'],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'ab-cvs-delivery',
      label: '편의점·배달앱 7% 적립',
      type: 'point',
      rate: 0.07,
      match: {
        brands: [...BRAND_GROUPS.CONVENIENCE, ...BRAND_GROUPS.DELIVERY],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
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
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'ab-shopping',
      label: '쇼핑 1.5% 적립',
      type: 'point',
      rate: 0.015,
      match: { categories: ['생활', '여가'] },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
      priority: 50,
      confidence: 'confirmed',
    },
  ],
};
