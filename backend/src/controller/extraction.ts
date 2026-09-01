import {Request, Response} from 'express';
import {Session} from 'express-session';
import {DocumentJob} from '../models/Job';

type SessionRequest = Request & {
    session: Session & {
        extraction?: {
            ocrData: unknown[];
            createdAt: number;
            updatedAt: number;
        };
        jobs?: DocumentJob[];
        batchId?: string;
        activeJobIndex?: number;
    };
};

export default {
    getJobs: (req: SessionRequest, res: Response) => {
        const jobs = req.session.jobs || [];
        res.json({
            batchId: req.session.batchId || null,
            activeJobIndex: req.session.activeJobIndex ?? (jobs.length > 0 ? 0 : null),
            jobs
        });
    },

    getExtraction: (req: SessionRequest, res: Response) => {
        const {jobId, index, format} = req.query;

        if (req.session.jobs && req.session.jobs.length > 0) {
            let targetJob: DocumentJob | undefined;

            if (typeof jobId === 'string') {
                targetJob = req.session.jobs.find((j) => j.id === jobId);
            } else if (typeof index === 'string') {
                const parsedIndex = parseInt(index, 10);
                if (!isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex < req.session.jobs.length) {
                    targetJob = req.session.jobs[parsedIndex];
                }
            } else {
                // If no specific job is requested, return the combined extraction (legacy behavior for ValidationPage)
                if (format === 'job') {
                    const activeIdx = req.session.activeJobIndex ?? 0;
                    targetJob = req.session.jobs[activeIdx] || req.session.jobs[0];
                    res.json(targetJob);
                    return;
                }
                
                if (req.session.extraction) {
                    res.json(req.session.extraction.ocrData);
                    return;
                }
            }

            if (targetJob) {
                if (format === 'job') {
                    res.json(targetJob);
                    return;
                }
                res.json(targetJob.ocrData);
                return;
            }
        }

        if (req.session.extraction) {
            res.json(req.session.extraction.ocrData);
        } else {
            res.json(null);
        }
    },

    saveExtraction: (req: SessionRequest, res: Response) => {
        const {ocrData, extractedData, jobId, index} = req.body;

        if (!ocrData && !extractedData) {
            res.status(400).json({error: 'No ocrData or extractedData provided'});
            return;
        }

        const dataToSave = ocrData || extractedData;

        // Update in batch jobs if present
        if (req.session.jobs && req.session.jobs.length > 0) {
            let jobIndex: number;

            if (typeof jobId === 'string') {
                jobIndex = req.session.jobs.findIndex((j) => j.id === jobId);
            } else if (typeof index === 'number' && index >= 0 && index < req.session.jobs.length) {
                jobIndex = index;
            } else if (req.session.activeJobIndex !== undefined && req.session.activeJobIndex >= 0) {
                jobIndex = req.session.activeJobIndex;
            } else {
                jobIndex = 0;
            }

            if (jobIndex >= 0 && jobIndex < req.session.jobs.length) {
                const job = req.session.jobs[jobIndex];
                if (ocrData) job.ocrData = ocrData;
                if (extractedData) job.extractedData = extractedData;
                job.updatedAt = Date.now();
            }
        }

        if (req.session.extraction) {
            req.session.extraction.ocrData = dataToSave;
            req.session.extraction.updatedAt = Date.now();
        } else {
            req.session.extraction = {
                ocrData: dataToSave,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        }

        res.json(req.session.extraction);
    },

    setActiveJob: (req: SessionRequest, res: Response) => {
        const {index, jobId} = req.body;
        const jobs = req.session.jobs || [];

        if (jobs.length === 0) {
            res.status(404).json({error: 'No batch jobs found in session'});
            return;
        }

        let targetIndex = -1;

        if (typeof index === 'number' && index >= 0 && index < jobs.length) {
            targetIndex = index;
        } else if (typeof jobId === 'string') {
            targetIndex = jobs.findIndex((j) => j.id === jobId);
        }

        if (targetIndex === -1) {
            res.status(400).json({error: 'Invalid job index or jobId'});
            return;
        }

        req.session.activeJobIndex = targetIndex;
        const activeJob = jobs[targetIndex];

        req.session.extraction = {
            ocrData: activeJob.ocrData,
            createdAt: activeJob.createdAt,
            updatedAt: Date.now()
        };

        res.json({
            success: true,
            activeJobIndex: targetIndex,
            activeJob
        });
    }
};
