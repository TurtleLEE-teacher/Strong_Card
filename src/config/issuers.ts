import type { Issuer } from '@/lib/types';

/**
 * 카드사 브랜드 표기.
 *
 * 화면에 '탄탄대로'만 뜨면 어느 카드사 건지 한 번 더 생각해야 한다.
 * 지갑에서 카드를 고를 때 먼저 보는 건 카드사다 — 카드사를 앞세운다.
 *
 * `color`는 **카드 면(미니 카드 아트) 전용**이다. 바 색으로는 쓰지 않는다.
 *
 * 왜 브랜드 색을 바에 안 쓰는가:
 *  1. 국내 카드사 브랜드 색이 대부분 파랑 계열이다(삼성 남색, 신한 파랑).
 *     6장을 브랜드 색으로 칠하면 색약에서 서로 붙어 구분이 안 된다.
 *  2. 국민·신한은 각각 카드가 두 장이다. 카드사 색으로만 칠하면 두 장이
 *     같은 색이 되어 카드별 정체성이 사라진다.
 *  3. 현대는 검정이라 채도 하한을 못 넘는다.
 *
 * 그래서 **바는 검증된 카테고리 팔레트**(--series-*)를 그대로 쓰고,
 * 카드사 인지는 미니 카드 아트 + 카드사 이름 텍스트가 맡는다.
 * 카드 면은 데이터 마크가 아니라 라벨 붙은 스와치라서 브랜드 색을 그대로
 * 써도 검증 대상이 아니다 — 위에 얹는 글자만 흰색으로 대비를 맞춘다.
 */
export interface IssuerBrand {
  /** 화면에 쓰는 정식 명칭 */
  label: string;
  /** 미니 카드 아트 배경 */
  color: string;
  /** 카드 면에 얹는 짧은 표기 */
  mark: string;
}

export const ISSUER_BRAND: Record<Issuer, IssuerBrand> = {
  국민: { label: 'KB국민카드', color: '#6B6B63', mark: 'KB' },
  신한: { label: '신한카드', color: '#0046FF', mark: '신한' },
  삼성: { label: '삼성카드', color: '#1428A0', mark: 'SAMSUNG' },
  현대: { label: '현대카드', color: '#1A1A1A', mark: 'HYUNDAI' },
};

export function issuerLabel(issuer: Issuer): string {
  return ISSUER_BRAND[issuer].label;
}
