import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface Message {
  role: "user" | "model";
  content: string;
}

export async function sendMessageToGemini(messages: Message[]): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Gemini uses a history array + a final user message separately
  const history = messages.slice(0, -1).map(m => ({
    role: m.role,
    parts: [{ text: m.content }]
  }));

  const lastMessage = messages[messages.length - 1].content;

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastMessage);
  return result.response.text();
}