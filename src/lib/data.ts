import 'server-only';

import type { CardMonthlySnapshot, Transaction } from '@/lib/types';
import { ACTIVE_CARDS } from '@/config/cards';
import { buildAllSnapshots, findUnmappedTransactions } from '@/lib/engine/snapshot';
import { currentMonthKey, daysRemainingInMonth, type MonthKey } from '@/lib/date';
import { DEMO_TRANSACTIONS } from '@/lib/demo-data';
import { knownSpendFor } from '@/config/manual-spend';

/**
 * 대시보드가 필요로 하는 모든 것을 한 번에 조립한다.
 *
 * Notion API는 3 req/s로 제한되므로 화면 컴포넌트가 각자 호출하면 안 된다.
 * 페이지당 한 번만 부르고 결과를 내려보낸다.
 */

export interface DashboardData {
  month: MonthKey;
  snapshots: CardMonthlySnapshot[];
  unmapped: Transaction[];
  transactions: Transaction[];
  /**
   * 이번 달이 끝나기까지 남은 일수.
   *
   * **지난달을 보고 있으면 0이 아니라 null이다.** 0은 '오늘이 말일'이라는
   * 뜻이라 화면이 지난 7월을 열어 놓고 "오늘이 말일", "3일 남음" 같은
   * 재촉을 하게 된다. 이미 끝난 달에는 남은 날이라는 개념이 없다.
   */
  daysRemaining: number | null;
  /** 지금 이 달을 보고 있는가. 월말 경고·재촉은 이때만 뜻이 있다. */
  isCurrentMonth: boolean;
  /**
   * 이 데이터를 Notion에서 읽어온 시각 (UTC ISO).
   *
   * ISR 캐시(300초)에 그대로 얼어붙는 값이라, 화면이 지금 몇 시 기준인지를
   * 정확히 가리킨다. 이게 없으면 사용자는 새로고침 버튼을 눌러도 뭐가
   * 달라졌는지 알 수 없다.
   */
  fetchedAt: string;
  /** Notion 대신 데모 데이터를 쓰고 있는지 */
  isDemo: boolean;
  /** Notion 조회 실패 시 사유 */
  error: string | null;
}

export async function getDashboardData(month?: MonthKey): Promise<DashboardData> {
  const targetMonth = month ?? currentMonthKey();
  const isCurrentMonth = targetMonth === currentMonthKey();
  const daysRemaining = isCurrentMonth ? daysRemainingInMonth() : null;

  let transactions: Transaction[];
  let isDemo = false;
  let error: string | null = null;

  if (!process.env.NOTION_API_KEY) {
    transactions = DEMO_TRANSACTIONS;
    isDemo = true;
  } else {
    try {
      // 동적 import: 토큰이 없는 환경에서 Notion 모듈을 아예 로드하지 않는다.
      const { fetchTransactionsForMonth } = await import('@/lib/notion/transactions');
      transactions = await fetchTransactionsForMonth(targetMonth);
    } catch (e) {
      // 노션이 죽어도 화면은 떠야 한다. 데모로 떨어뜨리되 사유를 표시한다.
      transactions = DEMO_TRANSACTIONS;
      isDemo = true;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    month: targetMonth,
    snapshots: buildAllSnapshots(
      ACTIVE_CARDS,
      transactions,
      targetMonth,
      // 데모 데이터에는 지난달 거래가 들어 있으므로 수동값을 섞지 않는다.
      isDemo ? undefined : knownSpendFor,
    ),
    unmapped: findUnmappedTransactions(transactions, targetMonth),
    transactions,
    daysRemaining,
    isCurrentMonth,
    fetchedAt: new Date().toISOString(),
    isDemo,
    error,
  };
}
