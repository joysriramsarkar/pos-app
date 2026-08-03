import type { PageType } from '@/app/pos/nav-config';

export interface BackNavigationResult {
  kind: 'close-overlay' | 'navigate' | 'exit';
  page?: PageType;
}

export function resolveBackNavigation({
  currentPage,
  stack,
  hasOpenOverlay,
}: {
  currentPage: PageType;
  stack: PageType[];
  hasOpenOverlay: boolean;
}): BackNavigationResult {
  if (hasOpenOverlay) {
    return { kind: 'close-overlay' };
  }

  if (currentPage !== 'billing') {
    return {
      kind: 'navigate',
      page: stack.length > 1 ? (stack[stack.length - 2] ?? 'billing') : 'billing',
    };
  }

  return { kind: 'exit' };
}
