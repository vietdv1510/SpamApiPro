# 🌳 iOS Modding Decision Tree (Cây quyết định Modding)

Sử dụng sơ đồ này để đưa ra chiến thuật mod chính xác nhất cho từng mục tiêu.

## 1. Mục tiêu: Bỏ quảng cáo (Ad-block)

- **Ưu tiên 1:** Dùng `Frida` để tìm các class có từ khóa `AdManager`, `GADBanner`. Hook hàm `show` -> return.
- **Ưu tiên 2:** Patch Binary file Mach-O. Tìm các lệnh `B` hoặc `BL` nhảy đến hàm quảng cáo và đổi thành `NOP`.
- **Skill dùng:** `@frida-debugging`, `@ios-binary-patching`.

## 2. Mục tiêu: Xem phim / VIP (Bypass Paywall)

- **Ưu tiên 1:** Chặn gói tin (Network Interception). Sửa response JSON từ `is_vip: false` thành `true`.
- **Ưu tiên 2:** Hook class `UserSubscription` hoặc `Purchaser`.
- **Skill dùng:** `@ios-network-interception`, `@frida-debugging`.

## 3. Mục tiêu: Game Hacking (Nạp xu / Mod Menu)

- **Kiểm tra:** Hệ thống có dùng Unity (IL2CPP) không?
- **Nếu có:** Dùng `Dump.cs` để tìm Offset của hàm `get_Coins`, `get_Diamonds`.
- **Nếu không:** Dùng `IDA/Hopper` tìm các giá trị Float/Int64 nhạy cảm.
- **Skill dùng:** `@il2cpp-modding`, `@arm64-assembly`.

## 4. Kiểm tra an toàn (Anti-cheat Bypass)

- **Luôn kiểm tra:** App có dùng `SwiftGuard`, `Arxan` hay kiểm tra Jailbreak không?
- **Hành động:** Hook hàm `exit(0)` hoặc các hàm kiểm tra file `.app` bị sửa đổi.
- **Skill dùng:** `@ios-anti-cheat-bypass`.

## 5. Mục tiêu: Bypass Key / License Check

- **Dấu hiệu:** App hiện màn hình bắt nhập Serial/Key.
- **Hành động 1 (Reconnaissance - Quan trọng):**
  - Hỏi người dùng: "Có file dylib/hack nào cũ từng chạy được không?".
  - Nếu có: Dùng `nm` hoặc `strings` phân tích file đó để học logic "Auto-Scan Hook".
- **Hành động 2 (Binary Patching):**
  - Đừng chỉ `return 1`.
  - Phải kiểm tra xem hàm đó có tham số `CompletionHandler` hoặc `Block` không (`void (^)(id)`).
  - Nếu có Async Block: Phải Patch để nhảy (`B`) tới đoạn code thực thi Block đó (`Execute Success Callback`).
- **Hành động 3 (Tweak Injection):**
  - Nếu Patch Binary gây Crash hoặc không bền, viết Tweak `.xm` để Auto-Hook theo tên hàm (`ScanAndHook`).
- **Hành động 4 (Log-Based Analysis - Siêu tốc):**
- **Hành động 4 (Log-Based Analysis - Siêu tốc):**
  - **Bước 1: Tìm tên Process:** Mở app trên điện thoại, trên máy tính chạy `frida-ps -Ua` (hoặc `ps aux | grep AppName`) để lấy tên chính xác (VD: `kgvn`, `ShadowTrackerExtra`).
  - **Bước 2 (GUI):** Dùng Console.app, gõ filter `process:[Tên_Process]`. Nhớ Clear trước khi bấm nút Login.
  - **Bước 3 (Terminal):** Chạy lệnh: `log stream --predicate 'process == "[Tên_Process]"' --level debug`.
  - **Mục tiêu:** Tìm các dòng log có format `[Mod]`, `Hook`, `Check Key`, `Response:`.
  - Agent dùng chuỗi log đó (String Xref) để tìm ngược ra địa chỉ hàm trong Binary.
- **Skill dùng:** `@arm64-assembly`, `@frida-debugging`, `@ios-tweak-development`.

## 6. Mục tiêu: High-level Game Hack (Mod Menu / God Mode)

- **Hành động:**
  - Tạo `dylib` chèn vào app (Tweak Development).
  - Tạo một `UIButton` ẩn để hiện Menu hack.
  - Hook logic nhân vật (`takeDamage`, `addGold`).
- **Skill dùng:** `@ios-tweak-development`, `@il2cpp-modding`.
