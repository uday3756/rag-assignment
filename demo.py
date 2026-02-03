from rag_system import RAGPipeline


def run_demo() -> None:
    pipeline = RAGPipeline()
    pipeline.ingest_documents("data")

    questions = [
        "How long do I have to return a physical product?",
        "What happens if my package is lost during shipping?",
        "Can I cancel a subscription after renewal?",
        "What happens if my package is damaged and I received the wrong item?",
        "Do you ship to Antarctica?",
    ]

    print("\nDemo Results:")
    for q in questions:
        result = pipeline.answer_question(q, prompt_version="v2")
        print("=" * 60)
        print(f"Question: {q}")
        print(f"Answer: {result.get('answer','')}")
        print(f"Sources: {result.get('sources','')}")
        print(f"Confidence: {result.get('confidence','')}")


if __name__ == "__main__":
    run_demo()
