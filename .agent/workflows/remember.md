---
description: Save important information to global long-term memory
---

# Remember

Save a thought, fact, decision, or code snippet to the global persistent memory.

Usage:

- `/remember <content>`
- `/remember <content> --tags <tag1,tag2>`

## Steps

1. Execute the memory tool to store the content.
   ```bash
   python3 .agent/skills/global-memory/scripts/memory_tool.py --action memorize --content "{1}"
   ```
