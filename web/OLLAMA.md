# Use a free local LLM (Ollama) – no API key, no quota

When you hit **429 quota** or don’t want to use OpenAI, run the app with **Ollama** on your machine. Everything stays local and free.

## 1. Install Ollama

- **Windows:** [ollama.com/download](https://ollama.com/download) → download and run the installer.
- **Mac/Linux:** `curl -fsSL https://ollama.com/install.sh | sh`

## 2. Pull the models

In a terminal (Ollama must be running):

```bash
ollama pull nomic-embed-text
ollama pull llama3.2
```

- **nomic-embed-text** – used for finding relevant policy chunks (embeddings).
- **llama3.2** – used for the final answer (small, runs smoothly on 8GB+ RAM).

If your PC is slow or low on RAM, use a smaller chat model:

```bash
ollama pull phi3
```

Then in `.env.local` set `OPENAI_CHAT_MODEL=phi3`.

## 3. Configure the app

In `web/.env.local` (create it if needed):

```env
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_CHAT_MODEL=llama3.2
OPENAI_EMBED_MODEL=nomic-embed-text
```

For a smaller/faster chat model:

```env
OPENAI_CHAT_MODEL=phi3
```

## 4. Run the app

```bash
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and ask a policy question. The first request may be slower while Ollama loads the models; after that it should run smoothly.

## Notes

- Keep **Ollama running** (it usually runs in the background after install).
- **First run:** embedding the policy docs can take 30–60 seconds; later requests use the cache.
- **RAM:** llama3.2 needs about 4–6 GB; phi3 about 2–3 GB. Close other heavy apps if it’s slow.
