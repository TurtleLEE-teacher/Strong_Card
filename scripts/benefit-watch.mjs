#!/usr/bin/env node
/**
 * 카드 혜택 월간 감시.
 *
 * 관리 중인 카드(src/config/benefit-watch.json, 설정 파일 active: true)의
 * 혜택 안내만 한 달에 한 번 확인하고, 바뀐 카드가 있으면 설정 수정안을 만든다.
 * 수정안은 PR로만 올라간다. main 에 넣는 건 사람이 머지할 때다.
 *
 * 비용을 아끼는 순서 (Claude API 는 사용자 본인 키로 과금된다):
 *   1. 안내문을 받아 해시만 비교한다.                    → 0원
 *   2. 처음 보는 안내문은 기준으로만 저장한다.            → 0원
 *   3. 바뀐 카드만 싼 모델(Haiku)로 '혜택 변경인가'를 묻는다. 바뀐 줄만 보낸다.
 *   4. 혜택 변경일 때만 Sonnet 으로 설정 수정안을 만든다. 출력은 찾아 바꾸기만.
 *   5. 매 호출 전에 최악의 비용을 더해 보고 상한(기본 0.5달러)을 넘으면 멈춘다.
 *      수정안은 한 번에 최대 2장(기본)까지다. 나머지는 다음 실행으로 미룬다.
 *
 * 환경 변수
 *   ANTHROPIC_API_KEY             없으면 1~2단계만 하고 변경을 '보류'로 남긴다
 *   BENEFIT_WATCH_BUDGET_USD      한 번 실행의 비용 상한 (기본 0.5)
 *   BENEFIT_WATCH_MAX_PATCH       한 번에 만들 수정안 수 상한 (기본 2)
 *   BENEFIT_WATCH_ONLY            이 카드 id만 (쉼표 구분, 관리 카드 안에서만)
 *   BENEFIT_WATCH_TRIAGE_MODEL    분류 모델 (기본: 최신 haiku)
 *   BENEFIT_WATCH_PATCH_MODEL     수정안 모델 (기본: 최신 sonnet)
 *   BENEFIT_WATCH_STATE           상태 파일 (기본 .benefit-watch/state.json)
 *   BENEFIT_WATCH_OUT             결과 폴더 (기본 .benefit-watch/out)
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  Budget,
  applyEdits,
  cardGorillaToLines,
  clip,
  estimateTokens,
  hashLines,
  htmlToLines,
  lineDiff,
  parsePatch,
  parseTriage,
  wonText,
} from './benefit-watch-lib.mjs';

const ROOT = process.cwd();
const env = process.env;
const API_KEY = env.ANTHROPIC_API_KEY || '';
const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const BUDGET_USD = num(env.BENEFIT_WATCH_BUDGET_USD, 0.5);
const MAX_PATCH = num(env.BENEFIT_WATCH_MAX_PATCH, 2);
const ONLY = (env.BENEFIT_WATCH_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const STATE_FILE = path.resolve(ROOT, env.BENEFIT_WATCH_STATE || '.benefit-watch/state.json');
const OUT_DIR = path.resolve(ROOT, env.BENEFIT_WATCH_OUT || '.benefit-watch/out');
const UA = 'Mozilla/5.0 (compatible; StrongCardBenefitWatch/1.0; +https://github.com/TurtleLEE-teacher/Strong_Card)';
const TRIAGE_MAX_TOKENS = 400;
const PATCH_MAX_TOKENS = 8000;

const read = (p) => readFileSync(path.resolve(ROOT, p), 'utf8');
const now = new Date().toISOString();
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------------------
// 안내문 가져오기
// ---------------------------------------------------------------------------

async function fetchSource(src) {
  if (src.type === 'cardgorilla') {
    const r = await fetch(`https://api.card-gorilla.com:8080/v1/cards/${src.id}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lines = cardGorillaToLines(await r.json());
    return { key: `cardgorilla:${src.id}`, url: `https://www.card-gorilla.com/card/detail/${src.id}`, lines };
  }
  if (src.type === 'html') {
    const r = await fetch(src.url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lines = htmlToLines(await r.text(), { start: src.start, end: src.end });
    return { key: `html:${src.url}`, url: src.url, lines };
  }
  throw new Error(`모르는 출처 종류 ${src.type}`);
}

/**
 * 잠깐 끊기는 연결은 다시 시도한다. 카드사 사이트는 해외(GitHub 러너)에서
 * 가끔 연결을 끊는다(2026-10-30 신한카드 'fetch failed').
 */
