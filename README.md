# RAG Policy Assistant

Retrieval-Augmented Generation (RAG) system for company policy Q&A: embedding → vector storage → retrieval → LLM generation. Includes a Python CLI (Claude + ChromaDB) and an optional Next.js UI (OpenAI or local Ollama).

---

## Deliverables

- **Source code:** `rag_system.py`, `evaluation.py`, `demo.py`, `data/`, and `web/` (Next.js UI).
- **README:** This file (setup, architecture, prompts, evaluation, trade-offs).
- **Optional:** Comparison between two prompt versions (V1 vs V2) via `python evaluation.py`.

---

## 1. Setup instructions

### Python CLI (core RAG)

```bash
# From repo root
pip install -r requirements.txt
cp .env.template .env
# Edit .env and set ANTHROPIC_API_KEY=
python demo.py
```

- **Interactive CLI:** `python rag_system.py`
- **Evaluation (V1 vs V2):** `python evaluation.py`

### Optional: Web UI

```bash
cd web
npm install
cp .env.local.example .env.local
# Edit .env.local: either OPENAI_API_KEY= or Ollama (see web/OLLAMA.md)
npm run dev
```

Open http://localhost:3000. For **free local LLM** (no API quota), use Ollama: see [web/OLLAMA.md](web/OLLAMA.md).

**Vercel (production):** Set `OPENAI_API_KEY` in project Environment Variables. To avoid 429 quota errors, add a **backup key**: `OPENAI_BACKUP_API_KEY` (second OpenAI key). When the primary key hits quota, the app automatically retries with the backup for both embeddings and chat.

---

## 2. Architecture overview

```
Policy docs (data/*.txt)
    → DocumentChunker (512 chars, 50 overlap, sentence boundaries)
    → RAGRetriever (SentenceTransformer all-MiniLM-L6-v2 + ChromaDB cosine)
    → Top-k retrieval (default 5)
    → PromptEngineer (V1 or V2 prompt)
    → LLM (Claude in Python; OpenAI or Ollama in web)
    → Answer + sources + confidence
```

- **Chunking:** 512 characters with 50-character overlap; breaks at sentence boundaries and preserves section headers.
- **Embeddings:** all-MiniLM-L6-v2 (Python) or OpenAI/Ollama embeddings (web).
- **Vector store:** ChromaDB (Python) or in-memory with OpenAI/Ollama (web).
- **Prompts:** V1 baseline vs V2 improved (explicit grounding, structured output, source citation, confidence).

---

## 3. Prompts used

### V1 (Baseline)

- Simple instruction; no structure; known to allow hallucinations and missing citations.

```
You are a helpful customer service assistant. Answer the following question
based on the provided policy documents.

Question: {query}

Policy Documents:
{context}

Answer:
```

### V2 (Improved)

- Explicit grounding, structured XML output, required source citation and confidence; reduces hallucinations.

```
<instructions>
1) Answer using ONLY the provided policy documents.
2) If the documents do not contain the information, say "I don't have information about that in the provided policies."
3) Always cite sources by filename and section.
4) Provide a confidence level: High, Medium, or Low.
5) Maintain a professional, concise tone.
</instructions>

<question>{query}</question>

<policy_documents>
{context}
</policy_documents>

<response>
<answer></answer>
<sources></sources>
<confidence></confidence>
</response>
```

---

## 4. Evaluation results

Run the comparison:

```bash
python evaluation.py
```

- **Test set:** 8 questions (2 direct, 2 partial, 1 multi-doc, 2 unanswerable, 1 edge).
- **Scoring:** Correct / Partial / Incorrect; hallucination check for unanswerable.

Expected (approximate):

| Prompt | Correct | Partial | Incorrect | Hallucinations |
|--------|---------|---------|-----------|-----------------|
| V1     | ~50–60% | Some    | Some      | Some            |
| V2     | ~75–90% | Few     | Few       | 0               |

Results depend on API/model; the script prints per-question output and a summary.

---

## 5. Key trade-offs and improvements with more time

**Trade-offs**

- **Embedding-only retrieval:** Fast and simple but can miss nuanced matches; a reranking step would help.
- **Chunk size 512:** Good balance for this corpus; other docs might need tuning.
- **Evaluation:** Keyword/semantic rubric rather than full human judgment.
- **Web stack:** Uses OpenAI/Ollama; Python stack uses Claude + ChromaDB (different code paths).

**Improvements with more time**

1. **Reranking:** Bi-encoder → top-20 → cross-encoder → top-5 → LLM for better accuracy on complex questions.
2. **Prompt templating:** LangChain/LangGraph for versioned, reusable prompts.
3. **Output schema:** Validate LLM output (e.g. JSON schema) for answer/sources/confidence.
4. **Logging/tracing:** Basic request IDs and latency per stage (chunk, embed, retrieve, generate).
5. **Unified backend:** Single RAG API (e.g. FastAPI) consumed by both Python and web front end.

---

## Pushing to GitHub

1. Create a new repository on GitHub (e.g. `rag-assignment`); leave it empty (no README/.gitignore).
2. From the project root:

```bash
git remote add origin https://github.com/YOUR_USERNAME/rag-assignment.git
git push -u origin main
```

(If you already have a remote, use `git remote set-url origin ...` or add and push as above.)

3. Optional Vercel deploy: import the repo, set **Root Directory** to `web`, add `OPENAI_API_KEY` (or use Ollama locally only).

---

## Repo layout

| Path | Purpose |
|------|--------|
| `rag_system.py` | DocumentChunker, RAGRetriever, PromptEngineer, RAGPipeline |
| `evaluation.py` | Test set, V1 vs V2 comparison |
| `demo.py` | Short demo script |
| `data/` | Policy documents (refund, cancellation, shipping) |
| `web/` | Next.js UI and `/api/ask` (OpenAI or Ollama) |
| `QUICKSTART.md`, `PROMPT_ENGINEERING.md` | Extra docs |
| `DEPLOY.md` | GitHub + Vercel steps |
| `web/OLLAMA.md` | Free local LLM (Ollama) setup |
