/**
 * 취소·환불 전표(음수 금액) 처리.
 *
 * 노션에는 취소가 **원거래와 별개의 음수 행**으로 들어온다. 원거래 행은
 * 지워지지 않고 그대로 남는다. 그래서 음수 행을 그냥 버리면 두 가지가
 * 동시에 틀어진다.
 *
 *   실적  원거래의 양수만 남아 실적이 부풀어 오른다
 *   혜택  이미 소진된 한도가 영원히 돌아오지 않는다
 *
 * 음수 행은 '버릴 것'이 아니라 **원거래를 되감는 전표**다. 부호가 유일한
 * 판별 기준이고, 세 갈래는 서로 겹치지 않는다:
 *
 *   금액 < 0             → 취소 전표     → 실적에서 상계, 혜택 회수
 *   금액 ≥ 0 + 취소 표시  → 원거래 무효   → 전액 제외, 혜택 없음
 *   금액 ≥ 0             → 정상 거래
 *
 * 가운데 갈래는 카드사가 취소를 별도 전표로 주지 않고 원거래에 취소
 * 표시만 남기는 경우다. 이때는 뺄 음수가 없으므로 원거래를 통째로
 * 빼는 게 맞다. 둘을 같은 코드로 처리하면 한쪽은 반드시 이중 차감된다.
 */

import type { Transaction } from '@/lib/types';
import { normalizeMerchant } from '@/config/merchants';

/** 이 거래가 취소 전표인가. 부호가 전부다. */
export function isReversal(tx: Transaction): boolean {
  return tx.krwAmount < 0;
}

export interface ReversalLink {
  /** 되감는 원거래의 id */
  originalId: string;
  /** 원거래의 남은 금액을 전부 되감았는가 (= 부분취소가 아니다) */
  full: boolean;
  /** 되감은 금액 (양수) */
  amount: number;
  /** 원거래의 원래 금액 */
  originalAmount: number;
}

/**
 * 취소 전표를 붙일 가맹점 키.
 *
 * 취소 문자에는 '취소'·'환불' 같은 말머리가 붙는 일이 잦다. 그대로
 * 정규화하면 원거래와 다른 문자열이 되어 짝을 못 찾는다.
 */
function merchantKey(tx: Transaction): string {
  const raw = [tx.title, tx.merchant].filter(Boolean).join(' ');
  return normalizeMerchant(raw)
    .split('승인취소')
    .join('')
    .split('취소')
    .join('')
    .split('환불')
    .join('');
}

/**
 * 취소 전표를 원거래에 짝지어 준다.
 *
 * 실적 엔진과 혜택 엔진이 **같은 짝짓기 결과**를 봐야 한다. 각자 따로
 * 매칭하면 "실적에서는 상계됐는데 혜택은 회수 안 된" 상태가 생긴다.
 * 그래서 순수 함수 하나로 뽑아 두 곳에서 같이 부른다.
 *
 * 규칙:
 * - 가맹점 키가 같고, **취소보다 먼저 승인된** 거래만 후보다.
 * - 아직 취소되지 않고 남은 금액이 취소액 이상인 것만 후보다.
 *   (부분취소가 여러 번 들어와도 잔액을 따라가며 맞춘다)
 * - 금액이 딱 맞는 것을 먼저 고르고, 없으면 가장 최근 것을 고른다.
 *   카드사는 보통 마지막 승인건부터 취소한다.
 *
 * 짝을 못 찾으면 아예 링크를 만들지 않는다. **지난달 결제를 이번 달에
 * 취소한 경우가 여기 걸린다** — 그 혜택은 지난달 한도에서 나갔으므로
 * 이번 달 한도를 되돌리면 이번 달 소진량이 실제보다 작아진다.
 * 모르는 채로 두는 편이 틀리게 되돌리는 것보다 낫다.
 */
export function linkReversals(transactions: Transaction[]): Map<string, ReversalLink> {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.approvedAt).getTime() - new Date(b.approvedAt).getTime(),
  );

  /** 원거래별 '아직 취소되지 않은 금액'. 등록된 것 = 이미 지나온 거래. */
  const remaining = new Map<string, number>();
  const links = new Map<string, ReversalLink>();

  for (const tx of sorted) {
    if (!isReversal(tx)) {
      // 취소 표시가 붙은 원거래는 이미 통째로 무효다. 여기에 음수를 또
      // 붙이면 이중 차감이 된다.
      if (!tx.canceled && tx.paymentKind !== '취소·환불') {
        remaining.set(tx.id, tx.krwAmount);
      }
      continue;
    }

    const amount = -tx.krwAmount;
    const original = pickOriginal(sorted, tx, amount, remaining);
    if (!original) continue;

    const left = remaining.get(original.id)!;
    remaining.set(original.id, left - amount);
    links.set(tx.id, {
      originalId: original.id,
      full: left - amount <= 0,
      amount,
      originalAmount: original.krwAmount,
    });
  }

  return links;
}

function pickOriginal(
  sorted: Transaction[],
  reversal: Transaction,
  amount: number,
  remaining: Map<string, number>,
): Transaction | undefined {
  const key = merchantKey(reversal);
  let exact: Transaction | undefined;
  let latest: Transaction | undefined;

  // sorted가 승인 시각 오름차순이라 나중에 덮어쓴 쪽이 항상 더 최근 건이다.
  for (const tx of sorted) {
    const left = remaining.get(tx.id);
    if (left === undefined || left < amount) continue;
    if (merchantKey(tx) !== key) continue;
    if (left === amount) exact = tx;
    latest = tx;
  }

  return exact ?? latest;
}