async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw last;
}

const errText = (e) =>
  e instanceof Error ? `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ''}` : String(e);

/** 위에서부터 시도해 처음 성공한 출처 하나. 혜택 단어가 하나도 없으면 실패로 본다(오류 페이지). */
async function fetchFirst(sources) {
  const errors = [];
  for (const src of sources) {
    try {
      const got = await withRetry(() => fetchSource(src));
      const body = got.lines.join('\n');
      if (got.lines.length < 3 || !/적립|할인|캐시백|포인트|혜택/.test(body)) {
        throw new Error('혜택 문구가 없는 응답 (오류·차단 페이지로 봄)');
      }
      return { ...got, label: src.label, errors };
    } catch (e) {
      errors.push(`${src.label}: ${errText(e)}`);
    }
  }
  return { errors };
}

// ---------------------------------------------------------------------------
// Claude API
// ---------------------------------------------------------------------------

async function listModels() {
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`모델 목록 ${r.status}: ${j?.error?.message ?? ''}`);
  return (j.data ?? []).map((m) => m.id); // 최신순
}

async function pickModels() {
  let triage = env.BENEFIT_WATCH_TRIAGE_MODEL || '';
  let patch = env.BENEFIT_WATCH_PATCH_MODEL || '';
  if (!triage || !patch) {
    const ids = await listModels();
    triage ||= ids.find((id) => id.includes('haiku')) ?? '';
    patch ||= ids.find((id) => id.includes('sonnet')) ?? '';
  }
  if (!triage || !patch) throw new Error('쓸 수 있는 haiku·sonnet 모델을 찾지 못함');
  return { triage, patch };
}

