import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthProvider";
import { AuthGuard } from "./components/auth/AuthGuard";
import LoginPage from "./pages/login/LoginPage";
import Navbar from "./pages/validation/components/navbar/Navbar";
import UploadPage from "./pages/upload/UploadPage";
import ValidationPage from "./pages/validation/ValidationPage";

function App() {
	return (
		<AuthProvider>
			<Router>
				<div className="min-h-screen bg-base-100 text-base-content flex flex-col">
					<Navbar />
					<div className="flex-1 flex flex-col">
						<Routes>
							<Route path="/login" element={<LoginPage />} />
							<Route element={<AuthGuard />}>
								<Route path="/" element={<UploadPage />} />
								<Route path="/validation" element={<ValidationPage />} />
							</Route>
						</Routes>
					</div>
				</div>
			</Router>
		</AuthProvider>
	);
}

export default App;

