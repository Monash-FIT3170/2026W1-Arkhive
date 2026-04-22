
//importing google vision
import { GoogleGenAI } from '@google/genai'
import fs from 'fs'
import { application } from 'express';
//creating new client using JSON credentials


//creating a client

const API_KEY = process.env.API_SECRET;

const prompt = `Perform a granular table analysis. 
1. Identify the main table grid.
2. Detect EVERY individual cell (intersection of row and column).
3. Return each cell's [ymin, xmin, ymax, xmax] normalized 0-1000.
4. Label each box with the text found inside that specific cell.
Output strictly in JSON.`;

const ai = new GoogleGenAI({ apiKey: API_KEY, apiVersion: 'v1beta' });

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
      thinkingConfig: {
    includeThoughts: false
  },
  // Reducing temperature can sometimes increase speed in 'Flash' models
  temperature: 0.1,
  maxOutputTokens: 1000  
    }
  });
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

// function for getting individual confidence score



// function for getting overall averaged confidence score