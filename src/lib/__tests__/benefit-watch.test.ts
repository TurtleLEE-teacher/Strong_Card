/**
 * 카드 혜택 월간 감시 (scripts/benefit-watch.mjs).
 *
 * 감시 목록은 **관리 중인 카드와 정확히 같아야 한다.** 안 쓰는 카드가 섞이면
 * 그 카드 안내문이 바뀔 때마다 사용자 API 키로 돈이 나간다. 반대로 관리
 * 카드가 빠지면 그 카드 혜택이 바뀌어도 아무도 모른다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIVE_CARDS, CARDS } from '@/config/cards';
import {
  Budget,
  applyEdits,
  cardGorillaToLines,
  hashLines,
  htmlToLines,
  lineDiff,
  parsePatch,
  parseTriage,
  wonText,
} from '../../../scripts/benefit-watch-lib.mjs';

interface WatchSource {
  type: 'html' | 'cardgorilla';
  label: string;
  url?: string;
  id?: number;
}
interface WatchCard {
  cardId: string;
  configFile: string;
  sources: WatchSource[];
}

const watch = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src/config/benefit-watch.json'), 'utf8'),
) as { cards: WatchCard[] };

describe('감시 목록 = 관리 중인 카드', () => {
  it('active 카드만, 빠짐없이 들어 있다', () => {
    const watched = watch.cards.map((c) => c.cardId).sort();
    expect(watched).toEqual(ACTIVE_CARDS.map((c) => c.id).sort());
  });

  it('비활성 카드는 감시하지 않는다', () => {
    const inactive = new Set<string>(CARDS.filter((c) => !c.active).map((c) => c.id));
    for (const c of watch.cards) expect(inactive.has(c.cardId), c.cardId).toBe(false);
  });

  it('설정 파일이 있고 그 파일의 카드 id가 맞다', () => {
    for (const c of watch.cards) {
      const text = readFileSync(path.join(process.cwd(), 'src/config/cards', c.configFile), 'utf8');
      expect(text, c.configFile).toContain(`id: '${c.cardId}'`);
    }
  });

  it('카드마다 출처가 하나 이상, 형식이 맞다', () => {
    for (const c of watch.cards) {
      expect(c.sources.length, c.cardId).toBeGreaterThan(0);
      for (const s of c.sources) {
        if (s.type === 'html') expect(s.url, c.cardId).toMatch(/^https:\/\//);
        else expect(Number.isInteger(s.id), c.cardId).toBe(true);
      }
    }
  });
});

describe('안내문 읽기', () => {
  it('HTML 블록 경계를 줄로 남기고 스크립트·엔티티를 정리한다', () => {
    const lines = htmlToLines(
      '<div>메뉴</div><script>var x=1</script><p>커피 10%&nbsp;할인</p><li>월 5,000원&amp;한도</li><p>푸터</p>',
      { start: '커피', end: '푸터' },
    );
    expect(lines).toEqual(['커피 10% 할인', '월 5,000원&한도']);
  });

  it('카드고릴라 응답은 혜택만 본다 (이벤트·배너는 무시)', () => {
    const lines = cardGorillaToLines({
      name: '쿠팡 와우카드',
      corp: { name: 'KB국민카드' },
      is_discon: false,
      pre_month_money: 0,
      event: { title: '매달 바뀌는 배너' },
      key_benefit: [{ title: '적립', comment: '쿠팡 2%', info: '<p>월 2만원</p>' }],
    });
    expect(lines.join('\n')).toContain('## 적립: 쿠팡 2%');
    expect(lines.join('\n')).toContain('월 2만원');
    expect(lines.join('\n')).not.toContain('배너');
  });

  it('같은 내용이면 해시가 같다', () => {
    expect(hashLines(['a', 'b'])).toBe(hashLines(['a', 'b']));
    expect(hashLines(['a', 'b'])).not.toBe(hashLines(['a', 'c']));
  });

  it('바뀐 줄만 골라낸다', () => {
    expect(lineDiff(['쿠팡 2%', '그 외 0.2%'], ['쿠팡 3.5%', '그 외 0.2%'])).toEqual({
      removed: ['쿠팡 2%'],
      added: ['쿠팡 3.5%'],
    });
  });
});

describe('비용 상한', () => {
  it('최악의 비용이 상한을 넘으면 부르지 않는다', () => {
    const b = new Budget(0.1);
    // sonnet: 입력 10,000 × 3달러 + 출력 8,000 × 15달러 = 0.15달러
    expect(b.canSpend('claude-sonnet-x', 10_000, 8_000)).toBe(false);
    // haiku: 입력 2,000 × 1달러 + 출력 400 × 5달러 = 0.004달러
    expect(b.canSpend('claude-haiku-x', 2_000, 400)).toBe(true);
  });

  it('실제 사용량을 누적한다', () => {
    const b = new Budget(1);
    b.record('claude-haiku-x', { input_tokens: 1_000_000, output_tokens: 0 }, 't');
    expect(b.spentUsd).toBeCloseTo(1, 6);
    expect(b.canSpend('claude-haiku-x', 10, 10)).toBe(false);
  });

  it('모르는 모델은 가장 비싸게 본다', () => {
    const b = new Budget(0.05);
    expect(b.canSpend('mystery-model', 1_000, 1_000)).toBe(false);
  });

  it('원화는 약어 없이 쓴다', () => {
    expect(wonText(1)).toBe('약 1,400원');
  });
});

describe('모델 응답 적용', () => {
  it('찾아 바꾸기는 원문이 정확히 한 번 나올 때만 적용한다', () => {
    const src = "rate: 0.02,\ncapPerMonth: 20_000,\n";
    expect(applyEdits(src, [{ old: 'rate: 0.02,', new: 'rate: 0.035,' }]).text).toContain('0.035');
    const missing = applyEdits(src, [{ old: 'rate: 0.05,', new: 'x' }]);
    expect(missing.ok).toBe(false);
    const dup = applyEdits('a a', [{ old: 'a', new: 'b' }]);
    expect(dup.ok).toBe(false);
  });

  it('수정안 응답을 읽는다', () => {
    const p = parsePatch(
      '<status>patched</status>\n<summary>- 쿠팡 3.5%</summary>\n<edit><old>\nrate: 0.02,\n</old><new>\nrate: 0.035,\n</new></edit>',
    );
    expect(p.status).toBe('patched');
    expect(p.edits).toEqual([{ old: 'rate: 0.02,', new: 'rate: 0.035,' }]);
  });

  it('분류 응답을 못 읽으면 변경으로 본다 (놓치는 쪽보다 안전)', () => {
    expect(parseTriage('{"relevant": false, "summary": "배너만 바뀜"}').relevant).toBe(false);
    expect(parseTriage('???').relevant).toBe(true);
  });
});
