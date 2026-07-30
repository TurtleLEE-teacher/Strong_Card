/**
 * 외화 → 원화 환산.
 *
 * ⚠️ 여기서 나오는 숫자는 **근사치**다.
 * 카드사는 매입 시점(승인일이 아니라 결제 정산일)의 자체 매매기준율에
 * 국제브랜드 수수료·해외서비스 수수료를 더해 청구한다. 우리는 그 값을
 * 미리 알 수 없다.
 *
 * 그래서 실적 계산에는 이 근사치를 쓰되, SMS의 카드사 공식 누계
 * (`issuerCumulative`)와 대조해 오차를 대시보드에 노출한다.
 * 오차가 크면 환율이 아니라 실적 제외 규칙을 의심하는 게 맞다.
 */

import type { Currency } from '@/lib/types';

/**
 * 폴백 환율. 실시간 조회에 실패했을 때만 쓴다.
 * 해외 결제가 잦아지면 실시간 조회로 갈아탈 것.
 */
const FALLBACK_RATES: Record<Currency, number> = {
  KRW: 1,
  USD: 1_380,
  JPY: 9.2, // 1엔당
  EUR: 1_500,
  기타: 1_380,
};

/** 카드사 해외이용 수수료 (국제브랜드 + 해외서비스). 대략 1.2% 수준. */
const FOREIGN_TX_FEE_RATE = 0.012;

export interface FxOptions {
  /** 통화별 환율 오버라이드. 실시간 조회 결과를 주입할 때 쓴다. */
  rates?: Partial<Record<Currency, number>>;
  /** 해외 수수료를 얹을지. 실적 산정은 청구액 기준이므로 기본 true. */
  applyFee?: boolean;
}

/**
 * 원화 환산액을 돌려준다. KRW면 그대로 반환한다.
 * 원 단위 미만은 버린다(카드사도 절사한다).
 */
export function toKrw(
  amount: number,
  currency: Currency | null,
  options: FxOptions = {},
): number {
  const cur = currency ?? 'KRW';
  if (cur === 'KRW') return Math.round(amount);

  const rate = options.rates?.[cur] ?? FALLBACK_RATES[cur] ?? FALLBACK_RATES.기타;
  const base = amount * rate;
  const withFee = options.applyFee === false ? base : base * (1 + FOREIGN_TX_FEE_RATE);
  return Math.floor(withFee);
}

/** 환산이 근사치인지 (UI에서 '≈' 표기를 붙이기 위해) */
export function isApproximate(currency: Currency | null): boolean {
  return (currency ?? 'KRW') !== 'KRW';
}

export { FALLBACK_RATES, FOREIGN_TX_FEE_RATE };
