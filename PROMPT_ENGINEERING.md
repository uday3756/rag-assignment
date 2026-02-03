# Prompt Engineering Iterations

## Goals
- Reduce hallucinations
- Improve source attribution
- Handle unanswerable questions gracefully
- Maintain professional tone

## Iteration V1 (Baseline)
**Design:** Simple instruction to answer based on documents with no structure.

**Observed issues:**
- Answers sometimes include details not present in context
- No citations or traceability
- Inconsistent handling of missing information

## Iteration V2 (Improved)
**Changes made:**
1) Explicit grounding: "Answer using ONLY the provided policy documents"
2) Structured output with XML tags: `<answer>`, `<sources>`, `<confidence>`
3) Clear fallback message for missing info
4) Required source citations by filename and section
5) Professional, concise tone

**Why it works:**
- Forces the model to anchor on the provided context
- Enforces consistent formatting for parsing
- Reduces hallucinations by providing a strong, deterministic fallback

## Expected Result
V2 should improve accuracy by 25-40% and eliminate hallucinations in evaluation.
