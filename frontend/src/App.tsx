import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./pages/validation/components/navbar/Navbar";
import UploadPage from "./pages/upload/UploadPage";
import ValidationPage from "./pages/validation/ValidationPage";

function App() {
	return (
		<Router>
			<div className="min-h-screen bg-base-100 text-base-content flex flex-col">
				<Navbar />
				<div className="flex-1 flex flex-col">
					<Routes>
						<Route path="/" element={<UploadPage />} />
						<Route path="/validation" element={<ValidationPage />} />
					</Routes>
				</div>
			</div>
		</Router>
	);
}

export default App;
