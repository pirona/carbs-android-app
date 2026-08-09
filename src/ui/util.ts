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
