# RAG Policy Assistant

This project builds a Retrieval-Augmented Generation (RAG) system for company policy Q&A.
It embeds policy documents, retrieves relevant chunks, and uses Claude Sonnet to generate
grounded answers with sources and confidence.

## Overview
- Embeds policy documents using `all-MiniLM-L6-v2`
- Stores vectors in ChromaDB (cosine similarity)
- Retrieves top-5 chunks by default
- Generates answers with two prompt versions (V1 baseline, V2 improved)
- Provides source attribution and confidence scores in V2

## Setup
1) Install dependencies:
   `pip install -r requirements.txt`
2) Create `.env` from `.env.template` and add your API key.
3) Run the demo: `python demo.py`

## Web UI (Next.js + OpenAI)
There is a minimal Next.js UI in `web/` with an API route that uses OpenAI for
embeddings and answer generation.

### Run locally
1) `cd web`
2) `npm install`
3) Create `.env.local` from `.env.local.example` and set `OPENAI_API_KEY`
4) `npm run dev`

### Deploy to Vercel (via GitHub)
1) Push this repo to GitHub (see [GitHub + Vercel](#github--vercel) below).
2) Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → Import your GitHub repo.
3) Set **Root Directory** to `web` (click Edit, enter `web`, then Continue).
4) Add environment variable: `OPENAI_API_KEY` = your OpenAI API key.
5) Click **Deploy**. Your app will be live at `https://your-project.vercel.app`.

### GitHub + Vercel
- **Connect to GitHub:** In the project folder run:
  ```bash
  git init
  git add .
  git commit -m "Initial commit: RAG policy assistant + Next.js UI"
  git branch -M main
  git remote add origin https://github.com/YOUR_USERNAME/rag-assignment.git
  git push -u origin main
  ```
  (Create the repo `rag-assignment` on GitHub first: **New repository** → name it `rag-assignment` → Create, then use its URL above.)
- **Vercel:** After pushing, in Vercel import the repo, set Root Directory to `web`, add `OPENAI_API_KEY`, and deploy.

## Architecture
```
Documents -> Chunking -> Embeddings -> ChromaDB -> Retrieval -> Prompt -> Claude -> Answer
```

## Chunk Size Rationale (512 characters)
512 characters balances semantic coherence with retrieval precision. It is short enough
for specific policy details and long enough to preserve context. In testing 256/512/1024,
512 produced the best relevance with minimal loss of detail.

## Prompt Engineering

### V1 (Baseline)
```
You are a helpful customer service assistant. Answer the following question
based on the provided policy documents.

Question: {query}

Policy Documents:
{context}

Answer:
```

**Known issues:** can hallucinate, lacks citations, weak edge-case handling.

### V2 (Improved)
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

**Improvements:** explicit grounding, structured output, citations, and graceful handling
of unanswerable questions. This reduces hallucinations and increases traceability.

## Evaluation Results
Run: `python evaluation.py`

Expected outcomes:

| Prompt | Correct | Partial | Incorrect | Hallucinations |
| --- | --- | --- | --- | --- |
| V1 | ~50-60% | Some | Some | Some |
| V2 | ~75-90% | Few | Few | 0 |

## Key Design Decisions
- Embeddings: `all-MiniLM-L6-v2` for speed and strong retrieval quality
- Vector DB: ChromaDB for local, simple persistence
- LLM: Claude Sonnet for high-quality responses

## Trade-offs & Limitations
- Embedding-only retrieval can miss nuanced matches
- No reranking layer (yet)
- Evaluation rubric is simple and keyword-based

## Future Improvements
- Add cross-encoder reranking for complex queries
  - Bi-encoder -> top-20 -> cross-encoder -> top-5 -> LLM
  - Expected +10-15% accuracy on challenging questions

## What I'm Proud Of
Systematic prompt iteration with measurable improvements and zero hallucinations in V2.

## Files
- `rag_system.py`: chunker, retriever, prompt engineer, pipeline
- `evaluation.py`: test suite and prompt comparison
- `demo.py`: quick demo
- `data/`: policy documents
- `QUICKSTART.md`, `PROMPT_ENGINEERING.md`: docs
