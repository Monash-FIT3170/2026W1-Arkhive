<<<<<<< HEAD
import mockOcrData from "../../../../mock-data/boundingBox.json";
<<<<<<< HEAD
=======
import { AlertTriangle } from "lucide-react"; // NEW: imported for low confidence warning icon
>>>>>>> 35a60c904bc91d8edb2b3eb12faf23f0c816b4d5
import type { ExtractedData } from "./ExtractedData";
=======
import type { ExtractedData } from "../../../../models/TableData";
>>>>>>> 5f3f3ed6747d72fe46de5213aac7676e04e0a576
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
	onHover
}: {
	onHover: (id: string | null) => void;
}) {
<<<<<<< HEAD
<<<<<<< HEAD
  const extractedData: ExtractedData = flattenOcrData(mockOcrData as any[]);
=======
	// Currency formatting function (unchanged)
	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR"
		}).format(amount);
	};
>>>>>>> 35a60c904bc91d8edb2b3eb12faf23f0c816b4d5
=======
	const extractedData: ExtractedData = flattenOcrData(mockOcrData as any[]);
>>>>>>> 5f3f3ed6747d72fe46de5213aac7676e04e0a576

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR"
		}).format(amount);
	};

<<<<<<< HEAD
<<<<<<< HEAD
  return (
    <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
      <h2 className="mb-4 text-xl font-semibold text-base-content">
        EXTRACTED DATA
      </h2>
=======
	return (
		<div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
			<h2 className="mb-4 text-xl font-heading font-semibold text-base-content flex items-center gap-2">
				<div className="bg-neutral text-neutral-content p-1 rounded-xl">
					<TableProperties size={18} strokeWidth={2.5} />
				</div>
				EXTRACTED DATA
			</h2>
>>>>>>> 5f3f3ed6747d72fe46de5213aac7676e04e0a576

			<div className="flex-1 overflow-auto min-h-0 max-w-full rounded-lg border border-base-300">
				<table className="table table-zebra table-pin-rows w-full text-xs font-sans">
					<thead>
						<tr className="bg-base-300/50 text-base-content/80 uppercase tracking-wider text-[11px]">
							{extractedData.columns.map((column) => (
								<th key={column} className="p-3 text-left font-semibold">
									{column.replace(/_/g, " ")}
								</th>
							))}
						</tr>
					</thead>

<<<<<<< HEAD
          <tbody>
            {extractedData.rows.map((row) => (
              <tr
                key={row._id}
                className="border-b border-base-300 hover:bg-base-300/40"
              >
                {extractedData.columns.map((column) => {
                  const cellKey = row._cellKeyMap?.[column];
                  return (
                    <td
                      key={column}
                      className={`p-2 hover:bg-warning/10 cursor-pointer text-base-content ${column === "ITEM" ? "break-all" : "break-words"
                        }`}
                      onMouseEnter={() =>
                        onHover(cellKey ? `${row._id}:${cellKey}` : String(row._id))
                      }
                      onMouseLeave={() => onHover(null)}
                    >
                      {column.includes("PRICE") && row[column]
                        ? formatCurrency(
                          Number(String(row[column]).replace(/,/g, ""))
                        )
                        : row[column] || ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
=======
			{/* Table */}
			<div className="flex-1 overflow-auto min-h-0 max-w-full">
				<table className="table table-fixed w-full border border-base-300 text-[10px]">

					{/* Table Header */}
					<thead>
						<tr className="text-base-content/70">
							{/* Existing columns (unchanged) */}
							{extractedData.columns.map((column) => (
								<th
									key={column}
									className="p-3 text-left text-[12px] font-bold border-b border-base-300 break-words whitespace-normal"
								>
									{column.replace(/_/g, " ")}
								</th>
							))}

							{/* NEW: Confidence column header added at the end of the table */}
							<th className="p-3 text-left text-[12px] font-bold border-b border-base-300 whitespace-normal">
								CONF
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
=======
					<tbody>
						{extractedData.rows.map((row) => (
							<tr
								key={row._id}
								className="hover:bg-primary/10 transition-colors duration-150"
							>
								{extractedData.columns.map((column) => {
									const cellKey = row._cellKeyMap?.[column];
									return (
										<td
											key={column}
											className={`p-3 cursor-pointer text-base-content ${
>>>>>>> 5f3f3ed6747d72fe46de5213aac7676e04e0a576
												column === "ITEM"
													? "break-all"
													: "break-words"
											}`}
<<<<<<< HEAD
										>
											{column.includes("PRICE") && row[column]
												? formatCurrency(
														Number(
															String(row[column]).replace(/,/g, "")
=======
											onMouseEnter={() =>
												onHover(
													cellKey
														? `${row._id}:${cellKey}`
														: String(row._id)
												)
											}
											onMouseLeave={() => onHover(null)}
										>
											{column.includes("PRICE") &&
											row[column]
												? formatCurrency(
														Number(
															String(
																row[column]
															).replace(/,/g, "")
>>>>>>> 5f3f3ed6747d72fe46de5213aac7676e04e0a576
														)
													)
												: row[column] || ""}
										</td>
<<<<<<< HEAD
									))}

									{/* NEW: Confidence score cell added at the end of each row
										Shows a DaisyUI badge with the score percentage
										Green ≥85%, Amber 70-84%, Red <70%
										Low confidence rows also show a warning icon from lucide-react */}
									<td className="p-2">
										<span className={`badge ${tier.badgeClass} gap-1 text-[10px]`}>
											{tier.isLow && (
												<AlertTriangle className="w-3 h-3" />
											)}
											{tier.label}
										</span>
									</td>
								</tr>
							);
						})}
=======
									);
								})}
							</tr>
						))}
>>>>>>> 5f3f3ed6747d72fe46de5213aac7676e04e0a576
					</tbody>
				</table>
			</div>
		</div>
	);
<<<<<<< HEAD
>>>>>>> 35a60c904bc91d8edb2b3eb12faf23f0c816b4d5
=======
>>>>>>> 5f3f3ed6747d72fe46de5213aac7676e04e0a576
}

export default ExtractedDataPanel;
