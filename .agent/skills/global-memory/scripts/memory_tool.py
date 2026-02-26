import argparse
import sys
import os

# Thêm thư mục hiện tại vào path để import
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from memory_manager import GlobalMemory

def main():
    parser = argparse.ArgumentParser(description="Antigravity Global Memory CLI")
    parser.add_argument("--action", choices=["memorize", "recall", "clear", "forget"], required=True, help="Action to perform")
    parser.add_argument("--content", help="Content to memorize")
    parser.add_argument("--query", help="Query string for recall")
    parser.add_argument("--tags", help="Comma-separated tags")
    parser.add_argument("--limit", type=int, default=5, help="Number of results to recall")

    args = parser.parse_args()
    
    try:
        gm = GlobalMemory()
        
        if args.action == "memorize":
            if not args.content:
                print("❌ Error: --content matches required for memorize action")
                return
            
            meta = {}
            if args.tags:
                meta["tags"] = args.tags
                
            mem_id = gm.memorize(args.content, metadata=meta)
            print(f"✅ Stored successfully. ID: {mem_id}")
            
        elif args.action == "recall":
            if not args.query:
                # Nếu không có query, mặc định tìm kiếm những gì mới nhất (Tiếng Việt)
                query = "những cập nhật quan trọng gần đây, tóm tắt dự án, thông tin user"
            else:
                query = args.query
                
            print(f"🧠 Đang hồi tưởng về: '{query}'...")
            results = gm.recall(query, n_results=args.limit)
            
            if not results:
                print("📭 Không tìm thấy ký ức nào liên quan.")
            else:
                print(f"📂 Tìm thấy {len(results)} ký ức liên quan:")
                for i, mem in enumerate(results):
                    source = mem['metadata'].get('project', 'unknown').split('/')[-1]
                    date = mem['metadata'].get('timestamp', '')[:16].replace('T', ' ')
                    rel_type = mem.get('relation_type', '📜 Phù hợp')
                    # Format lại ngày tháng cho đẹp
                    print(f"   {i+1}. [{date}] [{source}] -> {rel_type}")
                    if 'tech_stack' in mem['metadata']:
                         print(f"      🛠️ Tech: {mem['metadata']['tech_stack']}")
                    print(f"      {mem['content'][:200]}...")
                    if 'tags' in mem['metadata']:
                         print(f"      🏷️ Tags: {mem['metadata']['tags']}")
                    print(f"      🆔 ID: {mem['id']} (Dùng để xóa)") # Hiển thị ID để user copy xóa

        elif args.action == "forget":
            if not args.query: # Dùng tham số query để truyền ID (cho tiện)
                print("❌ Vui lòng nhập ID cần xóa (--query <ID>)")
                return
            gm.forget(args.query)

    except Exception as e:
        print(f"❌ Lỗi Bộ Nhớ Nghiêm Trọng: {str(e)}")

if __name__ == "__main__":
    main()
