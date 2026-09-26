import LlamaCloud from "@llamaindex/llama-cloud";
import fs from "fs";

// Initialize client (reads LLAMA_CLOUD_API_KEY from environment)
const client = new LlamaCloud({ apiKey: process.env.LLAMA_CLOUD_API_KEY});

const rules = [
  {
    type: "Complex table",
    description: "\"If a document is a price list or catalog organized with multi-level item breakdowns in grid form, classify it as a complex table.\"",
  },
  {
    type: "Simple table",
    description: "Business invoice containing itemized charges, tax information, payment terms, and vendor details",
  },
  {
    type: "blank page",
    description: "Is essentially blank and has nothing in it",
  },
  {
    type: "Other",
    description: "No detected tables in the document",
  },

]

export async function classifyDocument(buff: Buffer) {
  // Upload
  const blob = new File([buff], "document.pdf", { type: "application/pdf" }); 
  const fileObj = await client.files.create({
    file: blob,
    purpose: "classify",
  });

  const job = await client.classify.run({
    file_input: fileObj.id, // Must be 'file_input' (singular string ID)
  configuration: {
    rules: rules, // The classification rules array goes inside 'configuration'
    mode: "FAST",
    parsing_configuration: {
      max_pages: 5,
    },
  },
  });

  let jobState = await client.classify.get(job.id);

  while (jobState.status === "PENDING" || jobState.status === "RUNNING") {
    // Wait 2 seconds between updates so you don't rate-limit your keys
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Re-fetch the current status
    jobState = await client.classify.get(job.id);
    console.log(`Current status: ${jobState.status}`);
  }

  const result = job.result

  return result

}