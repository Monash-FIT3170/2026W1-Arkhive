import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMessage } from "../services/llmService";
import type { Message } from "../models/Message";
import type { ExtractedData } from "../models/TableData";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleMessages: Message[] = [
  { role: "user", content: "Change Apples to Mangoes in row comp_1" }
];

const sampleContext: ExtractedData = {
  columns: ["ITEM", "QTY", "PRICE"],
  rows: [
    { _id: "comp_1", confidence: 0.95, ITEM: "Apples", QTY: "10", PRICE: "5000" }
  ]
};

const mockReply = {
  response: "Done — I've updated Apples to Mangoes in row comp_1.",
  intent: {
    type: "correction",
    rowId: "comp_1",
    column: "ITEM",
    newValue: "Mangoes"
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub global fetch to return a successful JSON response */
function mockFetchSuccess(body: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body
    })
  );
}

/** Stub global fetch to return a non-ok HTTP response */
function mockFetchFailure(status = 500) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: "Internal Server Error" })
    })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- Happy path ---

  test("calls fetch with the correct URL", async () => {
    mockFetchSuccess({ reply: mockReply });

    await sendMessage(sampleMessages, sampleContext);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/llm/chat");
  });

  test("calls fetch with POST method", async () => {
    mockFetchSuccess({ reply: mockReply });

    await sendMessage(sampleMessages, sampleContext);

    const options = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("POST");
  });

  test("sets Content-Type header to application/json", async () => {
    mockFetchSuccess({ reply: mockReply });

    await sendMessage(sampleMessages, sampleContext);

    const options = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("includes messages in the request body", async () => {
    mockFetchSuccess({ reply: mockReply });

    await sendMessage(sampleMessages, sampleContext);

    const options = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.messages).toEqual(sampleMessages);
  });

  test("includes documentContext in the request body", async () => {
    mockFetchSuccess({ reply: mockReply });

    await sendMessage(sampleMessages, sampleContext);

    const options = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.documentContext).toEqual(sampleContext);
  });

  test("returns the reply object from the response", async () => {
    mockFetchSuccess({ reply: mockReply });

    const result = await sendMessage(sampleMessages, sampleContext);

    expect(result).toEqual(mockReply);
  });

  test("correctly surfaces the intent from the reply", async () => {
    mockFetchSuccess({ reply: mockReply });

    const result = await sendMessage(sampleMessages, sampleContext);

    expect(result.intent?.type).toBe("correction");
    expect(result.intent?.rowId).toBe("comp_1");
    expect(result.intent?.newValue).toBe("Mangoes");
  });

  test("works when documentContext is omitted", async () => {
    mockFetchSuccess({ reply: { response: "Hello!", intent: null } });

    const result = await sendMessage(sampleMessages);

    expect(result.response).toBe("Hello!");
  });

  // --- Sad path ---

  test("throws an error when the server responds with a non-ok status", async () => {
    mockFetchFailure(500);

    await expect(sendMessage(sampleMessages, sampleContext)).rejects.toThrow(
      "Failed to send message"
    );
  });

  test("throws an error on a 400 Bad Request response", async () => {
    mockFetchFailure(400);

    await expect(sendMessage(sampleMessages, sampleContext)).rejects.toThrow(
      "Failed to send message"
    );
  });

  test("throws when fetch itself rejects (network failure)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    await expect(sendMessage(sampleMessages, sampleContext)).rejects.toThrow(
      "Network error"
    );
  });

  // --- Body serialisation edge cases ---

  test("sends an empty messages array without throwing", async () => {
    mockFetchSuccess({ reply: { response: "No messages?", intent: null } });

    await expect(sendMessage([], sampleContext)).resolves.not.toThrow();
  });

  test("serialises messages with model role correctly", async () => {
    mockFetchSuccess({ reply: mockReply });

    const mixedMessages: Message[] = [
      { role: "user", content: "Hello" },
      { role: "model", content: "Hi there!" },
      { role: "user", content: "Fix row comp_1" }
    ];

    await sendMessage(mixedMessages, sampleContext);

    const options = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.messages[1].role).toBe("model");
  });
});