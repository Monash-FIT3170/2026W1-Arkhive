import {Request, Response} from 'express';
import {parseTableWithRetries} from '../services/ocr/ocr.ts';
import {DocumentJob} from '../models/Job';
import 'express-session';
import 'multer';
import fs from 'fs';
import path from 'path';

function calculateAverageConfidence(ocrData: any[]): number {
    const componentsWithConfidence = ocrData.filter(
        (comp) => typeof comp.confidence === 'number'
    );
    if (componentsWithConfidence.length === 0) return 0;
    const total = componentsWithConfidence.reduce(
        (sum, comp) => sum + comp.confidence,
        0
    );
    return total / componentsWithConfidence.length;
}

export default {
    processUpload: async (req: Request, res: Response) => {
        const files = (req as any).files as Express.Multer.File[] | undefined;

        if (!files || files.length === 0) {
            res.status(400).json({
                error:
                    'No files received. Send images as multipart/form-data with field name "pages".'
            });
            return;
        }

        try {
            // Auto-cleanup: If the user previously uploaded files in this session, delete them to keep the disk clear.
            // This ensures we do not hoard unused images indefinitely.
            if (req.session.uploadedFiles) {
                for (const filename of req.session.uploadedFiles) {
                    const oldPath = path.join(process.cwd(), 'uploads', filename);
                    if (fs.existsSync(oldPath)) {
                        try {
                            fs.unlinkSync(oldPath);
                        } catch (err) {
                            console.error('Failed to delete old session file:', oldPath, err);
                        }
                    }
                }
            }

            // Parse metadata if sent from frontend
            const metadataStr = req.body.metadata;
            let metadata: { type: string; fileName?: string }[] = [];
            if (metadataStr) {
                try {
                    metadata = JSON.parse(metadataStr);
                } catch (e) {
                    console.error("Failed to parse metadata", e);
                }
            }

            const batchId = `batch-${Date.now()}`;
            const totalDocuments = files.length;

            // Save the new filenames and classifications to the session
            req.session.uploadedFiles = files.map((f) => f.filename);
            req.session.uploadedTypes = metadata.map((m) => m.type);
            req.session.batchId = batchId;
            req.session.activeJobIndex = 0;

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');

            // Process each document as a distinct job in the batch
            const jobs: DocumentJob[] = await Promise.all(
                files.map(async (file, index) => {
                    const docMeta = metadata[index] || {type: 'Other', fileName: file.originalname};
                    const fileName = docMeta.fileName || file.originalname;
                    const docType = docMeta.type || 'Other';
                    const jobId = `job-${Date.now()}-${index}`;

                    res.write(
                        JSON.stringify({
                            type: 'job_progress',
                            jobId,
                            fileName,
                            index: index + 1,
                            total: totalDocuments,
                            status: 'processing'
                        }) + '\n'
                    );

                    console.log(`Processing batch job ${index + 1}/${totalDocuments}: ${fileName} (${file.originalname})`);

                    try {
                        const buffer = fs.readFileSync(file.path);
                        const ocrComponents = await parseTableWithRetries(buffer, (attempt, max) => {
                            res.write(
                                JSON.stringify({
                                    type: 'retry',
                                    jobId,
                                    fileName,
                                    attempt,
                                    maxRetries: max
                                }) + '\n'
                            );
                        });

                        const confidence = calculateAverageConfidence(ocrComponents);

                        const job: DocumentJob = {
                            id: jobId,
                            index,
                            fileName,
                            documentType: docType,
                            imageIndex: index,
                            imageUrl: `/api/upload/image/${index}`,
                            status: 'completed',
                            ocrData: ocrComponents,
                            confidence,
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        };

                        res.write(
                            JSON.stringify({
                                type: 'job_completed',
                                jobId,
                                fileName,
                                index: index + 1,
                                total: totalDocuments,
                                confidence
                            }) + '\n'
                        );

                        return job;
                    } catch (e: any) {
                        console.error(`OCR failed for batch job ${index + 1}/${totalDocuments} (${fileName})`, e);
                        const errMsg =
                            e && e.message && e.message.includes('NoTextDetectedError')
                                ? e.message.replace('NoTextDetectedError: ', '')
                                : 'OCR failed. Please double check and reupload your document.';

                        res.write(
                            JSON.stringify({
                                type: 'job_failed',
                                jobId,
                                fileName,
                                index: index + 1,
                                total: totalDocuments,
                                message: errMsg
                            }) + '\n'
                        );

                        const job: DocumentJob = {
                            id: jobId,
                            index,
                            fileName,
                            documentType: docType,
                            imageIndex: index,
                            imageUrl: `/api/upload/image/${index}`,
                            status: 'failed',
                            ocrData: [],
                            confidence: 0,
                            errorMessage: errMsg,
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        };

                        return job;
                    }
                })
            );

            // Save jobs array to session
            req.session.jobs = jobs;

            // Save primary/active extraction into session for single-doc / backward compatibility
            const activeOcrData = jobs[0]?.ocrData || [];
            req.session.extraction = {
                ocrData: activeOcrData,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            res.write(
                JSON.stringify({
                    type: 'success',
                    data: {
                        success: true,
                        batchId,
                        pageCount: totalDocuments,
                        jobs,
                        ocrData: activeOcrData
                    }
                }) + '\n'
            );
            res.end();
        } catch (error) {
            console.error('Batch upload error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'OCR batch processing failed. Check that your Google Vision credentials are configured.'
                });
            } else {
                res.write(
                    JSON.stringify({
                        type: 'error',
                        message: 'OCR batch processing failed. Check your Google Vision credentials.'
                    }) + '\n'
                );
                res.end();
            }
        }
    }
};
