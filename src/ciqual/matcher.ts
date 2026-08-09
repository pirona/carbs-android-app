// SPDX-License-Identifier: GPL-3.0-or-later
import Fuse from 'fuse.js';
import ciqualData from './ciqual.json';
import type { Per100 } from '../core/types';

export interface CiqualEntry {
  id: string;
  label: string;
  category: string;
  per100: Per100;
}

const entries = ciqualData as CiqualEntry[];

// Fuzzy match against the curated CIQUAL subset — client-side only, no network call.
// Chosen over embeddings: no bundled model, no network round-trip for a lookup that
// should stay instant and offline (see plan §7.3).
const fuse = new Fuse(entries, { keys: ['label'], threshold: 0.35 });

export function matchCiqual(query: string, limit = 5): CiqualEntry[] {
  if (!query.trim()) return [];
  return fuse.search(query, { limit }).map((r) => r.item);
}
