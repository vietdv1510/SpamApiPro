import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-shell";
import { appDataDir } from "@tauri-apps/api/path";
import type { TestResult } from "../store";

/**
 * Export test results thành HTML report — lưu file + mở bằng browser hệ thống
 */
export async function exportReportHTML(
  result: TestResult,
  meta?: { url?: string; method?: string; mode?: string },
) {
  const r = result;
  const successRate =
    r.total_requests > 0 ? (r.success_count / r.total_requests) * 100 : 0;
  const raceStatus = r.race_conditions_detected > 0 ? "⚠️ DETECTED" : "✅ SAFE";
  const now = new Date().toLocaleString("vi-VN");
  const fileTs = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const statusRows = Object.entries(r.status_distribution)
    .filter(([k]) => /^\d{3}$/.test(k))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([code, count]) => {
      const num = Number(code);
      const color =
        num < 300
          ? "#10B981"
          : num < 400
            ? "#3B82F6"
            : num < 500
              ? "#F59E0B"
              : "#EF4444";
      return `<tr><td style="font-family:monospace;font-weight:bold;color:${color}">${code}</td><td>${count}</td></tr>`;
    })
    .join("");

  const errorRows = Object.entries(r.error_types)
    .map(
      ([err, count]) =>
        `<tr><td style="color:#9CA3AF;font-size:12px">${err}</td><td style="color:#EF4444;font-weight:bold">${count}x</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SpamAPI Pro — Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, system-ui, sans-serif; background: #0D0D14; color: #E5E7EB; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 24px; color: #00D4FF; margin-bottom: 4px; }
    .subtitle { color: #6B7280; font-size: 13px; margin-bottom: 32px; }
    .meta { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .meta-item { background: #1A1A24; border: 1px solid #2A2A38; border-radius: 8px; padding: 8px 16px; font-size: 12px; }
    .meta-label { color: #6B7280; }
    .meta-value { color: #E5E7EB; font-family: monospace; font-weight: bold; }
    .grid { display: grid; gap: 12px; margin-bottom: 24px; }
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .grid-5 { grid-template-columns: repeat(5, 1fr); }
    .card { background: #1A1A24; border: 1px solid #2A2A38; border-radius: 12px; padding: 16px; text-align: center; }
    .card-value { font-size: 28px; font-weight: bold; font-family: monospace; }
    .card-label { font-size: 11px; color: #6B7280; margin-top: 4px; text-transform: uppercase; }
    .primary { color: #00D4FF; }
    .success { color: #10B981; }
    .danger { color: #EF4444; }
    .amber { color: #F59E0B; }
    .white { color: #FFFFFF; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #6B7280; margin-bottom: 12px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    table td { padding: 6px 12px; border-bottom: 1px solid #2A2A38; font-size: 13px; }
    .pass { background: #10B98120; border: 1px solid #10B98150; border-radius: 12px; padding: 16px; }
    .fail { background: #EF444420; border: 1px solid #EF444450; border-radius: 12px; padding: 16px; }
    .footer { text-align: center; color: #4B5563; font-size: 11px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #2A2A38; }
    @media print {
      body { background: #fff; color: #111; padding: 20px; }
      .card, .meta-item { background: #f9f9f9; border-color: #ddd; }
      .primary, .success { color: #059669; }
      .danger { color: #DC2626; }
      .footer { color: #999; }
    }
  </style>
</head>
<body>
  <h1>⚡ SpamAPI Pro — Load Test Report</h1>
  <div class="subtitle">Generated: ${now}</div>

  <div class="meta">
    ${meta?.url ? `<div class="meta-item"><span class="meta-label">URL: </span><span class="meta-value">${meta.url}</span></div>` : ""}
    ${meta?.method ? `<div class="meta-item"><span class="meta-label">Method: </span><span class="meta-value">${meta.method}</span></div>` : ""}
    ${meta?.mode ? `<div class="meta-item"><span class="meta-label">Mode: </span><span class="meta-value">${meta.mode}</span></div>` : ""}
    <div class="meta-item"><span class="meta-label">Duration: </span><span class="meta-value">${(r.total_duration_ms / 1000).toFixed(2)}s</span></div>
  </div>

  <div class="grid grid-3">
    <div class="card">
      <div class="card-value white">${r.total_requests.toLocaleString()}</div>
      <div class="card-label">Total Requests</div>
    </div>
    <div class="card">
      <div class="card-value ${successRate === 100 ? "success" : successRate > 90 ? "amber" : "danger"}">${successRate.toFixed(1)}%</div>
      <div class="card-label">Success Rate</div>
    </div>
    <div class="card">
      <div class="card-value primary">${r.requests_per_second.toFixed(0)}</div>
      <div class="card-label">Requests/sec</div>
    </div>
  </div>

  <div class="grid grid-3">
    <div class="card">
      <div class="card-value success">${r.success_count.toLocaleString()}</div>
      <div class="card-label">Success</div>
    </div>
    <div class="card">
      <div class="card-value danger">${r.error_count.toLocaleString()}</div>
      <div class="card-label">Errors</div>
    </div>
    <div class="card">
      <div class="card-value primary">${r.burst_dispatch_us < 1000 ? r.burst_dispatch_us.toFixed(0) + "µs" : (r.burst_dispatch_us / 1000).toFixed(2) + "ms"}</div>
      <div class="card-label">Dispatch Speed</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Latency Percentiles</div>
    <div class="grid grid-5">
      ${[
        { label: "P50", value: r.latency_p50_ms },
        { label: "P90", value: r.latency_p90_ms },
        { label: "P95", value: r.latency_p95_ms },
        { label: "P99", value: r.latency_p99_ms },
        { label: "P99.9", value: r.latency_p999_ms },
      ]
        .map(
          (m) =>
            `<div class="card"><div class="card-value primary" style="font-size:20px">${m.value.toFixed(1)}ms</div><div class="card-label">${m.label}</div></div>`,
        )
        .join("")}
    </div>
    <div class="grid grid-3" style="margin-top:12px">
      <div class="card"><div class="card-value success" style="font-size:20px">${r.latency_min_ms.toFixed(1)}ms</div><div class="card-label">Min</div></div>
      <div class="card"><div class="card-value primary" style="font-size:20px">${r.latency_avg_ms.toFixed(1)}ms</div><div class="card-label">Average</div></div>
      <div class="card"><div class="card-value danger" style="font-size:20px">${r.latency_max_ms.toFixed(1)}ms</div><div class="card-label">Max</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Race Condition Analysis</div>
    <div class="${r.race_conditions_detected > 0 ? "fail" : "pass"}">
      <div style="font-size:20px;font-weight:bold;font-family:monospace">${raceStatus}</div>
      <div style="font-size:12px;color:#9CA3AF;margin-top:4px">
        ${
          r.race_conditions_detected > 0
            ? `${r.race_conditions_detected} race conditions detected — ${r.unique_responses} unique responses`
            : `${r.response_consistency.toFixed(1)}% response consistency`
        }
      </div>
    </div>
  </div>

  ${
    statusRows
      ? `
  <div class="section">
    <div class="section-title">Status Code Distribution</div>
    <table>${statusRows}</table>
  </div>`
      : ""
  }

  ${
    errorRows
      ? `
  <div class="section">
    <div class="section-title">Error Breakdown</div>
    <table>${errorRows}</table>
  </div>`
      : ""
  }

  ${r.was_cancelled ? `<div class="fail" style="margin-bottom:24px"><strong>⚠️ Test was cancelled</strong> — Results are partial (${r.cancelled_count} requests cancelled)</div>` : ""}

  <div class="footer">
    SpamAPI Pro — High-Performance Load Testing • Engine: Rust + Tokio + HDR Histogram
  </div>
</body>
</html>`;

  // Lưu file vào app data dir rồi mở bằng browser hệ thống
  const fileName = `report-${fileTs}.html`;
  const dataDir = await appDataDir();
  const filePath = `${dataDir}reports`;

  // Tạo thư mục reports nếu cần
  try {
    await mkdir(filePath, { recursive: true });
  } catch {
    /* already exists */
  }

  const fullPath = `${filePath}/${fileName}`;
  await writeTextFile(fullPath, html);
  await open(fullPath);
}
