import { ISSUER_BRAND } from '@/config/issuers';
import type { Issuer } from '@/lib/types';

/**
 * 미니 카드 아트.
 *
 * 실제 카드 이미지를 쓰려면 카드사 저작물을 받아 와야 하고, 상품이 바뀔
 * 때마다 갈아 끼워야 한다. 대신 **카드사 브랜드 색 + 표기 + 뒷 4자리**로
 * 카드 면을 흉내 낸다 — 지갑에서 카드를 집을 때 쓰는 단서 그대로다.
 *
 * 가로:세로는 실제 신용카드 비율(85.6 × 53.98 ≈ 1.586)을 따른다.
 * 비율이 어긋나면 카드로 안 읽힌다.
 *
 * 색 스와치가 아니라 라벨이 붙은 그림이므로 카테고리 팔레트 검증 대상이
 * 아니다. 다만 위에 얹는 글자는 흰색 고정이라 어두운 브랜드 색만 쓴다.
 */
export function CardFace({
  issuer,
  last4,
  seriesColor,
}: {
  issuer: Issuer;
  last4: string[];
  /** 카드별 정체성 색. 카드 면 아래쪽에 가는 띠로 넣는다. */
  seriesColor: string;
}) {
  const brand = ISSUER_BRAND[issuer];

  return (
    <span
      aria-hidden
      className="relative flex shrink-0 flex-col justify-between overflow-hidden rounded-[5px] px-1.5 py-1"
      style={{ width: 44, height: 28, background: brand.color }}
    >
      <span
        className="text-[7px] font-bold leading-none tracking-wide"
        style={{ color: 'rgba(255,255,255,0.95)' }}
      >
        {brand.mark}
      </span>
      <span
        className="text-[7px] leading-none tabular"
        style={{ color: 'rgba(255,255,255,0.7)' }}
      >
        ··{last4[0]}
      </span>
      {/* 카드사가 같은 카드가 두 장씩 있다(국민·신한). 카드 면만으로는
          구분이 안 되므로 카드별 정체성 색을 띠로 얹는다. */}
      <span
        className="absolute inset-x-0 bottom-0"
        style={{ height: 3, background: seriesColor }}
      />
    </span>
  );
}
