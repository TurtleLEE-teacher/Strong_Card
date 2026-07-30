import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 신한카드 Discount Plan
 *
 * 전월실적 4구간(40/80/120/180만) → 월 통합 할인한도 최대 10만원.
 * https://www.shinhancard.com/pconts/html/card/apply/credit/1232369_2207.html
 *
 * ⚠️ 이 카드는 **선택형 할인 영역**이 있을 수 있다.
 *    사용자가 어떤 영역을 골랐는지 확인되면 benefits를 교체할 것.
 *    지금은 대표 영역으로 잠정 구성했다.
 *
 * ⚠️ 120만/150만 구간의 7만·7.3만은 검색으로 확인됐으나
 *    40만/80만 구간 한도는 추정치다. 명세서로 확정 필요.
 */
export const SHINHAN_DISCOUNT_PLAN: Card = {
  id: 'shinhan-discount-plan',
  notionOption: 'Discount Plan',
  issuer: '신한',
  name: '신한카드 Discount Plan',
  shortName: 'Discount Plan',
  last4: ['6359'],
  active: true,
  annualFee: 20_000,
  slot: 5,
  productPageUrl:
    'https://www.shinhancard.com/pconts/html/card/apply/credit/1232369_2207.html',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tiers: [
      { threshold: 0, label: '실적 미달', totalBenefitCap: 0 },
      { threshold: 400_000, label: '40만원', totalBenefitCap: 30_000 },
      { threshold: 800_000, label: '80만원', totalBenefitCap: 50_000 },
      { threshold: 1_200_000, label: '120만원', totalBenefitCap: 70_000 },
      { threshold: 1_800_000, label: '180만원', totalBenefitCap: 100_000 },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    {
      id: 'dp-cafe',
      label: '커피 10% 할인',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: ['STARBUCKS', 'EDIYA', 'TWOSOME', 'MEGA_COFFEE', 'COMPOSE', 'PAIK_COFFEE'],
        categories: ['카페'],
      },
      priority: 20,
    },
    {
      id: 'dp-food',
      label: '음식점 10% 할인',
      type: 'discount',
      rate: 0.1,
      match: { categories: ['식비'] },
      minAmountPerTx: 10_000,
      priority: 30,
    },
    {
      id: 'dp-cvs',
      label: '편의점 10% 할인',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['CU', 'GS25', 'SEVEN_ELEVEN', 'EMART24'] },
      priority: 20,
    },
    {
      id: 'dp-transit',
      label: '교통 10% 할인',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['TMONEY', 'KAKAO_T', 'KORAIL'], categories: ['교통'] },
      priority: 20,
    },
    {
      id: 'dp-telecom',
      label: '통신요금 10% 할인',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['SKT', 'KT', 'LGU'] },
      priority: 20,
    },
  ],
};
