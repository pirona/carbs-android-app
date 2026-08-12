// SPDX-License-Identifier: GPL-3.0-or-later
import type { Per100 } from '../core/types';

export interface OffProduct {
  code: string;
  name: string;
  brand: string;
  per100: Per100;
  // Community-entered serving size (e.g. a spoonful of chicory powder), in grams — null when
  // OFF has no serving_size, or it's not expressed in grams. A jar's nutriments are always
  // per 100g, but 100g is a wildly wrong default portion for anything dosed by the spoonful.
  servingGrams: number | null;
}

// "5 g", "1 sachet (3g)", "30g" — matches a plain gram figure. Deliberately doesn't match
// "1kg"/"5mg": those have a letter directly before the "g", not whitespace, so \s*g\b skips them.
function parseServingGrams(servingSize: string | null | undefined): number | null {
  if (!servingSize) return null;
  const m = servingSize.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  return isNaN(value) || value <= 0 ? null : value;
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
    `&fields=code,product_name,brands,nutriments,serving_size`;
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
      servingGrams: parseServingGrams(p.serving_size),
    }));
}

// Direct product lookup by barcode (v0 API — stable, keyless, matches searchOFF's shape).
// Returns null when OFF doesn't have the product, or has it without usable nutriment data.
export async function getOFFByBarcode(code: string): Promise<OffProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OFF indisponible');
  const data = await res.json();
  const p = data.product;
  if (data.status !== 1 || !p || !p.product_name || !p.nutriments || p.nutriments['energy-kcal_100g'] == null) {
    return null;
  }
  return {
    code: p.code || code,
    name: p.product_name,
    brand: p.brands || '',
    per100: mapNutriments(p.nutriments),
    servingGrams: parseServingGrams(p.serving_size),
  };
}
