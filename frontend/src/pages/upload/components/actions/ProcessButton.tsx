import React from 'react';

/**
 * Logic helper for Tailwind CSS class management.
 * 
 * @param isDisabled - State determining if the user can proceed.
 * @returns A string of Tailwind utility classes.
 */
export function getButtonClasses(isDisabled: boolean): string {
  // Base classes apply regardless of state (Layout and Transitions)
  const baseClasses = "w-full py-3 px-6 rounded-md font-bold text-white transition-all duration-200 ease-in-out";
  
  // State-specific classes (Visual feedback and Interactivity)
  const stateClasses = isDisabled 
    ? "bg-gray-400 cursor-not-allowed opacity-70" 
    : "bg-green-600 hover:bg-green-700 cursor-pointer shadow-md active:transform active:scale-95";
  
  return `${baseClasses} ${stateClasses}`;
}

/**
 * ProcessButton Component
 * Acts as the final gatekeeper for the Upload workflow (User Story 1.2).
 * It remains disabled until the parent state contains valid files.
 * 
 * HANDOFF NOTE:
 * - To implement navigation, the parent (UploadPage) should pass a navigation trigger (e.g., from useNavigate) to the 'onClick' prop.
 * - Example: const navigate = useNavigate(); <ProcessButton onClick={() => navigate('/validation')} isDisabled={storedFiles.length === 0} />
 * 
 * @param onClick - Logic to execute when the user is allowed to proceed.
 * @param isDisabled - Prop derived from the uploaded files array length.
 * @param label - Optional text to display (Defaults to "Proceed to Preview").
 * 
 * @author Muhammad Mubashir Shah (33878897)
 */
function ProcessButton({ 
  onClick, 
  isDisabled, 
  label = "Proceed to Preview" 
}: { 
  onClick: () => void, 
  isDisabled: boolean, 
  label?: string 
}) {

  /**
   * Internal handler to protect the navigation trigger.
   * Ensures that even if the UI fails to disable the button,
   * the code will not "Proceed" if the requirements aren't met.
   */
  function handleProceedAction() {
    if (!isDisabled) {
      onClick();
    }
  }

  return (
    <button
      type="button"
      onClick={handleProceedAction}
      disabled={isDisabled}
      className={getButtonClasses(isDisabled)}
    >
      {label}
    </button>
  );
}

export default ProcessButton;