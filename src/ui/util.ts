// SPDX-License-Identifier: GPL-3.0-or-later

// OFF/AI data is untrusted external input — escape before innerHTML injection to
// prevent stored XSS (food-habits.html:230-234).
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

// carb-cycling.html/food-habits.html fmt1 — trims a trailing ".0".
export function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
}

// Delegated long-press gesture (pointerdown held `delayMs` without moving more than a few px)
// — used for "long-press to delete" on habit chips/rows, which otherwise have no delete
// affordance outside the Habitudes library screen. Suppresses the click that a touch sequence
// normally fires right after pointerup, so a long-press never also triggers the element's
// regular tap action (e.g. logging the habit).
export function attachLongPress(container: HTMLElement, selector: string, delayMs: number, onLongPress: (target: HTMLElement) => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firedOn: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  container.addEventListener('pointerdown', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!target) return;
    startX = e.clientX;
    startY = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      firedOn = target;
      onLongPress(target);
    }, delayMs);
  });

  container.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancel();
  });

  container.addEventListener('pointerup', cancel);
  container.addEventListener('pointercancel', cancel);

  // Capture phase, same container as the element's own (bubble-phase) click handler —
  // runs first on the way down and stops the click before it ever reaches that handler.
  container.addEventListener(
    'click',
    (e) => {
      if (firedOn && (e.target as HTMLElement).closest<HTMLElement>(selector) === firedOn) {
        e.stopImmediatePropagation();
        e.preventDefault();
        firedOn = null;
      }
    },
    true,
  );
}
