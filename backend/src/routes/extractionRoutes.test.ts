import {describe, it, expect} from 'vitest';
import extractionController from '../controller/extraction';
import {DocumentJob} from '../models/Job';

function createMockReqRes(sessionData: any = {}, body: any = {}, query: any = {}) {
    const req: any = {
        session: {...sessionData},
        body,
        query
    };
    let statusCode = 200;
    let jsonResponse: any = null;

    const res: any = {
        status: (code: number) => {
            statusCode = code;
            return res;
        },
        json: (data: any) => {
            jsonResponse = data;
            return res;
        }
    };

    return {req, res, getStatus: () => statusCode, getJson: () => jsonResponse};
}

describe('Extraction Controller', () => {
    it('GET /api/extraction should return null if no session data exists', () => {
        const {req, res, getJson, getStatus} = createMockReqRes();
        extractionController.getExtraction(req, res);
        expect(getStatus()).toBe(200);
        expect(getJson()).toBeNull();
    });

    it('POST /api/extraction should save extraction to session', () => {
        const mockOcrData = [{_id: '1', text: 'Test'}];
        const {req, res, getJson, getStatus} = createMockReqRes({}, {ocrData: mockOcrData});

        extractionController.saveExtraction(req, res);
        expect(getStatus()).toBe(200);
        expect(getJson()).toHaveProperty('ocrData', mockOcrData);
        expect(req.session.extraction.ocrData).toEqual(mockOcrData);

        // Verify GET extraction retrieves the saved session
        const getMock = createMockReqRes(req.session);
        extractionController.getExtraction(getMock.req, getMock.res);
        expect(getMock.getStatus()).toBe(200);
        expect(getMock.getJson()).toEqual(mockOcrData);
    });

    it('POST /api/extraction should return 400 if neither ocrData nor extractedData is provided', () => {
        const {req, res, getJson, getStatus} = createMockReqRes({}, {});
        extractionController.saveExtraction(req, res);
        expect(getStatus()).toBe(400);
        expect(getJson()).toEqual({error: 'No ocrData or extractedData provided'});
    });

    describe('Batch Jobs & Document Management', () => {
        const mockJobs: DocumentJob[] = [
            {
                id: 'job-1',
                index: 0,
                fileName: 'invoice-01.png',
                documentType: 'Invoice',
                imageIndex: 0,
                imageUrl: '/api/upload/image/0',
                status: 'completed',
                ocrData: [{id: 'comp_1', text: 'Invoice #1'} as any],
                confidence: 0.95,
                createdAt: 1000,
                updatedAt: 1000
            },
            {
                id: 'job-2',
                index: 1,
                fileName: 'receipt-02.png',
                documentType: 'Receipt',
                imageIndex: 1,
                imageUrl: '/api/upload/image/1',
                status: 'completed',
                ocrData: [{id: 'comp_2', text: 'Total: $20'} as any],
                confidence: 0.88,
                createdAt: 1000,
                updatedAt: 1000
            }
        ];

        it('GET /api/extraction/jobs should return all batch jobs from session', () => {
            const {req, res, getJson, getStatus} = createMockReqRes({
                jobs: mockJobs,
                batchId: 'batch-123',
                activeJobIndex: 0
            });

            extractionController.getJobs(req, res);
            expect(getStatus()).toBe(200);
            expect(getJson()).toEqual({
                batchId: 'batch-123',
                activeJobIndex: 0,
                jobs: mockJobs
            });
        });

        it('GET /api/extraction?jobId=job-2 should return specific job ocrData', () => {
            const {req, res, getJson, getStatus} = createMockReqRes(
                {jobs: mockJobs},
                {},
                {jobId: 'job-2'}
            );

            extractionController.getExtraction(req, res);
            expect(getStatus()).toBe(200);
            expect(getJson()).toEqual(mockJobs[1].ocrData);
        });

        it('GET /api/extraction?jobId=job-2&format=job should return full DocumentJob object', () => {
            const {req, res, getJson, getStatus} = createMockReqRes(
                {jobs: mockJobs},
                {},
                {jobId: 'job-2', format: 'job'}
            );

            extractionController.getExtraction(req, res);
            expect(getStatus()).toBe(200);
            expect(getJson()).toEqual(mockJobs[1]);
        });

        it('POST /api/extraction/active should switch active job index and update session extraction', () => {
            const {req, res, getJson, getStatus} = createMockReqRes(
                {jobs: mockJobs, activeJobIndex: 0},
                {index: 1}
            );

            extractionController.setActiveJob(req, res);
            expect(getStatus()).toBe(200);
            expect(getJson()).toEqual({
                success: true,
                activeJobIndex: 1,
                activeJob: mockJobs[1]
            });
            expect(req.session.activeJobIndex).toBe(1);
            expect(req.session.extraction.ocrData).toEqual(mockJobs[1].ocrData);
        });

        it('POST /api/extraction with jobId should update that specific job in the batch', () => {
            const sessionJobs = JSON.parse(JSON.stringify(mockJobs));
            const updatedOcr = [{id: 'comp_2_mod', text: 'Total: $25'} as any];
            const {req, res, getStatus} = createMockReqRes(
                {jobs: sessionJobs, activeJobIndex: 0},
                {jobId: 'job-2', ocrData: updatedOcr}
            );

            extractionController.saveExtraction(req, res);
            expect(getStatus()).toBe(200);
            expect(sessionJobs[1].ocrData).toEqual(updatedOcr);
        });
    });
});
