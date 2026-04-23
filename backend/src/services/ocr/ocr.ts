
//importing google vision
import { GoogleGenAI } from '@google/genai'
import fs from 'fs'
import { application } from 'express';
//creating new client using JSON credentials


//creating a client

const API_KEY = process.env.API_SECRET;

const prompt = `Perform a granular table analysis. 
1. Identify the main table grid and every individual cell.
2. Return coordinates [ymin, xmin, ymax, xmax] normalized 0-1000.
3. For each cell, provide:
   - "text": The content found inside.
   - "confidence": A score between 0.0 and 1.0 based on how legible the text is and how clear the cell boundaries are.
Output strictly in JSON.`;

const ai = new GoogleGenAI({ apiKey: API_KEY, apiVersion: 'v1beta' });
const schema = {
  type: "object",
  properties: {
    cells: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bbox: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
          text: { type: "string" },
          // Add this property
          confidence: { 
            type: "number", 
            description: "A value from 0.0 to 1.0 indicating extraction certainty" 
          }
        },
        required: ["bbox", "text", "confidence"]
      }
    }
  }
};

// function for getting bounding boxes
async function getBoundingBoxes(imageBuffer: Buffer, mimeType: string) {
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { 
            inlineData: { 
              data: imageBuffer.toString("base64"), 
              mimeType: mimeType 
            } 
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: schema
    }
  });
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

// function for getting individual confidence score



// function for getting overall averaged confidence score