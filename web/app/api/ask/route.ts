import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  estimateConfidence,
  formatContext,
  retrieve,
  type RetrievedChunk,
} from "@/lib/rag";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

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

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
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
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a careful policy assistant. Follow instructions strictly.",
        },
        { role: "user", content: buildPrompt(question, context) },
      ],
      temperature: 0.2,
      max_tokens: 600,
    });

    const text = response.choices[0]?.message?.content || "";
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
    return NextResponse.json(
      { error: "Failed to process request.", detail: String(error) },
      { status: 500 }
    );
  }
}
