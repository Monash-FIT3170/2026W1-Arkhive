import "./App.css";
import Navbar from "./pages/validation/components/navbar/Navbar";
import ValidationPage from "./pages/validation/ValidationPage";

function App() {
	return (
		<>
			<Navbar></Navbar>
			<div className="h-screen">
				<ValidationPage />
			</div>
		</>
	);
}

export default App;
