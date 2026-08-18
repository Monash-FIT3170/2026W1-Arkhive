import type { ExtractedData } from '../models/TableData';
import type { OCRComponent } from '../models/OCRComponent';
import type { DocumentJob } from '../models/Job';

export async function getExtractionSession(jobIdOrIndex?: string | number) {
  let url = '/api/extraction';
  if (typeof jobIdOrIndex === 'string') {
    url += `?jobId=${encodeURIComponent(jobIdOrIndex)}`;
  } else if (typeof jobIdOrIndex === 'number') {
    url += `?index=${jobIdOrIndex}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch extraction session');
  }

  return await response.json();
}

export async function getBatchJobs(): Promise<{
  batchId: string | null;
  activeJobIndex: number | null;
  jobs: DocumentJob[];
}> {
  const response = await fetch('/api/extraction/jobs', {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch batch jobs');
  }

  return await response.json();
}

export async function saveExtractionSession(
  data: ExtractedData | OCRComponent[],
  jobIdOrIndex?: string | number
) {
  const payload: any = { ocrData: data };

  if (typeof jobIdOrIndex === 'string') {
    payload.jobId = jobIdOrIndex;
  } else if (typeof jobIdOrIndex === 'number') {
    payload.index = jobIdOrIndex;
  }

  const response = await fetch('/api/extraction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Failed to save extraction session');
  }

  return await response.json();
}

export async function setActiveBatchJob(indexOrJobId: number | string): Promise<{
  success: boolean;
  activeJobIndex: number;
  activeJob: DocumentJob;
}> {
  const payload: any = {};
  if (typeof indexOrJobId === 'number') {
    payload.index = indexOrJobId;
  } else {
    payload.jobId = indexOrJobId;
  }

  const response = await fetch('/api/extraction/active', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Failed to set active batch job');
  }

  return await response.json();
}
