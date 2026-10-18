import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import llmController from './llm';
// This test file was generated with the assistance of Google Gemini.
vi.mock('../services/llm/aiService', () => ({
  default: {
    sendMessageToGemini: vi.fn(),
    suggestFieldCorrection: vi.fn(),
    suggestBulkFieldCorrections: vi.fn(),
    detectTableFormats: vi.fn(),
  },
}));

import aiService from '../services/llm/aiService';

function createMockReqRes(body: any = {}) {
  const req = {
    body,
  } as Request<any, any, any>;

  let statusCode = 200;
  let jsonResponse: any = null;

  const res = {
    status: vi.fn().mockImplementation((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: any) => {
      jsonResponse = data;
      return res;
    }),
  } as unknown as Response;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
  };
}

describe('LLM Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('chatWithModel', () => {
    it('returns 400 when messages array is missing or empty', async () => {
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        messages: [],
      });

      await llmController.chatWithModel(req, res);

      expect(getStatusCode()).toBe(400);
      expect(getJsonResponse()).toEqual({ error: 'No messages provided' });
    });

    it('delegates to aiService.sendMessageToGemini and returns reply', async () => {
      const mockReply = { response: 'Here is the summary', intent: null };
      vi.mocked(aiService.sendMessageToGemini).mockResolvedValueOnce(mockReply as any);

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        messages: [{ role: 'user', content: 'Explain total' }],
        documentContext: { tables: [] },
      });

      await llmController.chatWithModel(req, res);

      expect(aiService.sendMessageToGemini).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Explain total' }],
        { tables: [] }
      );
      expect(getStatusCode()).toBe(200);
      expect(getJsonResponse()).toEqual({ reply: mockReply });
    });

    it('returns 500 with fallback object when aiService throws', async () => {
      vi.mocked(aiService.sendMessageToGemini).mockRejectedValueOnce(new Error('Gemini API timeout'));

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        messages: [{ role: 'user', content: 'Fix table' }],
      });

      await llmController.chatWithModel(req, res);

      expect(getStatusCode()).toBe(500);
      expect(getJsonResponse()).toEqual({
        response: 'Sorry, I encountered an error on the server.',
        intent: null,
      });
    });
  });

  describe('reviewField', () => {
    it('returns 400 when field or documentContext is missing', async () => {
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        field: { name: 'TOTAL' },
      });

      await llmController.reviewField(req, res);

      expect(getStatusCode()).toBe(400);
      expect(getJsonResponse()).toEqual({ error: 'field and documentContext are required' });
    });

    it('delegates to aiService.suggestFieldCorrection and returns reply', async () => {
      const mockReply = {
        response: 'Suggesting correction',
        intent: { type: 'correction', column: 'TOTAL', rowId: 'r1', newValue: '50.00' },
      };
      vi.mocked(aiService.suggestFieldCorrection).mockResolvedValueOnce(mockReply as any);

      const fieldObj = { name: 'TOTAL', value: '5O.OO' };
      const docContext = { rows: [] };

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        field: fieldObj,
        documentContext: docContext,
      });

      await llmController.reviewField(req, res);

      expect(aiService.suggestFieldCorrection).toHaveBeenCalledWith(fieldObj, docContext);
      expect(getStatusCode()).toBe(200);
      expect(getJsonResponse()).toEqual({ reply: mockReply });
    });

    it('returns 500 when suggestFieldCorrection throws an error', async () => {
      vi.mocked(aiService.suggestFieldCorrection).mockRejectedValueOnce(new Error('LLM error'));

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        field: { name: 'QTY' },
        documentContext: {},
      });

      await llmController.reviewField(req, res);

      expect(getStatusCode()).toBe(500);
      expect(getJsonResponse()).toEqual({
        response: 'Sorry, I encountered an error while checking that field.',
        intent: null,
      });
    });
  });

  describe('reviewBulk', () => {
    it('returns 400 when column, fields, or documentContext is missing', async () => {
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        column: 'QTY',
      });

      await llmController.reviewBulk(req, res);

      expect(getStatusCode()).toBe(400);
      expect(getJsonResponse()).toEqual({
        error: 'column, fields and documentContext are required',
      });
    });

    it('delegates to aiService.suggestBulkFieldCorrections and returns reply', async () => {
      const mockReply = { response: 'Bulk corrections', intent: null };
      vi.mocked(aiService.suggestBulkFieldCorrections).mockResolvedValueOnce(mockReply as any);

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        column: 'DATE',
        fields: [{ rowId: 'r1', value: '2026/01/01' }],
        documentContext: { rows: [] },
        formatRegex: '^\\d{4}-\\d{2}-\\d{2}$',
        tableId: 't1',
      });

      await llmController.reviewBulk(req, res);

      expect(aiService.suggestBulkFieldCorrections).toHaveBeenCalledWith(
        'DATE',
        [{ rowId: 'r1', value: '2026/01/01' }],
        { rows: [] },
        '^\\d{4}-\\d{2}-\\d{2}$',
        't1'
      );
      expect(getStatusCode()).toBe(200);
      expect(getJsonResponse()).toEqual({ reply: mockReply });
    });

    it('returns 500 when suggestBulkFieldCorrections throws an error', async () => {
      vi.mocked(aiService.suggestBulkFieldCorrections).mockRejectedValueOnce(new Error('Bulk fail'));

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        column: 'PRICE',
        fields: [],
        documentContext: {},
      });

      await llmController.reviewBulk(req, res);

      expect(getStatusCode()).toBe(500);
      expect(getJsonResponse()).toEqual({
        response: 'Sorry, I encountered an error while checking that field.',
        intent: null,
      });
    });
  });

  describe('detectFormat', () => {
    it('returns 400 when sampledData is missing', async () => {
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({});

      await llmController.detectFormat(req, res);

      expect(getStatusCode()).toBe(400);
      expect(getJsonResponse()).toEqual({ error: 'sampledData is required' });
    });

    it('delegates to aiService.detectTableFormats and returns regexMap', async () => {
      const mockRegexMap = { DATE: '^\\d{4}-\\d{2}-\\d{2}$', PRICE: '^\\d+\\.\\d{2}$' };
      vi.mocked(aiService.detectTableFormats).mockResolvedValueOnce(mockRegexMap as any);

      const sampled = { DATE: ['2026-01-01', '2026-02-01'] };
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        sampledData: sampled,
      });

      await llmController.detectFormat(req, res);

      expect(aiService.detectTableFormats).toHaveBeenCalledWith(sampled);
      expect(getStatusCode()).toBe(200);
      expect(getJsonResponse()).toEqual({ regexMap: mockRegexMap });
    });

    it('returns 500 when detectTableFormats throws an error', async () => {
      vi.mocked(aiService.detectTableFormats).mockRejectedValueOnce(new Error('Format error'));

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        sampledData: {},
      });

      await llmController.detectFormat(req, res);

      expect(getStatusCode()).toBe(500);
      expect(getJsonResponse()).toEqual({
        error: 'Sorry, I encountered an error during format detection.',
      });
    });
  });
});
