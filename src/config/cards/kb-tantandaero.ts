import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * KB국민 탄탄대로 Miz&Mr 티타늄카드
 *
 * 데일리 서비스 10% / 트렌디 서비스 20% 할인, 월 최대 10만원.
 * https://m.kbcard.com/CXHIACRC0002.cms?allianceCode=09230&mainCC=b
 *
 * ⚠️ 구간별 통합 한도(30/50/70/100)는 공개 자료 기준 추정치다.
 *    실제 이용대금명세서와 대조해 Phase 4에서 확정할 것.
 */
export const KB_TANTANDAERO: Card = {
  id: 'kb-tantandaero',
  notionOption: '탄탄대로 Miz&Mr',
  issuer: '국민',
  name: 'KB국민 탄탄대로 Miz&Mr 티타늄카드',
  shortName: '탄탄대로',
  last4: ['6089'],
  active: true,
  annualFee: 40_000,
  color: '#8B5E3C',
  productPageUrl: 'https://m.kbcard.com/CXHIACRC0002.cms?allianceCode=09230&mainCC=b',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    tiers: [
      { threshold: 0, label: '실적 미달', totalBenefitCap: 0 },
      { threshold: 300_000, label: '30만원', totalBenefitCap: 30_000 },
      { threshold: 700_000, label: '70만원', totalBenefitCap: 50_000 },
      { threshold: 1_000_000, label: '100만원', totalBenefitCap: 70_000 },
      { threshold: 1_500_000, label: '150만원', totalBenefitCap: 100_000 },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // --- 트렌디 서비스 20% ---
    {
      id: 'tt-beauty',
      label: '미용 20%',
      type: 'discount',
      rate: 0.2,
      match: { keywords: ['미용실', '헤어', '네일', '피부관리', '에스테틱', '왁싱'] },
      minAmountPerTx: 10_000,
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 10_000 },
        { threshold: 700_000, cap: 20_000 },
        { threshold: 1_000_000, cap: 30_000 },
        { threshold: 1_500_000, cap: 40_000 },
      ],
      priority: 10,
    },
    {
      id: 'tt-golf',
      label: '골프 20%',
      type: 'discount',
      rate: 0.2,
      match: { keywords: ['골프', 'GOLF', '스크린골프', 'CC', '컨트리클럽'] },
      minAmountPerTx: 10_000,
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 10_000 },
        { threshold: 700_000, cap: 20_000 },
        { threshold: 1_000_000, cap: 30_000 },
        { threshold: 1_500_000, cap: 40_000 },
      ],
      priority: 10,
    },
    {
      id: 'tt-fresh-delivery',
      label: '식품배송 20%',
      type: 'discount',
      rate: 0.2,
      match: { keywords: ['마켓컬리', '컬리', '오아시스마켓', '헬로네이처', '쿠팡프레시'] },
      minAmountPerTx: 10_000,
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 10_000 },
        { threshold: 700_000, cap: 20_000 },
        { threshold: 1_000_000, cap: 30_000 },
        { threshold: 1_500_000, cap: 40_000 },
      ],
      priority: 10,
    },
    {
      id: 'tt-interior',
      label: '인테리어 20%',
      type: 'discount',
      rate: 0.2,
      match: { keywords: ['한샘', '리바트', '이케아', 'IKEA', '오늘의집', '인테리어', '가구'] },
      minAmountPerTx: 10_000,
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 10_000 },
        { threshold: 700_000, cap: 20_000 },
        { threshold: 1_000_000, cap: 30_000 },
        { threshold: 1_500_000, cap: 40_000 },
      ],
      priority: 10,
    },

    // --- 데일리 서비스 10% ---
    {
      id: 'td-coffee',
      label: '커피 10%',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: ['STARBUCKS', 'EDIYA', 'TWOSOME', 'MEGA_COFFEE', 'COMPOSE', 'PAIK_COFFEE'],
        categories: ['카페'],
      },
      minAmountPerTx: 5_000,
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
        { threshold: 700_000, cap: 10_000 },
        { threshold: 1_000_000, cap: 10_000 },
        { threshold: 1_500_000, cap: 10_000 },
      ],
      priority: 20,
    },
    {
      id: 'td-dept',
      label: '백화점 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['SHINSEGAE_DEPT', 'LOTTE_DEPT', 'HYUNDAI_DEPT'] },
      minAmountPerTx: 10_000,
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
        { threshold: 700_000, cap: 10_000 },
        { threshold: 1_000_000, cap: 10_000 },
        { threshold: 1_500_000, cap: 10_000 },
      ],
      priority: 20,
    },
    {
      id: 'td-taxi',
      label: '택시 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['KAKAO_T'], keywords: ['택시'] },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
        { threshold: 700_000, cap: 10_000 },
        { threshold: 1_000_000, cap: 10_000 },
        { threshold: 1_500_000, cap: 10_000 },
      ],
      priority: 20,
    },
    {
      id: 'td-oil',
      label: '주유 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['SK_ENERGY', 'GS_CALTEX', 'HYUNDAI_OILBANK', 'S_OIL'] },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
        { threshold: 700_000, cap: 10_000 },
        { threshold: 1_000_000, cap: 10_000 },
        { threshold: 1_500_000, cap: 10_000 },
      ],
      priority: 20,
    },
    {
      id: 'td-mart',
      label: '마트 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['EMART', 'HOMEPLUS', 'LOTTE_MART'] },
      minAmountPerTx: 10_000,
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
        { threshold: 700_000, cap: 10_000 },
        { threshold: 1_000_000, cap: 10_000 },
        { threshold: 1_500_000, cap: 10_000 },
      ],
      priority: 20,
    },
  ],
};
