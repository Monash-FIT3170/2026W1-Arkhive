import { google } from "@google-cloud/vision/build/protos/protos.js";
import { OCRBoundingBoxes } from "../types/boundingBoxTypes.js";

export const flattenPagesToWordMap = (pages: google.cloud.vision.v1.IPage[]): OCRBoundingBoxes  => {
  return pages
    .flatMap(page => page.blocks ?? [])
    .flatMap(block => block.paragraphs ?? [])
    .flatMap(paragraph => paragraph.words ?? [])
    .reduce((acc: OCRBoundingBoxes , word, index) => {
      const key = `word_${index}`;
      
      acc[key] = {
        // In fullTextAnnotation, words are arrays of symbols
        text: word.symbols?.map(s => s.text).join('') ?? '',
        vertices: (word.boundingBox?.vertices ?? []).map(v => ({
          x: v.x ?? 0,
          y: v.y ?? 0
        })),
        confidence: word.confidence ?? 0
      };

      return acc;
    }, {});
};


export const flattenPagesToBlockMap = (pages: google.cloud.vision.v1.IPage[]): OCRBoundingBoxes  => {
  return pages
    .flatMap(page => page.blocks ?? [])
    .reduce((acc: OCRBoundingBoxes , block, index) => {
      const key = `block_${index}`;
      
      acc[key] = {
        // In fullTextAnnotation, words are arrays of symbols
        text: block.paragraphs?.flatMap(paragraph => paragraph.words?.flatMap(word => word.symbols?.map(s => s.text)
        .join('') ?? "")
        .join(" ") ?? '')
        .join('') ?? '',
        vertices: (block.boundingBox?.vertices ?? []).map(v => ({
          x: v.x ?? 0,
          y: v.y ?? 0
        })),
        confidence: block.confidence ?? 0
      };

      return acc;
    }, {});
};

export const flattenPagesToParaMap = (pages: google.cloud.vision.v1.IPage[]): OCRBoundingBoxes  => {
  return pages
    .flatMap(page => page.blocks ?? [])
    .flatMap(block => block.paragraphs ?? [])
    .reduce((acc: OCRBoundingBoxes , paragraph, index) => {
      const key = `paragraph_${index}`;
      
      acc[key] = {
        // In fullTextAnnotation, words are arrays of symbols
        text: paragraph.words?.flatMap(word => word.symbols?.map(s => s.text).join('') ?? "").join(" ") ?? '',
        vertices: (paragraph.boundingBox?.vertices ?? []).map(v => ({
          x: v.x ?? 0,
          y: v.y ?? 0
        })),
        confidence: paragraph.confidence ?? 0
      };

      return acc;
    }, {});
};


export const findAverageAccuracyForAllBlock = (pages: google.cloud.vision.v1.IPage[]): number => {
  const recordResult = pages
    .flatMap(page => page.blocks ?? [])
    .reduce((acc: Array<number>, block, index) => {
      acc.push(block.confidence ?? 0)
      return acc;
    }, []);

    return recordResult.reduce((acc: number, block, index) => {acc += block; return acc;}, 0) / recordResult.length;
};

export const findAverageAccuracyForAllPara = (pages: google.cloud.vision.v1.IPage[]): number => {
  const recordResult = pages
    .flatMap(page => page.blocks ?? [])
    .flatMap(block => block.paragraphs ?? [])
    .reduce((acc: Array<number>, paragraph, index) => {
      acc.push(paragraph.confidence ?? 0)
      return acc;
    }, []);

    return recordResult.reduce((acc: number, paragraph, index) => {acc += paragraph; return acc;}, 0) / recordResult.length;
};

export const findAverageAccuracyForAllWords = (pages: google.cloud.vision.v1.IPage[]): number => {
  const recordResult = pages
    .flatMap(page => page.blocks ?? [])
    .flatMap(block => block.paragraphs ?? [])
    .flatMap(paragraph => paragraph.words ?? [])
    .reduce((acc: Array<number>, word, index) => {
      acc.push(word.confidence ?? 0)
      return acc;
    }, []);

    return recordResult.reduce((acc: number, word, index) => {acc += word; return acc;}, 0) / recordResult.length;
};

export interface OCRComponent {
  id: string;
  type: 'TITLE' | 'HEADER' | 'TABLE_ROW' | 'LIST_ITEM' | 'BODY_TEXT';
  indentation: number;
  y: number;
  layer?: number;
  text: string;
  cells?: string[]; // Used specifically for TABLE_ROW
  confidence: number;
}

