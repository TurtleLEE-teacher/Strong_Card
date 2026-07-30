import { BRAND_GROUPS } from '../merchants';
import type { Card, ExclusionRule, TierCap } from '@/lib/types';
import { COMMON_EXCLUSIONS } from '../exclusions';

/**
 * 신한카드 Discount Plan (2025-04-17 출시)
 *
 * 공식 약관 기준. 이 카드는 **통합 한도 하나가 아니라 서비스별 한도 4개**로
 * 굴러간다. 마케팅의 "월 최대 6만원"은 네 한도의 합계다.
 *
 *   전월 이용금액       40~80만   80~120만   120만+
 *   ─────────────────────────────────────────────
 *   Time Plan            5,000    10,000    15,000
 *   Daily Plan          10,000    20,000    30,000
 *   Monthly 정기결제      3,000     7,000    10,000
 *   Monthly 영화예매      5,000     5,000     5,000
 *   ─────────────────────────────────────────────
 *   월 최대             23,000    42,000    60,000
 *
 * 서비스 구성
 *   Time Plan    DAY(07~15시) 카페·음식점 / NIGHT(18~22시) 편의점·배달앱  각 10%
 *                영역별 일 1회, 할인 전 이용금액 1회 1만원까지
 *   Daily Plan   쇼핑 10% (마트·온라인쇼핑·잡화)
 *                이동  5% (주유·카쉐어링·택시)
 *                생활  5% (해외·병원약국·미용실·온라인서점)
 *                영역별 일 1회 월 5회, 할인 전 이용금액 1회 5만원까지
 *   Monthly Plan 공과금 10% / 디지털구독·멤버십 20% / 영화예매 5천원(월 1회)
 *
 * Plan Day  매월 1일, Time Plan·Daily Plan **각 서비스의 첫 할인 거래 1건**에
 *           할인율 2배 (서비스당 1회, 최대 2회). 기존 월 한도와 일/월 횟수
 *           한도 안에서 제공되며, 승인 시각 기준 1일 23:59:59까지.
 *
 *           약관이 "할인 전 이용금액 1회 N원까지"로 쓰여 있어 건당 상한을
 *           할인액(capPerTx)이 아니라 이용금액(maxEligibleAmountPerTx)에 건다.
 *           평상시 결과는 같지만(1만원 × 10% = 1,000원), Plan Day로 요율이
 *           2배가 되면 할인액 상한도 2배가 되어야 약관과 맞는다.
 *
 * 출처: 신한카드 공식 상품 안내 (사용자 제공 전문)
 * https://www.shinhancard.com/pconts/html/card/apply/credit/1232369_2207.html
 */

// ── 서비스별 월 통합 한도 ────────────────────────────────────────────────
const TIME_PLAN_CAP: TierCap[] = [
  { threshold: 0, cap: 0 },
  { threshold: 400_000, cap: 5_000 },
  { threshold: 800_000, cap: 10_000 },
  { threshold: 1_200_000, cap: 15_000 },
];

const DAILY_PLAN_CAP: TierCap[] = [
  { threshold: 0, cap: 0 },
  { threshold: 400_000, cap: 10_000 },
  { threshold: 800_000, cap: 20_000 },
  { threshold: 1_200_000, cap: 30_000 },
];

const RECURRING_CAP: TierCap[] = [
  { threshold: 0, cap: 0 },
  { threshold: 400_000, cap: 3_000 },
  { threshold: 800_000, cap: 7_000 },
  { threshold: 1_200_000, cap: 10_000 },
];

const CINEMA_CAP: TierCap[] = [
  { threshold: 0, cap: 0 },
  { threshold: 400_000, cap: 5_000 },
  { threshold: 800_000, cap: 5_000 },
  { threshold: 1_200_000, cap: 5_000 },
];

/**
 * Plan Day — 매월 1일 요율 2배. capGroup(=서비스)마다 첫 할인 거래 1건에만
 * 붙으므로 Time Plan·Daily Plan 각 1회씩, 월 최대 2회 적용된다.
 */
