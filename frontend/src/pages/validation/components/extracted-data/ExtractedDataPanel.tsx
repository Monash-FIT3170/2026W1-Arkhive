import mockOcrData from "../../../../mock-data/boundingBox.json";
import type { ExtractedData } from "../../../../models/TableData";
import { flattenOcrData } from "./FlattenOcrData";
import { TableProperties } from "lucide-react";

function ExtractedDataPanel({
	onHover
}: {
	onHover: (id: string | null) => void;
}) {
	const extractedData: ExtractedData = flattenOcrData(mockOcrData as any[]);

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR"
		}).format(amount);
	};

	return (
		<div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
			<h2 className="mb-4 text-xl font-heading font-semibold text-base-content flex items-center gap-2">
				<div className="bg-neutral text-neutral-content p-1 rounded-xl">
					<TableProperties size={18} strokeWidth={2.5} />
				</div>
				EXTRACTED DATA
			</h2>

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
											onMouseLeave={() => onHover(null)}
										>
											{column.includes("PRICE") &&
											row[column]
												? formatCurrency(
														Number(
															String(
																row[column]
															).replace(/,/g, "")
														)
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
}

export default ExtractedDataPanel;
