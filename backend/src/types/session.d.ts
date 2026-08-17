import "express-session";
import type { UploadedPage } from "./upload.js";

declare module "express-session" {
	interface SessionData {
		extraction?: {
			ocrData: any;
			createdAt: number;
			updatedAt: number;
		};
		uploadedFiles?: string[];
		uploadedTypes?: string[];
		uploadedPages?: UploadedPage[];
	}
}
