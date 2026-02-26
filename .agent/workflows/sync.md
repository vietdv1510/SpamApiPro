---
description: Automatically summarize and save session insights
---

# Sync Session (Auto-Summarize)

Automatically analyzing the current conversation context, generating a summary, and saving it to global memory.

Usage:

- `/sync`

## Steps

1. [LLM-AUTO] **Analyze Conversation**: Review the conversation history. Identify key insights, decisions, bugs fix, or user preferences.
2. [LLM-AUTO] **Classify & Summarize**:
   - Determine the **Category**: `PROFILE` (User info), `TECH` (Stack/Config), `BUG` (Errors/Fixes), `SECRET` (Keys/Tokens), `LESSON` (Knowledge).
   - Generate a concise summary (in Vietnamese if the user speaks Vietnamese).
   - Extract relevant **Tags** (e.g., "api, payment, error-handling").
3. [LLM-AUTO] **Store**:
   ```bash
   python3 .agent/skills/global-memory/scripts/memory_tool.py --action memorize --content "<YOUR_SUMMARY>" --tags "<category>,<tags>,auto_sync"
   ```
4. [LLM-AUTO] **Confirm**: Inform the user what has been synced.
