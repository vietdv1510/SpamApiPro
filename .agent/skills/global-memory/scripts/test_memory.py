from memory_manager import GlobalMemory

# Khởi động não
gm = GlobalMemory()

print("--- 🧠 TEST GHI NHỚ ---")
# Giả lập tình huống hôm nay
info = "User tên là Việt. Hôm nay (30/01/2026) đã thực hiện Pentest web pj237. Kết quả: Tìm thấy API Callback ẩn /transactions/test/deposit-callback nhưng khi gửi request thì bị lỗi E05 (Transaction failed)."
gm.memorize(info, metadata={"topic": "security_audit"})

print("\n--- 🔍 TEST HỒI TƯỞNG ---")
# Hỏi lại bằng câu hỏi khác hoàn toàn (Semantic Search)
query = "Hôm nay hack web kết quả sao rồi?"
results = gm.recall(query)

print("\n--- KẾT QUẢ ---")
for mem in results:
    print(f"💡 Ký ức tìm thấy (Độ khớp: {mem['distance']}):")
    print(f"   {mem['content']}")
    print(f"   [Nguồn: {mem['metadata']['project']}]")
