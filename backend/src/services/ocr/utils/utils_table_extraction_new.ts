import fs from 'fs';
import LlamaCloud from "@llamaindex/llama-cloud";

interface LlamaBBox {
    start_index: number;
    end_index: number;
    x: number;
    y: number;
    w: number;
    h: number;
    confidence: number;
    label: string;
}

interface LlamaCloudItem {
    rows: never[];
    type: 'heading' | 'text' | 'table';
    md?: string;
    html?: string;
    value?: string;
    level?: number;
    grounding?: GroundingBox
}

interface GroundingBox {
  rows?: string[][];
  row_bbox?: LlamaBBox[];
  column_bbox?: LlamaBBox[];
  bbox?: LlamaBBox[];
}

export interface LlamaCloudResponse {
    page_number: number;
    page_width: number;
    page_height: number;
    success: boolean;
    items: LlamaCloudItem[];
}

export interface SubComponent {
    componentCode: string;
    description: string;
    individualCost: string;
}

export interface StructuredFixtureProduct {
    index: string;
    mainCode: string;
    totalPrice: string;
    categoryPhoto: string;
    subComponents: SubComponent[];
}

export async function convertTable(buffer: Buffer, client: LlamaCloud){
  const uint8Array = new Uint8Array(buffer);
  const fileBlob = new Blob([uint8Array], { type: 'application/pdf' });
  const fileObjectForUpload = new File([fileBlob], "uploaded_table.pdf");
  
  const fileObj = await client.files.create({
  file: fileObjectForUpload,
  purpose: "extract",
  });

  const result = await client.parsing.parse(
    {
      file_id: fileObj.id,
      tier: "cost_effective",
      expand: ["markdown_full", "metadata"],
      version: "latest",
      output_options: {
        granular_bboxes: ["cell"]
      }
    }
  );

  const fetchedData = await fetch(result.result_content_metadata?.grounded_items?.presigned_url ?? "")
  const jsonData = JSON.parse(await fetchedData.text())
  console.log(" rows out " + JSON.stringify(jsonData.items.filter(s => s.type === "table")[0].grounding.rows[0][0], null, 2))

}



function extractBboxes(thing: LlamaCloudResponse){
  return JSON.stringify(thing.items.filter(s => s.type === "table")[0].grounding?.rows ?? [], null, 2)
}

function extractTextCells(thing: LlamaCloudResponse){
  return JSON.stringify(thing.items.filter(s => s.type === "table")[0].rows ?? [], null, 2)
}




