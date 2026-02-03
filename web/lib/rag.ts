import fs from "fs";
import path from "path";
import OpenAI from "openai";

export type ChunkMetadata = {
  source: string;
  policyType: string;
  section: string;
};

export type IndexedChunk = {
  content: string;
  embedding: number[];
  metadata: ChunkMetadata;
};

export type RetrievedChunk = {
  content: string;
  metadata: ChunkMetadata;
  distance: number;
};

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 50;
const DISTANCE_THRESHOLD = 0.8;
const EMBEDDING_MODEL =
  process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

let cachedIndex: IndexedChunk[] | null = null;
let cachedDocsHash: string | null = null;

function loadPolicyDocs(): Array<{ filename: string; text: string }> {
  const candidates = [
    path.resolve(process.cwd(), "..", "data"),
    path.resolve(process.cwd(), "data"),
  ];
  let dataDir: string | null = null;
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      dataDir = dir;
      break;
    }
  }
  if (!dataDir) {
    throw new Error(
      `Policy data directory not found. Tried: ${candidates.join(", ")}`
    );
  }
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".txt"));
  if (files.length === 0) {
    throw new Error(`No .txt policy files found in ${dataDir}`);
  }
  return files.map((filename) => {
    const text = fs.readFileSync(path.join(dataDir!, filename), "utf-8");
    return { filename, text };
  });
}

function extractPolicyType(filename: string): string {
  const base = filename.replace("_policy", "").replace(".txt", "");
  return base.replace(/_/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());
}

function splitIntoSections(text: string): Array<{ title: string; body: string }> {
  const lines = text.split(/\r?\n/);
  const sections: Array<{ title: string; bodyLines: string[] }> = [];
  let currentTitle = "General";
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length) {
      sections.push({ title: currentTitle, bodyLines: buffer });
      buffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      buffer.push("");
      continue;
    }

    const isHeader =
      line.startsWith("##") ||
      (/^[A-Z\s]+$/.test(line) && line.length >= 3 && line.length <= 80) ||
      (line.endsWith(":") && line.length <= 80);

    if (isHeader) {
      flush();
      currentTitle = line.replace(/^#+/, "").trim() || "General";
    } else {
      buffer.push(rawLine);
    }
  }

  flush();
  return sections
    .map((section) => ({
      title: section.title,
      body: section.bodyLines.join("\n").trim(),
    }))
    .filter((section) => section.body.length > 0);
}

function findSentenceBoundary(text: string, start: number, end: number): number {
  const window = text.slice(start, end);
  const matches = window.matchAll(/[.!?]\s/g);
  let lastBoundary: number | null = null;
  for (const match of matches) {
    lastBoundary = match.index + match[0].length;
  }
  if (lastBoundary && lastBoundary > CHUNK_SIZE * 0.6) {
    return start + lastBoundary;
  }
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace > 10) {
    return start + lastSpace;
  }
  return end;
}

function chunkText(text: string): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      end = findSentenceBoundary(text, start, end);
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function hashDocs(docs: Array<{ filename: string; text: string }>): string {
  const content = docs.map((d) => `${d.filename}:${d.text.length}`).join("|");
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  return String(hash);
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  const openai = new OpenAI({ apiKey });
  const embeddings: number[][] = [];
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    for (const item of response.data) {
      embeddings.push(item.embedding);
    }
  }
  return embeddings;
}

export async function getIndex(): Promise<IndexedChunk[]> {
  const docs = loadPolicyDocs();
  const docsHash = hashDocs(docs);
  if (cachedIndex && cachedDocsHash === docsHash) {
    return cachedIndex;
  }

  const chunks: Array<{ content: string; metadata: ChunkMetadata }> = [];
  for (const doc of docs) {
    const policyType = extractPolicyType(doc.filename);
    const sections = splitIntoSections(doc.text);
    for (const section of sections) {
      const chunked = chunkText(section.body);
      for (const content of chunked) {
        chunks.push({
          content,
          metadata: {
            source: doc.filename,
            policyType,
            section: section.title,
          },
        });
      }
    }
  }

  const embeddings = await embedTexts(chunks.map((c) => c.content));
  cachedIndex = chunks.map((chunk, idx) => ({
    content: chunk.content,
    metadata: chunk.metadata,
    embedding: embeddings[idx],
  }));
  cachedDocsHash = docsHash;
  return cachedIndex;
}

export async function retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
  if (!query.trim()) return [];
  const index = await getIndex();
  if (!index.length) return [];
  const [queryEmbedding] = await embedTexts([query]);

  const scored = index.map((chunk) => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    const distance = 1 - similarity;
    return { ...chunk, distance };
  });

  scored.sort((a, b) => a.distance - b.distance);
  const top = scored.slice(0, topK);
  if (!top.length || top[0].distance > DISTANCE_THRESHOLD) {
    return [];
  }
  return top.map((item) => ({
    content: item.content,
    metadata: item.metadata,
    distance: item.distance,
  }));
}

export function formatContext(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "No relevant documents found.";
  return chunks
    .map(
      (chunk, idx) =>
        `[${idx + 1}] Source: ${chunk.metadata.source} | Policy: ${chunk.metadata.policyType} | Section: ${chunk.metadata.section}\n${chunk.content}`
    )
    .join("\n\n");
}

export function estimateConfidence(distance: number): "High" | "Medium" | "Low" {
  if (distance < 0.35) return "High";
  if (distance < 0.55) return "Medium";
  return "Low";
}
