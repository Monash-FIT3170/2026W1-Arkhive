import type {
  BulkReviewFieldRequest,
  ChatRequest,
  ChatResponse,
  Message,
  ReviewField,
} from '../models/Message';
import type { ExtractedPage } from '../models/TableData';
import { apiUrl } from './apiBase';

export async function sendMessage(
  messages: Message[],
  documentContext?: ExtractedPage
): Promise<ChatResponse> {
  const response = await fetch(apiUrl('/api/llm/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      documentContext,
    } satisfies ChatRequest),
  });
  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  const data = await response.json();
  return data.reply;
}

export async function requestFieldReview(
  field: ReviewField,
  documentContext: ExtractedPage
): Promise<ChatResponse> {
  const response = await fetch(apiUrl('/api/llm/chat/review-field'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, documentContext }),
  });
  if (!response.ok) {
    throw new Error('Failed to get field review suggestion');
  }
  const data = await response.json();
  return data.reply;
}

export async function requestBulkFieldReview(
  request: BulkReviewFieldRequest
): Promise<ChatResponse> {
  const response = await fetch(apiUrl('/api/llm/chat/review-field-bulk'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error('Failed to get bulk field review suggestion');
  }
  const data = await response.json();
  return data.reply;
}

export async function requestFormatDetection(
  sampledData: Record<string, string[]>
): Promise<Record<string, string>> {
  const response = await fetch(apiUrl('/api/llm/chat/detect-format'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampledData }),
  });
  if (!response.ok) {
    throw new Error('Failed to get format detection');
  }
  const data = await response.json();
  return data.regexMap;
}
