// This test file was generated with the assistance of Google Gemini.

// Tests express routes directly rather than using axios to avoid circular dependencies
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import extractionRoutes from './extractionRoutes';

const app = express();

app.use(express.json());
app.use(
  session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
  })
);

app.use('/api/extraction', extractionRoutes);

describe('Extraction Routes', () => {
  it('GET /api/extraction should return null if no session data exists', async () => {
    const res = await request(app).get('/api/extraction');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('POST /api/extraction should save extraction to session', async () => {
    const agent = request.agent(app);
    
    // Step 1: POST to save data
    const mockOcrData = [{ _id: '1', text: 'Test' }];
    const postRes = await agent
      .post('/api/extraction')
      .send({ ocrData: mockOcrData });
      
    expect(postRes.status).toBe(200);
    expect(postRes.body).toHaveProperty('ocrData');
    expect(postRes.body.ocrData).toEqual(mockOcrData);
    
    // Step 2: GET to verify it was saved in session
    const getRes = await agent.get('/api/extraction');
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(mockOcrData);
  });

  it('POST /api/extraction should return 400 if no ocrData is provided', async () => {
    const res = await request(app).post('/api/extraction').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No ocrData provided' });
  });
});
