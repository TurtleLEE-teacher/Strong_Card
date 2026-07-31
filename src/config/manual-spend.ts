import type { CardId } from '@/lib/types';

/**
 * 전월실적 수동 입력.
 *
 * 왜 필요한가
 * ─────────────────────────────────────────────────────────────────────
 * 이 앱은 전월실적을 **Notion에 쌓인 거래로 직접 계산**한다. 그런데 앱을
 * 막 도입한 시점에는 지난달 거래가 Notion에 하나도 없다. 그러면 전월실적이
 * 0원으로 계산되고, 모든 카드가 '실적 미달'이 되어 혜택이 전부 0원으로
 * 나온다 — 실제 카드는 멀쩡히 할인을 주고 있는데도.
 *
 * 이건 "실적이 모자란 것"이 아니라 "**데이터가 없어서 모르는 것**"이다.
 * 둘을 같은 걸로 취급하면 화면이 거짓말을 한다.
 *
 * 쓰는 법
 * ─────────────────────────────────────────────────────────────────────
 * 카드사 앱에서 본 전월실적을 환경변수에 넣는다. Vercel > Settings >
 * Environment Variables에서 바로 고칠 수 있고, 저장하면 자동 재배포된다.
 *
 *   MANUAL_PREVIOUS_SPEND={"shinhan-discount-plan":820000,"kb-tantandaero":450000}
 *
 * 한 달이 지나 Notion에 지난달 거래가 온전히 쌓이면 이 값은 지워도 된다.
 * 계산값이 있으면 그쪽이 더 정확하다.
 *
 * 우선순위: 수동 입력 > Notion 계산값
 * 수동 입력을 우선하는 이유는, 넣었다는 건 계산값을 믿지 못하겠다는 뜻이기
 * 때문이다. 넣어 놓고 무시당하면 왜 안 되는지 알 길이 없다.
 */
export type ManualPreviousSpend = Partial<Record<CardId, number>>;

let cached: ManualPreviousSpend | null = null;

export function manualPreviousSpend(): ManualPreviousSpend {
  if (cached) return cached;

  const raw = process.env.MANUAL_PREVIOUS_SPEND;
  if (!raw) return (cached = {});

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return (cached = {});
    const out: ManualPreviousSpend = {};
    for (const [key, value] of Object.entries(parsed)) {
      // 숫자가 아니거나 음수면 조용히 버린다. 잘못된 값으로 구간을
      // 올려 버리면 있지도 않은 혜택을 있다고 하게 된다.
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        out[key as CardId] = value;
      }
    }
    return (cached = out);
  } catch {
    // 형식이 깨졌으면 없는 것으로 본다. 화면은 '데이터 없음'으로 뜬다.
    return (cached = {});
  }
}
