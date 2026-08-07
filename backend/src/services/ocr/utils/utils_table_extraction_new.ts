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
  //console.log(" rows out " + JSON.stringify(jsonData.items.filter(s => s.type === "table")[0].grounding.rows[0][0], null, 2))
  extractStructuredComponents(result, client)

}

async function extractStructuredComponents(result: LlamaCloud.Parsing.ParsingGetResponse, client: LlamaCloud) {
  const dataSchema = 
{
  type: "object",
  properties: {
    components: {
      type: "array",
      description: "List of logical OCR components extracted from the document layout.",
      items: {
        type: "object",
        properties: {
          id: { 
            type: "string", 
            description: "A unique identifier for this component." 
          },
          type: { 
            type: "string", 
            enum: ["TITLE", "HEADER", "TABLE_ROW", "BODY_TEXT", "TABLE_COLS"],
            description: "The structural role of this layout block."
          },
          indentation: { 
            type: "number", 
            description: "The estimated layout indentation depth or level." 
          },
          layer: { 
            type: "number", 
            description: "The depth or z-index hierarchy layer." 
          },
          parentId: { 
            type: "string", 
            description: "The ID of the parent structural component, if any." 
          },
          text: { 
            type: "string", 
            description: "The textual content contained within this layout block." 
          },
          cells: {
            type: "array",
            description: "If this is a table row, the individual array of cell values strings.",
            items: { type: "string" }
          }
        },
        required: ["id", "type", "text"]
      }
    }
  },
  required: ["components"]
};

  let job = await client.extract.create({
    file_input: result.job.id,
    configuration: {
      data_schema: dataSchema,
      tier: "cost_effective",
      extraction_target: "per_doc",
      cite_sources: true,
      confidence_scores: true,
      
    }
  });

  while (!["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
    await new Promise((r) => setTimeout(r, 2000));
    job = await client.extract.get(job.id, {
      expand: ["metadata", "extract_metadata"]
    })
  }

  if (job.status !== "COMPLETED") {
    throw new Error(`Extract job ${job.id} ended in ${job.status}: ${job.error_message}`);
  }

  job.configuration?.confidence_scores
  //console.log(JSON.stringify(job.extract_result, null, 2))
  console.log(job.extract_metadata?.field_metadata?.document_metadata?.components)
  return job
}

function extractBboxes(thing: LlamaCloudResponse){
  return JSON.stringify(thing.items.filter(s => s.type === "table")[0].grounding?.rows ?? [], null, 2)
}

function extractTextCells(thing: LlamaCloudResponse){
  return JSON.stringify(thing.items.filter(s => s.type === "table")[0].rows ?? [], null, 2)
}




