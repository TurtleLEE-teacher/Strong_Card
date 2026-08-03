/**
 * 지난달 조회 — 월 키가 URL로 들어오기 시작하면서 필요해진 방어선.
 *
 * 이 앱에서 월 키가 틀리면 화면이 깨지지 않는다. **멀쩡한 모양으로 엉뚱한
 * 달을 보여준다.** 사용자가 알아챌 방법이 없으므로 입구에서 막아야 한다.
 */

import { describe, expect, it } from 'vitest';
import {
  EARLIEST_MONTH,
  currentMonthKey,
  isFutureMonth,
  isMonthKey,
  monthRangeUtc,
  nextMonthKey,
  previousMonthKey,
} from '@/lib/date';
import { cardHref, dashboardHref } from '@/lib/routes';

describe('월 키 검증', () => {
  it('정상 값을 받는다', () => {
    expect(isMonthKey('2026-07')).toBe(true);
    expect(isMonthKey('2026-01')).toBe(true);
    expect(isMonthKey('2026-12')).toBe(true);
  });

  it('13월을 막는다', () => {
    /*
     * 막지 않으면 monthRangeUtc가 `Date.UTC(2026, 12, 1)`을 만들어 2027년
     * 1월 범위를 조용히 돌려준다. 화면은 "2026년 13월"이라고 적힌 채
     * 2027년 1월 거래를 보여주게 된다.
     */
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-00')).toBe(false);
  });

  it('형식이 다르면 막는다', () => {
    expect(isMonthKey('2026-7')).toBe(false);
    expect(isMonthKey('202607')).toBe(false);
    expect(isMonthKey('2026-07-01')).toBe(false);
    expect(isMonthKey('')).toBe(false);
    expect(isMonthKey('../etc/passwd')).toBe(false);
  });

  it('통과한 키는 그 달의 범위를 정확히 만든다', () => {
    // KST 7월 1일 00:00 = UTC 6월 30일 15:00
    const { startUtc, endUtc } = monthRangeUtc('2026-07');
    expect(startUtc.toISOString()).toBe('2026-06-30T15:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-07-31T15:00:00.000Z');
  });
});

describe('오지 않은 달로는 못 간다', () => {
  const now = new Date('2026-08-03T03:00:00Z'); // KST 8월 3일

  it('다음 달은 미래다', () => {
    expect(isFutureMonth('2026-09', now)).toBe(true);
  });

  it('이번 달은 미래가 아니다', () => {
    expect(isFutureMonth('2026-08', now)).toBe(false);
  });

  it('지난달은 미래가 아니다', () => {
    expect(isFutureMonth('2026-07', now)).toBe(false);
    expect(isFutureMonth('2025-12', now)).toBe(false);
  });

  it('KST 자정 경계에서도 달을 넘기지 않는다', () => {
    // UTC 7월 31일 15:00 = KST 8월 1일 00:00 → 이 순간부터 8월이다
    const justAfterMidnight = new Date('2026-07-31T15:00:00Z');
    expect(currentMonthKey(justAfterMidnight)).toBe('2026-08');
    expect(isFutureMonth('2026-08', justAfterMidnight)).toBe(false);

    // 1분 전은 아직 7월이라 8월이 미래다
    const justBefore = new Date('2026-07-31T14:59:00Z');
    expect(currentMonthKey(justBefore)).toBe('2026-07');
    expect(isFutureMonth('2026-08', justBefore)).toBe(true);
  });
});

describe('과거 한계', () => {
  it('한계 자체는 유효한 월 키다', () => {
    // 화면이 이 값으로 '이전' 버튼을 잠그므로, 형식이 깨져 있으면
    // 버튼이 영영 안 열리거나 404로 가는 링크를 만든다.
    expect(isMonthKey(EARLIEST_MONTH)).toBe(true);
  });

  it('한계보다 앞선 달은 문자열 비교로 걸러진다', () => {
    // 라우트가 `month < EARLIEST_MONTH`로 판정한다. 'YYYY-MM'은 자릿수가
    // 고정이라 이 비교가 곧 시간 순서라는 사실에 기대고 있다.
    expect(previousMonthKey(EARLIEST_MONTH) < EARLIEST_MONTH).toBe(true);
    expect(nextMonthKey(EARLIEST_MONTH) < EARLIEST_MONTH).toBe(false);
    // 해가 바뀌어도 순서가 유지된다
    expect('2025-12' < '2026-01').toBe(true);
  });
});

describe('주소 만들기', () => {
  const now = '2026-08';

  it('이번 달은 월 키 없는 기본 주소를 쓴다', () => {
    // 홈 화면에 저장한 아이콘이 8월 화면에 굳어 버리면 안 된다.
    expect(dashboardHref('2026-08', now)).toBe('/');
    expect(cardHref('kb-tantandaero', '2026-08', now)).toBe('/card/kb-tantandaero');
  });

  it('지난달은 경로에 달을 싣는다', () => {
    expect(dashboardHref('2026-07', now)).toBe('/m/2026-07');
    expect(cardHref('kb-tantandaero', '2026-07', now)).toBe('/card/kb-tantandaero/2026-07');
  });

  it('만들어진 주소의 월 키는 라우트 검증을 통과한다', () => {
    // 링크를 만드는 쪽과 받는 쪽이 어긋나면 자기 화면의 자기 링크가 404가
    // 된다. 양쪽이 같은 형식을 쓰는지 여기서 붙잡아 둔다.
    const segment = dashboardHref('2026-07', now).split('/').pop()!;
    expect(isMonthKey(segment)).toBe(true);
  });
});
