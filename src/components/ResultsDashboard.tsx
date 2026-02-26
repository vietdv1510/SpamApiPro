import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useAppStore, type TestResult } from "../store";

function MetricCard({
  label,
  value,
  unit = "ms",
  color = "text-primary",
  highlight = false,
}: {
  label: string;
  value: number | string;
  unit?: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        highlight ? "bg-primary/5 border-primary/30" : "bg-bg-700 border-bg-500"
      }`}
    >
      <div className={`text-2xl font-bold font-mono ${color}`}>
        {typeof value === "number" ? value.toFixed(value < 10 ? 2 : 1) : value}
        <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function RaceConditionBadge({ result }: { result: TestResult }) {
  const hasRace = result.race_conditions_detected > 0;
  return (
    <div
      className={`rounded-xl p-4 border ${
        hasRace
          ? "bg-red-500/10 border-red-500/40"
          : "bg-success/10 border-success/30"
      }`}
    >
      <div
        className={`text-3xl font-bold font-mono ${hasRace ? "text-danger" : "text-success"}`}
      >
        {hasRace ? `⚠️ ${result.race_conditions_detected}` : "✓ 0"}
      </div>
      <div className="text-xs text-gray-500 mt-1">Race Conditions</div>
      <div
        className={`text-xs mt-2 font-medium ${hasRace ? "text-red-400" : "text-success"}`}
      >
        {hasRace
          ? `${result.unique_responses} different responses detected`
          : `${result.response_consistency.toFixed(1)}% consistent`}
      </div>
    </div>
  );
}

export function ResultsDashboard() {
  const { currentResult } = useAppStore();

  if (!currentResult) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-5xl opacity-20 mb-4">📊</div>
          <p className="text-gray-500 text-sm">
            Run a test to see results here
          </p>
        </div>
      </div>
    );
  }

  const r = currentResult;
  const successRate =
    r.total_requests > 0 ? (r.success_count / r.total_requests) * 100 : 0;

  // Timeline chart data (bucket by 10ms)
  const buckets: Record<
    number,
    { latency: number; success: number; error: number }
  > = {};
  r.timeline.forEach((req) => {
    const bucket = Math.floor(req.latency_ms / 20) * 20;
    if (!buckets[bucket])
      buckets[bucket] = { latency: bucket, success: 0, error: 0 };
    if (req.success) buckets[bucket].success++;
    else buckets[bucket].error++;
  });
  const chartData = Object.values(buckets).sort(
    (a, b) => a.latency - b.latency,
  );

  // Latency percentile chart
  const percentileData = [
    { name: "Min", value: r.latency_min_ms },
    { name: "P50", value: r.latency_p50_ms },
    { name: "P90", value: r.latency_p90_ms },
    { name: "P95", value: r.latency_p95_ms },
    { name: "P99", value: r.latency_p99_ms },
    { name: "Max", value: r.latency_max_ms },
  ];

  const tooltipStyle = {
    backgroundColor: "#1A1A24",
    border: "1px solid #2A2A38",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="overflow-y-auto h-full space-y-4 pr-1">
      {/* Summary Row */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-bg-700 border border-bg-500 rounded-xl p-4 col-span-1">
          <div className="text-3xl font-bold font-mono text-white">
            {r.total_requests}
          </div>
          <div className="text-xs text-gray-500">Total Requests</div>
        </div>
        <div
          className={`rounded-xl p-4 border ${successRate === 100 ? "bg-success/10 border-success/30" : successRate > 90 ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/10 border-red-500/30"}`}
        >
          <div
            className={`text-3xl font-bold font-mono ${successRate === 100 ? "text-success" : successRate > 90 ? "text-amber-400" : "text-danger"}`}
          >
            {successRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">Success Rate</div>
        </div>
        <div className="bg-bg-700 border border-bg-500 rounded-xl p-4">
          <div className="text-3xl font-bold font-mono text-primary">
            {r.requests_per_second.toFixed(0)}
          </div>
          <div className="text-xs text-gray-500">RPS</div>
        </div>
        <div className="bg-bg-700 border border-bg-500 rounded-xl p-4">
          <div className="text-3xl font-bold font-mono text-success">
            {r.success_count}
          </div>
          <div className="text-xs text-gray-500">Success</div>
        </div>
        <div className="bg-bg-700 border border-bg-500 rounded-xl p-4">
          <div className="text-3xl font-bold font-mono text-danger">
            {r.error_count}
          </div>
          <div className="text-xs text-gray-500">Errors</div>
        </div>
      </div>

      {/* Race Condition + Key Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <RaceConditionBadge result={r} />
        <MetricCard label="Avg Latency" value={r.latency_avg_ms} />
        <MetricCard
          label="P95 Latency"
          value={r.latency_p95_ms}
          color={r.latency_p95_ms > 500 ? "text-danger" : "text-amber-400"}
        />
        <MetricCard
          label="P99 Latency"
          value={r.latency_p99_ms}
          color={r.latency_p99_ms > 1000 ? "text-danger" : "text-warning"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Latency Distribution */}
        <div className="bg-bg-800 border border-bg-600 rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-4 font-semibold">
            Latency Distribution
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A38" />
              <XAxis
                dataKey="latency"
                tick={{ fill: "#6B7280", fontSize: 10 }}
                tickFormatter={(v) => `${v}ms`}
              />
              <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="success" fill="#10B981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="error" fill="#EF4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Percentile Chart */}
        <div className="bg-bg-800 border border-bg-600 rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-4 font-semibold">
            Latency Percentiles
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={percentileData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A38" />
              <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 10 }} />
              <YAxis
                tick={{ fill: "#6B7280", fontSize: 10 }}
                tickFormatter={(v) => `${v}ms`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [`${Number(v).toFixed(2)}ms`]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {percentileData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      entry.value > 1000
                        ? "#EF4444"
                        : entry.value > 500
                          ? "#F97316"
                          : entry.value > 200
                            ? "#F59E0B"
                            : "#00D4FF"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "P50", value: r.latency_p50_ms },
          { label: "P90", value: r.latency_p90_ms },
          { label: "P95", value: r.latency_p95_ms },
          { label: "P99", value: r.latency_p99_ms },
          { label: "P99.9", value: r.latency_p999_ms },
        ].map((m) => (
          <div
            key={m.label}
            className="bg-bg-700 border border-bg-500 rounded-lg p-3 text-center"
          >
            <div className="text-sm font-mono font-bold text-primary">
              {m.value.toFixed(1)}ms
            </div>
            <div className="text-xs text-gray-600">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Error breakdown */}
      {Object.keys(r.error_types).length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <h3 className="text-xs uppercase tracking-wider text-red-400 mb-3 font-semibold">
            Error Breakdown
          </h3>
          <div className="space-y-1">
            {Object.entries(r.error_types).map(([err, count]) => (
              <div key={err} className="flex justify-between text-sm">
                <span className="text-gray-400 font-mono text-xs">{err}</span>
                <span className="text-danger font-semibold">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
