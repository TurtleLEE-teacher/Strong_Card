/**
 * 적재 감시 — 카드 문자가 노션까지 오는 길이 살아 있는지 본다.
 *
 * 2026-10 사고: Make 시나리오가 해외취소 문자(JPY -590)의 금액을 못 읽어
 * 오류를 냈고, 웹훅으로 시작하는 시나리오는 오류 한 번에 꺼진다. 그 뒤
 * 7일 동안 적재가 0건이었는데 아무도 몰랐다. 지금은 오류가 나도 시나리오가
 * 꺼지지 않고 원문만 담은 `[파싱 실패]` 행을 남긴다. 그러면 이번에는 실패가
 * 조용히 쌓인다. 그래서 두 가지를 본다.
 *
 *   적재 공백   마지막 문자 적재 뒤 48시간 → 폰·Make·노션 어디가 멈췄든 잡힌다
 *   파싱 실패   `[파싱 실패]` 행이 새로 생김 → 길은 살아 있는데 그 결제는 빠졌다
 *
 * 순수 함수만 둔다. 조회·발송·기록은 ingest-watch.ts가 한다.
 */

import { isWithinHours } from '@/lib/date';
import { dateTimeShort } from '@/lib/format';

/**
 * 이 시간 동안 문자 적재가 없으면 알린다.
 *
 * 실측 2026-08~10 (문자 거래 297건, 하루 4.2건): 거래 간격 p99가 46시간,
 * 최장이 68시간(9/27 일요일 밤 → 9/30 수요일 오후)이었다. 48시간이면 70일
 * 동안 헛경보가 3번(대략 월 1회)이고, 7일을 모르고 지나간 이번 사고는
 * 2일 안에 잡힌다. 72시간이면 헛경보는 없지만 하루를 더 모른다.
 */
export const INGEST_GAP_HOURS = 48;

/**
 * 공백 알림을 보내지 않는 시간대 (KST, [start, end)).
 *
 * 급한 알림이 아니다. 시나리오가 꺼진 동안의 문자는 Make 대기열에, 폰이
 * 멈춘 동안의 문자는 문자함에 남는다. 새벽에 울리는 알림은 결국 꺼 버리게
 * 만든다.
 */
export const QUIET_HOURS = { start: 22, end: 8 } as const;

/** Make 오류 경로가 원문만 담아 만드는 행의 `사용 내역` */
export const PARSE_FAILURE_TITLE = '[파싱 실패]';

export type WatchAlertType = '적재공백' | '파싱실패';

export interface WatchAlert {
  /** 멱등 키. 적재 공백은 이 키로 Alert_Log에서 중복을 막는다. */
  key: string;
  type: WatchAlertType;
  title: string;
  body: string;
  /** 알림 탭 시 열 경로 */
  url: string;
}

export interface ParseFailure {
  id: string;
  rawMessage: string | null;
}

export function hoursSince(isoUtc: string, now: Date): number {
  return (now.getTime() - new Date(isoUtc).getTime()) / 3_600_000;
}

/**
 * 마지막 적재 시각을 보고 공백 알림을 만든다. 보낼 게 없으면 null.
 *
 * @param lastIngestedAt 문자에서 온 행 가운데 가장 최근 행의 생성 시각(UTC ISO)
 */
export function evaluateIngestGap(
  lastIngestedAt: string | null,
  now: Date = new Date(),
): WatchAlert | null {
  // 적재 이력이 아예 없으면 견줄 기준이 없다. 데모·초기 상태다.
  if (!lastIngestedAt) return null;

  const gap = hoursSince(lastIngestedAt, now);
  if (gap < INGEST_GAP_HOURS) return null;
  if (isWithinHours(now.toISOString(), QUIET_HOURS.start, QUIET_HOURS.end)) return null;

  return {
    // 마지막 적재 시각이 곧 '이번 공백'의 이름이다. 같은 공백에는 한 번만
    // 울리고, 문자가 한 건이라도 들어오면 키가 바뀌어 다음 공백을 다시 잡는다.
    key: `ingest-gap:${lastIngestedAt}`,
    type: '적재공백',
    title: `카드 문자 적재가 ${Math.floor(gap)}시간째 없습니다`,
    body:
      `마지막 적재 ${dateTimeShort(lastIngestedAt)}. ` +
      'Make 시나리오가 켜져 있는지, 폰 MacroDroid가 도는지 확인하세요.',
    url: '/settings',
  };
}

/**
 * 새로 생긴 파싱 실패 행을 알림 하나로 묶는다. 없으면 null.
 *
 * 여러 건이 한꺼번에 와도 한 통만 보낸다. 대기열이 풀리면서 실패가 몰려
 * 들어오는 경우가 있다(2026-10-11 해외취소 4건).
 */
export function buildParseFailureAlert(failures: readonly ParseFailure[]): WatchAlert | null {
  if (failures.length === 0) return null;

  const more = failures.length > 1 ? ` 외 ${failures.length - 1}건` : '';
  return {
    key: `parse-failure:${failures.map((f) => f.id).join(',')}`,
    type: '파싱실패',
    title: `카드 문자 ${failures.length}건을 읽지 못했습니다`,
    body:
      `${summarizeRaw(failures[0].rawMessage)}${more}. ` +
      `노션 Card_Transactions에서 사용 내역이 ${PARSE_FAILURE_TITLE}인 행을 고쳐 주세요.`,
    url: '/settings',
  };
}

/** 원문을 알림 한 줄로 줄인다. '[Web발신]' 머리와 줄바꿈을 걷어낸다. */
export function summarizeRaw(raw: string | null): string {
  if (!raw) return '원문 없음';
  const line = raw
    .replace(/\[Web발신\]/g, '')
    .split(/\s*\n\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
  if (!line) return '원문 없음';
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}
