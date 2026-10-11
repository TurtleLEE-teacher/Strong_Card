/**
 * 적재 감시 판정.
 *
 * 2026-10 사고에서 Make 시나리오가 꺼진 채 7일 동안 적재가 0건이었는데
 * 아무도 몰랐다. 이 테스트는 "그때 이 감시가 있었다면 언제 울렸나"를
 * 실제 시각으로 고정한다.
 */

import { describe, expect, it } from 'vitest';
import {
  INGEST_GAP_HOURS,
  buildParseFailureAlert,
  evaluateIngestGap,
  summarizeRaw,
} from '@/lib/alerts/ingest';

/** KST 'YYYY-MM-DD HH:mm' → Date */
const kst = (s: string) => new Date(`${s.replace(' ', 'T')}:00+09:00`);

// 사고 직전 마지막 적재: 10/4 13:41 KST (귀국 직후 UBER 1건)
const LAST = kst('2026-10-04 13:41').toISOString();

describe('적재 공백', () => {
  it(`${INGEST_GAP_HOURS}시간이 안 됐으면 울리지 않는다`, () => {
    expect(evaluateIngestGap(LAST, kst('2026-10-06 13:40'))).toBeNull();
  });

  it('이번 사고였다면 10/6 13:41에 울렸다 (실제로는 10/11에 알았다)', () => {
    const alert = evaluateIngestGap(LAST, kst('2026-10-06 13:41'));
    expect(alert?.type).toBe('적재공백');
    expect(alert?.title).toBe('카드 문자 적재가 48시간째 없습니다');
    expect(alert?.body).toContain('마지막 적재 10/4 13:41');
  });

  it('밤 10시~아침 8시에는 미뤘다가 8시에 보낸다', () => {
    const late = kst('2026-10-04 21:30').toISOString();
    expect(evaluateIngestGap(late, kst('2026-10-06 21:29'))).toBeNull(); // 48시간 전
    expect(evaluateIngestGap(late, kst('2026-10-06 21:45'))).not.toBeNull(); // 아직 22시 전
    expect(evaluateIngestGap(late, kst('2026-10-06 23:00'))).toBeNull();
    expect(evaluateIngestGap(late, kst('2026-10-07 07:59'))).toBeNull();
    expect(evaluateIngestGap(late, kst('2026-10-07 08:00'))).not.toBeNull();
  });

  it('같은 공백에는 같은 키 — 크론이 몇 번 돌아도 한 번만 나간다', () => {
    const a = evaluateIngestGap(LAST, kst('2026-10-06 14:00'));
    const b = evaluateIngestGap(LAST, kst('2026-10-08 10:00'));
    expect(a?.key).toBe(b?.key);
  });

  it('문자가 한 건이라도 들어오면 키가 바뀌어 다음 공백을 다시 잡는다', () => {
    const next = kst('2026-10-11 14:01').toISOString();
    const a = evaluateIngestGap(LAST, kst('2026-10-06 14:00'));
    const b = evaluateIngestGap(next, kst('2026-10-13 15:00'));
    expect(b).not.toBeNull();
    expect(a?.key).not.toBe(b?.key);
  });

  it('적재 이력이 없으면 판정하지 않는다', () => {
    expect(evaluateIngestGap(null, kst('2026-10-06 14:00'))).toBeNull();
  });

  it('실측 최장 정상 공백 68시간 가운데 48시간 넘는 구간은 울린다 (월 1회 수준의 헛경보를 감수한다)', () => {
    // 9/27 일 21:23 → 9/30 수 17:31. 카드를 안 쓴 사흘이었다.
    const quiet = kst('2026-09-27 21:23').toISOString();
    expect(evaluateIngestGap(quiet, kst('2026-09-29 21:24'))).not.toBeNull();
  });
});

describe('파싱 실패', () => {
  const raw = '[Web발신]\n[재발송]삼성2055해외취소 이*석\nJPY -590\n10/03 10:06 UBER';

  it('없으면 울리지 않는다', () => {
    expect(buildParseFailureAlert([])).toBeNull();
  });

  it('한 건이면 원문을 한 줄로 보여 준다', () => {
    const alert = buildParseFailureAlert([{ id: 'p1', rawMessage: raw }]);
    expect(alert?.type).toBe('파싱실패');
    expect(alert?.title).toBe('카드 문자 1건을 읽지 못했습니다');
    expect(alert?.body).toContain('[재발송]삼성2055해외취소 이*석 · JPY -590 · 10/03 10:06 UBER');
    expect(alert?.body).toContain('[파싱 실패]');
  });

  it('여러 건이 몰려도 한 통으로 묶는다', () => {
    const alert = buildParseFailureAlert([
      { id: 'p1', rawMessage: raw },
      { id: 'p2', rawMessage: null },
      { id: 'p3', rawMessage: null },
    ]);
    expect(alert?.title).toBe('카드 문자 3건을 읽지 못했습니다');
    expect(alert?.body).toContain('외 2건');
  });
});

describe('원문 요약', () => {
  it('비었으면 원문 없음', () => {
    expect(summarizeRaw(null)).toBe('원문 없음');
    expect(summarizeRaw('[Web발신]\n')).toBe('원문 없음');
  });

  it('길면 60자에서 자른다', () => {
    const long = 'ㄱ'.repeat(100);
    const out = summarizeRaw(long);
    expect(out).toHaveLength(60);
    expect(out.endsWith('…')).toBe(true);
  });
});
