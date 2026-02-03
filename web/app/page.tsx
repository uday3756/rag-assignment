"use client";

import { useState } from "react";
import styles from "./page.module.css";

type AskResponse = {
  answer: string;
  sources: string;
  confidence: string;
  context: Array<{
    content: string;
    distance: number;
    metadata: { source: string; policyType: string; section: string };
  }>;
  error?: string;
  detail?: string;
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = (await response.json()) as AskResponse;
      if (!response.ok) {
        const msg = data.detail
          ? `${data.error ?? "Request failed"}: ${data.detail}`
          : data.error ?? "Request failed.";
        throw new Error(msg);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Policy RAG Assistant</h1>
          <p>
            Ask questions about refunds, cancellations, or shipping. Answers are
            grounded in the policy documents with sources and confidence.
          </p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            className={styles.textarea}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a policy question..."
            rows={3}
            required
          />
          <button className={styles.button} type="submit" disabled={loading}>
            {loading ? "Thinking..." : "Ask"}
          </button>
        </form>

        {error && <div className={styles.error}>{error}</div>}

        {result && (
          <section className={styles.result}>
            <div className={styles.resultRow}>
              <span className={styles.label}>Answer</span>
              <p>{result.answer}</p>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.label}>Sources</span>
              <p>{result.sources || "No sources returned."}</p>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.label}>Confidence</span>
              <p>{result.confidence || "Unknown"}</p>
            </div>

            {result.context?.length ? (
              <div className={styles.context}>
                <span className={styles.label}>Retrieved Context</span>
                <div className={styles.contextList}>
                  {result.context.map((chunk, idx) => (
                    <div className={styles.contextItem} key={idx}>
                      <div className={styles.contextMeta}>
                        {chunk.metadata.source} · {chunk.metadata.section} ·
                        distance {chunk.distance.toFixed(3)}
                      </div>
                      <p>{chunk.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
