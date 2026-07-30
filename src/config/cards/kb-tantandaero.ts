import { BRAND_GROUPS } from '../merchants';
import type { Card } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * KB국민 탄탄대로 Miz&Mr 티타늄카드
 *
 * 전월 40만원 이상부터 서비스 제공. 월 통합 할인한도 최대 10만원.
 *
 *   트렌디 서비스 20% — 미용·화장품, 스포츠·골프, 결혼서비스·가전,
 *                      SPA패션, 식품배송, 인테리어
 *   데일리 서비스 10% — 커피·베이커리·아이스크림(건당 2만원 이상),
 *                      대중교통, 택시, 백화점
 *
 * 영역별 세부 한도는 공개돼 있지 않다. 임의로 지어내는 대신 비워 두고
 * **통합 한도만** 적용한다. 없는 숫자를 만들어 넣으면 틀린 값을 확정인 척
 * 보여주게 된다.
 *
 * 출처: KB국민카드 상품 안내, 카드고릴라
 * https://m.kbcard.com/CXHIACRC0002.cms?allianceCode=09230&mainCC=b
 */
export const KB_TANTANDAERO: Card = {
  id: 'kb-tantandaero',
  notionOption: '탄탄대로 Miz&Mr',
  issuer: '국민',
  name: 'KB국민 탄탄대로 Miz&Mr 티타늄카드',
  shortName: '탄탄대로',
  last4: ['6089'],
  active: true,
  annualFee: 30_000, // JCB·Master 모두 3만원
  slot: 1,
  productPageUrl: 'https://m.kbcard.com/CXHIACRC0002.cms?allianceCode=09230&mainCC=b',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full',
    // 40만 → 7만원, 80만 → 10만원. 두 구간 모두 공개 자료로 확인.
    tierConfidence: 'confirmed',
    tiers: [
      { threshold: 0, label: '실적 미달', totalBenefitCap: 0 },
      { threshold: 400_000, label: '40만원', totalBenefitCap: 70_000 },
      { threshold: 800_000, label: '80만원', totalBenefitCap: 100_000 },
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // ── 트렌디 서비스 20% ──────────────────────────────────────────────
    {
      id: 'tt-beauty',
      label: '미용·화장품 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        brands: ['OLIVEYOUNG'],
        keywords: ['미용실', '헤어', '네일', '피부과', '피부관리', '에스테틱', '왁싱', '화장품'],
      },
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'tt-golf',
      label: '스포츠·골프 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        keywords: ['골프', 'GOLF', '스크린골프', '컨트리클럽', '스포츠센터', '헬스', '피트니스'],
      },
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'tt-wedding-appliance',
      label: '결혼서비스·가전 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        keywords: [
          '웨딩', '결혼', '예식장', '하이마트', '전자랜드',
          '삼성디지털프라자', 'LG베스트샵',
        ],
      },
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'tt-spa-fashion',
      label: 'SPA패션 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        keywords: ['ZARA', '자라', 'H&M', '유니클로', 'UNIQLO', 'SPAO', '스파오', '탑텐', 'TOPTEN'],
      },
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'tt-fresh-delivery',
      label: '식품배송 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        brands: [...BRAND_GROUPS.FRESH_DELIVERY, 'BAEMIN'],
        keywords: ['배민찬', '헬로네이처'],
      },
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'tt-interior',
      label: '인테리어 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        keywords: ['이케아', 'IKEA', '무인양품', 'MUJI', '까사미아', '한샘', '리바트', '인테리어'],
      },
      priority: 10,
      confidence: 'confirmed',
    },

    // ── 데일리 서비스 10% ──────────────────────────────────────────────
    {
      id: 'td-coffee',
      label: '커피·베이커리·아이스크림 10%',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: [...BRAND_GROUPS.CAFE],
        categories: ['카페'],
        keywords: ['베이커리', '파리바게뜨', '뚜레쥬르', '배스킨라빈스', '설빙'],
      },
      // 건당 2만원 이상 이용 시에만 할인된다. 5천원으로 잘못 잡으면
      // 소액 결제에 있지도 않은 할인이 붙는다.
      minAmountPerTx: 20_000,
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'td-transit',
      label: '대중교통 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['TMONEY'], keywords: ['버스', '지하철', '교통카드'] },
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'td-taxi',
      label: '택시 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['KAKAO_T', 'UBER_TAXI', 'ITAXI'], keywords: ['택시'] },
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'td-dept',
      label: '백화점 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: [...BRAND_GROUPS.DEPARTMENT] },
      priority: 20,
      confidence: 'confirmed',
    },
  ],
};
