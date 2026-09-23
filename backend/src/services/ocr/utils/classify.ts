import LlamaCloud from "@llamaindex/llama-cloud";
import fs from "fs";

// Initialize client (reads LLAMA_CLOUD_API_KEY from environment)
const client = new LlamaCloud({ apiKey: process.env.LLAMA_CLOUD_API_KEY });

const rules = [
  {
    type: "Invoice",
    description: "",
  },
  {
    type: "",
    description: "",
  },
  {
    type: "",
    description: "",
  },
  {
    type: "",
    description: "",
  },
  {
    type: "",
    description: "",
  },
]

async function main() {
  // Upload
  const fileObj = await client.files.create({
    file: fs.createReadStream("./document.pdf"),
    purpose: "classify",
  });

  const result = await client.classifier.classify({
    file_ids: [fileObj.id],
    rules,
    mode: "FAST",
    parsing_configuration: {
    max_pages: 5,
  },
  });

  for (const item of result.items) {
    if (item.result) {
      console.log(`File: ${item.file_id}`);
      console.log(`Type: ${item.result.type}`);
      console.log(`Confidence: ${item.result.confidence}`);
      console.log(`Reasoning: ${item.result.reasoning}`);
    } else {
      console.log(`Classification failed for ${item.file_id}`);
    }
  }
}

main().catch(console.error);