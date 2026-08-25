import {
  BulkReviewFieldRequest,
  ChatRequest,
  Message,
  ReviewField,
  ReviewFieldRequest,
} from '../models/message';
import { Router, Request, Response } from 'express';

import aiService from '../services/llm/aiService';

export default {
  chatWithModel: async (req: Request<{}, {}, ChatRequest>, res: Response) => {
    try {
      const { messages, documentContext } = req.body;

      if (!messages || messages.length === 0) {
        res.status(400).json({ error: 'No messages provided' });
        return;
      }

      const reply = await aiService.sendMessageToGemini(messages, documentContext);
      console.log(reply);
      res.json({ reply });
    } catch (error) {
      console.error('Error communicating with Gemini:', error);
      res.status(500).json({
        response: 'Sorry, I encountered an error on the server.',
        intent: null,
      });
    }
  },
  reviewField: async (req: Request<{}, {}, ReviewFieldRequest>, res: Response) => {
    try {
      const { field, documentContext } = req.body;
      if (!field || !documentContext) {
        return res.status(400).json({ error: 'field and documentContext are required' });
      }
      const reply = await aiService.suggestFieldCorrection(field, documentContext);
      console.log(reply);
      res.json({ reply });
    } catch (error) {
      console.error('Error communicating with Gemini:', error);
      res.status(500).json({
        response: 'Sorry, I encountered an error while checking that field.',
        intent: null,
      });
    }
  },
  reviewBulk: async (req: Request<{}, {}, BulkReviewFieldRequest>, res: Response) => {
    try {
      const { column, fields, formatRegex, documentContext } = req.body;
      if (!fields || !documentContext) {
        return res.status(400).json({ error: 'field and documentContext are required' });
      }
      const reply = await aiService.suggestBulkFieldCorrections(column, fields, documentContext);
      console.log(reply);
      res.json({ reply });
    } catch (error) {
      console.error('Error communicating with Gemini:', error);
      res.status(500).json({
        response: 'Sorry, I encountered an error while checking that field.',
        intent: null,
      });
    }
  },
  detectFormat: async (req: Request, res: Response) => {
    try {
      const { sampledData } = req.body;
      if (!sampledData) {
        return res.status(400).json({ error: 'sampledData is required' });
      }
      const regexMap = await aiService.detectTableFormats(sampledData);
      console.log('Detected formats:', regexMap);
      res.json({ regexMap });
    } catch (error) {
      console.error('Error in format detection:', error);
      res.status(500).json({
        error: 'Sorry, I encountered an error during format detection.',
      });
    }
  },
};
