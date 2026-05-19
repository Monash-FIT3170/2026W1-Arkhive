import { AlertTriangle } from "lucide-react"; // NEW: imported for low confidence warning icon
import type { ExtractedData } from "./ExtractedData";

// NEW update: Helper function helps to determine the confidence tier of a row
// Returns the appropriate DaisyUI badge class and label based on the score
// Thresholds: ≥0.85 = high (green), 0.70-0.84 = medium (amber), <0.70 = low (red)
function getConfidenceTier(confidence: number): {
	badgeClass: string;
	label: string;
	isLow: boolean;
} {
	if (confidence >= 0.85) {
		return {
			badgeClass: "badge-success",
			label: `${Math.round(confidence * 100)}%`,
			isLow: false
		};
	} else if (confidence >= 0.7) {
		return {
			badgeClass: "badge-warning",
			label: `${Math.round(confidence * 100)}%`,
			isLow: false
		};
	} else {
		return {
			badgeClass: "badge-error",
			label: `${Math.round(confidence * 100)}%`,
			isLow: true // triggers row highlight and warning icon
		};
	}
}

function ExtractedDataPanel({
	extractedData
}: {
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

			{/* Table */}
			<div className="flex-1 overflow-auto min-h-0 max-w-full">
				{/* UPDATED: Removed table-fixed to allow columns to size based on content */}
				<table className="table w-full border border-base-300 text-[10px]">

					{/* Table Header */}
					<thead>
						<tr className="text-base-content/70">
							{/* Existing columns (unchanged) */}
							{extractedData.columns.map((column) => (
							// 	UPDATED: whitespace-nowrap prevents headers from breaking mid-word.
								<th
								key={column}
								className="p-3 text-left text-[12px] font-bold border-b border-base-300 whitespace-nowrap"
								>
								{column.replace(/_/g, " ")}
								</th>
							))}

							{/* NEW: Confidence column header added at the end of the table */}
							<th className="p-3 text-left text-[12px] font-bold border-b border-base-300 whitespace-normal">
								CONFIDENCE SCORE
							</th>
						</tr>
					</thead>

					{/* Table Body */}
					<tbody>
						{extractedData.rows.map((row) => {
							// NEW: Calculate confidence tier for this row
							// Used for badge colour and row background highlight
							const tier = getConfidenceTier(row.confidence ?? 1);

							return (
								<tr
									key={row._id}
									className={`border-b border-base-300 hover:bg-base-300/40
										${tier.isLow ? "bg-error/10" : ""}`}
									// NEW: Low confidence rows get a subtle red background
									// so they are visually distinguishable at a glance
									// satisfying acceptance criteria: "low confidence fields are visually distinguishable"
								>
									{/* Existing data cells (unchanged) */}
									{extractedData.columns.map((column) => (
										<td
											key={column}
											className={`p-2 text-base-content ${
												column === "ITEM"
													? "break-all"
													: "break-words"
											}`}
										>
											{column.includes("PRICE") && row[column]
												? formatCurrency(
														Number(
															String(row[column]).replace(/,/g, "")
														)
													)
												: row[column] || ""}
										</td>
									))}

									{/* NEW: Confidence score cell added at the end of each row
										Shows a DaisyUI badge with the score percentage
										Green ≥85%, Amber 70-84%, Red <70%
										Low confidence rows also show a warning icon from lucide-react */}
									{/* UPDATED: Capsule shape with solid background colours for high visibility */}
									{/* Alert icon on left only for low confidence rows with hover tooltip */}
									<td className="p-2">
										<div className="flex items-center gap-1">
											{tier.isLow && (
												<span title="please check this output">
													<AlertTriangle className="w-3 h-3 text-red-500 cursor-pointer flex-shrink-0" />
												</span>
											)}
											{/* UPDATED: Switched from solid fill to outlined badge style */}
											{/* High confidence uses brand blue, medium amber, low red */}
											{/* White background keeps it subtle so it doesn't compete with more important UI elements */}
											<span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
												tier.badgeClass === "badge-success" ? "border-blue-500 text-blue-500 bg-white" :
												tier.badgeClass === "badge-warning" ? "border-amber-500 text-amber-500 bg-white" :
												"border-red-500 text-red-500 bg-white"
											}`}>
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