import type { CardMonthlySnapshot, Transaction } from '@/lib/types';
import { ACTIVE_CARDS } from '@/config/cards';
import { knownSpendFor } from '@/config/manual-spend';
import { buildAllSnapshots } from '@/lib/engine/snapshot';
import type { MonthKey } from '@/lib/date';

/**
 * 실데이터(Notion)로 스냅샷을 조립하는 **유일한** 입구.
 *
 * 화면(data.ts)·동기화 크론·알림 크론이 각자 buildAllSnapshots를 부르던
 * 시절, 화면만 수동 전월실적(manual-spend)을 넘기고 크론 둘은 빼먹었다.
 * 7월 노션 거래가 탄탄대로 1건(2,500원)뿐이던 8월, 화면은 80만 구간으로
 * 혜택을 보여주는데 크론은 '실적 미달'로 계산해 8월 거래 34건 전부를
 * 노션에 혜택 0원·'대상아님'으로 써 버렸고 푸시는 한 통도 안 나갔다.
 *
 * 호출 지점이 셋이라는 게 문제였다. 인자가 한 군데에만 있으면 빠질 곳이 없다.
 */
export function buildLiveSnapshots(
  transactions: Transaction[],
  month: MonthKey,
): CardMonthlySnapshot[] {
  return buildAllSnapshots(ACTIVE_CARDS, transactions, month, knownSpendFor);
}
