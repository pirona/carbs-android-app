// SPDX-License-Identifier: GPL-3.0-or-later
import type { Per100 } from '../core/types';

export interface OffProduct {
  code: string;
  name: string;
  brand: string;
  per100: Per100;
}

// Verbatim port of searchOFF (food-habits.html:249-269 / carb-cycling.html:1183-1203,
// duplicated identically in both — no build step to share it there). Public, keyless,
// read-only API.
export async function searchOFF(query: string): Promise<OffProduct[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=15` +
    `&fields=code,product_name,brands,nutriments`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OFF indisponible');
  const data = await res.json();
  const products: unknown[] = data.products || [];
  return products
    .filter((p: any) => p.product_name && p.nutriments && p.nutriments['energy-kcal_100g'] != null)
    .map((p: any) => ({
      code: p.code,
      name: p.product_name,
      brand: p.brands || '',
      per100: {
        kcal: p.nutriments['energy-kcal_100g'],
        protein_g: p.nutriments['proteins_100g'] || 0,
        fat_g: p.nutriments['fat_100g'] || 0,
        carb_g: p.nutriments['carbohydrates_100g'] || 0,
      },
    }));
}
