import os
import sys
from datetime import datetime, timedelta

# Thêm path để import module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from memory_manager import GlobalMemory

def deep_clean():
    """Hệ thống tự động dọn dẹp các ký ức rác hoặc quá cũ"""
    gm = GlobalMemory()
    all_memories = gm.get_all_memories()
    
    print("🧹 Bắt đầu quy trình 'Gạn đục khơi trong' cho bộ não...")
    
    deleted_count = 0
    now = datetime.now()
    
    # 1. Xóa các ký ức quá ngắn và không có tag quan trọng (Thông tin rác)
    for mem in all_memories:
        content = mem['content']
        tags = mem['metadata'].get('tags', '')
        
        # Tiêu chí rác: Nội dung < 30 ký tự và không có tag xịn
        if len(content) < 30 and not any(t in tags for t in ["QUYẾT_ĐỊNH", "KIẾN_TRÚC", "MILESTONE"]):
            gm.forget(mem['id'])
            deleted_count += 1
            
    # 2. Hợp nhất các ký ức (Logic V5 ULTIMATE)
    projects = list(set([m['metadata'].get('project', 'Unknown') for m in all_memories]))
    
    for proj in projects:
        proj_mem = [m for m in all_memories if m['metadata'].get('project') == proj]
        # Nếu project có trên 10 ký tự vụn vặt và chưa có Snapshot gần đây (trong 24h)
        snapshots = [m for m in proj_mem if "#SNAPSHOT" in m['metadata'].get('tags', '')]
        
        if len(proj_mem) > 10 and not snapshots:
            print(f"📦 Phát hiện dự án '{proj}' có nhiều ký ức vụn. Đang tiến hành 'Khơi trong'...")
            
            # Gom nội dung để tóm tắt
            summary_content = f"--- BẢN TÓM TẮT TRI THỨC DỰ ÁN: {proj} ---\n"
            summary_content += f"Ngày tạo: {now.strftime('%d/%m/%Y')}\n\n"
            
            # Lọc ra các quyết định và lỗi quan quan trọng
            highlights = [m['content'] for m in proj_mem if any(t in m['metadata'].get('tags', '') for t in ["QUYẾT_ĐỊNH", "LỖI_HỆ_THỐNG", "KIẾN_TRÚC"])]
            
            summary_content += "🎯 CÁC ĐIỂM CỐT YẾU:\n- " + "\n- ".join(highlights[:5]) + "\n\n"
            summary_content += "📜 CHI TIẾT TIẾN ĐỘ:\n"
            for m in proj_mem[:10]: # Lấy 10 cái đầu tiên làm tóm tắt sơ bộ
                 summary_content += f"- {m['content'][:100]}...\n"
            
            # Lưu bản Snapshot mới
            gm.memorize(summary_content, metadata={
                "tags": "#SNAPSHOT, #V5_ULTIMATE, MILESTONE",
                "project": proj,
                "summary_of_count": len(proj_mem)
            })
            print(f"✨ Đã tạo Snapshot thành công cho dự án {proj}!")

    print(f"✅ Đã dọn dẹp xong! Loại bỏ {deleted_count} ký ức rác.")
    print("🧠 Bộ não của Sếp giờ đã tinh gọn và sắc bén hơn rất nhiều ở đẳng cấp V5!")

if __name__ == "__main__":
    deep_clean()
