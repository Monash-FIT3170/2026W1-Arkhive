import { useState } from 'react';
import DropZone from './components/dropzone/DropZone';
import ProcessButton from './components/actions/ProcessButton';
import {useNavigate} from "react-router-dom";

/**
 * Logic helper to manage the "Store" user story.
 * 
 * @param currentFiles - The existing array of files already in the store.
 * @param incomingFiles - The new array of files captured from the user.
 * @returns A new array containing the combined collection of files.
 */
export function calculateNewFilesStore(currentFiles: File[], incomingFiles: File[]): File[] {
  // We use the spread operator to create a new array
  return [...currentFiles, ...incomingFiles];
}

/**
 * UploadPage Component
 * This page acts as the orchestrator for the document upload workflow.
 * It specifically addresses two key User Stories:
 * 1. Capture: Receives validated files from the child DropZone component.
 * 2. Store: Maintains the files in component state to be passed to the next step.
 *
 * HANDOFF NOTE:
 * - This component coordinates the flow between DropZone and ProcessButton.
 * - The next developer should implement the navigation logic inside 'handleProceedToPreview' using 'useNavigate' from react-router-dom once routing is set up.
 * 
 * @author Muhammad Mubashir Shah (33878897)
 */
function UploadPage() {
  // USER STORY: "Store the uploaded file for the next step"
  // We initialize the store as an empty array of File objects.
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const navigate = useNavigate();

  /**
   * USER STORY: "Capture the selected file from the user"
   * This handler is passed to the DropZone. When the DropZone validates files,
   * it calls this function to send them "up" to be stored at the page level.
   * 
   * @param capturedFiles - Array of validated files received from the DropZone.
   */
  function handleFilesCaptured(capturedFiles: File[]) {
    setUploadedFiles(function updateState(previousFiles) {
      return calculateNewFilesStore(previousFiles, capturedFiles);
    });
  }

  /**
   * Final action handler to transition the user to the next phase of the app.
   * Triggered by the ProcessButton.
   */
  function handleProceedToPreview() {
    // Logging for debug purposes during development handoff.
    console.log("Proceeding to preview step with the following store:", uploadedFiles);
    // navigation logic here:
    // navigate('/validation');
    // navigate to preview and pass files:
    navigate("/preview", {state: {files: uploadedFiles}});
  }

  return (
    <div className="upload-page-container p-8 max-w-4xl mx-auto">
      {/* Page Header Area */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Document Upload</h1>
        <p className="mt-2 text-gray-600">
          Upload your documents to begin the AI-powered OCR and validation process.
        </p>
      </header>

      {/* Main Content Area */}
      <main className="space-y-8">
        
        {/* Section responsible for the 'Capture' event */}
        <section aria-label="File Upload Area">
          <DropZone onFilesCaptured={handleFilesCaptured} />
        </section>

        {/* User feedback showing that files are currently 'Stored' */}
        {uploadedFiles.length > 0 && (
          <section 
            className="p-4 bg-blue-50 border border-blue-200 rounded-lg"
            aria-live="polite"
          >
            <p className="text-blue-800 font-semibold">
              Ready for processing: {uploadedFiles.length} file(s) captured.
            </p>
          </section>
        )}

        {/* Section responsible for the 'Proceed' action */}
        <section className="pt-4 border-t border-gray-100">
          <ProcessButton 
            onClick={handleProceedToPreview} 
            isDisabled={uploadedFiles.length === 0} 
            label={uploadedFiles.length > 0 ? "Proceed to Preview" : "Select files to continue"}
          />
        </section>

      </main>
    </div>
  );
}

export default UploadPage;