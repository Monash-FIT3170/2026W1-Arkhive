import { google } from "@google-cloud/vision/build/protos/protos.js";

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



const wait = (time: number) => {
  return new Promise((resolve) => setTimeout(() => resolve("waiting"), time));
}


export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (maxRetries <= 0) {
      throw error; // No more retries left
    }
    console.log(`Retrying... attempts left: ${maxRetries}`);
    await wait(3000)
    return withRetry(fn, maxRetries - 1, delayMs); // Recursive call
  }
}