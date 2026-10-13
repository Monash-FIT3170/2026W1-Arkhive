import { GoogleGenAI, Type } from '@google/genai';
import type { AnalyzeResultOutput } from '@azure-rest/ai-document-intelligence';
import type { Block, DocType, StructuredDocument } from '../../../models/Document';
import { toRawPages, type RawPage } from './layout';
import {
  MODEL,
  llmStructurer,
  nativeTableExtractor,
  plainTextExtractor,
  type Extractor,
} from './extractors';

// ───────────── Profiles: the registry you extend to support a new document type ─────────────
export interface DocProfile {
  type: DocType;
  hint: string; // appended to the LLM prompt
  expectedFields?: string[]; // nudges the LLM towards the fields you care about
  extractors: Extractor[]; // run in order; later ones only see unclaimed lines
}

const profiles = new Map<DocType, DocProfile>();
export const registerProfile = (p: DocProfile) => profiles.set(p.type, p);
const getProfile = (t: DocType) => profiles.get(t) ?? profiles.get('generic')!;

registerProfile({
  type: 'table',
  hint: '',
  extractors: [nativeTableExtractor, plainTextExtractor],
}); // cheap path, no LLM
registerProfile({ type: 'generic', hint: '', extractors: [nativeTableExtractor, llmStructurer] });
registerProfile({
  type: 'receipt',
  hint: 'This is a retail receipt. Line items are usually "description qty price" on one or two lines; emit ONE table (description, quantity, unit_price, amount). Subtotal, tax, total, tendered and change are fields.',
  expectedFields: ['merchant', 'date', 'subtotal', 'tax', 'total', 'payment_method'],
  extractors: [nativeTableExtractor, llmStructurer],
});
registerProfile({
  type: 'invoice',
  hint: 'This is an invoice. Header details (vendor, customer, invoice number, dates, PO) are fields; line items are ONE table; subtotal/tax/total/amount due are fields.',
  expectedFields: [
    'vendor',
    'customer',
    'invoice_number',
    'invoice_date',
    'due_date',
    'subtotal',
    'tax',
    'total',
  ],
  extractors: [nativeTableExtractor, llmStructurer],
});

// ───────────── Classification (one tiny call; skippable via opts.docType) ─────────────
async function classify(page: RawPage | undefined, ai: GoogleGenAI) {
  const fallback = { type: 'generic' as DocType, confidence: 0 };
  if (!page) return fallback;
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [
        page.lines
          .slice(0, 40)
          .map((l) => l.text)
          .join('\n'),
      ],
      config: {
        systemInstruction:
          'Classify the document. "table" = a plain table/spreadsheet-like page with no invoice/receipt semantics.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, format: 'enum', enum: [...profiles.keys()] },
            confidence: { type: Type.NUMBER },
          },
          required: ['type', 'confidence'],
        },
      },
    });
    const p = JSON.parse(res.text ?? '{}');
    return profiles.has(p.type)
      ? { type: p.type as DocType, confidence: p.confidence ?? 0.5 }
      : fallback;
  } catch {
    return fallback; // classification failure must never fail the document
  }
}

// ───────────── Orchestration ─────────────
const topY = (b: Block) =>
  b.region?.polygon.length ? Math.min(...b.region.polygon.map((v) => v.y)) : Infinity;

export async function structureDocument(
  azure: AnalyzeResultOutput,
  deps: { ai: GoogleGenAI; docType?: DocType; pageOffset?: number }
): Promise<StructuredDocument> {
  const pages = toRawPages(azure, deps.pageOffset);
  const cls = deps.docType
    ? { type: deps.docType, confidence: 1 }
    : await classify(pages[0], deps.ai);
  const profile = getProfile(cls.type);
  const hint = [
    profile.hint,
    profile.expectedFields &&
      `Prefer these field keys when present: ${profile.expectedFields.join(', ')}.`,
  ]
    .filter(Boolean)
    .join('\n');

  const out = await Promise.all(
    pages.map(async (page) => {
      const claimed = new Set<string>();
      const blocks: Block[] = [];
      for (const ex of profile.extractors) {
        // sequential: claiming
        try {
          blocks.push(...(await ex.run({ page, claimed, hint, ai: deps.ai })));
        } catch (e) {
          console.error(`[pipeline] ${ex.name} failed on page ${page.pageIndex}`, e);
        } // degrade, don't die
      }
      return { pageIndex: page.pageIndex, blocks: blocks.sort((a, b) => topY(a) - topY(b)) };
    })
  );

  return { docType: profile.type, docTypeConfidence: cls.confidence, pages: out };
}

/** Combine per-image results (each already carries its real pageIndex) into one document. */
export function mergeStructured(docs: StructuredDocument[]): StructuredDocument {
  const best = docs.reduce((a, b) => (b.docTypeConfidence > a.docTypeConfidence ? b : a), docs[0]);
  return {
    docType: best.docType,
    docTypeConfidence: best.docTypeConfidence,
    pages: docs.flatMap((d) => d.pages).sort((a, b) => a.pageIndex - b.pageIndex),
  };
}

/** Mean confidence over all blocks (replaces calculateAverageConfidence for components). */
export function documentConfidence(doc: StructuredDocument): number {
  const cs = doc.pages.flatMap((p) => p.blocks.map((b) => b.confidence));
  return cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : 0;
}
