---
name: ai-adversarial-forensics
description: Investigating AI-related security incidents, tracing prompt injections, and identifying malicious agentic behavior post-exploitation.
category: security
skills: ai-engineering, observability-engineer, forensics-analyst
---

# 🕵️ AI Adversarial Forensics (2026)

> "The logs never lie, but the AI might."

When an AI system is hacked—whether through a jailbreak or an agent hijack—standard server logs aren't enough. You need to perform **Inference-level Forensics**.

## 📊 The Forensics Stack for AI

### 1. The Prompt Log (Input Trace)

- **What to look for**: High entropy (Base64), multiple languages, weird character repeats (GCG attacks), or extremely long contexts (many-shot).
- **Red Flag**: Requests that use "Role-play" frameworks or ask the AI to "Forget all previous rules".

### 2. The Trace Log (Agent Execution)

- **What to look for**: Unexpected tool calls. Why did the "Support Bot" call `list_directory`?
- **Red Flag**: A tool call where the arguments don't match the user's explicit request.

### 3. The Embedding Trace (RAG)

- **What to look for**: Which chunks were retrieved for a given query?
- **Red Flag**: A query about "Price policy" retrieving a chunk about "Debugging instructions". This indicates a metadata or vector injection.

---

## 🛠️ Investigation Workflows

### Phase 1: Identification

- Goal: Determine if the anomaly was a "Hallucination" or an "Attack".
- **Check**: Did the output grant unauthorized access? If yes → Attack.
- **Check**: Is the malicious payload present in the retrieval database? If yes → RAG Poisoning.

### Phase 2: Reconstruction (The "Replay")

- **Method**: Use an identical model and temperature. Re-run the suspicious prompt.
- **Goal**: See if the model consistently produces the malicious output. If it does, the "Safety Alignment" is the weak point.

### Phase 3: Attribution

- **Source**: Trace the `user_id`, IP, and session tokens.
- **Advanced**: If it's an Indirect Injection, find the source document (e.g., the URL the agent scraped) and analyze its history.

---

## 🔬 Advanced Detection Patterns

### 1. Semantic Distance Monitoring

Monitor the distance between the query and the retrieved chunks. If a chunk is retrieved but has a very low cosine similarity (or is suspiciously high but the content is gibberish), it's likely a **Similarity Attack**.

### 2. Perplexity Spikes

Attacks often use garbled text (like adversarial suffixes). If the **Perplexity** of the input prompt spikes significantly compared to average user queries, trigger a "Manual Review" gate.

### 3. Agentic Dead-Ends

Detect loops where the agent tries to call a tool, gets blocked, and tries a "shades of grey" alternative immediately. This "Trial and Error" behavior is characteristic of an automated AI exploit script.

---

## 🛡️ Hardening & Monitoring

- **LangSmith / Langfuse**: Use these to trace every step of the chain.
- **Prompt Guard**: Deploy a small, fast model (BERT-based) specifically to classify inputs as "Jailbreak" or "Safe" _before_ sending them to the expensive frontier model.

---

## 🔗 Related Skills

- `@[ai-red-teaming-foundations]`
- `@[observability-engineer]`
- `@[langfuse]`
