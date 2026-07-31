/**
 * Strong Card 도메인 타입.
 *
 * 용어 정리 (헷갈리면 여기로 돌아올 것):
 * - 실적(performance): 이번 달에 쓴 금액. **다음 달** 혜택 구간을 결정한다.
 * - 적용 구간(applied tier): 이번 달 혜택 한도. **지난달** 실적으로 이미 확정돼 있다.
 * 이 둘은 항상 한 달 어긋나 있으므로 절대 섞지 않는다.
 */

/** 카드 상품 ID. Notion `카드 상품` select 옵션과 1:1 대응한다. */
export type CardId =
  | 'kb-tantandaero'
  | 'kb-coupang-wow'
  | 'samsung-amex-blue'
  | 'hyundai-zero-ed2'
  | 'shinhan-discount-plan'
  | 'shinhan-ev';

export type Issuer = '국민' | '신한' | '삼성' | '현대';

/** Notion `카테고리` select 옵션. 브랜드 매칭 실패 시 폴백 신호로 쓴다. */
export type TxCategory =
  | '식비' | '카페' | '교통' | '생활' | '의료'
  | '교육' | '여가' | '구독' | '업무' | '금융' | '기타';

export type Currency = 'KRW' | 'USD' | 'JPY' | 'EUR' | '기타';

export type PaymentKind = '일시불' | '할부' | '해외' | '취소·환불';

/** 실적 제외 사유. Notion `실적 인정` select와 대응한다. */
export type PerformanceVerdict =
  | '인정'
  | '제외-취소'
  | '제외-공과금'
  | '제외-상품권'
  | '제외-무승인'
  | '제외-기타';

// ---------------------------------------------------------------------------
// 거래
// ---------------------------------------------------------------------------

/** Notion `💳 Card_Transactions` 한 행을 앱 도메인으로 옮긴 것. */
export interface Transaction {
  /** Notion page id */
  id: string;
  /** 가맹점명 (title) */
  title: string;
  /** 가맹점 원문 */
  merchant: string | null;
  /** 원본 금액. 해외결제면 외화 원금이다. 계산에 직접 쓰지 말 것. */
  rawAmount: number;
  currency: Currency;
  /** 원화 환산 금액. 실적·혜택 계산은 **오직 이 값만** 사용한다. */
  krwAmount: number;
  /** 승인일시 (UTC ISO). 실적 기간 판정 기준. */
  approvedAt: string;
  issuer: Issuer | null;
  /** 원문에서 파싱한 카드 뒤 4자리 */
  last4: string | null;
  /** last4로 매핑한 카드 상품. 매핑 실패 시 null. */
  cardId: CardId | null;
  category: TxCategory | null;
  paymentKind: PaymentKind | null;
  installmentMonths: number | null;
  canceled: boolean;
  /** SMS 원문 */
  rawMessage: string | null;
  /** 원문에서 파싱한 카드사 공식 누적 실적 (있으면 정합성 검증에 쓴다) */
  issuerCumulative: number | null;
  /**
   * 혜택 적용 알림 발송 상태. 거래 단위 알림의 중복 방지 근거다.
   * 별도 DB가 없으므로 이 상태도 노션 거래 행에 저장한다.
   */
  alertStatus: '대기' | '발송완료' | '대상아님' | null;
}

// ---------------------------------------------------------------------------
// 카드 마스터
// ---------------------------------------------------------------------------

/** 전월실적 구간. threshold 이상이면 이 구간의 혜택 한도가 적용된다. */
export interface SpendTier {
  /** 실적 하한 (원). 0이면 "실적 없음" 구간. */
  threshold: number;
  label: string;
  /** 이 구간에서의 월 통합 혜택 한도 (원). null이면 한도 없음. */
  totalBenefitCap: number | null;
}

/** 실적 제외 규칙. 하나라도 걸리면 그 사유로 제외된다. */
export interface ExclusionRule {
  verdict: Exclude<PerformanceVerdict, '인정'>;
  reason: string;
  /** 가맹점명/카테고리 매칭 */
  keywords?: string[];
  categories?: TxCategory[];
}

