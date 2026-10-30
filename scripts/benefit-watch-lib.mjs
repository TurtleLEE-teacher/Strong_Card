/**
 * 카드 혜택 감시, 순수 함수 모음.
 *
 * 네트워크·파일을 건드리지 않는다. 그래야 vitest로 바로 검사할 수 있다.
 * 실제 실행은 scripts/benefit-watch.mjs 가 한다.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// 안내문 → 줄 목록
// ---------------------------------------------------------------------------

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', bull: '•',
  times: '×', ndash: '-', mdash: '-', percnt: '%',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/**
 * HTML을 사람이 읽는 줄 목록으로 바꾼다.
 *
 * 블록 태그 경계를 줄바꿈으로 남긴다. 한 줄로 뭉개면 문장 하나만 바뀌어도
 * '바뀐 줄'이 페이지 전체가 되어, 무엇이 바뀌었는지 보여 줄 수 없다.
 *
 * start / end 를 주면 그 문구가 든 줄 사이만 남긴다 (메뉴·푸터 잡음 제거).
 */
export function htmlToLines(html, { start, end } = {}) {
  const text = decodeEntities(
    String(html)
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|td|th|h[1-6]|dt|dd|section|article|table|ul|ol)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
  let lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
  if (start) {
    const i = lines.findIndex((l) => l.includes(start));
    if (i >= 0) lines = lines.slice(i);
  }
  if (end) {
    const j = lines.findIndex((l) => l.includes(end));
    if (j > 0) lines = lines.slice(0, j);
  }
  return lines;
}

/**
 * 카드고릴라 카드 API 응답 → 줄 목록.
 *
 * 혜택(key_benefit)과 연회비·전월실적만 본다. 배너·이벤트·추천 카드는
 * 매달 바뀌는데 혜택과 상관이 없어, 넣으면 매달 '변경'으로 잡혀 API를 쓴다.
 */
export function cardGorillaToLines(card) {
  const lines = [];
  lines.push(`카드: ${card.name ?? ''} (${card.corp?.name ?? ''})`);
  lines.push(`신규발급 중단: ${card.is_discon ? '예' : '아니오'}`);
  if (card.annual_fee_basic) lines.push(...htmlToLines(`연회비: ${card.annual_fee_basic}`));
  if (card.pre_month_money !== undefined) lines.push(`전월실적: ${card.pre_month_money}`);
  for (const b of card.key_benefit ?? []) {
    lines.push(`## ${b.title ?? ''}: ${String(b.comment ?? '').replace(/\s+/g, ' ').trim()}`);
    lines.push(...htmlToLines(b.info ?? ''));
  }
  return lines;
}

