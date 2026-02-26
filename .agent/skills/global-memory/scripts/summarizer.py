import os
import sys
import json
from datetime import datetime

# Thêm path để import module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from memory_manager import GlobalMemory

def summarize_project(project_name=None):
    gm = GlobalMemory()
    memories = gm.get_all_memories()
    
    # Nếu không chỉ định project, lấy project hiện tại
    if not project_name:
        project_name = os.path.basename(os.getcwd())
        
    print(f"🔍 Đang thu thập ký ức cho dự án: {project_name}...")
    
    # Lọc ký ức theo project
    project_memories = [m for m in memories if m['metadata'].get('project') == project_name]
    
    # Loại bỏ các file snapshot cũ để tránh tóm tắt đè lên tóm tắt
    project_memories = [m for m in project_memories if "#SNAPSHOT" not in m['metadata'].get('tags', '')]
    
    if not project_memories:
        print(f"❌ Không tìm thấy ký ức nào cho dự án '{project_name}'.")
        return None

    # Sắp xếp theo thời gian
    project_memories.sort(key=lambda x: x['metadata']['timestamp'])
    
    # Chuẩn bị nội dung để Agent (AI) tóm tắt
    raw_content = ""
    for i, m in enumerate(project_memories):
        raw_content += f"[{i+1}] {m['metadata']['timestamp']} | Tags: {m['metadata'].get('tags')} \nContent: {m['content']}\n\n"
    
    print(f"✅ Đã thu thập {len(project_memories)} ký ức.")
    print("--- RAW DATA FOR AGENT ---")
    print(raw_content)
    print("--- END RAW DATA ---")
    
    return raw_content

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    summarize_project(target)
