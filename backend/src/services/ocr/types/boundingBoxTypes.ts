export interface Vertex {
  x: number;
  y: number;
}

export interface OCRBoundingBox {
  text: string;
  column?: string;
  vertices: Vertex[]
  confidence: number
}


export interface OCRComponent {
  id: string;
  type: 'TITLE' | 'HEADER' | 'TABLE_ROW' | 'BODY_TEXT' | 'TABLE_COLS';
  indentation: number;
  y: number;
  layer: number;
  parentId?: string;
  text: string;
  cells?: string[];
  confidence: number;
  boundingBoxes?: OCRBoundingBoxes;
}


export const geminiSchemaBBoxPrompt = {
  "type": "OBJECT",
  "properties": {
    "components": {
      "type": "ARRAY",
      "description": "List of OCR layout components extracted from the document",
      "items": {
        "type": "OBJECT",
        "properties": {
          "id": {
            "type": "STRING"
          },
          "type": {
            "type": "STRING",
            "enum": [
              "TITLE",
              "HEADER",
              "TABLE_ROW",
              "BODY_TEXT",
              "TABLE_COLS"
            ]
          },
          "indentation": {
            "type": "NUMBER"
          },
          "y": {
            "type": "NUMBER"
          },
          "layer": {
            "type": "INTEGER"
          },
          "parentId": {
            "type": "STRING"
          },
          "text": {
            "type": "STRING"
          },
          "cells": {
            "type": "ARRAY",
            "items": {
              "type": "STRING"
            }
          },
          "confidence": {
            "type": "NUMBER"
          },
          "boundingBoxes": {
            "type": "ARRAY",
            "description": "Array representation of the bounding boxes record for compatibility",
            "items": {
              "type": "OBJECT",
              "properties": {
                "key": {
                  "type": "STRING"
                },
                "box": {
                  "type": "OBJECT",
                  "properties": {
                    "text": {
                      "type": "STRING"
                    },
                    "column": {
                      "type": "STRING"
                    },
                    "confidence": {
                      "type": "NUMBER"
                    },
                    "vertices": {
                      "type": "ARRAY",
                      "items": {
                        "type": "OBJECT",
                        "properties": {
                          "x": {
                            "type": "NUMBER"
                          },
                          "y": {
                            "type": "NUMBER"
                          }
                        },
                        "required": ["x", "y"]
                      }
                    }
                  },
                  "required": ["text", "vertices", "confidence"]
                }
              },
              "required": ["key", "box"]
            }
          }
        },
        "required": [
          "id",
          "type",
          "indentation",
          "y",
          "boundingBoxes",
          "layer",
          "text",
          "confidence"
        ]
      }
    }
  }
}

export type OCRBoundingBoxes = Record<string, OCRBoundingBox>