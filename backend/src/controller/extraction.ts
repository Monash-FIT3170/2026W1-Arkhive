import { Request, Response } from "express";

export default {
	getExtraction: (req: Request, res: Response) => {
		if (req.session.extraction) {
			res.json(req.session.extraction);
		} else {
			res.json(null);
		}
	},

	saveExtraction: (req: Request, res: Response) => {
		// Extract both structured OCR data and raw text from the incoming payload
		const { ocrData, rawText } = req.body;

		if (!ocrData) {
			res.status(400).json({ error: "No ocrData provided" });
			return;
		}

		if (req.session.extraction) {
			req.session.extraction.ocrData = ocrData;
			// Append raw text to the existing session object
			req.session.extraction.rawText = rawText;
			req.session.extraction.updatedAt = Date.now();
		} else {
			// Initialize a new session containing both data streams
			req.session.extraction = {
				ocrData,
				rawText,
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
		}
		console.log("[SESSION SAVE] extraction object:", req.session.extraction);
		res.json(req.session.extraction);
	}
};
