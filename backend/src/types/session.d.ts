import "express-session";
import { DocumentJob } from "../models/Job";

declare module "express-session" {
	interface SessionData {
		extraction?: {
			ocrData: any;
			createdAt: number;
			updatedAt: number;
		};
		uploadedFiles?: string[];
		uploadedTypes?: string[];
		jobs?: DocumentJob[];
		batchId?: string;
		activeJobIndex?: number;
	}
}
