import os
import sys

# Thêm path để import module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from memory_manager import GlobalMemory

def proactive_recall():
    """Tự động tìm kiếm các ngữ cảnh quan trọng và phân tích rủi ro"""
    gm = GlobalMemory()
    cwd = os.getcwd()
    project_name = os.path.basename(cwd)
    
    # 1. Tìm kiếm các ký ức liên quan đến ngữ cảnh hiện tại
    query = f"quyết định quan trọng và kiến trúc dự án {project_name}"
    results = gm.recall(query, n_results=3, threshold=1.5)
    
    print("\n" + "═"*60)
    print("🧠 GIÁC QUAN THỨ 6: HỒI TƯỞNG CHỦ ĐỘNG")
    print("═"*60)
    
    if results:
        for i, mem in enumerate(results):
            date = mem['metadata'].get('timestamp', '')[:10]
            rel = mem.get('relation_type', '🎯')
            print(f"{i+1}. [{date}] {rel}")
            print(f"   > {mem['content'][:150]}...")
    else:
        print("💡 Chưa có ký ức đặc biệt nào cho dự án này.")

    # 2. PHÂN TÍCH RỦI RO (Risk Analysis)
    risks = gm.get_project_risks(project_name)
    if risks:
        print("\n" + "⚠️ CẢNH BÁO RỦI RO DỰ ÁN")
        print("─"*60)
        for risk in risks[:5]: # Hiển thị tối đa 5 rủi ro
            print(f"   {risk}")
        print("─"*60)
    
    # 3. GỢI Ý CODE SNIPPET (Nếu có)
    code_snippets = gm.recall(f"đoạn code mẫu trong {project_name}", n_results=2)
    code_found = [c for c in code_snippets if c['metadata'].get('has_code') == "true"]
    if code_found:
        print("\n" + "🛠️ SNIPPET CODE TÌM THẤY")
        print("─"*60)
        for c in code_found:
             print(f"   > {c['metadata'].get('snippet_preview', 'Code block...')}")
        print("─"*60)

    print("═"*60 + "\n")

if __name__ == "__main__":
    proactive_recall()