export interface PerformancePolicy {
  /** false면 무실적 카드 — 실적 바를 그리지 않는다. */
  required: boolean;
  /** 실적 구간표. 낮은 threshold부터 오름차순. */
  tiers: SpendTier[];
  exclusions: ExclusionRule[];
  /** 해외 결제를 실적에 산입하는지 */
  countsForeignSpend: boolean;
  /**
   * 할부 실적 인정 방식.
   * 'full'   = 승인월에 전액 인정
   * 'monthly'= 매월 분할금만 인정
   */
  installmentPolicy: 'full' | 'monthly';
  /**
   * 구간표(tiers)의 숫자 출처. 기본 'estimated'.
   * 추정 구간은 설정 화면에 '확인 필요'로 노출된다.
   */
  tierConfidence?: RuleConfidence;
  /**
   * **이 혜택을 받은 거래는 실적에서 통째로 빠진다.** capGroup 또는 룰 id.
   *
   * 탄탄대로 약관: "이용실적 제외 대상 — 탄탄대로 카드로 'Trendy서비스'
   * 받은 이용건(해당 매출 전체)". 20% 할인을 받으면 그 결제 금액 전액이
   * 실적에 안 잡힌다. 40만/80만 구간을 넘기느냐가 걸린 문제라 반드시
   * 반영해야 한다 — 안 하면 실적을 실제보다 크게 계산한다.
   *
   * 할인은 그대로 받는다. 빠지는 건 실적뿐이다.
   */
  excludeBenefitedGroups?: string[];
}

/** 구간별로 달라지는 한도. threshold는 SpendTier.threshold와 맞춘다. */
export interface TierCap {
  threshold: number;
  cap: number | null;
}

export interface MerchantMatcher {
  /**
   * 결제 구분으로 매칭한다. 가맹점과 무관한 혜택에 쓴다.
   * 예: Amex Blue의 해외 결제 5% 적립은 어느 가맹점이든 해외이기만 하면 된다.
   */
  paymentKinds?: PaymentKind[];
  /** 정규화된 브랜드 키 (config/merchants.ts) */
  brands?: string[];
  /** 브랜드 매칭 실패 시 쓰는 Notion 카테고리 폴백 */
  categories?: TxCategory[];
  /** 가맹점명 부분일치 (정규화 후) */
  keywords?: string[];
  /** 위 조건에 걸려도 이건 제외 */
  excludeKeywords?: string[];
}

/**
 * 승인 시각대 조건 (KST). endHour는 포함하지 않는다.
 * 자정을 넘는 구간도 허용한다 (예: 22~02시).
 */
export interface TimeWindow {
  startHour: number;
  endHour: number;
  /** 화면에 보여줄 설명. 예: '07~15시' */
  label: string;
}

/**
 * 이 룰의 숫자가 어디서 왔는지.
 *
 * 'confirmed'  — 카드사 공식 자료나 이용대금명세서로 확인함
 * 'estimated'  — 공개 자료 기준 추정. **화면에 표시해 사용자가 검증하게 한다.**
 *
 * 추정치를 확정인 척 보여주면 사용자는 틀린 숫자를 믿게 되고, 그게
 * 이 앱에서 가장 나쁜 실패다.
 */
export type RuleConfidence = 'confirmed' | 'estimated';

