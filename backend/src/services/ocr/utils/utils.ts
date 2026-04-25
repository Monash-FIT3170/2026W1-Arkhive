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
