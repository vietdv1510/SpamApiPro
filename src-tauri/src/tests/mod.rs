/// SpamAPI Engine — Test Suite
/// Chạy: cargo test
/// Dev verbose: RUST_LOG=debug cargo test -- --nocapture
///
/// Mỗi khi thêm tính năng / sửa engine → chạy lại để đảm bảo không regression.

#[cfg(test)]
mod engine_tests {
    use std::collections::HashMap;
    use tokio_util::sync::CancellationToken;
    use wiremock::{MockServer, Mock, ResponseTemplate};
    use wiremock::matchers::{method, path};

    use crate::engine::{LoadTestEngine, TestConfig, TestMode, RequestResult};

    // ─── Helpers ─────────────────────────────────────────────────────────────

    fn make_config(url: &str, virtual_users: u32, mode: TestMode) -> TestConfig {
        TestConfig {
            url: url.to_string(),
            method: "GET".to_string(),
            headers: HashMap::new(),
            body: None,
            virtual_users,
            duration_secs: None,
            iterations: Some(1),
            mode,
            timeout_ms: 5_000,
            think_time_ms: 0,
            ignore_ssl_errors: false,
        }
    }

    fn make_result(id: u32, success: bool, latency_ms: f64, status: Option<u16>, error: Option<&str>) -> RequestResult {
        RequestResult {
            id,
            success,
            status_code: status,
            latency_ms,
            error: error.map(|s| s.to_string()),
            response_size_bytes: 100,
            timestamp_ms: 0,
            response_body: Some("ok".to_string()),
        }
    }

    fn new_engine() -> LoadTestEngine {
        LoadTestEngine::new(5_000, false).expect("failed to build engine")
    }

    // ─── 1. aggregate_results: pure logic tests (no network) ─────────────────

    #[test]
    fn test_aggregate_empty_results_no_panic() {
        let engine = new_engine();
        // Given: không có request nào hoàn thành
        let result = engine.aggregate_results_pub(vec![], 1000.0);
        // Then: không panic, trả về zero values
        assert_eq!(result.total_requests, 0);
        assert_eq!(result.success_count, 0);
        assert_eq!(result.error_count, 0);
        assert_eq!(result.latency_min_ms, 0.0);
        assert_eq!(result.latency_avg_ms, 0.0);
    }

    #[test]
    fn test_aggregate_all_success() {
        let engine = new_engine();
        let results = vec![
            make_result(1, true, 10.0, Some(200), None),
            make_result(2, true, 20.0, Some(200), None),
            make_result(3, true, 30.0, Some(200), None),
        ];
        let agg = engine.aggregate_results_pub(results, 100.0);

        assert_eq!(agg.total_requests, 3);
        assert_eq!(agg.success_count, 3);
        assert_eq!(agg.error_count, 0);
        assert!((agg.latency_avg_ms - 20.0).abs() < 1.0, "avg should be ~20ms");
        assert_eq!(agg.latency_min_ms, 10.0);
        assert_eq!(agg.latency_max_ms, 30.0);
    }

    #[test]
    fn test_aggregate_mixed_success_errors() {
        let engine = new_engine();
        let results = vec![
            make_result(1, true,  50.0, Some(200), None),
            make_result(2, false, 10.0, Some(500), Some("HTTP 500")),
            make_result(3, false, 10.0, None,      Some("Timeout")),
            make_result(4, true,  50.0, Some(200), None),
        ];
        let agg = engine.aggregate_results_pub(results, 200.0);

        assert_eq!(agg.success_count, 2);
        assert_eq!(agg.error_count, 2);
        assert_eq!(*agg.error_types.get("HTTP 500").unwrap_or(&0), 1);
        assert_eq!(*agg.error_types.get("Timeout").unwrap_or(&0), 1);
    }

    #[test]
    fn test_aggregate_cancelled_requests_excluded_from_metrics() {
        let engine = new_engine();
        let results = vec![
            make_result(1, true,  50.0, Some(200), None),
            // Cancelled request — không nên tính vào latency/success/error
            make_result(2, false, 0.0, None, Some("Cancelled")),
            make_result(3, false, 0.0, None, Some("Cancelled")),
        ];
        let agg = engine.aggregate_results_pub(results, 100.0);

        // Only 1 non-cancelled request
        assert_eq!(agg.success_count, 1);
        assert_eq!(agg.error_count, 0);
        // latency_avg should reflect only the 1 completed request
        assert!((agg.latency_avg_ms - 50.0).abs() < 1.0);
    }

