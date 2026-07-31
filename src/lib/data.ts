import 'server-only';

import type { CardMonthlySnapshot, Transaction } from '@/lib/types';
import { ACTIVE_CARDS } from '@/config/cards';
import { buildAllSnapshots, findUnmappedTransactions } from '@/lib/engine/snapshot';
import { currentMonthKey, daysRemainingInMonth, type MonthKey } from '@/lib/date';
import { DEMO_TRANSACTIONS } from '@/lib/demo-data';
import { manualPreviousSpend } from '@/config/manual-spend';

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
  daysRemaining: number;
  /** Notion 대신 데모 데이터를 쓰고 있는지 */
  isDemo: boolean;
  /** Notion 조회 실패 시 사유 */
  error: string | null;
}

export async function getDashboardData(month?: MonthKey): Promise<DashboardData> {
  const targetMonth = month ?? currentMonthKey();
  const daysRemaining = daysRemainingInMonth();

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
      isDemo ? {} : manualPreviousSpend(),
    ),
    unmapped: findUnmappedTransactions(transactions, targetMonth),
    transactions,
    daysRemaining,
    isDemo,
    error,
  };
}