const PLAN_DAY = { dayOfMonth: 1, multiplier: 2 } as const;

const TIME = 'dp-time';
const DAILY = 'dp-daily';
const RECURRING = 'dp-recurring';
const CINEMA = 'dp-cinema';

/**
 * 이 카드만의 실적 제외 항목.
 * 공통 목록에 없는 것들이 약관에 명시돼 있다.
 */
const DP_EXCLUSIONS: ExclusionRule[] = [
  ...COMMON_EXCLUSIONS,
  {
    verdict: '제외-공과금',
    reason: 'TV수신료·환경개선부담금',
    keywords: ['TV수신료', '수신료', '환경개선부담금', '지방세외수입'],
  },
  {
    verdict: '제외-기타',
    // 약관에 '철도 업종 이용금액'이 명시돼 있다. 다른 카드에는 없는 조건이다.
    reason: '철도 업종',
    keywords: ['코레일', '한국철도공사', 'SRT', '에스알'],
  },
];

export const SHINHAN_DISCOUNT_PLAN: Card = {
  id: 'shinhan-discount-plan',
  notionOption: 'Discount Plan',
  issuer: '신한',
  name: '신한카드 Discount Plan',
  shortName: 'Discount Plan',
  last4: ['6359'],
  active: true,
  annualFee: 15_000, // 국내전용·Mastercard 모두 1만5천원
  slot: 5,
  productPageUrl:
    'https://www.shinhancard.com/pconts/html/card/apply/credit/1232369_2207.html',

  performance: {
    required: true,
    countsForeignSpend: true,
    installmentPolicy: 'full', // 전월(1일~말일) 일시불 + 할부
    tierConfidence: 'confirmed',
    tiers: [
      // 서비스별 한도가 따로 있으므로 통합 한도는 두지 않는다.
      { threshold: 0, label: '실적 미달', totalBenefitCap: null },
      { threshold: 400_000, label: '40만원', totalBenefitCap: null },
      { threshold: 800_000, label: '80만원', totalBenefitCap: null },
      { threshold: 1_200_000, label: '120만원', totalBenefitCap: null },
    ],
    exclusions: DP_EXCLUSIONS,
  },

  benefits: [
    // ══ Time Plan — 영역별 일 1회, 건당 1만원까지 (→ 최대 1,000원) ══════
    {
      id: 'dp-time-cafe',
      label: '카페 10% (07~15시)',
      type: 'discount',
      rate: 0.1,
      // 지정 6개 브랜드만. 일반 카페 브랜드를 넣으면 과다 계상된다.
      match: { brands: [...BRAND_GROUPS.DP_CAFE] },
      timeWindow: { startHour: 7, endHour: 15, label: '07~15시' },
      maxEligibleAmountPerTx: 10_000,
      bonusDay: PLAN_DAY,
      capPerMonth: TIME_PLAN_CAP,
      capGroup: TIME,
      capGroupLabel: 'Time Plan (카페·음식점·편의점·배달앱 10%)',
      maxCountPerDay: 1,
      // 카페 브랜드가 음식점 업종이어도 카페 할인이 우선한다.
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'dp-time-restaurant',
      label: '음식점 10% (07~15시)',
      type: 'discount',
      rate: 0.1,
      match: { brands: [...BRAND_GROUPS.DINING], categories: ['식비'] },
      timeWindow: { startHour: 7, endHour: 15, label: '07~15시' },
      maxEligibleAmountPerTx: 10_000,
      bonusDay: PLAN_DAY,
      capPerMonth: TIME_PLAN_CAP,
      capGroup: TIME,
      capGroupLabel: 'Time Plan (카페·음식점·편의점·배달앱 10%)',
      maxCountPerDay: 1,
      priority: 15,
      confidence: 'confirmed',
    },
    {
      id: 'dp-time-cvs',
      label: '편의점 10% (18~22시)',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['CU', 'GS25', 'SEVEN_ELEVEN', 'EMART24'] },
      timeWindow: { startHour: 18, endHour: 22, label: '18~22시' },
      maxEligibleAmountPerTx: 10_000,
      bonusDay: PLAN_DAY,
      capPerMonth: TIME_PLAN_CAP,
      capGroup: TIME,
      capGroupLabel: 'Time Plan (카페·음식점·편의점·배달앱 10%)',
      maxCountPerDay: 1,
      priority: 10,
      confidence: 'confirmed',
    },
    {
      id: 'dp-time-delivery',
      label: '배달앱 10% (18~22시)',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['BAEMIN', 'YOGIYO', 'COUPANG_EATS', 'DDANGYO'] },
      timeWindow: { startHour: 18, endHour: 22, label: '18~22시' },
      maxEligibleAmountPerTx: 10_000,
      bonusDay: PLAN_DAY,
      capPerMonth: TIME_PLAN_CAP,
      capGroup: TIME,
      capGroupLabel: 'Time Plan (카페·음식점·편의점·배달앱 10%)',
      maxCountPerDay: 1,
      priority: 10,
      confidence: 'confirmed',
    },

    // ══ Daily Plan 쇼핑 10% — 영역별 일 1회·월 5회, 건당 5만원까지 ══════
    {
      id: 'dp-daily-mart',
      label: '마트 10%',
      type: 'discount',
      rate: 0.1,
      // 창고형·기업형 슈퍼(이마트 에브리데이, 롯데슈퍼)는 제외
      match: { brands: [...BRAND_GROUPS.DP_MART] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 20,
      confidence: 'confirmed',
    },
    {
      id: 'dp-daily-online',
      label: '온라인쇼핑 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: [...BRAND_GROUPS.DP_ONLINE] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 20,
      confidence: 'confirmed',
      notes: '멤버십·구독료, 쿠팡이츠는 제외',
    },
    {
      id: 'dp-daily-goods',
      label: '잡화 10% (올리브영·다이소)',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['OLIVEYOUNG', 'DAISO'] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 20,
      confidence: 'confirmed',
    },

    // ══ Daily Plan 이동 5% ═══════════════════════════════════════════════
    {
      id: 'dp-daily-fuel',
      label: '주유 5%',
      type: 'discount',
      rate: 0.05,
      match: { brands: ['SK_ENERGY', 'GS_CALTEX', 'HYUNDAI_OILBANK', 'S_OIL'] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 30,
      confidence: 'confirmed',
      notes: 'LPG는 제외 (휘발유·경유·등유만)',
    },
    {
      id: 'dp-daily-carshare',
      label: '카쉐어링 5% (쏘카)',
      type: 'discount',
      rate: 0.05,
      match: { brands: ['SOCAR'] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 30,
      confidence: 'confirmed',
    },
    {
      id: 'dp-daily-taxi',
      label: '택시 5%',
      type: 'discount',
      rate: 0.05,
      match: { brands: ['KAKAO_T', 'UBER_TAXI', 'ITAXI'], keywords: ['택시'] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 30,
      confidence: 'confirmed',
    },

    // ══ Daily Plan 생활 5% ═══════════════════════════════════════════════
    {
      id: 'dp-daily-overseas',
      label: '해외 5%',
      type: 'discount',
      rate: 0.05,
      // 해외 일시불만. 할부 전환분은 제외된다.
      match: { paymentKinds: ['해외'] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 30,
      confidence: 'confirmed',
      notes: 'Mastercard 해외겸용 카드만. 원화 청구금액 기준',
    },
    {
      id: 'dp-daily-medical',
      label: '병원·약국 5%',
      type: 'discount',
      rate: 0.05,
      match: {
        brands: ['PHARMACY'],
        keywords: ['병원', '의원', '치과', '약국'],
      },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 30,
      confidence: 'confirmed',
    },
    {
      id: 'dp-daily-salon',
      label: '미용실 5%',
      type: 'discount',
      rate: 0.05,
      match: { keywords: ['미용실', '헤어', '이용원', '미용'] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 30,
      confidence: 'confirmed',
    },
    {
      id: 'dp-daily-bookstore',
      label: '온라인서점 5%',
      type: 'discount',
      rate: 0.05,
      match: { brands: [...BRAND_GROUPS.BOOKSTORE] },
      maxEligibleAmountPerTx: 50_000,
      bonusDay: PLAN_DAY,
      capPerMonth: DAILY_PLAN_CAP,
      capGroup: DAILY,
      capGroupLabel: 'Daily Plan (쇼핑 10% · 이동/생활 5%)',
      maxCountPerDay: 1,
      maxCountPerMonth: 5,
      priority: 30,
      confidence: 'confirmed',
    },

    // ══ Monthly Plan 정기결제 ════════════════════════════════════════════
    {
      id: 'dp-subscription',
      label: '디지털구독·멤버십 20%',
      type: 'discount',
      rate: 0.2,
      match: {
        brands: ['NETFLIX', 'YOUTUBE_PREMIUM', 'TVING', 'DISNEY_PLUS', 'MILLIE'],
        keywords: ['네이버플러스멤버십', '쿠팡와우멤버십', '와우멤버십'],
        categories: ['구독'],
      },
      // 할인 전 이용금액 1회 1만원까지 → 건당 최대 2,000원
      capPerTx: 2_000,
      capPerMonth: RECURRING_CAP,
      capGroup: RECURRING,
      capGroupLabel: 'Monthly Plan 정기결제 (공과금 10% · 구독 20%)',
      priority: 10,
      confidence: 'confirmed',
      notes: '공식 홈페이지 정기결제만. 인앱결제·통신요금 포함 결제는 제외. 횟수 무제한',
    },
    {
      id: 'dp-utility',
      label: '공과금 10%',
      type: 'discount',
      rate: 0.1,
      // 아파트관리비·도시가스·전기요금. 통신요금은 아래 별도 룰(월 1회 제한).
      match: {
        brands: ['APT_FEE', 'CITY_GAS', 'KEPCO_BILL'],
        keywords: ['아파트관리비', '관리비', '도시가스', '전기요금'],
      },
      // 할인 전 이용금액 1회 5만원까지 → 건당 최대 5,000원
      capPerTx: 5_000,
      capPerMonth: RECURRING_CAP,
      capGroup: RECURRING,
      capGroupLabel: 'Monthly Plan 정기결제 (공과금 10% · 구독 20%)',
      priority: 12,
      // 공과금은 실적에서 빠지지만 이 카드에서는 할인 대상이다.
      applyToExcludedSpend: true,
      confidence: 'confirmed',
      notes: '자동납부 시에만 할인. 횟수 무제한',
    },
    {
      id: 'dp-telecom',
      label: '통신요금 10%',
      type: 'discount',
      rate: 0.1,
      match: { brands: ['SKT', 'KT', 'LGU'] },
      capPerTx: 5_000,
      capPerMonth: RECURRING_CAP,
      capGroup: RECURRING,
      capGroupLabel: 'Monthly Plan 정기결제 (공과금 10% · 구독 20%)',
      // 통신요금만 월 1회 제한이 따로 있다.
      maxCountPerMonth: 1,
      priority: 12,
      confidence: 'confirmed',
      notes: '순수 통신요금 자동납부만. 알뜰폰·선불폰·결합상품 제외',
    },

    // ══ Monthly Plan 영화예매 — 별도 한도 5,000원 ════════════════════════
    {
      id: 'dp-cinema',
      label: '영화 예매 5,000원 할인',
      type: 'discount',
      // 정률이 아니라 정액 5,000원이다. 건당 한도로 정액을 표현한다.
      // rate 1.0 + capPerTx 5,000 → 조건을 넘는 거래는 항상 정확히 5,000원.
      rate: 1,
      match: { brands: ['CGV', 'LOTTE_CINEMA'] },
      minAmountPerTx: 12_000,
      capPerTx: 5_000,
      capPerMonth: CINEMA_CAP,
      capGroup: CINEMA,
      capGroupLabel: 'Monthly Plan 영화예매',
      maxCountPerMonth: 1,
      priority: 5,
      confidence: 'confirmed',
      notes: '영화 예매만. 예매권·상품권·매점·통신사 예매는 제외',
    },
  ],
};
