import { google } from "@google-cloud/vision/build/protos/protos";
import { OCRBoundingBoxes, OCRComponent } from "../types/boundingBoxTypes";


/**
 * This is the main function that processes and extracts data into OCRComponent list
 * 
 * @param pages: an OCR IPage from google vision
 * 
 * @returns OCRComponent[] or a list of OCRComponents that was detected in the pages
 */
export const extractStructuredComponents = (pages: google.cloud.vision.v1.IPage[]): OCRComponent[] => {
  const rowMap: Record<string, google.cloud.vision.v1.IParagraph[]> = {};
  processParagraphsAndFillRowMap(pages, rowMap)
  // 3. Process Rows into Components
  const components: OCRComponent[] = Object.keys(rowMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((comp, ind) => identifyTypeAndCreateComponents(comp, ind, rowMap));

  return postProcessIndentation(components);
};




/**
 * This flattens an array of paragraphs into OCRBoundingBoxes, essentially in one page compressing all detected paragraphs
 * into OCR components 
 * 
 * @param pages 
 * @returns OCRBoundingBoxes 
 */
const flattenParagraphsToCellMap = (pages: google.cloud.vision.v1.IParagraph[]): OCRBoundingBoxes  => {
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


/** 
 * This function firsts identifies the first table row and assumes based on heuristic that it is 
 * the columns of the table (and labels it TABLE_COLS) and then afterwards uses DFS or Depth First Search
 * based on indentation
 * 
 * in the stack: if the item at the top of the stack is greater in indentation than the current component then 
 * traverse down the component and find parents and assign layers appropriately
 * 
 * @param components 
 * @returns 
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

  return components.map((comp, index) => {
    AddColumnsToRows(comp, components)



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




/**
 * This function takes a list of Google vision OCR pages and flattens them into a list of paragraphs from all pages then afterwards
 * it populates the rowMap with values.
 * 
 * @param pages 
 * @param rowMap 
 * @returns void
 */
const processParagraphsAndFillRowMap = (pages: google.cloud.vision.v1.IPage[], rowMap: Record<string, google.cloud.vision.v1.IParagraph[]>) => {
  const Y_THRESHOLD = 15;
  const allParagraphs = pages.flatMap(page => 
    (page.blocks ?? []).flatMap(block => block.paragraphs ?? [])
  );

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

  return allParagraphs;
}

/**
 * A function that for each component in the rowMap identifies the type and also creates an OCRComponent based on it
 * there are 3 types (visible in the OCRComponent types)
 * - TITLE
 * - TABLE_ROW
 * - HEADER
 * - BODY_TEXT
 * - TABLE_COL (will be elaborated in another function)
 * 
 * @param y 
 * @param index 
 * @param rowMap 
 * @returns void
 */
const identifyTypeAndCreateComponents  = (y: number, index: number, rowMap: Record<string, google.cloud.vision.v1.IParagraph[]>) => {
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
    }



/**
 * For each cell in an OCRComponent, assign appropriate columns based on intersections in the ranges of x 
 * for the bounding box and the cell bounding box 
 * 
 * the main assumption here is that there will always be horizontal intersection between the column cell and
 * row cell if it is part of a column
 * 
 * @param comp 
 * @param components 
 * @returns void
 */
const AddColumnsToRows = (comp: OCRComponent, components: OCRComponent[]) => {
  const table_cols = components[components.findIndex(c => c.type === "TABLE_COLS")];
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
  }

