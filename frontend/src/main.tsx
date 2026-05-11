import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import "./index.css";
import UploadPage from "./pages/upload/UploadPage";
import PreviewPage from "./pages/preview/PreviewPage";
import ValidationPage from "./pages/validation/ValidationPage";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<UploadPage />} />
				<Route path="/preview" element={<PreviewPage />} />
				<Route path="/validation" element={<ValidationPage />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>
);
