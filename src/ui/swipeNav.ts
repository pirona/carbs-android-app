// SPDX-License-Identifier: GPL-3.0-or-later
// Left/right swipe to move between screens, alongside the bottom-nav icons. Attached once on a
// stable ancestor (main.ts uses #app, never replaced) since #screen itself is swapped for a
// fresh clone on every tab switch (see showTab) and would silently drop any listener attached
// directly to it. Pointer-events, same family as attachLongPress/attachMealSlotDrag — no
// gesture library in this project.
const MOVE_THRESHOLD = 60;
const AXIS_RATIO = 1.5; // horizontal must dominate vertical by this much to count as a swipe

export function attachSwipeNav(root: HTMLElement, onSwipe: (direction: 'left' | 'right') => void): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  root.addEventListener('pointerdown', (e) => {
    // Never hijack a gesture that starts on an interactive control or the meal-slot drag
    // handle — those already own the pointer sequence for their own purpose.
    if ((e.target as HTMLElement).closest('input, select, textarea, button, .drag-handle')) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
  });

  root.addEventListener('pointerup', (e) => {
    if (!tracking || pointerId === null || e.pointerId !== pointerId) return;
    tracking = false;
    pointerId = null;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) < MOVE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * AXIS_RATIO) return;
    onSwipe(dx < 0 ? 'left' : 'right');
  });

  root.addEventListener('pointercancel', () => {
    tracking = false;
    pointerId = null;
  });
}
