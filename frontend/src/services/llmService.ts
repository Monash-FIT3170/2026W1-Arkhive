import type { ChatRequest, ChatResponse, Message, ReviewField } from '../models/Message';
import type { ExtractedData } from '../models/TableData';

export async function sendMessage(
  messages: Message[],
  documentContext?: ExtractedData
): Promise<ChatResponse> {
  const response = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      documentContext,
    } as ChatRequest),
  });
  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  const data = await response.json();
  console.log(data);
  return data.reply;
}

export async function requestFieldReview(
  field: ReviewField,
  documentContext: ExtractedData
): Promise<ChatResponse> {
  const response = await fetch('/api/llm/chat/review-field', {
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

export async function requestFormatDetection(
  sampledData: Record<string, string[]>
): Promise<Record<string, string>> {
  const response = await fetch('/api/llm/chat/detect-format', {
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
