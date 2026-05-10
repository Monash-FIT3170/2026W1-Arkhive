import { google } from "@google-cloud/vision/build/protos/protos.js";
import { OCRBoundingBox, OCRBoundingBoxes, OCRComponent } from "../types/boundingBoxTypes.js";

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

export const flattenParagraphsToCellMap = (pages: google.cloud.vision.v1.IParagraph[]): OCRBoundingBoxes  => {
  return pages
    .reduce((acc: OCRBoundingBoxes , paragraph, index) => {
      const key = `cell_${index}`;
      
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

      if (sortedParts.length > 1) {
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
        confidence,
        boundingBoxes: flattenParagraphsToCellMap(sortedParts)
      };

      if (type === 'TABLE_ROW') {
        result.cells = partTexts;
      }

      return result;
    });

  return postProcessIndentation(components);
};

/**
 * Adjusts component types based on relative indentation (the level handler)
 * 
 * Author: Harsha Sharma 
 * 
 */
function postProcessIndentation(components: OCRComponent[]): OCRComponent[] {
  const INDENT_STEP = 30; // Pixels that constitute a new nesting level
  const stack: OCRComponent[] = [];

  //Heuristic: very first table row is always a list of table columns
  const firstIndex = components.findIndex(c => c.type === "TABLE_ROW");

  components.map((comp, ind) => {
    if (ind == firstIndex){
      comp.type = "TABLE_COLS";
    }
  })

  const table_cols = components[components.findIndex(c => c.type === "TABLE_COLS")];

  return components.map((comp, index) => {
    comp.type == "TABLE_ROW" ? Object.keys(comp.boundingBoxes!).map(
      (num1, _) => 
      Object.keys(table_cols.boundingBoxes!).map((num,  _) => {
        const column = table_cols.boundingBoxes![num.toString()];
        const cell = comp.boundingBoxes![num1.toString()];
        const leftMarginOfCol = column.vertices[0].x
        const widthOfCol = column.vertices[1].x - leftMarginOfCol

        const leftMarginOfCell = cell.vertices[0].x
        const widthOfCell = cell.vertices[1].x - leftMarginOfCell

        if (leftMarginOfCol <= leftMarginOfCell + widthOfCell &&
          leftMarginOfCell <= leftMarginOfCol + widthOfCol 
        ){
          cell.column = column.text;
        }
      })
    ) : ""
    // 1. Pop from stack if current component is further left than the top of stack
    // This means we've "closed" a nested section
    while (stack.length > 0 && comp.indentation <= stack[stack.length - 1].indentation - 5) {
      stack.pop();
    }

    // 2. Determine Parent
    const parent = stack[stack.length - 1];
    if (parent) {
      comp.parentId = parent.id;
      comp.layer = stack.length;
    } else {
      comp.layer = 0;
    }

    // 3. Heuristic: Should this component be a parent for the NEXT ones?
    // Usually List Items or Headers "own" the indented text below them
    const isPotentialParent = comp.type === 'HEADER';
    
    // Also, if the NEXT item is indented significantly more than this one, 
    // this item is effectively the parent.
    const nextComp = components[index + 1];
    const nextIsIndented = nextComp && nextComp.indentation > comp.indentation + INDENT_STEP;

    if (isPotentialParent || nextIsIndented) {
      stack.push(comp);
    }

    return comp;
  });
}
