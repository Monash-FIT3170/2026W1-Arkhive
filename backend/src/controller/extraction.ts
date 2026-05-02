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
		const { ocrData } = req.body;
		
		if (!ocrData) {
			res.status(400).json({ error: "No ocrData provided" });
			return;
		}

		if (req.session.extraction) {
			req.session.extraction.ocrData = ocrData;
			req.session.extraction.updatedAt = Date.now();
		} else {
			req.session.extraction = {
				ocrData,
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
		}

		res.json(req.session.extraction);
	}
};
