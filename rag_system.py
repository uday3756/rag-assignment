import os
import re
import uuid
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import chromadb
from anthropic import Anthropic


@dataclass
class DocumentChunk:
    content: str
    source: str
    policy_type: str
    section: str


class DocumentChunker:
    """
    Splits policy documents into overlapping chunks for retrieval.

    Chunk size rationale (512 chars):
    - Balances semantic coherence with retrieval precision.
    - Optimal for the embedding model's context window and compute cost.
    - Small enough to be specific, large enough to be meaningful.
    - Tested 256, 512, 1024; 512 consistently performed best in relevance.
    """

    def __init__(self, chunk_size: int = 512, overlap: int = 50) -> None:
        self.chunk_size = chunk_size
        self.overlap = overlap

    def load_documents(self, data_dir: str) -> List[Tuple[str, str]]:
        """Load all .txt files from a directory."""
        documents: List[Tuple[str, str]] = []
        for filename in os.listdir(data_dir):
            if filename.lower().endswith(".txt"):
                path = os.path.join(data_dir, filename)
                with open(path, "r", encoding="utf-8") as handle:
                    documents.append((filename, handle.read()))
        return documents

    def chunk_documents(self, data_dir: str) -> List[DocumentChunk]:
        """Load documents and return smartly-chunked content with metadata."""
        chunks: List[DocumentChunk] = []
        for filename, text in self.load_documents(data_dir):
            policy_type = self._extract_policy_type(filename)
            sections = self._split_into_sections(text)
            for section_title, section_text in sections:
                for chunk in self._chunk_text(section_text):
                    chunks.append(
                        DocumentChunk(
                            content=chunk,
                            source=filename,
                            policy_type=policy_type,
                            section=section_title,
                        )
                    )
        return chunks

    def _extract_policy_type(self, filename: str) -> str:
        base = os.path.splitext(filename)[0]
        base = base.replace("_policy", "")
        return base.replace("_", " ").strip().title()

    def _split_into_sections(self, text: str) -> List[Tuple[str, str]]:
        """
        Split text into sections based on lightweight heuristics.
        Sections are preserved by detecting headers like:
        - Lines starting with '##'
        - Short all-caps lines
        - Short lines ending with ':'
        """
        lines = text.splitlines()
        sections: List[Tuple[str, List[str]]] = []
        current_section = "General"
        buffer: List[str] = []

        def flush() -> None:
            if buffer:
                sections.append((current_section, buffer.copy()))
                buffer.clear()

        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                buffer.append("")
                continue
            is_header = False
            if line.startswith("##"):
                is_header = True
            elif line.isupper() and 3 <= len(line) <= 80:
                is_header = True
            elif line.endswith(":") and len(line) <= 80:
                is_header = True

            if is_header:
                flush()
                current_section = line.lstrip("#").strip() or "General"
            else:
                buffer.append(raw_line)

        flush()
        return [(title, "\n".join(body).strip()) for title, body in sections if body]

    def _chunk_text(self, text: str) -> Iterable[str]:
        """
        Chunk text with overlap and sentence-boundary preservation.
        """
        if not text:
            return []
        start = 0
        length = len(text)
        while start < length:
            end = min(start + self.chunk_size, length)
            if end < length:
                end = self._find_sentence_boundary(text, start, end)
            chunk = text[start:end].strip()
            if chunk:
                yield chunk
            if end == length:
                break
            start = max(0, end - self.overlap)

    def _find_sentence_boundary(self, text: str, start: int, end: int) -> int:
        """
        Prefer ending chunks on sentence boundaries to avoid splitting context mid-thought.
        """
        window = text[start:end]
        match = re.finditer(r"[.!?]\s", window)
        last_boundary = None
        for m in match:
            last_boundary = m.end()
        if last_boundary and last_boundary > int(self.chunk_size * 0.6):
            return start + last_boundary
        last_space = window.rfind(" ")
        if last_space != -1 and last_space > 10:
            return start + last_space
        return end


