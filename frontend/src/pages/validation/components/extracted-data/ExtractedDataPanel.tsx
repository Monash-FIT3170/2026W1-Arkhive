import mockOcrData from "../../../../mock-data/boundingBox.json";
import type { ExtractedData } from "../../../../models/TableData";
import { flattenOcrData } from "./FlattenOcrData";

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
			<h2 className="mb-4 text-xl font-semibold text-base-content">
				EXTRACTED DATA
			</h2>

			<div className="flex-1 overflow-auto min-h-0 max-w-full">
				<table className="table table-fixed w-full border border-base-300 text-[10px]">
					<thead>
						<tr className="text-base-content/70">
							{extractedData.columns.map((column) => (
								<th
									key={column}
									className="p-3 text-left text-[12px] font-bold border-b border-base-300 break-words whitespace-normal"
								>
									{column.replace(/_/g, " ")}
								</th>
							))}
						</tr>
					</thead>

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
