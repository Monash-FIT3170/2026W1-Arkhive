import "express-session";

declare module "express-session" {
	interface SessionData {
		extraction: {
			ocrData: any;
			createdAt: number;
			updatedAt: number;
		};
	}
}
