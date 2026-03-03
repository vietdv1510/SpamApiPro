# SpamAPI Pro

> **Công cụ load testing native cho macOS** — dành cho developers cần tìm race conditions, stress-test API và đo latency thực tế mà không phụ thuộc cloud.

![CI](https://github.com/vietdv1510/SpamApiPro/actions/workflows/ci.yml/badge.svg)

---

## ✨ Tính năng

### Test cơ bản

| Tính năng            | Mô tả                                                  |
| -------------------- | ------------------------------------------------------ |
| **Burst Mode**       | Bắn N requests đồng thời — phát hiện race condition    |
| **Constant Mode**    | Duy trì tải ổn định với số virtual users cấu hình được |
| **Ramp-up Mode**     | Tăng dần tải để tìm điểm giới hạn                      |
| **Stress Test Mode** | Leo thang liên tục đến khi server sập                  |

### Nâng cao

- **🔀 Phát hiện Race Condition** — tự động phát hiện bug double-spend / duplicate write
- **📊 Metrics thời gian thực** — P50/P90/P95/P99/P99.9 latency, RPS, phân phối status code
- **🔗 Multi-step Flows (Scenarios)** — chuỗi requests với trích xuất biến (`{{step.response.id}}`)
- **🔁 Retry cho từng bước** — cấu hình retry (1×/2×/3×/5×) mỗi bước trong scenario
- **💉 Biến có sẵn** — `{{$uuid}}`, `{{$timestamp}}`, `{{$random_int:1:100}}`, `{{$random_str:8}}`, `{{$random_email}}`
- **🔐 Auth Profiles** — lưu và tái sử dụng Bearer / API Key / Basic Auth
- **📦 Presets** — lưu toàn bộ cấu hình test để dùng lại nhanh
- **📤 Export** — kết quả dưới dạng JSON, CSV, HTML report; biểu đồ dưới dạng PNG
- **⚖️ So sánh Runs** — so sánh 2 lần chạy cạnh nhau với delta màu sắc
- **📜 Lịch sử** — lưu trữ lịch sử test bằng SQLite

---

## 🖥️ Tech Stack

| Tầng         | Công nghệ                                           |
| ------------ | --------------------------------------------------- |
| **Desktop**  | [Tauri 2](https://tauri.app) (Rust + WebView)       |
| **Engine**   | Rust — `tokio` async runtime, `reqwest` HTTP client |
| **Frontend** | React 18 + TypeScript + Vite                        |
| **State**    | Zustand                                             |
| **Charts**   | Recharts                                            |
| **Storage**  | SQLite via `rusqlite`                               |

---

## 🚀 Bắt đầu

### Yêu cầu

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) stable
- macOS 12+ (Apple Silicon hoặc Intel)

### Chạy môi trường dev

```bash
git clone https://github.com/vietdv1510/SpamApiPro.git
cd SpamApiPro
npm install
npm run tauri dev
```

### Build production

```bash
npm run tauri build
# Output:
# src-tauri/target/release/bundle/macos/SpamAPI Pro.app
# src-tauri/target/release/bundle/dmg/SpamAPI Pro_0.1.0_aarch64.dmg
```

Hoặc tải bản build mới nhất từ [GitHub Actions artifacts](https://github.com/vietdv1510/SpamApiPro/actions).

---

## 🧪 Chạy test

```bash
# Rust unit tests (16 tests)
cd src-tauri && cargo test

# Kiểm tra TypeScript
npx tsc --noEmit

# Kiểm tra build production
npm run build
```

---

## 📖 Hướng dẫn sử dụng

### Load Test nhanh

1. Nhập URL + chọn HTTP method
2. Chọn chế độ test và số virtual users
3. Click **Run** — kết quả hiện theo thời gian thực

### Scenario (Chuỗi nhiều bước)

1. Vào tab **Scenarios**
2. Thêm bước → cấu hình URL, method, body
3. Dùng `{{tên_bước.response.field}}` để truyền dữ liệu giữa các bước
4. Đặt retry count mỗi bước để test khả năng chịu lỗi

### Auth Profiles

Click **🔐 Auth** trong phần Headers → lưu Bearer/API Key/Basic Auth → apply vào bất kỳ test nào chỉ 1 click.

### So sánh Runs

Trong tab **History** → click **⚖️ Compare** → chọn 2 runs → xem bảng delta với màu xanh/đỏ thể hiện cải thiện/hồi quy.

---

## 🏗️ Cấu trúc dự án

```
SpamApiPro/
├── src/                    # Frontend React
│   ├── components/         # Các UI component
│   ├── hooks/              # useTestRunner, useScenarioRunner
│   ├── utils/              # exportResults, authProfiles, presets
│   └── store.ts            # Global state với Zustand
├── src-tauri/              # Backend Rust
│   └── src/
│       ├── engine.rs       # Engine load testing cốt lõi
│       ├── commands.rs     # Tauri IPC commands
│       ├── db.rs           # Lưu trữ SQLite
│       └── tests/          # Unit tests
└── .github/workflows/      # CI/CD — chạy test + build DMG tự động
```

---

## 🔒 Bảo mật

- Mọi request chạy **hoàn toàn local** — không cloud, không telemetry (trừ Sentry error reporting nếu bật)
- SSL verification bật mặc định
- Tauri CSP được cấu hình; `shell.open` chỉ cho phép `http/https`

---

## 📄 License

Private — © 2025 SpamAPI Pro
