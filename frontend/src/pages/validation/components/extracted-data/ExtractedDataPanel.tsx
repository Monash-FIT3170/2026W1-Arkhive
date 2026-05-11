import mockOcrData from "../../../../mock-data/boundingBox.json";
import { AlertTriangle } from "lucide-react"; // NEW: imported for low confidence warning icon
import type { ExtractedData } from "../../../../models/TableData";
import { flattenOcrData } from "./FlattenOcrData";
import { TableProperties } from "lucide-react";

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
			badgeClass: "badge-success p-2",
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
	onHover
}: {
	onHover: (id: string | null) => void;
}) {
	const extractedData: ExtractedData = flattenOcrData(mockOcrData as any[]);
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
				<table className="table table-fixed w-full border border-base-300 bg-white text-[10px]">
					{/* Header */}
					<thead>
						<tr className="text-base-content/70">
							{extractedData.columns.map((column) => (
								<th
									key={column}
									className="p-3 text-left text-[16px] font-bold border-b border-base-300 break-words whitespace-normal"
								>
									{column.replace(/_/g, " ")}
								</th>
							))}

							{/* NEW: Confidence column */}
							<th className="p-3 text-left text-[16px] font-bold border-b border-base-300">
								CONF
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
										const cellKey =
											row._cellKeyMap?.[column];

										return (
											<td
												key={column}
												className={`p-2 hover:bg-warning/10 cursor-pointer text-base-content ${
													column === "ITEM"
														? "break-all"
														: "break-words"
												}`}
												onMouseEnter={() =>
													onHover(
														cellKey
															? `${row._id}:${cellKey}`
															: String(row._id)
													)
												}
												onMouseLeave={() =>
													onHover(null)
												}
											>
												{column.includes("PRICE") &&
												row[column]
													? formatCurrency(
															Number(
																String(
																	row[column]
																).replace(
																	/,/g,
																	""
																)
															)
														)
													: row[column] || ""}
											</td>
										);
									})}

									{/* NEW: Confidence cell */}
									<td className="p-2">
										<span
											className={`badge ${tier.badgeClass} gap-1 text-[10px]`}
										>
											{tier.isLow && (
												<AlertTriangle className="w-3 h-3" />
											)}
											{tier.label}
										</span>
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
