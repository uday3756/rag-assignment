import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  estimateConfidence,
  formatContext,
  retrieve,
  type RetrievedChunk,
} from "@/lib/rag";

const CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL ||
  (process.env.OPENAI_BASE_URL ? "llama3.2" : "gpt-4o-mini");

function buildPrompt(question: string, context: string): string {
  return (
    "<instructions>\n" +
    "1) Answer using ONLY the provided policy documents.\n" +
    "2) If the documents do not contain the information, say " +
    "\"I don't have information about that in the provided policies.\"\n" +
    "3) Always cite sources by filename and section.\n" +
    "4) Provide a confidence level: High, Medium, or Low.\n" +
    "5) Maintain a professional, concise tone.\n" +
    "</instructions>\n\n" +
    `<question>${question}</question>\n\n` +
    `<policy_documents>\n${context}\n</policy_documents>\n\n` +
    "<response>\n" +
    "<answer></answer>\n" +
    "<sources></sources>\n" +
    "<confidence></confidence>\n" +
    "</response>"
  );
}

function parseResponse(text: string): {
  answer: string;
  sources: string;
  confidence: string;
} {
  const extract = (tag: string) => {
    const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text);
    return match ? match[1].trim() : "";
  };
  return {
    answer: extract("answer") || text.trim(),
    sources: extract("sources"),
    confidence: extract("confidence"),
  };
}

function normalizeSources(chunks: RetrievedChunk[]): string {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const chunk of chunks) {
    const entry = `${chunk.metadata.source} (${chunk.metadata.section})`;
    if (!seen.has(entry)) {
      seen.add(entry);
      entries.push(entry);
    }
  }
  return entries.join("; ");
}

function getOpenAIConfig(): { apiKey: string; baseURL?: string } {
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  if (baseURL) {
    return { apiKey: process.env.OPENAI_API_KEY || "ollama", baseURL };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");
  return { apiKey };
}

function getBackupConfig(): { apiKey: string; baseURL?: string } | null {
  const backupKey = process.env.OPENAI_BACKUP_API_KEY?.trim();
  if (!backupKey) return null;
  const backupBase = process.env.OPENAI_BACKUP_BASE_URL?.trim();
  if (backupBase) return { apiKey: backupKey, baseURL: backupBase };
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  return { apiKey: backupKey, baseURL: baseURL || undefined };
}

/** Groq free tier – backup for chat when OpenAI returns 429. No extra OpenAI key needed. */
function getGroqConfig(): { apiKey: string; baseURL: string; model: string } | null {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  return {
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
    model: process.env.GROQ_CHAT_MODEL || "llama-3.1-8b-instant",
  };
}

/** Ordered list: primary, backup key (if set), then Groq (free, if set). */
function getChatConfigs(): Array<{ apiKey: string; baseURL?: string; model: string }> {
  const primary = getOpenAIConfig();
  const list: Array<{ apiKey: string; baseURL?: string; model: string }> = [
    { ...primary, model: CHAT_MODEL },
  ];
  const backup = getBackupConfig();
  if (backup) list.push({ ...backup, model: CHAT_MODEL });
  const groq = getGroqConfig();
  if (groq) list.push(groq);
  return list;
}

function is429(error: unknown): boolean {
  const msg = String(error);
  return msg.includes("429") || msg.includes("quota");
}

export async function POST(request: Request) {
  try {
    let config: { apiKey: string; baseURL?: string };
    try {
      config = getOpenAIConfig();
    } catch {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY. Or use Ollama: set OPENAI_BASE_URL=http://localhost:11434/v1" },
        { status: 500 }
      );
    }

    const payload = await request.json();
    const question = String(payload?.question || "").trim();
    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 }
      );
    }

    const chunks = await retrieve(question, 5);
    if (!chunks.length) {
      return NextResponse.json({
        answer:
          "I don't have information about that in the provided policies.",
        sources: "",
        confidence: "Low",
        context: [],
      });
    }

    const context = formatContext(chunks);
    const chatConfigs = getChatConfigs();
    const messages = [
      {
        role: "system" as const,
        content:
          "You are a careful policy assistant. Follow instructions strictly.",
      },
      { role: "user" as const, content: buildPrompt(question, context) },
    ];
    let text = "";
    let lastErr: unknown;
    for (const cfg of chatConfigs) {
      try {
        const client = new OpenAI({
          apiKey: cfg.apiKey,
          baseURL: cfg.baseURL,
        });
        const res = await client.chat.completions.create({
          model: cfg.model,
          messages,
          temperature: 0.2,
          max_tokens: 600,
        });
        const content = res.choices[0]?.message?.content;
        text = typeof content === "string" ? content : "";
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (!is429(err)) throw err;
        if (chatConfigs.indexOf(cfg) >= chatConfigs.length - 1) throw err;
      }
    }
    if (lastErr) throw lastErr;
    const parsed = parseResponse(text);
    const topDistance = chunks[0]?.distance ?? 1;
    const fallbackSources = normalizeSources(chunks);

    return NextResponse.json({
      answer: parsed.answer,
      sources: parsed.sources || fallbackSources,
      confidence: parsed.confidence || estimateConfidence(topDistance),
      context: chunks,
    });
  } catch (error) {
    const message = String(error);
    const is429 = message.includes("429") || message.includes("quota");
    const isConnectionFail =
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed") ||
      message.includes("Failed to fetch") ||
      message.includes("Connection refused") ||
      message.includes("ENOTFOUND");

    let errorLabel = "Connection failed.";
    let detail = message;

    if (is429) {
      errorLabel = "OpenAI quota exceeded.";
      const hasBackup =
        process.env.OPENAI_BACKUP_API_KEY || process.env.GROQ_API_KEY;
      detail = hasBackup
        ? "All providers hit quota. Add credits or try again later."
        : "Add GROQ_API_KEY in Vercel (free at console.groq.com) for automatic fallback when OpenAI hits quota. Or add OPENAI_BACKUP_API_KEY. See web/OLLAMA.md for local Ollama.";
    } else if (isConnectionFail) {
      const hint = process.env.OPENAI_BASE_URL
        ? " If using Ollama, start it (open Ollama app or run: ollama serve) and ensure you ran: ollama pull nomic-embed-text && ollama pull llama3.2"
        : " Check OPENAI_API_KEY and your network.";
      detail = `Connection failed.${hint}`;
    }

    return NextResponse.json(
      { error: errorLabel, detail },
      { status: 500 }
    );
  }
}
