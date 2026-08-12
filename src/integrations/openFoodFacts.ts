// SPDX-License-Identifier: GPL-3.0-or-later
import type { Per100 } from '../core/types';

export interface OffProduct {
  code: string;
  name: string;
  brand: string;
  per100: Per100;
}

function mapNutriments(n: Record<string, number | undefined>): Per100 {
  return {
    kcal: n['energy-kcal_100g'] as number,
    protein_g: n['proteins_100g'] || 0,
    fat_g: n['fat_100g'] || 0,
    carb_g: n['carbohydrates_100g'] || 0,
  };
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
      per100: mapNutriments(p.nutriments),
    }));
}

// Product lookup API (v0) — different endpoint/response shape from the search API above.
// Public, keyless, read-only.
export async function getOFFByBarcode(code: string): Promise<OffProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OFF indisponible');
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  if (!p.product_name || p.nutriments?.['energy-kcal_100g'] == null) return null;
  return {
    code: p.code ?? code,
    name: p.product_name,
    brand: p.brands || '',
    per100: mapNutriments(p.nutriments),
  };
}
