import { Request, Response } from "express";
import { Session } from "express-session";

interface ExtractionSessionData {
	extraction?: {
		ocrData: any;
		createdAt: number;
		updatedAt: number;
	};
}

type SessionRequest = Request & {
	session: Session & ExtractionSessionData;
};

export default {
	getExtraction: (req: SessionRequest, res: Response) => {
		if (req.session.extraction) {
			res.json(req.session.extraction);
		} else {
			res.json(null);
		}
	},

	saveExtraction: (req: SessionRequest, res: Response) => {
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
