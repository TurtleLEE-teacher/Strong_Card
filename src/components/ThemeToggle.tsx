'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * 라이트/다크/시스템 전환.
 *
 * 기본은 **라이트**다. 시스템이 다크여도 직접 고르기 전까지는 라이트로 둔다.
 *
 * 선택은 <html data-theme>에 쓰고 localStorage에 남긴다. 서버는 사용자의
 * 선택을 모르므로(쿠키를 쓰지 않는다) 첫 페인트 전에 layout의 인라인
 * 스크립트가 같은 값을 미리 발라 준다 — 그게 없으면 다크를 고른 사람이
 * 매번 흰 화면을 한 번 보고 나서 어두워지는 걸 겪는다.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'sc-theme';

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'system', label: '시스템' },
];

/** 상태바 색. 홈 화면 앱에서 상단 띠 색이 본문과 어긋나면 눈에 띈다. */
const BAR_COLOR: Record<'light' | 'dark', string> = {
  light: '#f4f4f2',
  dark: '#121211',
};

export function applyTheme(choice: ThemeChoice) {
  document.documentElement.setAttribute('data-theme', choice);
  const effective =
    choice === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : choice;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', BAR_COLOR[effective]);
}

/**
 * 현재 선택을 DOM에서 읽는다.
 *
 * layout의 인라인 스크립트가 첫 페인트 전에 이미 data-theme을 발라 놨으므로
 * 그게 곧 진실이다. 이펙트로 뒤늦게 맞추면 렌더가 한 번 더 돈다.
 */
const themeStore = {
  subscribe(onChange: () => void) {
    window.addEventListener('sc-theme-change', onChange);
    return () => window.removeEventListener('sc-theme-change', onChange);
  },
  getSnapshot(): ThemeChoice {
    const v = document.documentElement.getAttribute('data-theme');
    return v === 'dark' || v === 'system' ? v : 'light';
  },
  // 서버에는 DOM이 없다. 기본값과 같아야 하이드레이션이 어긋나지 않는다.
  getServerSnapshot: (): ThemeChoice => 'light',
};

export function ThemeToggle() {
  const choice = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  const pick = useCallback((next: ThemeChoice) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event('sc-theme-change'));
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="화면 테마"
      className="inline-flex gap-1 rounded-lg p-1"
      style={{ background: 'var(--surface-alt)' }}
    >
      {OPTIONS.map((opt) => {
        const active = choice === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(opt.value)}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: active ? '0 1px 2px rgb(0 0 0 / 0.06)' : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
