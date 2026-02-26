# Task Plan: Upgrade Global Memory System (Brain V2)

Nâng cấp hệ thống bộ nhớ từ ghi chép đơn thuần sang hệ thống tri thức có khả năng tự phân loại, liên kết và tóm tắt theo yêu cầu của Sếp.

## 🎯 Mục tiêu

- **Phân loại Thông minh (Semantic Tagging):** Tự động nhận diện loại ký ức (Quyết định, Lỗi, Kiến trúc, Profile).
- **Liên kết Ký ức (Interlinking):** Tìm kiếm đa lớp để kết nối các thông tin liên quan.
- **Tóm tắt Dự án (Context Compression):** Tạo ra các bản tóm tắt snapshot cho từng dự án.

## 🛠 Lộ trình triển khai

### Bước 1: Nâng cấp `memory_manager.py` (Phase 1)

- [ ] Thêm hàm `_auto_tag(text)` để phân tích từ khóa chuyên sâu.
- [ ] Cập nhật hàm `memorize` để sử dụng bộ tag mới.
- [ ] Cập nhật hàm `recall` để hỗ trợ "Recursive Search" (Tìm các ký ức liên quan qua metadata).
- [ ] **Verification:** Chạy test recall để kiểm tra độ chính xác của mối liên kết.

### Bước 2: Xây dựng `summarizer.py` (Phase 2)

- [ ] Tạo file mới `scripts/summarizer.py`.
- [ ] Logic trích xuất ký ức theo Project và lọc theo Tag quan trọng.
- [ ] Tích hợp API (hoặc thông qua Agent) để tạo bản tóm tắt.
- [ ] Lưu snapshot tóm tắt vào bộ nhớ với tag `#SNAPSHOT`.
- [ ] **Verification:** Chạy lệnh summarize cho dự án hiện tại.

### Bước 3: Cập nhật Dashboard (Giao diện tích hợp)

- [ ] Cập nhật `generate_dashboard.html` để hiển thị các liên kết (Related Memories).
- [ ] Hiển thị các bản Snapshot ở vị trí ưu tiên.

## 🕵️ Kiểm tra & Nghiệm thu

- [ ] Chạy `python3 scripts/memory_tool.py --action recall` kiểm tra kết quả liên kết.
- [ ] Kiểm tra tính toàn vẹn của dữ liệu mã hóa sau khi nâng cấp.

---

**Trạng thái:** 🟢 Sẵn sàng triển khai Bước 1.
