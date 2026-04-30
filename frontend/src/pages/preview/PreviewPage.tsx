import { useLocation } from "react-router-dom";

function PreviewPage() {
  const location = useLocation();
  const files = location.state?.files ?? [];

  return (
    <div>
      <h1>Preview Page</h1>
      <p>{files.length} file(s) received</p>
    </div>
  );
}

export default PreviewPage;