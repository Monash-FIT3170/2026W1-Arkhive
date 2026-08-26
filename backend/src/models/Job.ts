import { OCRComponent } from '../services/ocr/types/boundingBoxTypes';
import { ExtractedData } from './TableData';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DocumentJob {
  id: string;
  index: number;
  fileName: string;
  documentType: string;
  imageIndex: number;
  imageUrl: string;
  status: JobStatus;
  ocrData: OCRComponent[];
  extractedData?: ExtractedData;
  confidence: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BatchSession {
  batchId: string;
  createdAt: number;
  updatedAt: number;
  jobs: DocumentJob[];
  activeJobIndex?: number;
}

export interface BatchProgressEvent {
  type: 'job_progress' | 'retry' | 'job_completed' | 'job_failed' | 'success' | 'error';
  jobId?: string;
  fileName?: string;
  index?: number;
  total?: number;
  attempt?: number;
  maxRetries?: number;
  confidence?: number;
  message?: string;
  data?: any;
}
