// Pure logic — no I/O. Matches a free-text line item (from a scanned receipt)
// against the existing product catalog, so the purchase form can be
// pre-filled without ever creating or renaming products automatically.
import type { Product } from "./types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Similitud 0..1 entre el texto del ticket y el nombre de un producto. */
export function matchScore(receiptText: string, productName: string): number {
  const a = tokens(receiptText);
  const b = tokens(productName);
  if (a.length === 0 || b.length === 0) return 0;

  const setB = new Set(b);
  const shared = a.filter((t) => setB.has(t)).length;
  const jaccard = shared / new Set([...a, ...b]).size;

  const normA = normalize(receiptText);
  const normB = normalize(productName);
  const substringBonus =
    normA.includes(normB) || normB.includes(normA) ? 0.3 : 0;

  return Math.min(1, jaccard + substringBonus);
}

export interface ProductMatch {
  product: Product | null;
  score: number;
}

/** Mejor producto existente para un ítem detectado en un ticket. */
export function bestProductMatch(
  receiptText: string,
  products: Product[]
): ProductMatch {
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    const score = matchScore(receiptText, p.name);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return { product: bestScore >= 0.25 ? best : null, score: bestScore };
}
