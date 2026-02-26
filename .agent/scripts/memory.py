import json
import os
import sys
import argparse
from datetime import datetime
from difflib import get_close_matches

MEMORY_FILE = ".agent/memory/brain.json"

def load_memory():
    if not os.path.exists(MEMORY_FILE):
        os.makedirs(os.path.dirname(MEMORY_FILE), exist_ok=True)
        return {"long_term": {}, "episodic": []}
    try:
        with open(MEMORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {"long_term": {}, "episodic": []}

def save_memory(data):
    os.makedirs(os.path.dirname(MEMORY_FILE), exist_ok=True)
    with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def remember(key, value, category="general"):
    data = load_memory()
    entry = {
        "value": value,
        "category": category,
        "timestamp": datetime.now().isoformat()
    }
    data["long_term"][key.lower()] = entry
    
    # Also log to episodic memory
    data["episodic"].append({
        "action": "remember",
        "key": key,
        "timestamp": datetime.now().isoformat()
    })
    
    save_memory(data)
    print(f"✅ Ghi nhớ: '{key}' -> '{value}' (Mục: {category})")

def recall(query):
    data = load_memory()
    long_term = data["long_term"]
    
    # Exact match
    if query.lower() in long_term:
        item = long_term[query.lower()]
        print(f"🔍 Tìm thấy (Chính xác): {item['value']} (Lưu lúc: {item['timestamp']})")
        return

    # Fuzzy match keys
    keys = list(long_term.keys())
    matches = get_close_matches(query.lower(), keys, n=3, cutoff=0.5)
    
    if matches:
        print(f"🔍 Tìm thấy {len(matches)} kết quả liên quan cho '{query}':")
        for match in matches:
            item = long_term[match]
            print(f"   - [{match}]: {item['value']}")
    else:
        print(f"❌ Không tìm thấy thông tin gì về '{query}' trong bộ nhớ dài hạn.")

def show_all():
    data = load_memory()
    print("🧠 TẤT CẢ TRÍ NHỚ HIỆN CÓ:")
    for k, v in data["long_term"].items():
        print(f" - {k}: {v['value']}")

def main():
    parser = argparse.ArgumentParser(description="AI Agent Dynamic Memory System")
    subparsers = parser.add_subparsers(dest="command")

    # Remember command
    rem_parser = subparsers.add_parser("remember", help="Save knowledge")
    rem_parser.add_argument("key", help="Keyword/Topic")
    rem_parser.add_argument("value", help="Information to store")
    rem_parser.add_argument("--cat", default="general", help="Category")

    # Recall command
    rec_parser = subparsers.add_parser("recall", help="Retrieve knowledge")
    rec_parser.add_argument("query", help="Keyword to search")

    # Show all
    subparsers.add_parser("list", help="List all memories")

    args = parser.parse_args()

    if args.command == "remember":
        remember(args.key, args.value, args.cat)
    elif args.command == "recall":
        recall(args.query)
    elif args.command == "list":
        show_all()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
