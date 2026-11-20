import { describe, expect, it } from 'vitest';
import { FALLBACK_RATES, parseLiveRates, toKrw } from '@/lib/fx';

describe('실시간 환율 파싱', () => {
  it('1원당 외화를 1 외화당 원화로 뒤집는다', () => {
    const rates = parseLiveRates({
      base: 'KRW',
      date: '2026-11-19',
      rates: { EUR: 0.00068482, JPY: 0.12042, USD: 0.00075276 },
    });
    expect(rates.JPY).toBeCloseTo(8.3043, 3);
    expect(rates.USD).toBeCloseTo(1328.44, 1);
    expect(rates.EUR).toBeCloseTo(1460.24, 1);
  });

  it('말이 안 되는 값은 버린다', () => {
    const rates = parseLiveRates({ rates: { USD: 0, JPY: -1, EUR: 1 } });
    expect(rates).toEqual({});
  });

  it('응답 모양이 이상해도 던지지 않는다', () => {
    expect(parseLiveRates(null)).toEqual({});
    expect(parseLiveRates({})).toEqual({});
    expect(parseLiveRates({ rates: { USD: 'x' } })).toEqual({});
  });

  it('엔화 75,000엔은 실시간 환율이면 약 63만원이다 (11/18 SKYCLINIC)', () => {
    const krw = toKrw(75_000, 'JPY', { rates: { JPY: 8.3574 } });
    expect(krw).toBe(634_326);
  });

  it('폴백 엔화 환율이 옛 9.2보다 현실에 가깝다', () => {
    expect(FALLBACK_RATES.JPY).toBeLessThan(9);
  });
});
