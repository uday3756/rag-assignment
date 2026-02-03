from dataclasses import dataclass
from typing import Dict, List

from rag_system import RAGPipeline


@dataclass
class TestQuestion:
    question: str
    category: str
    expected_answer: str
    expected_sources: List[str]


class RAGEvaluator:
    def __init__(self, pipeline: RAGPipeline) -> None:
        self.pipeline = pipeline
        self.test_set = self._create_test_set()

    def _create_test_set(self) -> List[TestQuestion]:
        return [
            TestQuestion(
                question="How long do I have to return a physical product?",
                category="direct",
                expected_answer="30 days",
                expected_sources=["refund_policy.txt"],
            ),
            TestQuestion(
                question="What is the return window for digital downloads?",
                category="direct",
                expected_answer="14 days",
                expected_sources=["refund_policy.txt"],
            ),
            TestQuestion(
                question="Can I get a refund for a subscription after a week?",
                category="partial",
                expected_answer="7 days",
                expected_sources=["refund_policy.txt"],
            ),
            TestQuestion(
                question="Do you offer refunds for event tickets 3 days before the event?",
                category="partial",
                expected_answer="tiered refunds",
                expected_sources=["cancellation_policy.txt"],
            ),
            TestQuestion(
                question="What happens if my package is damaged and the wrong item arrives?",
                category="multi-doc",
                expected_answer="damaged packages and wrong items",
                expected_sources=["shipping_policy.txt", "refund_policy.txt"],
            ),
            TestQuestion(
                question="Do you ship to Antarctica?",
                category="unanswerable",
                expected_answer="I don't have information",
                expected_sources=[],
            ),
            TestQuestion(
                question="Can I cancel my order after it ships?",
                category="unanswerable",
                expected_answer="I don't have information",
                expected_sources=[],
            ),
            TestQuestion(
                question="If I miss the 24-hour window, what is the cancellation fee?",
                category="edge",
                expected_answer="$10",
                expected_sources=["cancellation_policy.txt"],
            ),
        ]

    def evaluate(self, prompt_version: str) -> Dict[str, int]:
        results = {"correct": 0, "partial": 0, "incorrect": 0, "hallucinations": 0}
        print(f"\nEvaluating prompt {prompt_version}...")

        for test in self.test_set:
            response = self.pipeline.answer_question(
                test.question, prompt_version=prompt_version
            )
            answer = response.get("answer", "").lower()

            is_unanswerable = test.category == "unanswerable"
            if is_unanswerable:
                if "don't have information" in answer or "not in the provided" in answer:
                    results["correct"] += 1
                else:
                    results["incorrect"] += 1
                    results["hallucinations"] += 1
                continue

            expected = test.expected_answer.lower()
            if expected in answer:
                results["correct"] += 1
            elif any(word in answer for word in expected.split()):
                results["partial"] += 1
            else:
                results["incorrect"] += 1

            print(
                f"- {test.question}\n"
                f"  Answer: {response.get('answer','')}\n"
                f"  Sources: {response.get('sources','')}\n"
            )

        return results


def compare_prompts() -> None:
    pipeline = RAGPipeline()
    pipeline.ingest_documents("data")
    evaluator = RAGEvaluator(pipeline)
    results_v1 = evaluator.evaluate("v1")
    results_v2 = evaluator.evaluate("v2")

    def score(res: Dict[str, int]) -> int:
        total = res["correct"] + res["partial"] + res["incorrect"]
        return int((res["correct"] + 0.5 * res["partial"]) / max(total, 1) * 100)

    print("\nComparison Results:")
    print(f"V1 Score: {score(results_v1)}%")
    print(f"V2 Score: {score(results_v2)}%")
    print(f"V1 Hallucinations: {results_v1['hallucinations']}")
    print(f"V2 Hallucinations: {results_v2['hallucinations']}")


if __name__ == "__main__":
    compare_prompts()
