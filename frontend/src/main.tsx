import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import "./index.css";
import UploadPage from "./pages/upload/UploadPage";
import ValidationPage from "./pages/validation/ValidationPage";
import { Navbar } from "./pages/validation/components/navbar/Navbar";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<Navbar />

			<Routes>
				<Route path="/" element={<UploadPage />} />
				<Route path="/validation" element={<ValidationPage />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>
);
