import logging
import re
import time
from contextvars import ContextVar
from threading import Lock
from uuid import uuid4

from fastapi import FastAPI, Request, Response

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
request_id_context: ContextVar[str] = ContextVar("request_id", default="")
logger = logging.getLogger("taskbridge.request")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}
HTTP_REQUEST_DURATION_MS_BUCKETS = (50, 100, 250, 500, 1000, 2500, 5000)
HTTP_METHOD_ALLOWLIST = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
_metrics_lock = Lock()
_http_requests_total = 0
_http_error_responses_total = 0
_http_request_duration_ms_sum = 0.0
_task_version_conflicts_total = 0
_client_error_reports_total = 0
_http_series: dict[tuple[str, str, int], tuple[int, float]] = {}
_client_error_reports_by_source: dict[str, int] = {}
_http_duration_bucket_counts = [0 for _ in HTTP_REQUEST_DURATION_MS_BUCKETS]
_http_series_duration_bucket_counts: dict[tuple[str, str, int], list[int]] = {}


def install_observability(application: FastAPI) -> None:
    @application.middleware("http")
    async def observability_middleware(request: Request, call_next) -> Response:
        request_id = _normalize_request_id(request.headers.get(REQUEST_ID_HEADER))
        token = request_id_context.set(request_id)
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_context.reset(token)

        response.headers[REQUEST_ID_HEADER] = request_id
        for header, value in SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)

        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        record_http_request(
            request.method,
            _request_path_template(request, response.status_code),
            response.status_code,
            duration_ms,
        )
        logger.info(
            "request completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response


def record_http_request(method: str, path: str, status_code: int, duration_ms: float) -> None:
    global _http_error_responses_total
    global _http_request_duration_ms_sum
    global _http_requests_total

    with _metrics_lock:
        method = _normalize_http_method(method)
        _http_requests_total += 1
        _http_request_duration_ms_sum += duration_ms
        if status_code >= 400:
            _http_error_responses_total += 1
        key = (method.upper(), path, status_code)
        count, duration_sum = _http_series.get(key, (0, 0.0))
        _http_series[key] = (count + 1, duration_sum + duration_ms)
        series_bucket_counts = _http_series_duration_bucket_counts.get(
            key,
            [0 for _ in HTTP_REQUEST_DURATION_MS_BUCKETS],
        )
        for index, bucket in enumerate(HTTP_REQUEST_DURATION_MS_BUCKETS):
            if duration_ms <= bucket:
                _http_duration_bucket_counts[index] += 1
                series_bucket_counts[index] += 1
        _http_series_duration_bucket_counts[key] = series_bucket_counts


def record_task_version_conflict() -> None:
    global _task_version_conflicts_total

    with _metrics_lock:
        _task_version_conflicts_total += 1


def record_client_error_report(source: str) -> None:
    global _client_error_reports_total

    normalized_source = _normalize_client_error_source(source)
    with _metrics_lock:
        _client_error_reports_total += 1
        _client_error_reports_by_source[normalized_source] = (
            _client_error_reports_by_source.get(normalized_source, 0) + 1
        )


def render_prometheus_metrics() -> str:
    with _metrics_lock:
        requests_total = _http_requests_total
        error_responses_total = _http_error_responses_total
        duration_ms_sum = _http_request_duration_ms_sum
        task_version_conflicts_total = _task_version_conflicts_total
        client_error_reports_total = _client_error_reports_total
        series = dict(sorted(_http_series.items()))
        client_error_reports_by_source = dict(sorted(_client_error_reports_by_source.items()))
        duration_bucket_counts = list(_http_duration_bucket_counts)
        series_duration_bucket_counts = {
            key: list(value)
            for key, value in sorted(_http_series_duration_bucket_counts.items())
        }
    lines = [
        "# HELP taskbridge_http_requests_total Total HTTP responses served by TaskBridge.",
        "# TYPE taskbridge_http_requests_total counter",
        f"taskbridge_http_requests_total {requests_total}",
    ]
    for (method, path, status_code), (count, _) in series.items():
        labels = _metric_labels(method, path, status_code)
        lines.append(f"taskbridge_http_requests_total{{{labels}}} {count}")
    lines.extend(
        [
            "# HELP taskbridge_http_error_responses_total "
            "Total HTTP responses with status code >= 400.",
            "# TYPE taskbridge_http_error_responses_total counter",
            f"taskbridge_http_error_responses_total {error_responses_total}",
        ],
    )
    for (method, path, status_code), (count, _) in series.items():
        if status_code < 400:
            continue
        labels = _metric_labels(method, path, status_code)
        lines.append(f"taskbridge_http_error_responses_total{{{labels}}} {count}")
    lines.extend(
        [
            "# HELP taskbridge_http_request_duration_ms HTTP response duration in milliseconds.",
            "# TYPE taskbridge_http_request_duration_ms histogram",
        ],
    )
    for bucket, bucket_count in zip(
        HTTP_REQUEST_DURATION_MS_BUCKETS,
        duration_bucket_counts,
        strict=True,
    ):
        lines.append(
            f'taskbridge_http_request_duration_ms_bucket{{le="{_bucket_label(bucket)}"}} '
            f"{bucket_count}",
        )
    lines.extend(
        [
            f'taskbridge_http_request_duration_ms_bucket{{le="+Inf"}} {requests_total}',
            f"taskbridge_http_request_duration_ms_count {requests_total}",
            f"taskbridge_http_request_duration_ms_sum {duration_ms_sum:.2f}",
        ],
    )
    for (method, path, status_code), (_, series_duration_sum) in series.items():
        labels = _metric_labels(method, path, status_code)
        for bucket, bucket_count in zip(
            HTTP_REQUEST_DURATION_MS_BUCKETS,
            series_duration_bucket_counts.get(
                (method, path, status_code),
                [0 for _ in HTTP_REQUEST_DURATION_MS_BUCKETS],
            ),
            strict=True,
        ):
            lines.append(
                f'taskbridge_http_request_duration_ms_bucket{{{labels},'
                f'le="{_bucket_label(bucket)}"}} {bucket_count}',
            )
        lines.append(
            f'taskbridge_http_request_duration_ms_bucket{{{labels},le="+Inf"}} '
            f"{series[(method, path, status_code)][0]}",
        )
        lines.append(
            f"taskbridge_http_request_duration_ms_count{{{labels}}} "
            f"{series[(method, path, status_code)][0]}",
        )
        lines.append(
            f"taskbridge_http_request_duration_ms_sum{{{labels}}} {series_duration_sum:.2f}",
        )
    lines.extend(
        [
            "# HELP taskbridge_task_version_conflicts_total "
            "Total direct task writes rejected by optimistic version checks.",
            "# TYPE taskbridge_task_version_conflicts_total counter",
            f"taskbridge_task_version_conflicts_total {task_version_conflicts_total}",
            "# HELP taskbridge_client_error_reports_total "
            "Total client-side error reports accepted by TaskBridge.",
            "# TYPE taskbridge_client_error_reports_total counter",
            f"taskbridge_client_error_reports_total {client_error_reports_total}",
        ],
    )
    for source, count in client_error_reports_by_source.items():
        lines.append(
            'taskbridge_client_error_reports_total{'
            f'source="{_escape_label_value(source)}"'
            f"}} {count}",
        )
    lines.append("")
    return "\n".join(lines)


def _normalize_request_id(value: str | None) -> str:
    if value and _REQUEST_ID_PATTERN.fullmatch(value):
        return value
    return str(uuid4())


def _request_path_template(request: Request, status_code: int) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if isinstance(path, str) and path:
        return path
    if status_code == 404:
        return "__unmatched__"
    return request.url.path


def _metric_labels(method: str, path: str, status_code: int) -> str:
    return ",".join(
        [
            f'method="{_escape_label_value(method)}"',
            f'path="{_escape_label_value(path)}"',
            f'status="{status_code}"',
        ],
    )


def _escape_label_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def _bucket_label(bucket: int) -> str:
    return str(bucket)


def _normalize_http_method(method: str) -> str:
    normalized = method.upper()
    return normalized if normalized in HTTP_METHOD_ALLOWLIST else "OTHER"


def _normalize_client_error_source(source: str) -> str:
    normalized = source.lower()
    return normalized if normalized in {"web", "desktop", "android"} else "other"
