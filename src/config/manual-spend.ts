import type { CardId } from '@/lib/types';
import type { MonthKey } from '@/lib/date';

/**
 * 실적 수동 입력.
 *
 * 왜 필요한가
 * ─────────────────────────────────────────────────────────────────────
 * 이 앱은 실적을 **Notion에 쌓인 거래로 직접 계산**한다. 그런데 앱을 막
 * 도입한 시점에는 지난달 거래가 Notion에 하나도 없다. 그러면 전월실적이
 * 0원으로 계산되고, 모든 카드가 '실적 미달'이 되어 혜택이 전부 0원으로
 * 나온다 — 실제 카드는 멀쩡히 할인을 주고 있는데도.
 *
 * 이건 "실적이 모자란 것"이 아니라 "**데이터가 없어서 모르는 것**"이다.
 *
 * 왜 '전월'이 아니라 '월'로 받는가
 * ─────────────────────────────────────────────────────────────────────
 * "전월실적"만 받으면 그 값이 어느 달 것인지가 보는 시점에 따라 달라진다.
 * 7월에 넣은 값은 6월 실적을 뜻하고, 8월이 되면 같은 값이 7월 실적으로
 * 둔갑한다. 달이 바뀔 때마다 조용히 틀려지는 구조다.
 *
 * 그래서 **어느 달의 실적인지 못 박아** 저장한다. 8월 화면은 자동으로
 * 2026-07 값을 집어 간다. 손댈 필요가 없다.
 */
export type MonthlySpend = Partial<Record<CardId, number>>;

/**
 * 카드사 앱에서 확인한 월별 실적.
 *
 * 출처: 사용자가 제공한 카드값 앱 화면 (2026-07-31 확인)
 *
 * ⚠️ 이 숫자는 **총 카드 지출**이다. 실적 인정액이 아니다.
 *    세금·공과금·상품권 같은 실적 제외 항목이 섞여 있을 수 있고, 탄탄대로는
 *    Trendy 할인을 받은 건이 실적에서 통째로 빠진다. 그래도 아래 값들은
 *    각 카드의 최고 구간을 크게 넘겨서 구간 판정 결과는 달라지지 않는다.
 *
 *      Discount Plan  2,677,344 → 최고 구간 120만 (147만 여유)
 *      탄탄대로        1,962,580 → 최고 구간  80만 (116만 여유)
 *      Amex Blue        704,385 → 최고 구간  30만 ( 40만 여유)
 *
 *    여유가 빠듯한 달에는 이 값을 그대로 쓰면 구간을 실제보다 높게 잡을 수
 *    있다. 그때는 카드사 앱의 '내 카드 실적 관리'에서 **실적 인정액**을 보고
 *    그 숫자를 넣어야 한다.
 *
 * 참고: 쿠팡 와우 464,540원 — 무실적 카드라 구간 판정에 쓰이지 않아 뺐다.
 *       신한 EV는 카드값 화면의 '나머지 카드 13개'(합계 51,217원)에 묶여
 *       있어 개별 금액을 알 수 없다. 13장 합이 5만원대이므로 30만 구간
 *       미달인 것은 분명하지만, 모르는 값을 지어내지 않고 비워 둔다.
 *
 * 이 표는 Notion에 해당 월 거래가 온전히 쌓이면 지워도 된다.
 * 그때는 계산값이 더 정확하다.
 */
export const KNOWN_MONTHLY_SPEND: Partial<Record<MonthKey, MonthlySpend>> = {
  '2026-07': {
    'shinhan-discount-plan': 2_677_344,
    'kb-tantandaero': 1_962_580,
    'samsung-amex-blue': 704_385,
  },
};

/**
 * 환경변수로도 넣을 수 있다. 배포 없이 고쳐야 할 때 쓴다.
 *
 *   MANUAL_MONTHLY_SPEND={"2026-08":{"shinhan-discount-plan":1200000}}
 *
 * 코드에 박은 값보다 우선한다 — 나중에 넣은 쪽이 더 최신이라고 본다.
 */
let envCache: Partial<Record<MonthKey, MonthlySpend>> | null = null;

function fromEnv(): Partial<Record<MonthKey, MonthlySpend>> {
  if (envCache) return envCache;

  const raw = process.env.MANUAL_MONTHLY_SPEND;
  if (!raw) return (envCache = {});

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return (envCache = {});

    const out: Partial<Record<MonthKey, MonthlySpend>> = {};
    for (const [month, spend] of Object.entries(parsed)) {
      // 'YYYY-MM' 이 아니면 버린다. 형식이 어긋난 키는 영영 안 읽히므로
      // 조용히 무시되느니 아예 없는 편이 낫다.
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      if (typeof spend !== 'object' || spend === null) continue;

      const byCard: MonthlySpend = {};
      for (const [cardId, value] of Object.entries(spend)) {
        // 숫자가 아니거나 음수면 버린다. 잘못된 값으로 구간을 올리면
        // 있지도 않은 혜택을 있다고 하게 된다.
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          byCard[cardId as CardId] = value;
        }
      }
      if (Object.keys(byCard).length > 0) out[month as MonthKey] = byCard;
    }
    return (envCache = out);
  } catch {
    // 형식이 깨졌으면 없는 것으로 본다. 화면은 '기록 없음'으로 뜬다.
    return (envCache = {});
  }
}

/** 그 달의 실적으로 알려진 값. 모르면 undefined. */
export function knownSpendFor(month: MonthKey, cardId: CardId): number | undefined {
  return fromEnv()[month]?.[cardId] ?? KNOWN_MONTHLY_SPEND[month]?.[cardId];
}

/** 그 달에 값이 있는 카드 전체 (설정 화면 표시용) */
export function knownSpendForMonth(month: MonthKey): MonthlySpend {
  return { ...KNOWN_MONTHLY_SPEND[month], ...fromEnv()[month] };
}
