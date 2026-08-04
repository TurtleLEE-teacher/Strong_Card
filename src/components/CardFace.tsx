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
 *
 * 카드별 정체성 색은 **점**으로 얹는다. 예전에는 카드 면 아래쪽에 가로
 * 띠였는데, 바로 옆 혜택 영역이 전부 가로 막대라 그 띠가 '0%짜리 바'나
 * '꽉 찬 바'로 읽혔다. 이 화면에서 가로 막대는 전부 데이터라는 규칙을
 * 정체성 표시가 어기고 있던 것이다. 추천·설정 화면은 이미 점을 쓰고
 * 있었으므로 여기까지 맞춘다.
 */
export function CardFace({
  issuer,
  last4,
  seriesColor,
}: {
  issuer: Issuer;
  last4: string[];
  /** 카드별 정체성 색. 카드 면 오른쪽 아래에 점으로 넣는다. */
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
          구분이 안 되므로 카드별 정체성 색을 점으로 얹는다.

          흰 테를 두르는 이유: 신한 브랜드 색(#0046FF)처럼 밝은 면 위에
          series 색을 그냥 올리면 둘이 붙어 점이 사라진다. 테가 있으면
          어떤 브랜드 색 위에서도 형태가 남는다.

          왼쪽 아래 '··6089'와 겹치지 않게 오른쪽 아래에 둔다. 위쪽은
          'SAMSUNG' 표기가 면 폭을 거의 다 쓴다. */}
      <span
        className="absolute rounded-full"
        style={{
          right: 4,
          bottom: 4,
          width: 6,
          height: 6,
          background: seriesColor,
          boxShadow: '0 0 0 1.5px rgba(255,255,255,0.85)',
        }}
      />
    </span>
  );
}
