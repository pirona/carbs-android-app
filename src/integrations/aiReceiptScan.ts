// SPDX-License-Identifier: GPL-3.0-or-later
import { callAiChat, extractToolCallArguments, requireAiCallContext, recordAiUsage } from './aiClient';
import { DEFAULT_AI_MODELS } from '../storage/repos/aiModelsRepo';

// Direct client call to api.mistral.ai — a receipt photo (ticket de caisse) can list many
// food items at once, unlike a single-plate photo. Deliberately does NOT ask Mistral for
// nutrition macros: a receipt shows a product name and a price, not nutrition — unlike a
// photographed plate, where the model has a real (if rough) visual basis to guess macros.
// Macros for receipt items come from the app's own OFF/CIQUAL lookup (see photoScanMatch.ts's
// receiptItemToRow), or are left at zero for manual entry — never fabricated here.
export interface ReceiptItem {
  label: string;
  // Literal printed line — not used for matching in this version, kept as a seam for a
  // possible future on-device OCR pass to feed a cleaner raw line into this field.
  raw_text: string;
  quantity: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ReceiptScanResult {
  items: ReceiptItem[];
  merchant_note: string;
}

const TIMEOUT_MS = 30_000;

// The photo is sent once and never written to any repo — see PhotoScanScreen, which
// discards the base64 string from memory as soon as this call resolves or fails.
export async function analyzeReceiptPhoto(imageBase64: string, mimeType: string, model = DEFAULT_AI_MODELS.receiptModel): Promise<ReceiptScanResult> {
  const ctx = await requireAiCallContext();
  const data = await callAiChat(
    {
      model,
      tool_choice: 'any',
      tools: [
        {
          type: 'function',
          function: {
            name: 'extract_receipt_items',
            description:
              "Extrait les articles alimentaires listés sur une photo de ticket de caisse (supermarché ou restaurant), en français. Pour chaque article, donne un nom court et clair (pas le libellé brut de caisse), la quantité si indiquée, et le texte exact tel qu'imprimé. NE PAS estimer de valeurs nutritionnelles. Ignore les lignes qui ne sont pas de la nourriture (sacs, consigne, réductions, total, TVA, paiement...). Si le ticket est flou, illisible, ou n'est pas un ticket de caisse, le préciser dans merchant_note.",
            parameters: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  description: 'Liste des articles alimentaires identifiés sur le ticket',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: "Nom court et reconnaissable du produit (ex: yaourt fraise, pâtes, poulet rôti) — pas l'abréviation de caisse brute" },
                      raw_text: { type: 'string', description: "Le texte exact tel qu'imprimé sur le ticket pour cet article" },
                      quantity: { type: 'number', description: '1 si non précisé' },
                      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                    },
                    required: ['label', 'raw_text', 'quantity', 'confidence'],
                  },
                },
                merchant_note: {
                  type: 'string',
                  description: "Remarque courte si le ticket est flou, illisible, incomplet, ou n'est pas un ticket de caisse, sinon chaîne vide",
                },
              },
              required: ['items', 'merchant_note'],
            },
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Identifie les articles alimentaires listés sur ce ticket de caisse.' },
            { type: 'image_url', image_url: `data:${mimeType};base64,${imageBase64}` },
          ],
        },
      ],
    },
    ctx,
    TIMEOUT_MS,
  );
  void recordAiUsage('receipt_scan', data);
  const result = extractToolCallArguments(data);
  return {
    items: Array.isArray(result.items) ? result.items : [],
    merchant_note: result.merchant_note || '',
  };
}
