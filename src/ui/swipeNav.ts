// SPDX-License-Identifier: GPL-3.0-or-later
// Left/right swipe to move between screens, alongside the bottom-nav icons. Attached once on a
// stable ancestor (main.ts uses #app, never replaced) since #screen itself is swapped for a
// fresh clone on every tab switch (see showTab) and would silently drop any listener attached
// directly to it. Pointer-events, same family as attachLongPress/attachMealSlotDrag — no
// gesture library in this project.
//
// Reports raw progress (onMove/onEnd give the live pixel offset) rather than just a final
// direction — main.ts uses that to visually drag #screen with the finger (see showTab's swipe
// wiring) instead of switching tabs as a flat, unanimated jump.
const SLOP = 10; // px of movement before committing to "this is a horizontal gesture", not a tap/scroll
const AXIS_RATIO = 1.5; // horizontal must dominate vertical by this much to lock in as a swipe

export interface SwipeNavCallbacks {
  onStart: () => void;
  onMove: (dx: number) => void;
  onEnd: (dx: number) => void;
}

export function attachSwipeNav(root: HTMLElement, callbacks: SwipeNavCallbacks): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let started = false;

  root.addEventListener('pointerdown', (e) => {
    // Never hijack a gesture that starts on an interactive control or the meal-slot drag
    // handle — those already own the pointer sequence for their own purpose.
    if ((e.target as HTMLElement).closest('input, select, textarea, button, .drag-handle')) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    started = false;
  });

  root.addEventListener('pointermove', (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!started) {
      if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(dy) * AXIS_RATIO) return;
      started = true;
      callbacks.onStart();
    }
    callbacks.onMove(dx);
  });

  root.addEventListener('pointerup', (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const wasStarted = started;
    pointerId = null;
    started = false;
    if (wasStarted) callbacks.onEnd(dx);
  });

  root.addEventListener('pointercancel', (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const wasStarted = started;
    pointerId = null;
    started = false;
    if (wasStarted) callbacks.onEnd(0);
  });
}
