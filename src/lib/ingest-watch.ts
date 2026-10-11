import 'server-only';

import { currentMonthKey } from '@/lib/date';
import {
  buildParseFailureAlert,
  evaluateIngestGap,
  hoursSince,
  type WatchAlert,
} from '@/lib/alerts/ingest';
import { sendPayload, type SendResult } from '@/lib/push';
import { hasAlertKey, recordWatchAlert } from '@/lib/notion/alerts';
import { fetchLastIngestedAt, fetchUnnotifiedParseFailures } from '@/lib/notion/ingest';
import { writeDerivedFields } from '@/lib/notion/transactions';

/**
 * 적재 감시 실행 — 동기화 크론(15분)이 매번 부른다.
 *
 * 판정은 alerts/ingest.ts의 순수 함수가 하고, 여기서는 조회·발송·기록만 한다.
 * 감시가 실패해도 동기화는 계속돼야 하므로 예외를 던지지 않고 errors에 담는다.
 */

export type WatchOutcome = 'none' | 'sent' | 'already-sent' | 'no-device';

export interface IngestWatchResult {
  lastIngestedAt: string | null;
  /** 마지막 적재 뒤 지난 시간 (소수 첫째 자리) */
  gapHours: number | null;
  gapAlert: WatchOutcome;
  /** 이번에 새로 잡은 파싱 실패 행 수 */
  parseFailures: number;
  parseFailureAlert: WatchOutcome;
  errors: string[];
}

export async function runIngestWatch(now: Date = new Date()): Promise<IngestWatchResult> {
  const result: IngestWatchResult = {
    lastIngestedAt: null,
    gapHours: null,
    gapAlert: 'none',
    parseFailures: 0,
    parseFailureAlert: 'none',
    errors: [],
  };

  // 1. 적재 공백 — 같은 공백에는 한 번만. 중복 방지는 Alert_Log 멱등 키로 한다.
  try {
    const last = await fetchLastIngestedAt();
    result.lastIngestedAt = last;
    result.gapHours = last ? Math.round(hoursSince(last, now) * 10) / 10 : null;

    const alert = evaluateIngestGap(last, now);
    if (alert) {
      if (await hasAlertKey(alert.key)) {
        result.gapAlert = 'already-sent';
      } else {
        const sent = await send(alert);
        // 받을 기기가 없으면 이력을 남기지 않는다. 남기면 기기를 등록한 뒤에도
        // 이 공백 알림이 영영 안 온다 (월간 알림과 같은 규칙).
        if (sent.sent > 0) {
          await recordWatchAlert(alert, currentMonthKey(now), true);
          result.gapAlert = 'sent';
        } else {
          result.gapAlert = 'no-device';
        }
      }
    }
  } catch (e) {
    result.errors.push(`ingest-gap: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. 파싱 실패 — 중복 방지는 그 행의 `알림 상태`로 한다 (혜택 알림과 같은 방식).
  try {
    const failures = await fetchUnnotifiedParseFailures();
    result.parseFailures = failures.length;

    const alert = buildParseFailureAlert(failures);
    if (alert) {
      const sent = await send(alert);
      if (sent.sent > 0) {
        for (const failure of failures) {
          await writeDerivedFields(failure.id, { alertStatus: '발송완료' });
        }
        result.parseFailureAlert = 'sent';
      } else {
        // 그대로 두면 다음 크론이 다시 시도한다.
        result.parseFailureAlert = 'no-device';
      }
    }
  } catch (e) {
    result.errors.push(`parse-failure: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

function send(alert: WatchAlert): Promise<SendResult> {
  return sendPayload({
    title: alert.title,
    body: alert.body,
    url: alert.url,
    // 같은 유형끼리는 알림창에서 앞의 것을 대체한다. 공백 알림이 쌓일 일은
    // 없지만, 파싱 실패가 연달아 오면 최신 한 통만 남는 편이 낫다.
    tag: `watch:${alert.type}`,
  });
}
