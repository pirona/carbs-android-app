// SPDX-License-Identifier: GPL-3.0-or-later
// Touch drag between meal sections — lets the user fix a mislogged meal (e.g. an entry that
// landed in "diner" but was actually a snack) by dragging it into the right section, instead of
// deleting and re-adding it. Pointer-events delegation, same family as attachLongPress (util.ts)
// — the only gesture pattern already in this codebase — rather than pulling in a drag/gesture
// library (project stays zero-dependency where a hand-rolled ~80-line handler suffices).
import type { MealSlot } from '../core/types';

export interface MealSlotDragOptions {
  handleSelector: string;
  rowSelector: string;
  sectionSelector: string;
  onDrop: (entryId: string, fromSlot: MealSlot, toSlot: MealSlot) => void | Promise<void>;
}

const MOVE_THRESHOLD = 6;

export function attachMealSlotDrag(container: HTMLElement, opts: MealSlotDragOptions): void {
  let pointerId: number | null = null;
  let row: HTMLElement | null = null;
  let fromSlot: MealSlot | null = null;
  let entryId = '';
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let clone: HTMLElement | null = null;
  let overSection: HTMLElement | null = null;

  function cleanup() {
    if (row) row.style.opacity = '';
    if (clone) clone.remove();
    if (overSection) overSection.classList.remove('drag-over');
    pointerId = null;
    row = null;
    fromSlot = null;
    dragging = false;
    clone = null;
    overSection = null;
  }

  container.addEventListener('pointerdown', (e) => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>(opts.handleSelector);
    if (!handle) return;
    const r = handle.closest<HTMLElement>(opts.rowSelector);
    const section = handle.closest<HTMLElement>(opts.sectionSelector);
    if (!r || !section) return;
    pointerId = e.pointerId;
    row = r;
    entryId = r.dataset.entryId ?? '';
    fromSlot = (section.dataset.mealSection ?? null) as MealSlot | null;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
  });

  container.addEventListener('pointermove', (e) => {
    if (pointerId === null || e.pointerId !== pointerId || !row) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
      dragging = true;
      row.setPointerCapture(pointerId);
      const rect = row.getBoundingClientRect();
      clone = row.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '9999';
      clone.classList.add('drag-clone');
      document.body.appendChild(clone);
      row.style.opacity = '0.4';
    }

    if (clone) {
      clone.style.transform = `translate(${e.clientX - startX}px, ${e.clientY - startY}px)`;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(opts.sectionSelector) ?? null;
    if (target !== overSection) {
      overSection?.classList.remove('drag-over');
      target?.classList.add('drag-over');
      overSection = target;
    }
  });

  container.addEventListener('pointerup', (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    const wasDragging = dragging;
    const targetSlot = (overSection?.dataset.mealSection ?? null) as MealSlot | null;
    const from = fromSlot;
    const id = entryId;
    cleanup();
    if (wasDragging && targetSlot && from && targetSlot !== from) {
      void opts.onDrop(id, from, targetSlot);
    }
  });

  container.addEventListener('pointercancel', (e) => {
    if (pointerId === null || e.pointerId !== pointerId) return;
    cleanup();
  });
}
