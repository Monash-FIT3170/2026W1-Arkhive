import "./App.css";
import Navbar from "./pages/validation/components/navbar/Navbar";
import ValidationPage from "./pages/validation/ValidationPage";

function App() {
	return (
		<div className="min-h-screen bg-base-100 text-base-content flex flex-col">
			<Navbar></Navbar>
			<div className="flex-1 flex flex-col">
				<ValidationPage />
			</div>
		</div>
	);
}

export default App;
