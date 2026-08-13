import fs from 'fs';
import LlamaCloud from "@llamaindex/llama-cloud";
import { OCRBoundingBox } from '../types/boundingBoxTypes';

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

  interface ExtractedSchema {
    components?: Array<{
      id: string;
      type: string;
      text: string;
      cells: string[];
      [key: string]: any;
    }>;
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
  const out = await extractStructuredComponents(result, client)
 // console.log(JSON.stringify(await extractStructuredComponents(result, client), null, 2))
  

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
            description: "If this is a table row or column, the individual array containing the cell",
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
      tier: "agentic",
      extraction_target: "per_doc",
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
  return mapBoundingBoxes(result, job)
}


async function populateHashMapLookup(llamaparseData: LlamaCloud.Parsing.ParsingGetResponse): Promise<Map<string, any>>{
  const lookup = new Map<string, any>();
  const items = await fetch(llamaparseData.result_content_metadata?.grounded_items?.presigned_url!)
  if (!items){
    throw Error("");
  }
  const itemss = await items.json()
  // Extract the actual array (handles both raw array and wrapper objects)
  const itemsss: any[] = Array.isArray(itemss)
  ? itemss : itemss?.items ?? itemss?.grounded_items ?? [];

  itemsss.forEach((item: any) => {
    if (item.type === "table") {
      const textRows = item.rows || [];
      const groundingRows = item.grounding?.rows || [];

      textRows.forEach((row: any[], rIdx: number) => {
        row.forEach((cellText: any, cIdx: number) => {
          if (!cellText || typeof cellText !== "string") return;

          // Normalize text key to improve matching
          const cleanKey = cellText.trim().replace(/^-\s*/, "").replace(/\s*:\s*$/, "");
          
          // Safely access row and column grounding
          const cellGrounding = groundingRows[rIdx]?.[cIdx];
          const bbox = cellGrounding?.bbox || null;

          if (cleanKey && !lookup.has(cleanKey)) {
            lookup.set(cleanKey, bbox);
          }
        });
      });
    }
  });

  return lookup;
}

async function populateHashMapForConfidence(llamaextractData: LlamaCloud.Extract.ExtractV2Job, llamaparseData: LlamaCloud.Parsing.ParsingGetResponse): Promise<Map<string, any>>{
  const lookup_meta = new Map<string, any>();

  const smth = (llamaextractData.extract_metadata?.field_metadata?.document_metadata! as any).components;
  const items = await fetch(llamaparseData.result_content_metadata?.grounded_items?.presigned_url!)
  if (!items){
    throw Error("");
  }
  const itemss = await items.json()
  // Extract the actual array (handles both raw array and wrapper objects)
  const itemsss: any[] = Array.isArray(itemss)
  ? itemss : itemss?.items ?? itemss?.grounded_items ?? [];

  itemsss.forEach((item: any) => {
    if (item.type === "table") {
      const textRows = item.rows || [];
      const groundingRows = item.grounding?.rows || [];

      textRows.forEach((row: any[], rIdx: number) => {
        lookup_meta.set(row.join("").replace(/^-\s*/, "").replace(/\s*:\s*$/, ""), smth[rIdx]?.text?.confidence ?? 0)
      });
    }
  });
  return lookup_meta;
}




async function mapBoundingBoxes(llamaparseData: LlamaCloud.Parsing.ParsingGetResponse, llamaextractData: LlamaCloud.Extract.ExtractV2Job) {
  // 1. Build lookup map from LlamaParse table data
  const lookup = await populateHashMapLookup(llamaparseData);
  const lookup_meta = await populateHashMapForConfidence(llamaextractData, llamaparseData);
  console.log(Array.from(lookup_meta.keys()))
  console.log("\n")
  console.log(Array.from(lookup.keys()))

  console.log(`this is the lookup meta ${Array.from(lookup_meta.keys()).length} ${Array.from(lookup.keys()).length}`)

  // 2. Extract components safely with type casting
  const extractObj = llamaextractData.extract_result as ExtractedSchema;

  const comp_ = extractObj?.components ?? [];
  const updatedComponents = comp_.map((component: { cells: string[]; }, ind) => {
    if (!component.cells) return component;

    const cellBboxes = component.cells.map((cellText: string, index) => {
      if (!cellText) return null;
      
      const cleanCellKey = cellText.trim().replace(/^-\s*/, "").replace(/\s*:\s*$/, "");
      const i = (llamaextractData.extract_metadata?.field_metadata?.document_metadata as any)?.components?.[ind]?.[index]
      return {
        ...lookup.get(cleanCellKey),
      }
    });
    
    return {
      ...component,
      cell_bboxes: cellBboxes,
      confidence: lookup_meta
    };
  });

  return {
    ...llamaextractData,
    components: updatedComponents
  };
}




