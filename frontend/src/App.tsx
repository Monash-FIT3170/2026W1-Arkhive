import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "./assets/vite.svg";
import heroImg from "./assets/hero.png";
import "./App.css";
import Navbar from "./pages/validation/components/navbar/Navbar";
import ValidationPage from "./pages/validation/ValidationPage";

function App() {
	const [count, setCount] = useState(0);

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
