---
description: Delete a specific memory by ID
---

# Forget Memory

Permanently delete a memory from the global database using its ID.

Usage:

- `/forget <MEMORY_ID>`

## Steps

1. Execute the memory tool to delete the item.
   ```bash
   python3 .agent/skills/global-memory/scripts/memory_tool.py --action forget --query "{1}"
   ```
