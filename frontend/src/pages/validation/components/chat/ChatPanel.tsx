import { ChevronsLeft} from 'lucide-react';
function ChatPanel({
	isOpen,
	onToggle
}: {
	isOpen: boolean;
	onToggle: () => void;
}) {
	// Styling of the chat when the window is collapsed
    if (!isOpen) {
        return (
            <div className="h-full w-full bg-base-200 border border-gray-200 rounded-lg flex flex-col items-center py-4 transition-all">
				{/* Expand Button */}
                <button 
                    onClick={onToggle}
                    className="btn btn-ghost btn-circle"
                    title="Expand Chat"
                >
                    <ChevronsLeft className="w-6 h-6" />
                </button>
				{/* Vertical AI Assistant label */} 
                <div className="flex-1 flex items-center justify-center">
                    <span className="[writing-mode:vertical-rl] text-base-content/50 uppercase tracking-widest font-semibold">AI Assistant</span>
                </div>
            </div>
        ); 
	}
	// Styling of the chat when the window is expanded 
	return (
		<>
			<div className="h-full w-full bg-base-200 border border-gray-200 rounded-lg">
				<h1>CHAT PANEL</h1>
				<button onClick={onToggle}>
					{isOpen ? "Collapse ->" : "<-"}
				</button>
			</div>
		</>
	);
}

export default ChatPanel;
