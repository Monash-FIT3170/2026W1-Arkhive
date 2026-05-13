import { AlertTriangle } from "lucide-react"; // NEW: imported for low confidence warning icon
import type { ExtractedData } from "../../../../models/TableData";

// NEW update: Helper function helps to determine the confidence tier of a row
// Returns the appropriate DaisyUI badge class and label based on the score
// Thresholds: ≥0.85 = high (green), 0.70-0.84 = medium (amber), <0.70 = low (red)
function getConfidenceTier(confidence: number): {
	colour: string;
	label: string;
	isLow: boolean;
} {
	if (confidence >= 0.85) {
		return {
			colour: "#22c55e",
			label: `${Math.round(confidence * 100)}% - High`,
			isLow: false
		};
	} else if (confidence >= 0.7) {
		return {
			colour: "#f59e0b",
			label: `${Math.round(confidence * 100)}% - Medium`,
			isLow: false
		};
	} else {
		return {
			colour: "#f59e0b",
			label: `${Math.round(confidence * 100)}% - Low`,
			isLow: true // triggers row highlight and warning icon
		};
	}
}

function ExtractedDataPanel({
	onHover,
	extractedData
}: {
	onHover: (id: string | null) => void;
	extractedData: ExtractedData;
}) {
	// Currency formatting function (unchanged)
	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR"
		}).format(amount);
	};

	return (
		<div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
			<h2 className="mb-4 text-xl font-semibold text-base-content">
				EXTRACTED DATA
			</h2>

			<div className="flex-1 overflow-auto min-h-0 max-w-full">
				<table className="table w-full border border-base-300 bg-white text-[10px]">
					{/* Header */}
					<thead>
						<tr className="text-base-content/70">
							{extractedData.columns.map((column) => (
								<th
									key={column}
									className="p-3 text-left text-[11px] font-bold border-b border-base-300 break-words whitespace-normal"
								>
									{column.replace(/_/g, " ")}
								</th>
							))}

							{/* NEW: Confidence column */}
							<th className="p-3 text-left text-[11px] font-bold border-b border-base-300 min-w-[100[x]">
								CONFIDENCE
							</th>
						</tr>
					</thead>

					{/* Body */}
					<tbody>
						{extractedData.rows.map((row) => {
							const tier = getConfidenceTier(row.confidence ?? 1);

							return (
								<tr
									key={row._id}
									className={`border-b border-base-300 hover:bg-base-300/40 ${
										tier.isLow ? "bg-error/10" : ""
									}`}
								>
									{extractedData.columns.map((column) => {
										const cellKey = row._cellKeyMap?.[column];

										return (
											<td
												key={column}
												className={`p-2 hover:bg-warning/10 cursor-pointer text-base-content text-[13px]`}
												onMouseEnter={() =>
													onHover(
														cellKey ? `${row._id}:${cellKey}` : String(row._id)
													)
												}
												onMouseLeave={() => onHover(null)}
											>
												{row[column] || ""}
											</td>
										);
									})}

									{/* NEW: Confidence cell */}
									<td className="p-2">
										<div className="flex flex-col gap-1 min-w-[80px]">
											<div className="h-2 rounded-full bg-base-300">
												<div
													className="h-2 rounded-full"
													style={{
														width: tier.label,
														backgroundColor: tier.colour
													}}
												/>
											</div>
											<span
												className="text-[12px] tabular-nums"
												style={{ color: tier.colour }}
											>
												{tier.label}
											</span>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export default ExtractedDataPanel;