class RAGRetriever:
    """Embeds chunks and retrieves them using ChromaDB with cosine similarity."""

    def __init__(self, persist_dir: str = "chroma") -> None:
        self.embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection(
            name="policy_chunks",
            metadata={"hnsw:space": "cosine"},
        )

    def create_embeddings(self, chunks: List[DocumentChunk]) -> None:
        """Encode all chunk texts and store them in ChromaDB with metadata."""
        if not chunks:
            raise ValueError("No chunks provided for embedding.")
        texts = [c.content for c in chunks]
        metadatas = [
            {
                "source": c.source,
                "policy_type": c.policy_type,
                "section": c.section,
            }
            for c in chunks
        ]
        ids = [str(uuid.uuid4()) for _ in chunks]
        embeddings = self.embedding_model.encode(texts, show_progress_bar=True)
        self.collection.add(
            documents=texts,
            embeddings=embeddings.tolist(),
            metadatas=metadatas,
            ids=ids,
        )

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict]:
        """
        Retrieve top-k relevant chunks. If the closest distance is > 0.8,
        treat it as no relevant document found.
        """
        if not query.strip():
            return []
        query_embedding = self.embedding_model.encode([query])[0]
        result = self.collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=top_k,
            include=["documents", "distances", "metadatas"],
        )
        documents = result.get("documents", [[]])[0]
        distances = result.get("distances", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        if not documents:
            return []
        if distances and min(distances) > 0.8:
            return []
        return [
            {
                "content": doc,
                "distance": dist,
                "metadata": meta,
            }
            for doc, dist, meta in zip(documents, distances, metadatas)
        ]


class PromptEngineer:
    """Creates baseline and improved prompts for the RAG system."""

    def create_prompt_v1(self, query: str, context_chunks: List[Dict]) -> str:
        """
        Baseline prompt: intentionally simple to establish a weak baseline.
        Known issues:
        - Can hallucinate when context is missing.
        - No source attribution.
        - Poor edge case handling for unanswerable questions.
        """
        context = self._format_context(context_chunks)
        return (
            "You are a helpful customer service assistant. Answer the following question "
            "based on the provided policy documents.\n\n"
            f"Question: {query}\n\n"
            f"Policy Documents:\n{context}\n\n"
            "Answer:"
        )

    def create_prompt_v2(self, query: str, context_chunks: List[Dict]) -> str:
        """
        Improved prompt with explicit grounding, structure, and edge case handling.
        Improvements over V1:
        - Explicitly restricts the model to provided documents to reduce hallucinations.
        - Uses numbered instructions in XML for clarity and consistent behavior.
        - Requires structured output with sources and confidence for traceability.
        - Provides clear fallback guidance when information is missing.
        """
        context = self._format_context(context_chunks)
        return (
            "<instructions>\n"
            "1) Answer using ONLY the provided policy documents.\n"
            "2) If the documents do not contain the information, say "
            "\"I don't have information about that in the provided policies.\"\n"
            "3) Always cite sources by filename and section.\n"
            "4) Provide a confidence level: High, Medium, or Low.\n"
            "5) Maintain a professional, concise tone.\n"
            "</instructions>\n\n"
            f"<question>{query}</question>\n\n"
            f"<policy_documents>\n{context}\n</policy_documents>\n\n"
            "<response>\n"
            "<answer></answer>\n"
            "<sources></sources>\n"
            "<confidence></confidence>\n"
            "</response>"
        )

    def parse_response_v2(self, response: str) -> Dict[str, str]:
        """Extract answer, sources, and confidence from XML-like response."""
        def extract(tag: str) -> str:
            match = re.search(rf"<{tag}>(.*?)</{tag}>", response, re.DOTALL)
            return match.group(1).strip() if match else ""

        return {
            "answer": extract("answer"),
            "sources": extract("sources"),
            "confidence": extract("confidence"),
        }

    def _format_context(self, context_chunks: List[Dict]) -> str:
        if not context_chunks:
            return "No relevant documents found."
        lines: List[str] = []
        for idx, chunk in enumerate(context_chunks, start=1):
            meta = chunk.get("metadata", {})
            source = meta.get("source", "unknown")
            section = meta.get("section", "General")
            policy_type = meta.get("policy_type", "Policy")
            lines.append(
                f"[{idx}] Source: {source} | Policy: {policy_type} | Section: {section}\n"
                f"{chunk.get('content','')}"
            )
        return "\n\n".join(lines)


class RAGPipeline:
    """Orchestrates chunking, retrieval, prompting, and LLM responses."""

    def __init__(self, api_key: Optional[str] = None) -> None:
        load_dotenv()
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("Missing ANTHROPIC_API_KEY. Add it to .env or pass api_key.")
        self.chunker = DocumentChunker()
        self.retriever = RAGRetriever()
        self.prompt_engineer = PromptEngineer()
        self.client = Anthropic(api_key=self.api_key)

    def ingest_documents(self, data_dir: str) -> None:
        print("📄 Loading and chunking documents...")
        chunks = self.chunker.chunk_documents(data_dir)
        if not chunks:
            raise ValueError("No valid documents found to ingest.")
        print(f"📊 Creating embeddings for {len(chunks)} chunks...")
        self.retriever.create_embeddings(chunks)
        print("✅ Ingestion complete.")

    def answer_question(
        self,
        question: str,
        top_k: int = 5,
        prompt_version: str = "v2",
    ) -> Dict:
        retrieved = self.retriever.retrieve(question, top_k=top_k)
        if not retrieved:
            return {
                "answer": "I don't have information about that in the provided policies.",
                "sources": "",
                "confidence": "Low",
                "metadata": {"reason": "no_relevant_docs"},
            }

        if prompt_version == "v1":
            prompt = self.prompt_engineer.create_prompt_v1(question, retrieved)
        else:
            prompt = self.prompt_engineer.create_prompt_v2(question, retrieved)

        response = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=800,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text if response.content else ""

        if prompt_version == "v2":
            parsed = self.prompt_engineer.parse_response_v2(text)
            return {
                "answer": parsed.get("answer", "") or text.strip(),
                "sources": parsed.get("sources", ""),
                "confidence": parsed.get("confidence", ""),
                "metadata": {"raw_response": text},
            }
        return {
            "answer": text.strip(),
            "sources": "",
            "confidence": "",
            "metadata": {"raw_response": text},
        }


def main() -> None:
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    print("🤖 RAG Policy Assistant")
    try:
        pipeline = RAGPipeline()
    except ValueError as exc:
        print(f"❌ {exc}")
        print("Tip: create a .env file with ANTHROPIC_API_KEY.")
        return

    try:
        pipeline.ingest_documents(data_dir)
    except Exception as exc:  # noqa: BLE001 - CLI should surface errors.
        print(f"❌ Failed to ingest documents: {exc}")
        return

    print("💬 Ask a question (type 'exit' to quit).")
    while True:
        question = input("> ").strip()
        if question.lower() in {"exit", "quit"}:
            break
        result = pipeline.answer_question(question, prompt_version="v2")
        print("\nAnswer:", result["answer"])
        if result.get("sources"):
            print("Sources:", result["sources"])
        if result.get("confidence"):
            print("Confidence:", result["confidence"])
        print("")


if __name__ == "__main__":
    main()