async function claude(budget, label, model, system, user, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(240_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${j?.error?.message ?? ''}`);
  budget.record(model, j.usage, label);
  const text = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { text, stop: j.stop_reason };
}

// ---------------------------------------------------------------------------
// 프롬프트
// ---------------------------------------------------------------------------

const TRIAGE_SYSTEM = [
  '너는 신용카드 혜택 안내문의 변경을 분류한다.',
  '아래는 한 카드 안내 페이지에서 지난번 대비 빠진 줄과 새 줄이다.',
  '이 카드를 이미 가진 회원이 받는 혜택이 바뀌었으면 relevant=true 다.',
  '혜택이란 적립·할인율, 월 한도, 전월실적 구간, 대상 가맹점·업종, 제외 대상, 적용 기간, 연회비를 말한다.',
  '디자인·문구 다듬기·광고·추천 카드·신규 발급 회원 한정이나 응모형 이벤트만 바뀌었으면 false 다.',
  'JSON 한 줄로만 답한다: {"relevant": true 또는 false, "summary": "한국어 한 문장"}',
].join('\n');

const PATCH_SYSTEM = [
  '너는 개인용 카드 혜택 앱 Strong_Card 의 카드 설정 파일(TypeScript)을 고친다.',
  '앱은 이 설정으로 거래마다 적립·할인과 월 한도를 계산한다. 숫자 하나가 틀리면 화면 전체가 틀린 말을 한다.',
  '',
  '원칙',
  '1. 이 앱은 카드를 **이미 가진** 사용자의 혜택을 계산한다. 신규 발급 회원 한정·응모형 이벤트는 반영하지 않고 summary 의 확인 필요에 적는다.',
  '2. 지난 기간의 룰은 지우지 않는다(지난달 계산이 바뀐다). 바뀐 혜택은 새 룰을 effectiveFrom/effectiveUntil 로 추가하거나, 끝난 룰에 effectiveUntil 을 단다.',
  '3. 안내문에 없는 숫자를 지어내지 않는다. 확실하지 않으면 confidence: \'estimated\' 와 notes 에 확인 필요를 적는다.',
  '4. 룰 id 는 카드 전체에서 유일해야 한다. brands 에는 아래 목록의 키만 쓴다.',
  '5. 지금 필드로 표현할 수 없는 조건이면 억지로 맞추지 말고 status 를 needs_review 로 하고 무엇이 필요한지 쓴다.',
  '6. 파일 머리 주석의 요율표와 출처도 함께 고친다. 주석은 한국어 평서문(~다)으로 쓴다.',
  '',
  '출력 형식 (이 밖의 글은 쓰지 않는다)',
  '<status>patched 또는 no_change 또는 needs_review</status>',
  '<summary>',
  '- 바뀐 점 (안내문 문장을 짧게 인용)',
  '- 확인 필요',
  '</summary>',
  '<edit><old>파일에 정확히 한 번 나오는 원문 그대로</old><new>바꿀 내용</new></edit>',
  'edit 는 여러 개 쓸 수 있다. old 는 공백·들여쓰기까지 파일과 똑같아야 한다. no_change 면 edit 를 쓰지 않는다.',
].join('\n');

/** types.ts 에서 카드 설정에 필요한 정의만 잘라 온다 (토큰 절약). */
function typesExcerpt() {
  const t = read('src/lib/types.ts');
  const a = t.indexOf('export interface SpendTier');
  const b = t.indexOf('// 계산 결과');
  return a >= 0 && b > a ? t.slice(a, b) : t;
}

function brandKeys() {
  const t = read('src/config/merchants.ts');
  const keys = [...t.matchAll(/^ {2}([A-Z0-9_]+):\s*\[/gm)].map((m) => m[1]);
  return [...new Set(keys)].join(', ');
}

function patchPrompt({ card, configText, fetched, diff }) {
  return [
    `## 카드\nid: ${card.cardId}\n파일: src/config/cards/${card.configFile}\n출처: ${fetched.label} ${fetched.url}`,
    `## 타입 정의 (src/lib/types.ts 일부)\n\`\`\`ts\n${typesExcerpt()}\n\`\`\``,
    `## brands 에 쓸 수 있는 키 (BRAND_ALIASES, BRAND_GROUPS 는 ...BRAND_GROUPS.CAFE 처럼 펼쳐 쓴다)\n${brandKeys()}`,
    `## 현재 설정 파일\n\`\`\`ts\n${configText}\n\`\`\``,
    `## 안내문 변경 (지난번 대비)\n빠진 줄:\n${clip(diff.removed.map((l) => `- ${l}`).join('\n') || '(없음)', 6000)}\n\n새 줄:\n${clip(diff.added.map((l) => `+ ${l}`).join('\n') || '(없음)', 6000)}`,
    `## 지금 안내문 전체\n${clip(fetched.lines.join('\n'), 12000)}`,
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

async function main() {
  const watch = JSON.parse(read('src/config/benefit-watch.json'));
  const firstRun = !existsSync(STATE_FILE);
  const state = firstRun ? { version: 1, sources: {} } : JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  const budget = new Budget(BUDGET_USD);
  const rows = []; // 보고 표
  const proposals = []; // 수정안 (파일 바뀜)
  const attention = []; // 혜택 변경인데 수정안이 없음 (사람이 봐야 함)
  let models = null;
  let patched = 0;

  for (const card of watch.cards) {
    if (ONLY.length && !ONLY.includes(card.cardId)) continue;
    const configPath = `src/config/cards/${card.configFile}`;
    const configText = read(configPath);

    // 관리 안 하는 카드는 출처를 아예 부르지 않는다 (API 는 물론 네트워크도 안 쓴다).
    if (/^\s*active:\s*false/m.test(configText)) {
      rows.push([card.cardId, '건너뜀', '관리 안 함 (active: false)']);
      continue;
    }

    const fetched = await fetchFirst(card.sources);
    if (!fetched.lines) {
      rows.push([card.cardId, '가져오기 실패', fetched.errors.join(' / ')]);
      continue;
    }
    const hash = hashLines(fetched.lines);
    const prev = state.sources[fetched.key];
    const remember = () => {
      state.sources[fetched.key] = { cardId: card.cardId, hash, lines: fetched.lines, seenAt: now };
    };

    if (!prev) {
      remember();
      rows.push([card.cardId, '기준 저장', `${fetched.label} ${fetched.lines.length}줄 (처음이라 비교 없음, 0원)`]);
      continue;
    }
    if (prev.hash === hash) {
      rows.push([card.cardId, '같음', `${fetched.label} (0원)`]);
      continue;
    }

    const diff = lineDiff(prev.lines ?? [], fetched.lines);
    if (!API_KEY) {
      // 기준을 갱신하지 않는다. 키를 넣은 뒤 다음 실행에서 같은 변경을 다시 본다.
      rows.push([card.cardId, '바뀜 · 보류', `API 키 없음. 빠진 줄 ${diff.removed.length} · 새 줄 ${diff.added.length}`]);
      attention.push({ card, fetched, diff, why: 'ANTHROPIC_API_KEY 가 없어 분석하지 않음' });
      continue;
    }
    if (patched >= MAX_PATCH) {
      rows.push([card.cardId, '바뀜 · 다음으로', `한 번에 ${MAX_PATCH}장까지만 분석`]);
      continue;
    }

    models ??= await pickModels();

    // 3. 분류 (싼 모델, 바뀐 줄만)
    const triageUser = `카드: ${card.cardId}\n\n빠진 줄:\n${clip(diff.removed.join('\n') || '(없음)', 4000)}\n\n새 줄:\n${clip(diff.added.join('\n') || '(없음)', 4000)}`;
    const triageIn = estimateTokens(TRIAGE_SYSTEM + triageUser);
    if (!budget.canSpend(models.triage, triageIn, TRIAGE_MAX_TOKENS)) {
      rows.push([card.cardId, '바뀜 · 예산 멈춤', `상한 ${wonText(BUDGET_USD)}`]);
      continue;
    }
    const tri = parseTriage(
      (await claude(budget, `${card.cardId} 분류`, models.triage, TRIAGE_SYSTEM, triageUser, TRIAGE_MAX_TOKENS)).text,
    );
    if (!tri.relevant) {
      remember(); // 잡음이면 기준을 새로 잡아 다음 달에 또 묻지 않는다
      rows.push([card.cardId, '바뀜 · 혜택 무관', tri.summary]);
      continue;
    }

    // 4. 수정안 (Sonnet, 찾아 바꾸기만)
    const user = patchPrompt({ card, configText, fetched, diff });
    const patchIn = estimateTokens(PATCH_SYSTEM + user);
    if (!budget.canSpend(models.patch, patchIn, PATCH_MAX_TOKENS)) {
      rows.push([card.cardId, '혜택 변경 · 예산 멈춤', `${tri.summary} (상한 ${wonText(BUDGET_USD)})`]);
      attention.push({ card, fetched, diff, why: `예산 상한(${wonText(BUDGET_USD)})에 걸려 수정안을 못 만듦`, triage: tri.summary });
      continue;
    }
    patched += 1;
    const res = await claude(budget, `${card.cardId} 수정안`, models.patch, PATCH_SYSTEM, user, PATCH_MAX_TOKENS);
    remember(); // 돈을 쓴 변경은 기준을 갱신한다, PR 을 닫아도 다음 달에 다시 과금되지 않게
    const p = parsePatch(res.text);
    if (res.stop === 'max_tokens') {
      rows.push([card.cardId, '혜택 변경 · 수정안 잘림', tri.summary]);
      attention.push({ card, fetched, diff, why: '모델 출력이 길이 상한에서 잘림', triage: tri.summary, summary: p.summary });
      continue;
    }
    if (p.status === 'no_change' || p.edits.length === 0) {
      rows.push([card.cardId, `혜택 변경 · ${p.status}`, tri.summary]);
      attention.push({ card, fetched, diff, why: `모델 판단: ${p.status}`, triage: tri.summary, summary: p.summary });
      continue;
    }
    const applied = applyEdits(configText, p.edits);
    if (!applied.ok) {
      rows.push([card.cardId, '혜택 변경 · 적용 실패', applied.errors.join(' / ')]);
      attention.push({ card, fetched, diff, why: `수정안 적용 실패: ${applied.errors.join(' / ')}`, triage: tri.summary, summary: p.summary });
      continue;
    }
    writeFileSync(path.resolve(ROOT, configPath), applied.text);
    proposals.push({ card, fetched, diff, status: p.status, summary: p.summary, triage: tri.summary, edits: p.edits.length });
    rows.push([card.cardId, `수정안 (${p.status})`, tri.summary]);
  }

  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  mkdirSync(OUT_DIR, { recursive: true });

  // ---- 보고서 ----
  const cost = budget.calls.length
    ? `${wonText(budget.spentUsd)} (${budget.calls.map((c) => `${c.label} ${c.model} 입력 ${c.input}·출력 ${c.output}토큰`).join(', ')})`
    : '0원 (API 호출 없음)';
  const table = ['| 카드 | 결과 | 내용 |', '|---|---|---|', ...rows.map((r) => `| ${r.map((x) => String(x).replace(/\|/g, '/')).join(' | ')} |`)];
  const head = [
    '## 카드 혜택 월간 감시',
    '',
    `- 실행: ${now}${firstRun ? ' (첫 실행: 기준만 저장)' : ''}`,
    `- 비용: ${cost}`,
    `- 상한: 한 번에 ${wonText(BUDGET_USD)}, 수정안 ${MAX_PATCH}장`,
    API_KEY ? '' : '- ANTHROPIC_API_KEY 없음: 바뀐 카드는 분석하지 않고 보류했다',
    '',
    ...table,
  ].filter((l) => l !== '');
  const detail = (x) => [
    '',
    `### ${x.card.cardId}`,
    `- 출처: [${x.fetched.label}](${x.fetched.url})`,
    x.triage ? `- 분류: ${x.triage}` : '',
    x.why ? `- 사람 확인 필요: ${x.why}` : '',
    x.summary ? `\n${x.summary}` : '',
    '',
    '<details><summary>안내문에서 바뀐 줄</summary>',
    '',
    '```diff',
    clip([...x.diff.removed.map((l) => `- ${l}`), ...x.diff.added.map((l) => `+ ${l}`)].join('\n'), 5000),
    '```',
    '</details>',
  ].filter((l) => l !== '').join('\n');

  const report = [...head, ...proposals.map(detail), ...attention.map(detail)].join('\n');
  writeFileSync(path.join(OUT_DIR, 'report.md'), report);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${report}\n`);

  const month = now.slice(0, 7);
  if (proposals.length) {
    const names = proposals.map((x) => x.card.cardId).join(', ');
    writeFileSync(path.join(OUT_DIR, 'pr-title.txt'), `혜택 감시 ${month}: ${names} 설정 수정안`);
    writeFileSync(
      path.join(OUT_DIR, 'pr-body.md'),
      [
        report,
        '',
        '---',
        '- 이 PR 은 카드 혜택 월간 감시(benefit-watch.yml)가 만들었다. 공개 안내문 기준이라 기보유 고객 혜택과 다를 수 있다.',
        '- 머지하면 main 에 들어가고 운영 앱에 배포된다. 이상하면 닫으면 된다(같은 변경으로 다시 과금하지 않는다).',
      ].join('\n'),
    );
  }
  if (attention.length) {
    writeFileSync(path.join(OUT_DIR, 'issue-title.txt'), `혜택 감시 ${month}: 확인 필요 ${attention.map((x) => x.card.cardId).join(', ')}`);
    writeFileSync(path.join(OUT_DIR, 'issue-body.md'), report);
  }
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `proposed=${proposals.length > 0}\nattention=${attention.length > 0}\n`);
  }
  log(report);
}

main().catch((e) => {
  console.error(`혜택 감시 실패: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