export function hashLines(lines) {
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * 지난번과 이번 줄 목록의 차이. 순서는 따지지 않고 줄 단위로 센다.
 * 바뀐 줄만 모델에 보내야 토큰이 적게 든다.
 */
export function lineDiff(oldLines, newLines) {
  const count = (arr) => {
    const m = new Map();
    for (const l of arr) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const a = count(oldLines);
  const b = count(newLines);
  const removed = [];
  const added = [];
  for (const [l, n] of a) for (let i = 0; i < n - (b.get(l) ?? 0); i += 1) removed.push(l);
  for (const [l, n] of b) for (let i = 0; i < n - (a.get(l) ?? 0); i += 1) added.push(l);
  return { removed, added };
}

/** 길면 앞에서 자른다. 자른 사실을 끝에 남긴다. */
export function clip(s, max) {
  const str = String(s);
  return str.length <= max ? str : `${str.slice(0, max)}\n…(${str.length - max}자 생략)`;
}

// ---------------------------------------------------------------------------
// 비용
// ---------------------------------------------------------------------------

/**
 * 토큰 수 어림. 한글이 섞인 글은 글자당 토큰이 많아 넉넉하게 잡는다.
 * 실제 사용량은 API 응답의 usage로 다시 기록한다.
 */
export function estimateTokens(s) {
  return Math.ceil(String(s).length / 1.5) + 50;
}

/** 모델 계열별 100만 토큰당 달러 (입력, 출력). 모르는 모델은 가장 비싼 값으로 본다. */
export function pricePerMTok(model) {
  const id = String(model).toLowerCase();
  if (id.includes('haiku')) return { input: 1, output: 5 };
  if (id.includes('sonnet')) return { input: 3, output: 15 };
  return { input: 15, output: 75 };
}

/**
 * 한 번 실행에서 쓸 수 있는 돈의 상한.
 *
 * 호출 **전에** 최악의 경우(입력 어림 + max_tokens 전부 출력)를 더해 보고,
 * 넘으면 부르지 않는다. 호출 뒤에는 실제 usage로 고친다.
 */
export class Budget {
  constructor(limitUsd) {
    this.limitUsd = limitUsd;
    this.spentUsd = 0;
    this.calls = [];
  }

  worstCase(model, inputTokens, maxTokens) {
    const p = pricePerMTok(model);
    return (inputTokens * p.input + maxTokens * p.output) / 1e6;
  }

  canSpend(model, inputTokens, maxTokens) {
    return this.spentUsd + this.worstCase(model, inputTokens, maxTokens) <= this.limitUsd;
  }

  record(model, usage, label) {
    const p = pricePerMTok(model);
    const input = usage?.input_tokens ?? 0;
    const output = usage?.output_tokens ?? 0;
    const usd = (input * p.input + output * p.output) / 1e6;
    this.spentUsd += usd;
    this.calls.push({ label, model, input, output, usd });
    return usd;
  }
}

/** 달러 → '약 1,234원' (K·M 약어 없이) */
export function wonText(usd, krwPerUsd = 1400) {
  return `약 ${Math.round(usd * krwPerUsd).toLocaleString('ko-KR')}원`;
}

// ---------------------------------------------------------------------------
// 모델 응답 해석
// ---------------------------------------------------------------------------

function tag(text, name) {
  const m = String(text).match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : null;
}

/** 앞뒤 줄바꿈 하나씩만 벗긴다. 들여쓰기는 원문 일치에 필요하므로 건드리지 않는다. */
function unwrap(s) {
  return s.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}

/** 분류 응답: {"relevant": bool, "summary": "..."} 한 줄 */
export function parseTriage(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return { relevant: true, summary: '분류 응답을 읽지 못해 변경으로 본다' };
  try {
    const j = JSON.parse(m[0]);
    return { relevant: j.relevant !== false, summary: String(j.summary ?? '') };
  } catch {
    return { relevant: true, summary: '분류 응답을 읽지 못해 변경으로 본다' };
  }
}

/** 수정안 응답: <status>, <summary>, <edit><old/><new/></edit>* */
export function parsePatch(text) {
  const status = (tag(text, 'status') ?? '').trim() || 'needs_review';
  const summary = (tag(text, 'summary') ?? '').trim();
  const edits = [];
  for (const m of String(text).matchAll(/<edit>([\s\S]*?)<\/edit>/g)) {
    const oldText = tag(m[1], 'old');
    const newText = tag(m[1], 'new');
    if (oldText === null || newText === null) continue;
    edits.push({ old: unwrap(oldText), new: unwrap(newText) });
  }
  return { status, summary, edits };
}

/**
 * 찾아 바꾸기 묶음을 차례로 적용한다.
 *
 * 원문이 **정확히 한 번** 나올 때만 바꾼다. 0번이면 모델이 원문을 잘못
 * 옮긴 것이고, 2번 이상이면 어느 쪽을 바꿀지 모른다. 둘 다 추측하지 않고
 * 실패로 돌려준다, 틀린 설정이 조용히 들어가는 것보다 낫다.
 */
export function applyEdits(source, edits) {
  let text = source;
  const errors = [];
  edits.forEach((e, i) => {
    if (!e.old) {
      errors.push(`${i + 1}번 수정: 바꿀 원문이 비어 있음`);
      return;
    }
    const n = text.split(e.old).length - 1;
    if (n !== 1) {
      errors.push(`${i + 1}번 수정: 원문이 ${n}번 나옴 (정확히 1번이어야 함)`);
      return;
    }
    text = text.replace(e.old, () => e.new);
  });
  return { ok: errors.length === 0 && edits.length > 0, text, errors };
}