export interface BenefitRule {
  id: string;
  label: string;
  type: 'discount' | 'point';
  match: MerchantMatcher;
  /** 승인 시각 조건. 없으면 시간 무관. */
  timeWindow?: TimeWindow;
  /**
   * 적용 요일 (KST, 0=일 … 6=토). 없으면 요일 무관.
   * 예: 신한EV 3대마트 할인은 주말에만 적용된다.
   */
  daysOfWeek?: number[];
  /**
   * 월 최대 적용 횟수. 카드사는 금액 한도와 별개로 횟수를 제한하는 일이 잦다.
   * 예: 신한EV 편의점 할인은 월 5회까지.
   */
  maxCountPerMonth?: number;
  /** 일 최대 적용 횟수. 예: 신한EV 커피 할인은 하루 1회. */
  maxCountPerDay?: number;
  /**
   * 여러 룰이 하나의 월 한도를 나눠 쓸 때의 그룹 키.
   *
   * 신한EV 생활서비스는 6개 영역이 **통합 3만원** 한도를 공유한다. 룰을
   * 영역별로 쪼개면서 각자 capPerMonth를 주면 한도가 6배로 부풀어 오른다.
   * 같은 capGroup을 달면 소진량을 합산해 하나의 한도로 계산한다.
   */
  capGroup?: string;
  /** 화면에 그룹을 하나로 묶어 보여줄 때 쓸 이름 */
  capGroupLabel?: string;
  /** 이 룰의 숫자 출처. 기본 'estimated'. */
  confidence?: RuleConfidence;
  /** 할인·적립률. 0.2 = 20% */
  rate: number;
  /** 건당 최소 결제금액. 미만이면 혜택 없음. */
  minAmountPerTx?: number;
  /** 건당 혜택 한도 */
  capPerTx?: number;
  /**
   * 요율을 적용할 **할인 전 이용금액**의 상한.
   *
   * capPerTx와 다르다. capPerTx는 "할인액 N원까지", 이 값은 "이용금액 N원까지".
   * 평상시에는 둘이 같은 결과를 내지만(1만원 × 10% = 1,000원), 요율이 바뀌는
   * 순간 갈라진다. 신한 Discount Plan 약관은 "할인 전 이용금액 1회 1만원까지"로
   * 쓰여 있으므로 이쪽이 원문에 맞고, Plan Day로 요율이 2배가 되면 할인액
   * 상한도 함께 2배가 된다.
   */
  maxEligibleAmountPerTx?: number;
  /**
   * 매월 특정 일자에 요율을 배수만큼 올리는 보너스.
   *
   * 신한 Discount Plan의 **Plan Day** — 매월 1일, Time Plan·Daily Plan
   * 각 서비스의 **첫 할인 거래 1건**에만 요율 2배. capGroup 단위로 1회씩
   * 소진되며, 기존 월 한도·일월 횟수 한도 안에서 제공된다.
   */
  bonusDay?: { dayOfMonth: number; multiplier: number };
  /** 월 혜택 한도. 구간에 따라 달라지면 TierCap[]. null/undefined면 무제한. */
  capPerMonth?: number | TierCap[] | null;
  /** 이 룰이 유효한 시작일 (YYYY-MM-DD, 포함) */
  effectiveFrom?: string;
  /** 이 룰이 유효한 종료일 (YYYY-MM-DD, 포함) — 프로모션 종료일 */
  effectiveUntil?: string;
  /** 우선순위. 낮을수록 먼저 매칭 시도. 기본 100. */
  priority?: number;
  /**
   * 실적에서 제외된 거래에도 혜택을 줄지.
   * 기본 false — 세금·상품권 결제에 적립이 붙는 과다 계상을 막는다.
   * 예외: 신한EV 하이패스는 무승인 전표라 실적 제외지만 캐시백은 나온다.
   */
  applyToExcludedSpend?: boolean;
  notes?: string;
}

export interface Card {
  id: CardId;
  /** Notion `카드 상품` select 옵션명과 정확히 일치해야 한다. */
  notionOption: string;
  issuer: Issuer;
  name: string;
  shortName: string;
  /** 카드 뒤 4자리. 재발급 대비 배열. */
  last4: string[];
  active: boolean;
  annualFee: number;
  /**
   * 카드 식별 색 슬롯 (1~6).
   * 검증된 카테고리 팔레트의 고정 순서를 그대로 쓴다. 슬롯은 카드에
   * 귀속되며 순환시키지 않는다 — 카드를 하나 숨긴다고 나머지 색이
   * 바뀌면 사용자가 색으로 카드를 기억할 수 없다.
   */
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  performance: PerformancePolicy;
  benefits: BenefitRule[];
  /** 카드 통합 월 혜택 한도. tiers의 totalBenefitCap과 중복되면 이쪽이 우선. */
  productPageUrl?: string;
}

