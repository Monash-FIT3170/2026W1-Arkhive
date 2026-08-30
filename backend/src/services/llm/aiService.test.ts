// This test file was generated with the assistance of Google Gemini.

//Mocks Gemini API calls and checks for issues with our own logic
import { describe, it, expect, vi } from 'vitest';
import aiService from './aiService';

// We mock GoogleGenerativeAI since we only want to unit test the pure functions and logic,
// and we don't want to make actual API calls to Gemini.
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          startChat: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockResolvedValue({
              response: {
                text: () => JSON.stringify({
                  response: "I've made the requested changes.",
                  intent: {
                    type: "correction",
                    column: "PRICE",
                    rowId: "row_1",
                    newValue: "12.00"
                  }
                })
              }
            })
          }),
          generateContent: vi.fn().mockImplementation((prompt: string) => {
            let responseText = "";

            if (prompt.includes("Identify columns with a consistent format")) {
              // Mock response for detectTableFormats
              responseText = JSON.stringify({
                formats: [
                  { column: "PRICE", regex: "^\\d{1,3}(,\\d{3})*$" }
                ]
              });
            } else if (prompt.includes("review the \"PRICE\" field")) {
              // Mock response for suggestFieldCorrection (formatting issue)
              responseText = JSON.stringify({
                response: "Corrected format to match the rest of the column.",
                intent: {
                  type: "correction",
                  column: "PRICE",
                  rowId: "row_2",
                  newValue: "500",
                  oldValue: "$500",
                  note: "Removed formatting artifact"
                }
              });
            } else {
              // Mock response for suggestFieldCorrection (low confidence)
              responseText = JSON.stringify({
                response: "Is this meant to be 10?",
                intent: {
                  type: "correction",
                  column: "QTY",
                  rowId: "row_1",
                  newValue: "10",
                  oldValue: "1O",
                  note: "Cleaned OCR artifact"
                }
              });
            }

            return Promise.resolve({
              response: {
                text: () => responseText
              }
            });
          })
        };
      }
    },
    SchemaType: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      BOOLEAN: 'BOOLEAN',
      ARRAY: 'ARRAY'
    }
  };
});

describe('aiService', () => {
  const dummyContext = {
    columns: ['ITEM', 'QTY', 'PRICE'],
    rows: [
      { _id: 'row_1', ITEM: 'Apple', QTY: '1O', PRICE: '10.00' },
      { _id: 'row_2', ITEM: 'Banana', QTY: '5', PRICE: '2.50' }
    ]
  };

  describe('sendMessageToGemini', () => {
    it('should correctly apply a correction intent to the document context', async () => {
      const messages = [{ role: 'user' as const, content: 'Change Apple price to 12.00' }];
      
      const result = await aiService.sendMessageToGemini(messages, dummyContext);
      
      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('intent');
      expect(result.updatedContext).toBeDefined();
      
      // Check if context was actually updated based on our mocked Gemini response
      const updatedRow = result.updatedContext.rows.find((r: any) => r._id === 'row_1');
      expect(updatedRow?.PRICE).toBe('12.00');
    });

    it('should not throw when document context is undefined', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const result = await aiService.sendMessageToGemini(messages, undefined);
      
      expect(result.updatedContext).toBeUndefined();
    });
  });

  describe('suggestFieldCorrection', () => {
    it('should suggest a correction and return updated context', async () => {
      const fieldToCorrect = {
        column: 'QTY',
        rowId: 'row_1',
        value: '1O',
        confidence: 0.4
      };
      
      const result = await aiService.suggestFieldCorrection(fieldToCorrect, dummyContext);
      
      expect(result.intent.newValue).toBe('10');
      const updatedRow = result.updatedContext.rows.find((r: any) => r._id === 'row_1');
      expect(updatedRow?.QTY).toBe('10');
    });

    it('should suggest a correction for a formatting inconsistency and return updated context', async () => {
      const fieldToCorrect = {
        column: 'PRICE',
        rowId: 'row_2',
        value: '$500',
        confidence: 0.9,
        issueType: 'format' as const
      };
      
      const result = await aiService.suggestFieldCorrection(fieldToCorrect, dummyContext);
      
      expect(result.intent.newValue).toBe('500');
      const updatedRow = result.updatedContext.rows.find((r: any) => r._id === 'row_2');
      expect(updatedRow?.PRICE).toBe('500');
    });
  });

  describe('detectTableFormats', () => {
    it('should correctly identify and return formatting regexes for valid columns', async () => {
      const sampledData = {
        'PRICE': ['10.00', '2.50', '5.00', '100.00']
      };

      const result = await aiService.detectTableFormats(sampledData);

      expect(result).toHaveProperty('PRICE');
      expect(result['PRICE']).toBe('^\\d{1,3}(,\\d{3})*$');
    });
  });
});
