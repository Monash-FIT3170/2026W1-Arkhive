function ChatPanel({
	isOpen,
	onToggle
}: {
	isOpen: boolean;
	onToggle: () => void;
}) {
	return (
		<>
			<div>
				<h1>CHAT PANEL</h1>
				<button onClick={onToggle}>
					{isOpen ? "Collapse ->" : "<-"}
				</button>
			</div>
		</>
	);
}

export default ChatPanel;