// ---------------------------------------------------------------------------
// 계산 결과
// ---------------------------------------------------------------------------

/** 거래 1건에 대한 혜택 적용 결과 */
export interface AppliedBenefit {
  transactionId: string;
  ruleId: string;
  ruleLabel: string;
  type: 'discount' | 'point';
  /** 한도 적용 전 이론값 */
  grossAmount: number;
  /** 한도(건당·월간·통합) 적용 후 실제 금액 */
  netAmount: number;
  /** 한도에 걸려 깎인 금액 */
  cappedAmount: number;
  cappedBy: 'none' | 'per-tx' | 'per-month' | 'total';
}

/** 혜택 룰별 월 소진 현황 */
export interface BenefitUsage {
  ruleId: string;
  /** 여러 룰이 한 한도를 공유하면 그 그룹 키. 화면에서 한 줄로 합친다. */
  capGroup?: string;
  label: string;
  type: 'discount' | 'point';
  used: number;
  cap: number | null;
  /** cap이 null이면 null */
  ratio: number | null;
  txCount: number;
  /**
   * 지금 구간에서 한도가 0일 때, **얼마를 채우면 얼마가 열리는지**.
   *
   * 실적 미달이면 모든 영역의 한도가 0이 된다. 그 행들을 목록에서 지우면
   * 카드에 아무것도 안 보이는데, 정작 "이 카드에 어떤 혜택이 있나"가 가장
   * 궁금한 시점이 바로 그때다. 지우는 대신 잠긴 상태로 보여준다.
   */
  unlock?: { threshold: number; cap: number };
}

/** 실적 제외 내역 요약 */
export interface ExclusionSummary {
  verdict: PerformanceVerdict;
  amount: number;
  count: number;
}

export interface CardMonthlySnapshot {
  cardId: CardId;
  /** 'YYYY-MM' (KST) */
  month: string;

  // --- 이번 달 실적 (→ 다음 달 혜택을 결정) ---
  /** 실적으로 인정된 금액 합계 */
  currentSpend: number;
  /** 제외된 금액 합계 */
  excludedSpend: number;
  exclusions: ExclusionSummary[];
  /** currentSpend 기준으로 지금 달성한 구간 */
  reachedTier: SpendTier | null;
  /** 아직 못 넘은 다음 구간 */
  nextTier: SpendTier | null;
  /** 다음 구간까지 남은 금액. nextTier가 없으면 0. */
  remainingToNextTier: number;
  /** 카드사 SMS가 알려준 공식 누계 (최신값) */
  issuerReportedSpend: number | null;
  /** currentSpend - issuerReportedSpend. 룰 오류 탐지용. */
  reconciliationDelta: number | null;

  // --- 이번 달 혜택 (← 지난달 실적으로 확정) ---
  /** 지난달 실적 */
  previousSpend: number;
  /** 지난달 실적으로 확정된, 이번 달 적용 구간 */
  appliedTier: SpendTier | null;
  benefitUsage: BenefitUsage[];
  appliedBenefits: AppliedBenefit[];
  totalBenefitUsed: number;
  /** appliedTier의 통합 한도. null이면 무제한. */
  totalBenefitCap: number | null;

  /**
   * 룰별 이번 달 적용 횟수. 횟수 제한이 있는 혜택을 추천할 때 참조한다.
   * 이게 없으면 월 5회를 이미 다 쓴 혜택을 계속 추천하게 된다.
   */
  ruleCounts: Record<string, number>;
  /** 혜택 매칭에 실패한 거래 (미분류 관리 화면에서 쓴다) */
  unmatchedTransactionIds: string[];
  transactionCount: number;
}
