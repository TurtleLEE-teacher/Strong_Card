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
 *
 * 동기화 크론은 `fetchLiveRates()`로 그날 기준환율을 받아 넘긴다.
 * 노션에 원화금액이 한 번 적히면 그 값을 계속 믿으므로(transactions.ts),
 * 승인 뒤 첫 동기화 때의 환율이 그 거래의 환산액으로 남는다.
 */

import type { Currency } from '@/lib/types';

/**
 * 폴백 환율. 실시간 조회에 실패했을 때만 쓴다.
 *
 * 2026-11-20 기준환율 근처로 맞췄다. 예전 값(USD 1,380 · JPY 9.2)은 엔화가
 * 8.3원대로 내려온 뒤에도 그대로여서 11/18 엔화 결제 75,000엔을 698,280원
 * (실제 기준환율로는 약 634,000원)으로 10% 넘게 부풀렸다.
 */
const FALLBACK_RATES: Record<Currency, number> = {
  KRW: 1,
  USD: 1_330,
  JPY: 8.4, // 1엔당
  EUR: 1_460,
  기타: 1_330,
};

/** 카드사 해외이용 수수료 (국제브랜드 + 해외서비스). 대략 1.2% 수준. */
const FOREIGN_TX_FEE_RATE = 0.012;

/**
 * 실시간 환율 출처. 무료 · 인증 없음 · 유럽중앙은행 기준환율(영업일마다 갱신).
 * 응답은 1원당 외화라서 뒤집어 쓴다.
 */
const LIVE_RATES_URL = 'https://api.frankfurter.app/latest?from=KRW&to=USD,JPY,EUR';

const LIVE_CURRENCIES = ['USD', 'JPY', 'EUR'] as const;

export interface FxOptions {
  /** 통화별 환율 오버라이드. 실시간 조회 결과를 주입할 때 쓴다. */
  rates?: Partial<Record<Currency, number>>;
  /** 해외 수수료를 얹을지. 실적 산정은 청구액 기준이므로 기본 true. */
  applyFee?: boolean;
}

export interface LiveRates {
  /** 1 외화당 원화. 조회에 실패하면 비어 있고 toKrw()가 폴백 환율로 내려간다. */
  rates: Partial<Record<Currency, number>>;
  source: 'live' | 'fallback';
  /** 기준환율 날짜 (live일 때) */
  date?: string;
  error?: string;
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

/**
 * frankfurter 응답(1원당 외화)을 1 외화당 원화로 뒤집는다.
 * 말이 안 되는 값(숫자 아님 · 0 이하 · 폴백과 2배 넘게 차이)은 버린다.
 */
export function parseLiveRates(body: unknown): Partial<Record<Currency, number>> {
  const raw = (body as { rates?: Record<string, unknown> } | null)?.rates ?? {};
  const rates: Partial<Record<Currency, number>> = {};
  for (const cur of LIVE_CURRENCIES) {
    const perKrw = raw[cur];
    if (typeof perKrw !== 'number' || !(perKrw > 0)) continue;
    const krw = 1 / perKrw;
    const fallback = FALLBACK_RATES[cur];
    if (krw < fallback / 2 || krw > fallback * 2) continue;
    rates[cur] = Math.round(krw * 10_000) / 10_000;
  }
  return rates;
}

/**
 * 그날 기준환율을 가져온다. 실패해도 던지지 않는다.
 * 동기화 한 번에 한 번만 부른다.
 */
export async function fetchLiveRates(timeoutMs = 5_000): Promise<LiveRates> {
  try {
    const res = await fetch(LIVE_RATES_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const rates = parseLiveRates(body);
    if (Object.keys(rates).length === 0) throw new Error('쓸 수 있는 환율이 없다');
    const date = (body as { date?: unknown }).date;
    return { rates, source: 'live', date: typeof date === 'string' ? date : undefined };
  } catch (e) {
    return { rates: {}, source: 'fallback', error: e instanceof Error ? e.message : String(e) };
  }
}

/** 환산이 근사치인지 (UI에서 '≈' 표기를 붙이기 위해) */
export function isApproximate(currency: Currency | null): boolean {
  return (currency ?? 'KRW') !== 'KRW';
}

export { FALLBACK_RATES, FOREIGN_TX_FEE_RATE };