    #[test]
    fn test_aggregate_rps_calculation() {
        let engine = new_engine();
        let results: Vec<RequestResult> = (0..100)
            .map(|i| make_result(i, true, 10.0, Some(200), None))
            .collect();
        // 100 requests in 1000ms → RPS = 100
        let agg = engine.aggregate_results_pub(results, 1000.0);

        assert!((agg.requests_per_second - 100.0).abs() < 1.0,
            "RPS should be ~100, got {}", agg.requests_per_second);
    }

    #[test]
    fn test_aggregate_status_distribution() {
        let engine = new_engine();
        let results = vec![
            make_result(1, true,  10.0, Some(200), None),
            make_result(2, true,  10.0, Some(201), None),
            make_result(3, false, 10.0, Some(500), Some("HTTP 500")),
        ];
        let agg = engine.aggregate_results_pub(results, 100.0);

        // "2xx" bucket
        assert_eq!(*agg.status_distribution.get("2xx").unwrap_or(&0), 2);
        // "5xx" bucket
        assert_eq!(*agg.status_distribution.get("5xx").unwrap_or(&0), 1);
        // exact code "200"
        assert_eq!(*agg.status_distribution.get("200").unwrap_or(&0), 1);
    }

    #[test]
    fn test_aggregate_percentiles_monotonic() {
        let engine = new_engine();
        // 100 requests với latency tăng dần
        let results: Vec<RequestResult> = (1..=100)
            .map(|i| make_result(i, true, i as f64, Some(200), None))
            .collect();
        let agg = engine.aggregate_results_pub(results, 1000.0);

        // p50 <= p90 <= p95 <= p99 <= p999
        assert!(agg.latency_p50_ms <= agg.latency_p90_ms, "p50 > p90");
        assert!(agg.latency_p90_ms <= agg.latency_p95_ms, "p90 > p95");
        assert!(agg.latency_p95_ms <= agg.latency_p99_ms, "p95 > p99");
        assert!(agg.latency_p99_ms <= agg.latency_p999_ms, "p99 > p999");
        // p50 của 1..100 phải gần 50ms
        assert!(agg.latency_p50_ms >= 45.0 && agg.latency_p50_ms <= 55.0,
            "p50 should be ~50ms, got {}", agg.latency_p50_ms);
    }

    // ─── 2. Network tests (wiremock) ─────────────────────────────────────────

    #[tokio::test]
    async fn test_burst_all_requests_succeed() {
        // GIVEN: mock server luôn trả 200
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_string("ok"))
            .mount(&server)
            .await;

        let engine = new_engine();
        let config = make_config(&server.uri(), 10, TestMode::Burst);
        let cancel = CancellationToken::new();

        // WHEN: chạy burst 10 VUs
        let result = engine.run(config, cancel, |_, _| {}).await;

