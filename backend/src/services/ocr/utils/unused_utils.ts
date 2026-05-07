import { google } from "@google-cloud/vision/build/protos/protos";
import { OCRBoundingBoxes } from "../types/boundingBoxTypes";

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
