# SpamAPI Pro

> **Native macOS load testing tool** — built for engineers who need to find race conditions, stress-test APIs, and measure real latency without cloud dependencies.

![CI](https://github.com/vietdv1510/SpamApiPro/actions/workflows/ci.yml/badge.svg)

---

## ✨ Features

### Core Testing

| Feature              | Description                                               |
| -------------------- | --------------------------------------------------------- |
| **Burst Mode**       | Fire N requests simultaneously — race condition detection |
| **Constant Mode**    | Sustained load with configurable virtual users            |
| **Ramp-up Mode**     | Gradually increase load to find breaking points           |
| **Stress Test Mode** | Continuous escalation until failure                       |

### Advanced

- **🔀 Race Condition Detection** — identify double-spend / duplicate write bugs automatically
- **📊 Real-time Metrics** — P50/P90/P95/P99/P99.9 latency, RPS, status distribution
- **🔗 Multi-step Flows (Scenarios)** — chain requests with variable extraction (`{{step.response.id}}`)
- **🔁 Step Retry** — configurable retry (1×/2×/3×/5×) per scenario step
- **💉 Built-in Variables** — `{{$uuid}}`, `{{$timestamp}}`, `{{$random_int:1:100}}`, `{{$random_str:8}}`, `{{$random_email}}`
- **🔐 Auth Profiles** — save and reuse Bearer / API Key / Basic Auth configurations
- **📦 Presets** — save full test configurations for quick reuse
- **📤 Export** — results as JSON, CSV, or HTML report; charts as PNG
- **⚖️ Compare Runs** — side-by-side delta comparison between two test runs
- **📜 History** — persistent SQLite-backed test history

---

## 🖥️ Tech Stack

| Layer        | Tech                                                |
| ------------ | --------------------------------------------------- |
| **Desktop**  | [Tauri 2](https://tauri.app) (Rust + WebView)       |
| **Engine**   | Rust — `tokio` async runtime, `reqwest` HTTP client |
| **Frontend** | React 18 + TypeScript + Vite                        |
| **State**    | Zustand                                             |
| **Charts**   | Recharts                                            |
| **Storage**  | SQLite via `rusqlite`                               |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) stable
- macOS 12+ (Apple Silicon or Intel)

### Development

```bash
git clone https://github.com/vietdv1510/SpamApiPro.git
cd SpamApiPro
npm install
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
# Output:
# src-tauri/target/release/bundle/macos/SpamAPI Pro.app
# src-tauri/target/release/bundle/dmg/SpamAPI Pro_0.1.0_aarch64.dmg
```

Or download the latest `.dmg` from [GitHub Actions artifacts](https://github.com/vietdv1510/SpamApiPro/actions).

---

## 🧪 Testing

```bash
# Rust unit tests (16 tests)
cd src-tauri && cargo test

# TypeScript check
npx tsc --noEmit

# Full production build validation
npm run build
```

---

## 📖 Usage

### Quick Load Test

1. Enter URL + select HTTP method
2. Choose test mode and virtual users
3. Click **Run** — results appear in real-time

### Scenario (Multi-step Flow)

1. Go to **Scenarios** tab
2. Add steps → configure URL, method, body
3. Use `{{step_name.response.field}}` to pass data between steps
4. Set retry count per step for resilience testing

### Auth Profiles

Click **🔐 Auth** in the Headers section → save Bearer/API Key/Basic Auth → apply to any test in one click.

### Compare Runs

In **History** tab → click **⚖️ Compare** → select two runs → view delta table with color-coded improvements/regressions.

---

## 🏗️ Architecture

```
SpamApiPro/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # useTestRunner, useScenarioRunner
│   ├── utils/              # exportResults, authProfiles, presets
│   └── store.ts            # Zustand global state
├── src-tauri/              # Rust backend
│   └── src/
│       ├── engine.rs       # Core load testing engine
│       ├── commands.rs     # Tauri IPC commands
│       ├── db.rs           # SQLite persistence
│       └── tests/          # Unit tests
└── .github/workflows/      # CI/CD — tests + DMG build
```

---

## 🔒 Security

- Requests run **fully local** — no cloud, no telemetry (except opt-in Sentry error reporting)
- SSL verification enabled by default
- Tauri CSP configured; `shell.open` restricted to `http/https`

---

## 📄 License

Private — © 2025 SpamAPI Pro