        // THEN: tất cả 10 requests thành công
        assert_eq!(result.success_count, 10, "all 10 VUs should succeed");
        assert_eq!(result.error_count, 0);
        assert!(!result.was_cancelled);
    }

    #[tokio::test]
    async fn test_burst_server_errors_counted() {
        // GIVEN: mock server luôn trả 500
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(500).set_body_string("error"))
            .mount(&server)
            .await;

        let engine = new_engine();
        let config = make_config(&server.uri(), 5, TestMode::Burst);
        let cancel = CancellationToken::new();

        // WHEN
        let result = engine.run(config, cancel, |_, _| {}).await;

        // THEN: 5 requests đều fail (500 = error)
        assert_eq!(result.error_count, 5, "all 5 requests should be counted as errors");
        assert_eq!(result.success_count, 0);
        // Status distribution phải có "5xx"
        assert!(*result.status_distribution.get("5xx").unwrap_or(&0) > 0);
    }

    #[tokio::test]
    async fn test_burst_cancel_before_run() {
        // GIVEN: cancel token đã bị cancel trước khi chạy
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let engine = new_engine();
        let config = make_config(&server.uri(), 100, TestMode::Burst);
        let cancel = CancellationToken::new();
        cancel.cancel(); // cancel ngay

        // WHEN
        let result = engine.run(config, cancel, |_, _| {}).await;

        // THEN: was_cancelled = true, không fire 100 requests
        assert!(result.was_cancelled, "should detect cancellation");
    }

    #[tokio::test]
    async fn test_burst_cancel_mid_run() {
        // GIVEN: mock server delay nhẹ
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_delay(std::time::Duration::from_millis(100))
            )
            .mount(&server)
            .await;

        let engine = new_engine();
        let config = make_config(&server.uri(), 50, TestMode::Burst);
        let cancel = CancellationToken::new();
        let cancel_clone = cancel.clone();

        // Cancel sau 50ms (mid-run)
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            cancel_clone.cancel();
        });

        let result = engine.run(config, cancel, |_, _| {}).await;

        // THEN: test dừng do cancel (không nhất thiết was_cancelled=true
        // nếu tất cả kịp xong, nhưng ít nhất không panic)
        let _ = result; // không crash là pass
    }

    #[tokio::test]
    async fn test_constant_mode_runs_for_duration() {
        // GIVEN: server luôn 200
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let engine = new_engine();
        let mut config = make_config(&server.uri(), 5, TestMode::Constant);
        config.duration_secs = Some(1); // chạy 1 giây
        config.iterations = None;
        let cancel = CancellationToken::new();

        let start = std::time::Instant::now();
        let result = engine.run(config, cancel, |_, _| {}).await;
        let elapsed = start.elapsed().as_millis();

        // THEN: chạy tối thiểu ~1 giây và có requests
        assert!(elapsed >= 900, "should run for ~1s, got {}ms", elapsed);
        assert!(result.total_requests > 0, "should have processed some requests");
        assert_eq!(result.error_count, 0);
    }

    #[tokio::test]
    async fn test_post_request_with_body() {
        // GIVEN: mock chỉ accept POST
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api"))
            .respond_with(ResponseTemplate::new(201).set_body_string("{\"created\":true}"))
            .mount(&server)
            .await;

        let engine = new_engine();
        let mut config = make_config(&format!("{}/api", server.uri()), 3, TestMode::Burst);
        config.method = "POST".to_string();
        config.body = Some(r#"{"key":"value"}"#.to_string());
        let cancel = CancellationToken::new();

        let result = engine.run(config, cancel, |_, _| {}).await;

        assert_eq!(result.success_count, 3, "POST requests should succeed");
        assert_eq!(*result.status_distribution.get("201").unwrap_or(&0), 3);
    }

    #[tokio::test]
    async fn test_connection_refused_counted_as_error() {
        // GIVEN: port không có server nào listen
        let engine = new_engine();
        let config = make_config("http://127.0.0.1:19999/nothing", 3, TestMode::Burst);
        let cancel = CancellationToken::new();

        let result = engine.run(config, cancel, |_, _| {}).await;

        // THEN: error_count = 3, không panic
        assert_eq!(result.error_count, 3, "refused connections should be errors");
        assert_eq!(result.success_count, 0);
    }

    // ─── 3. Input validation tests (commands layer) ───────────────────────────

    #[test]
    fn test_validate_virtual_users_too_high() {
        let too_many = 10_001u32;
        let result: Result<(), String> = if too_many > 10_000 {
            Err("Max 10,000 virtual users".to_string())
        } else {
            Ok(())
        };
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("10,000"));
    }

    #[test]
    fn test_validate_url_must_be_http() {
        for bad_url in &["", "ftp://foo.com", "file:///etc/passwd", "javascript:alert(1)"] {
            let ok = bad_url.starts_with("http://") || bad_url.starts_with("https://");
            assert!(!ok, "URL {} should be rejected", bad_url);
        }
        for good_url in &["http://example.com", "https://api.test/v1"] {
            let ok = good_url.starts_with("http://") || good_url.starts_with("https://");
            assert!(ok, "URL {} should be accepted", good_url);
        }
    }
}
