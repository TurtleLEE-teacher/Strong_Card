import { BRAND_GROUPS } from '../merchants';
import type { Card, TierCap } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * KB국민 탄탄대로 Miz&Mr 티타늄카드
 *
 * **통합 한도가 아니라 영역별 한도 6개**로 굴러간다.
 * 마케팅 문구의 "월 최대 10만원"은 2구간 영역 한도의 합계다.
 *
 *   스포츠·미용·결혼           20%   20,000원
 *   식품배송·SPA패션·인테리어  20%   20,000원
 *   백화점·편의점             10%   15,000원
 *   커피·베이커리·아이스크림   10%   15,000원  (건당 2만원 이상)
 *   대중교통                 10%   15,000원
 *   대형마트·약국              5%   15,000원
 *                                 ─────────
 *                                 100,000원  (2구간 기준)
 *
 * 출처: 카드 앱 '이번 달 혜택' 화면(사용자 제공) — 2구간 한도 실측.
 *       KB국민카드 상품 안내 — 구간 임계값(40만/80만).
 */

/**
 * 영역별 한도.
 *
 * 2구간(80만) 값은 카드 앱 화면에서 직접 읽었다.
 * ⚠️ **1구간(40만) 배분은 추정이다.** 합계가 7만원이라는 것만 확인됐고
 *    영역별로 어떻게 쪼개지는지는 화면에 없었다. 40만~80만 구간에서
 *    실제 잔여한도를 보면 바로 확정된다.
 */
function areaCap(tier1: number, tier2: number): TierCap[] {
  return [
    { threshold: 0, cap: 0 },
    { threshold: 400_000, cap: tier1 },
    { threshold: 800_000, cap: tier2 },
  ];
}

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
    // 구간 임계값(40만/80만)과 2구간 영역 한도는 확인됐지만
    // 1구간 영역 배분은 추정이다.
    tierConfidence: 'estimated',
    tiers: [
      // 통합 한도를 두지 않는다 — 이 카드는 영역별 한도로만 제어된다.
      { threshold: 0, label: '실적 미달', totalBenefitCap: null },
      { threshold: 400_000, label: '40만원', totalBenefitCap: null }, // KB 앱의 '1구간'
      { threshold: 800_000, label: '80만원', totalBenefitCap: null }, // KB 앱의 '2구간'
    ],
    exclusions: COMMON_EXCLUSIONS,
  },

  benefits: [
    // ── 20% 영역 ──────────────────────────────────────────────────────
    {
      id: 'tt-sports-beauty-wedding',
      label: '스포츠·미용·결혼 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        brands: ['OLIVEYOUNG'],
        keywords: [
          // 미용·화장품
          '미용실', '헤어', '네일', '피부과', '피부관리', '에스테틱', '왁싱', '화장품',
          // 스포츠·골프
          '골프', 'GOLF', '스크린골프', '컨트리클럽', '스포츠센터', '헬스', '피트니스',
          // 결혼서비스·가전
          '웨딩', '결혼', '예식장', '하이마트', '전자랜드', '삼성디지털프라자', 'LG베스트샵',
        ],
      },
      capPerMonth: areaCap(15_000, 20_000),
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'tt-delivery-fashion-interior',
      label: '식품배송·SPA패션·인테리어 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        brands: [...BRAND_GROUPS.FRESH_DELIVERY, 'BAEMIN'],
        keywords: [
          // 식품배송
          '배민찬', '헬로네이처',
          // SPA패션
          'ZARA', '자라', 'H&M', '유니클로', 'UNIQLO', 'SPAO', '스파오', '탑텐', 'TOPTEN',
          // 인테리어
          '이케아', 'IKEA', '무인양품', 'MUJI', '까사미아', '한샘', '리바트', '인테리어',
        ],
      },
      capPerMonth: areaCap(15_000, 20_000),
      priority: 10,
      confidence: 'confirmed',
    },

    // ── 10% 영역 ──────────────────────────────────────────────────────
    {
      id: 'tt-dept-cvs',
      label: '백화점·편의점 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: [...BRAND_GROUPS.DEPARTMENT, ...BRAND_GROUPS.CONVENIENCE] },
      capPerMonth: areaCap(10_000, 15_000),
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'tt-coffee',
      label: '커피·베이커리·아이스크림 10%',
      type: 'discount',
      rate: 0.1,
      match: {
        brands: [...BRAND_GROUPS.CAFE],
        categories: ['카페'],
        keywords: ['베이커리', '파리바게뜨', '뚜레쥬르', '배스킨라빈스', '설빙'],
      },
      // 건당 2만원 이상이어야 한다. 낮게 잡으면 소액 결제에
      // 있지도 않은 할인이 붙는다.
      minAmountPerTx: 20_000,
      capPerMonth: areaCap(10_000, 15_000),
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'tt-transit',
      label: '대중교통 10%',
      type: 'discount',
      rate: 0.1,
      // 카드 앱 화면에 '택시'는 별도 영역으로 없다. 대중교통만이다.
      match: { brands: ['TMONEY'], keywords: ['버스', '지하철', '교통카드'] },
      capPerMonth: areaCap(10_000, 15_000),
      priority: 20,
      confidence: 'confirmed',
    },

    // ── 5% 영역 ───────────────────────────────────────────────────────
    {
      id: 'tt-mart-pharmacy',
      label: '대형마트·약국 5%',
      type: 'discount',
      rate: 0.05,
      match: {
        brands: [...BRAND_GROUPS.MART, 'PHARMACY'],
        keywords: ['약국'],
      },
      // ⚠️ 이 영역만 카드 앱 화면에서 잘려 한도를 못 봤다.
      //    나머지 5개 합(85,000)과 총 10만원의 차이로 역산한 값이다.
      capPerMonth: areaCap(10_000, 15_000),
      priority: 30,
      confidence: 'estimated',
      notes: '한도는 총합에서 역산한 추정치 — 카드 앱에서 직접 확인 필요',
    },
  ],
};
