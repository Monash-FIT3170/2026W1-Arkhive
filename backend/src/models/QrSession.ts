// backend/src/models/QrSession.ts

export type QrSessionStatus = 'pending' | 'uploaded' | 'expired';

export interface QrSession {
	token: string;
	batchId: string;
	projectId?: string;
	status: QrSessionStatus;
	uploadedFileName?: string;
	uploadedImageUrl?: string;
	errorMessage?: string;
	createdAt: number;
	expiresAt: number;
	updatedAt: number;
}

export interface QrSessionCreateResult {
	token: string;
	qrPayload: string;
	expiresAt: number;
}

export interface QrPollResponse {
	status: QrSessionStatus;
	uploadedFileName?: string;
	uploadedImageUrl?: string;
	errorMessage?: string;
}