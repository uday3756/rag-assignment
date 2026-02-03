import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        background: "#0b0f14",
        color: "#e5e7eb",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>404 – Not Found</h1>
      <p style={{ color: "#9ca3af", marginBottom: "1.5rem" }}>
        This page doesn&apos;t exist. The app root is the home page.
      </p>
      <Link
        href="/"
        style={{
          color: "#4f46e5",
          fontWeight: 600,
          textDecoration: "underline",
        }}
      >
        Go to Policy RAG Assistant
      </Link>
    </div>
  );
}