export const extractStructuredComponents = (pages: google.cloud.vision.v1.IPage[]): OCRComponent[] => {
  const Y_THRESHOLD = 15; // Vertical proximity for same-line items
  const MARGIN_THRESHOLD = 50; // Horizontal offset for indentation
  const BULLET_REGEX = /^[-•*◦\d+\.]\s?/; 

  // 1. Flatten all paragraphs across all pages
  const allParagraphs = pages.flatMap(page => 
    (page.blocks ?? []).flatMap(block => block.paragraphs ?? [])
  );

  // 2. Group into Rows based on Y-coordinate midpoints
  const rowMap: Record<string, google.cloud.vision.v1.IParagraph[]> = {};

  allParagraphs.forEach(para => {
    const v = para.boundingBox?.vertices;
    if (!v) return;

    // Calculate vertical center to handle slight skews
    const yCenter = ((v[0].y ?? 0) + (v[3].y ?? 0)) / 2;

    const existingKey = Object.keys(rowMap).find(key => 
      Math.abs(Number(key) - yCenter) < Y_THRESHOLD
    );

    const key = existingKey ?? yCenter.toString();
    if (!rowMap[key]) rowMap[key] = [];
    rowMap[key].push(para);
  });

  // 3. Process Rows into Components
  const components: OCRComponent[] = Object.keys(rowMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((y, index) => {
      const paragraphs = rowMap[y.toString()];
      
      // Sort paragraphs horizontally (Left to Right)
      const sortedParts = paragraphs.sort((a, b) => 
        (a.boundingBox?.vertices?.[0]?.x ?? 0) - (b.boundingBox?.vertices?.[0]?.x ?? 0)
      );

      // Extract text content
      const partTexts = sortedParts.map(p => 
        p.words?.map(w => w.symbols?.map(s => s.text).join('')).join(' ') ?? ""
      );

      const fullText = partTexts.join(' ').trim();
      const leftMargin = sortedParts[0]?.boundingBox?.vertices?.[0]?.x ?? 0;
      const height = Math.abs((sortedParts[0]?.boundingBox?.vertices?.[3]?.y ?? 0) - (sortedParts[0]?.boundingBox?.vertices?.[0]?.y ?? 0));
      const confidence = sortedParts.reduce((acc, p) => acc + (p.confidence ?? 0), 0) / sortedParts.length;

      // Determine Component Type
      let type: OCRComponent['type'] = 'BODY_TEXT';

      if (BULLET_REGEX.test(fullText)) {
        type = 'LIST_ITEM';
      } else if (sortedParts.length > 1) {
        type = 'TABLE_ROW';
      } else if (height > 35 && index === 0) {
        type = 'TITLE';
      } else if (height > 25 || /total|amount|date|description/i.test(fullText)) {
        type = 'HEADER';
      }

      const result: OCRComponent = {
        id: `comp_${index}`,
        type,
        indentation: leftMargin,
        y,
        layer: 0,
        text: fullText,
        confidence
      };

      if (type === 'TABLE_ROW' || type === "LIST_ITEM") {
        result.cells = partTexts;
      }

      return result;
    });

  return postProcessIndentation(components);
};

/**
 * Adjusts component types based on relative indentation (the '-' handler)
 */
function postProcessIndentation(components: OCRComponent[]): OCRComponent[] {
  return components.map(comp => {
    // If it's standard text but indented significantly, mark as nested
    if (comp.type === 'BODY_TEXT' && comp.indentation > 60) {
      // Logic to treat heavily indented text as part of a previous list item
      return { ...comp, type: 'BODY_TEXT' as const }; 
    }
    return comp;
  });
}


export const extractHierarchicalTables = (pages: google.cloud.vision.v1.IPage[]): OCRComponent[] => {
  const Y_THRESHOLD = 15;
  const INDENT_STEP = 20; // Min pixels to consider a new "Layer"
  
  // 1. Initial Row Mapping (Same as before)
  const allParagraphs = pages.flatMap(page => (page.blocks ?? []).flatMap(b => b.paragraphs ?? []));
  const rowMap: Record<string, google.cloud.vision.v1.IParagraph[]> = {};

  allParagraphs.forEach(para => {
    const v = para.boundingBox?.vertices;
    if (!v) return;
    const yCenter = ((v[0].y ?? 0) + (v[3].y ?? 0)) / 2;
    const existingKey = Object.keys(rowMap).find(k => Math.abs(Number(k) - yCenter) < Y_THRESHOLD);
    const key = existingKey ?? yCenter.toString();
    if (!rowMap[key]) rowMap[key] = [];
    rowMap[key].push(para);
  });

  // 2. Sort and Process Rows
  const rawRows = Object.keys(rowMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((y, index) => {
      const paragraphs = rowMap[y.toString()].sort((a, b) => 
        (a.boundingBox?.vertices?.[0]?.x ?? 0) - (b.boundingBox?.vertices?.[0]?.x ?? 0)
      );

      const partTexts = paragraphs.map(p => 
        p.words?.map(w => w.symbols?.map(s => s.text).join('')).join(' ') ?? ""
      );

      return {
        id: `row_${index}`,
        y,
        indentation: paragraphs[0]?.boundingBox?.vertices?.[0]?.x ?? 0,
        text: partTexts.join(' '),
        cells: paragraphs.length > 1 ? partTexts : undefined,
        type: (paragraphs.length > 1 ? 'TABLE_ROW' : 'BODY_TEXT') as OCRComponent['type']
      };
    });

  // 3. Hierarchical Layering Logic
  const currentBaseIndentation = rawRows[0]?.indentation ?? 0;
  
  return rawRows.map((row, idx) => {
    // Calculate layer based on how many "steps" it is from the base margin
    const diff = row.indentation - currentBaseIndentation;
    
    // Determine layer: if diff is 60px and step is 30px, it's Layer 3
    const layer = diff > (INDENT_STEP / 2) ? Math.floor(diff / INDENT_STEP) + 1 : 1;

    // Heuristic: If it's a TABLE_ROW and layer > 1, it's subordinate
    return {
      ...row,
      layer,
      confidence: 0 // Placeholder
    } as OCRComponent;
  });
};