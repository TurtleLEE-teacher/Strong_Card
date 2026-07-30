import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 삼성카드 American Express Blue
 *
 * 전월 30만원 이상: 멤버십리워즈 적립 + 스벅/OTT 할인
 * 해외 결제 혜택은 전월실적 조건 없음.
 * https://www.americanexpress.com/ko-kr/network/credit-cards/samsung/blue-card.html
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
  color: '#2E6DB4',
  productPageUrl:
    'https://www.americanexpress.com/ko-kr/network/credit-cards/samsung/blue-card.html',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
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
      match: { brands: ['STARBUCKS', 'EDIYA'] },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
      priority: 10,
    },
    {
      id: 'ab-ott',
      label: 'OTT 정기결제 20% 할인',
      type: 'discount',
      rate: 0.2,
      match: {
        brands: ['NETFLIX', 'DISNEY_PLUS', 'WATCHA', 'TVING', 'WAVVE', 'YOUTUBE_PREMIUM', 'SPOTIFY'],
        categories: ['구독'],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
      priority: 10,
    },
    {
      id: 'ab-cvs-delivery',
      label: '편의점·배달앱 7% 적립',
      type: 'point',
      rate: 0.07,
      match: {
        brands: ['CU', 'GS25', 'SEVEN_ELEVEN', 'EMART24', 'BAEMIN', 'COUPANG_EATS', 'YOGIYO'],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
      priority: 20,
    },
    {
      id: 'ab-transit-telecom',
      label: '교통·통신 5% 적립',
      type: 'point',
      rate: 0.05,
      match: {
        brands: ['KORAIL', 'TMONEY', 'KAKAO_T', 'SKT', 'KT', 'LGU'],
        categories: ['교통'],
      },
      capPerMonth: [
        { threshold: 0, cap: 0 },
        { threshold: 300_000, cap: 5_000 },
      ],
      priority: 20,
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
    },
  ],
};
