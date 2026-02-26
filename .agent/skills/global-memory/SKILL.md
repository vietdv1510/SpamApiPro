---
name: global-memory
description: Enhanced Long-term Memory System for Antigravity Agents (Inspired by OpenClaw/Moltbot). Stores and retrieves knowledge across different projects using a central vector database.
created: 2026-01-30
---

# Global Memory Skill

This skill provides a persistent, cross-project memory system powered by ChromaDB. It allows the agent to "remember" facts, decisions, and outcomes from previous sessions, even if they occurred in a different workspace.

## 🧠 Architecture

- **Storage:** Local vector database at `~/.antigravity_brain/chroma_db`.
- **Engine:** ChromaDB + Sentence Transformers (all-MiniLM-L6-v2).
- **Strategy:** Retrieval-Augmented Generation (RAG) on local history.

## 🛠️ Usage

### 1. Initialize & Recall (At start of session)

Run this to see what happened recently or related to the current task.

```bash
python3 .agent/skills/global-memory/scripts/memory_tool.py --action recall --query "last project status"
```

### 2. Memorize (At end of task/session)

Run this to save important context.

```bash
python3 .agent/skills/global-memory/scripts/memory_tool.py --action memorize --content "Fixed bug E05 in payment gateway by adding correct payload keys." --tags "bugfix, payment, pj237"
```

### 3. Auto-Learn (Advanced)

Use the `auto_learn.py` script to summarize the current conversation history and save it automatically.

## 📂 File Structure

- `scripts/memory_manager.py`: Core logic class (Singleton).
- `scripts/memory_tool.py`: CLI wrapper for the agent to use.
