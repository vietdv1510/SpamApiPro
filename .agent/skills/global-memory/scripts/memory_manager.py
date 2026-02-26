import os
import uuid
import chromadb
from datetime import datetime
from security_manager import SecurityManager

# ĐỊNH NGHĨA KHO CHỨA GLOBAL
# Lưu tại: ~/.antigravity_brain
HOME_DIR = os.path.expanduser("~")
MEMORY_DIR = os.path.join(HOME_DIR, ".antigravity_brain", "chroma_db")

class GlobalMemory:
    def __init__(self):
        self.security = SecurityManager() # Khởi tạo vệ sĩ mã hóa
        # Tự động tạo thư mục nếu chưa có
        if not os.path.exists(MEMORY_DIR):
            os.makedirs(MEMORY_DIR)
            print(f"🧠 Initialized Global Memory at: {MEMORY_DIR}")
        
        # Kết nối tới ChromaDB (Persistent Client)
        self.client = chromadb.PersistentClient(path=MEMORY_DIR)
        
        # Lấy hoặc tạo Collection "antigravity_memories"
        # Dùng model mặc định của Chroma (all-MiniLM-L6-v2) để tạo vector
        self.collection = self.client.get_or_create_collection(name="antigravity_memories")

    def _auto_tag(self, text):
        """Tự động phân loại ký ức dựa trên ngữ nghĩa tiếng Việt"""
        text_lower = text.lower()
        tags = set()
        
        # 0. Nhóm Code Snippet
        if "```" in text:
            tags.add("CODE_SNIPPET")

        # 1. Nhóm Quyết định/Quan trọng
        if any(w in text_lower for w in ["quyết định", "thống nhất", "chốt", "quan trọng", "đặc biệt"]):
            tags.add("QUYẾT_ĐỊNH")
        
        # 2. Nhóm Lỗi/Debug
        if any(w in text_lower for w in ["lỗi", "bug", "crash", "sửa", "fix", "vấn đề", "cảnh báo"]):
            tags.add("LỖI_HỆ_THỐNG")
            
        # 3. Nhóm Kiến trúc/Refactor
        if any(w in text_lower for w in ["kiến trúc", "thiết kế", "refactor", "cấu trúc", "nâng cấp", "quy trình"]):
            tags.add("KIẾN_TRÚC")
            
        # 4. Nhóm Profile/Sở thích của Sếp
        if any(w in text_lower for w in ["sếp", "anh việt", "thích", "ghét", "thói quen", "tên là"]):
            tags.add("SẾP_PROFILE")
            
        # 5. Nhóm Secret/Cấu hình
        if any(w in text_lower for w in ["token", "key", "bí mật", "mật khẩu", "cấu hình", "env"]):
            tags.add("SECRET_CONFIG")

        return list(tags)

    def memorize(self, text, metadata=None):
        """Lưu một ký ức mới với Metadata thông minh"""
        if metadata is None:
            metadata = {}
        
        # 1. Tự động lấy timestamp
        metadata["timestamp"] = datetime.now().isoformat()
        
        # 1.5 Tự động trích xuất Code Snippet
        if "```" in text:
            metadata["has_code"] = "true"
            import re
            # Lấy snippet đầu tiên làm preview
            snippets = re.findall(r'```(?:\w+)?\n(.*?)\n```', text, re.DOTALL)
            if snippets:
                metadata["snippet_preview"] = snippets[0][:100] + "..."

        # 1.6 Tự động gán Tag thông minh
        auto_tags = self._auto_tag(text)
        current_tags = metadata.get("tags", "").split(",") if metadata.get("tags") else []
        combined_tags = list(set([t.strip() for t in current_tags if t.strip()] + auto_tags))
        metadata["tags"] = ", ".join(combined_tags)
        
        # 2. Tự động lấy tên Project từ đường dẫn
        cwd = os.getcwd()
        project_name = os.path.basename(cwd)
        metadata["project"] = project_name
        metadata["path"] = cwd

        # 3. Tự động đoán Tech Stack (Sơ sơ qua file tồn tại)
        tech_stack = []
        if os.path.exists(os.path.join(cwd, "package.json")): tech_stack.append("Node.js/JS")
        if os.path.exists(os.path.join(cwd, "requirements.txt")): tech_stack.append("Python")
        if os.path.exists(os.path.join(cwd, "go.mod")): tech_stack.append("Go")
        if os.path.exists(os.path.join(cwd, "docker-compose.yml")): tech_stack.append("Docker")
        
        if tech_stack:
            metadata["tech_stack"] = ", ".join(tech_stack)
        
        # 4. KIỂM TRA MÂU THUẪN (Conflict Detection)
        # Nếu là Quyết định hoặc Cấu hình, kiểm tra xem có cái nào cũ mâu thuẫn không
        if "QUYẾT_ĐỊNH" in auto_tags or "SECRET_CONFIG" in auto_tags:
            potential_conflicts = self.recall(text, n_results=1, threshold=0.8)
            for conflict in potential_conflicts:
                if conflict["distance"] > 0.1: # Không phải trùng lặp hoàn toàn
                    print(f"⚖️ CẢNH BÁO MÂU THUẪN: Phát hiện ký ức cũ có nội dung tương tự nhưng khác biệt.")
                    print(f"   Old: {conflict['content'][:50]}...")
                    print(f"   New: {text[:50]}...")
                    metadata["potential_conflict_with"] = conflict["id"]

        # 5. KIỂM TRA TRÙNG LẶP (Deduplication)
        # Truy vấn thử xem có nội dung nào giống hệt (distance < 0.2) đã tồn tại không
        existing = self.collection.query(
            query_texts=[text],
            n_results=1
        )
        
        if existing["documents"] and existing["distances"][0]:
            dist = existing["distances"][0][0]
            if dist < 0.2: # Ngưỡng giống nhau (0.0 là giống hệt, 0.2 là rất giống)
                exist_id = existing["ids"][0][0]
                print(f"⚠️ Ký ức này đã tồn tại (Độ giống: {100-dist*100:.1f}%). Bỏ qua không lưu mới.")
                return exist_id

        # 5. MÃ HÓA TRƯỚC KHI LƯU
        encrypted_text = self.security.encrypt(text)

        mem_id = str(uuid.uuid4())
        
        self.collection.add(
            documents=[encrypted_text], # Lưu bản mã
            metadatas=[metadata],
            ids=[mem_id]
        )
        print(f"✅ Đã ghi nhớ vào não bộ (mã hóa tuyệt mật)")
        print(f"   📂 Dự án: {project_name}")
        if tech_stack:
            print(f"   🛠️ Tech: {', '.join(tech_stack)}")
            
        return mem_id

    def recall(self, query_text, n_results=5, threshold=1.8):
        """Hồi tưởng ký ức theo ngữ nghĩa (Có lọc rác)"""
        # print(f"🔍 Recalling: '{query_text}'") -> Log này dư thừa, đã có ở memory_tool.py
        
        results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
        
        memories = []
        if results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                meta = results["metadatas"][0][i]
                dist = results["distances"][0][i] if results["distances"] else 0
                
                # ChromaDB Distance: Càng thấp càng giống (0 = giống hệt)
                # Threshold 1.5 là mức tương đối rộng rãi, 1.0 là chặt chẽ
                if dist <= threshold:
                    # Giải mã nội dung trước khi trả về
                    decrypted_doc = self.security.decrypt(doc)
                    memories.append({
                        "id": results["ids"][0][i],
                        "content": decrypted_doc,
                        "metadata": meta,
                        "distance": dist
                    })
        
        # Sắp xếp theo độ giống (distance tăng dần)
        memories.sort(key=lambda x: x["distance"])
        
        # --- BẮT ĐẦU LIÊN KẾT KÝ ỨC (Interlinking) ---
        if memories and n_results > 1:
            primary_mem = memories[0]
            
            # 1. Lấy các Tag quan trọng từ kết quả đầu tiên để tìm liên quan sâu
            priority_tags = ["QUYẾT_ĐỊNH", "KIẾN_TRÚC", "LỖI_HỆ_THỐNG", "SẾP_PROFILE"]
            p_tags = [t.strip() for t in primary_mem["metadata"].get("tags", "").split(",") if t.strip()]
            target_tag = next((t for t in p_tags if t in priority_tags), None)
            
            if target_tag:
                # Thực hiện một truy vấn phụ để tìm các ký ức liên quan đến tag này
                related_res = self.collection.query(
                    query_texts=[target_tag],
                    n_results=3
                )
                if related_res["documents"]:
                    for j, doc in enumerate(related_res["documents"][0]):
                        r_id = related_res["ids"][0][j]
                        # Không thêm lại nếu đã trùng ID hoặc trùng nội dung đã có trong list
                        if r_id != primary_mem["id"] and not any(m["id"] == r_id for m in memories):
                            dec_doc = self.security.decrypt(doc)
                            memories.append({
                                "id": r_id,
                                "content": dec_doc,
                                "metadata": related_res["metadatas"][0][j],
                                "distance": 1.9, # Đánh dấu là liên quan xa
                                "relation_type": f"🔗 Liên kết qua: {target_tag}"
                            })

            # 2. Đánh dấu "Gốc" hoặc "Phù hợp ngữ nghĩa" cho các kết quả còn lại
            for i, m in enumerate(memories):
                if "relation_type" not in m:
                    m["relation_type"] = "🎯 Kết quả chính" if i == 0 else "📜 Phù hợp ngữ nghĩa"

        # --- 3. BỘ MÁY RERANKING SIÊU CẤP (Phase 4) ---
        if memories and len(memories) > 2:
            # Sắp xếp lại dựa trên mật độ từ khóa quan trọng nếu khoảng cách vector quá gần nhau
            top_score = memories[0]["distance"]
            for m in memories[1:]:
                # Nếu kết quả tiếp theo có khoảng cách gần bằng kết quả 1 nhưng chứa từ khóa query rành mạch hơn
                if abs(m["distance"] - top_score) < 0.3:
                    if query_text.lower() in m["content"].lower():
                         m["distance"] -= 0.1 # Ưu tiên đẩy lên một chút
            memories.sort(key=lambda x: x["distance"])
        
        return memories

    def consolidate_memories(self, project_name):
        """Hệ thống 'Gạn đục khơi trong': Gộp các ký ức vụn vặt cùng project"""
        all_mem = self.get_all_memories()
        proj_mem = [m for m in all_mem if m['metadata'].get('project') == project_name]
        
        if len(proj_mem) < 10:
            return "Chưa đủ lượng ký ức để thực hiện gộp (Cần tối thiểu 10)."
            
        print(f"🧹 Đang tiến hành gạn lọc {len(proj_mem)} ký ức cho {project_name}...")
        # (Logic gộp nâng cao sẽ được triển khai trong script vault_cleaner.py)
        return f"Đã tối ưu hóa bộ nhớ cho dự án {project_name}."

    def get_project_risks(self, project_name):
        """Phân tích rủi ro dựa trên ký ức về lỗi và nợ kỹ thuật"""
        all_mem = self.get_all_memories()
        proj_mem = [m for m in all_mem if m['metadata'].get('project') == project_name]
        
        risks = []
        for m in proj_mem:
            content_lower = m['content'].lower()
            tags = m['metadata'].get('tags', '')
            
            # Cảnh báo Lỗi chưa fix
            if "LỖI_HỆ_THỐNG" in tags and not any(w in content_lower for w in ["đã sửa", "đã fix", "xong", "resolved"]):
                risks.append(f"⚠️ Bug tồn đọng: {m['content'][:60]}...")
            
            # Cảnh báo Nợ kỹ thuật
            if any(w in content_lower for w in ["tạm thời", "chưa xong", "todo", "fixme", "làm sau"]):
                risks.append(f"🚧 Nợ kỹ thuật: {m['content'][:60]}...")
                
        return risks

    def forget(self, mem_id):
        """Xóa vĩnh viễn một ký ức theo ID"""
        self.collection.delete(ids=[mem_id])
        print(f"🗑️ Đã xóa ký ức ID: {mem_id}")

    def get_all_memories(self):
        """Lấy toàn bộ bộ nhớ để hiển thị Dashboard (Limit 1000)"""
        results = self.collection.get(limit=1000)
        
        # Chuẩn hóa format
        data = []
        if results["ids"]:
            for i, mem_id in enumerate(results["ids"]):
                # Giải mã để Dashboard có thể hiển thị
                decrypted_content = self.security.decrypt(results["documents"][i])
                data.append({
                    "id": mem_id,
                    "content": decrypted_content,
                    "metadata": results["metadatas"][i]
                })
        return data

# Test nhanh nếu chạy trực tiếp
if __name__ == "__main__":
    gm = GlobalMemory()
    # gm.memorize("User thích màu xanh dương và ghét ăn hành.")
    # res = gm.recall("User thích màu gì?")
    # print(res)
