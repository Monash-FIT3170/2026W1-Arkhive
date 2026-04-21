import type { ChatMessage } from "../../../../models/message";

function ChatPanel({
	isOpen,
	onToggle
}: {
	isOpen: boolean;
	onToggle: () => void;
	messages: ChatMessage[];
}) {
	return (
		<>
			<div className="h-full w-full border border-gray-200 rounded-lg">
				<h1>CHAT PANEL</h1>
				<button onClick={onToggle}>
					{isOpen ? "Collapse ->" : "<-"}
				</button>
			</div>
		</>
	);
}

export default ChatPanel;
