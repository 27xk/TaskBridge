from app.core import sync_health


def test_health_snapshots_replace_same_device_and_expire(monkeypatch):
    monkeypatch.setattr(sync_health, "_snapshots", {})
    sync_health.record_sync_health(1, "desktop", "one", 12, 2, 80, 10, now=100)
    sync_health.record_sync_health(1, "desktop", "one", 3, 1, 20, 5, now=110)
    sync_health.record_sync_health(2, "web", "two", 4, 0, 30, 8, now=110)
    metrics = sync_health.render_sync_health_metrics(now=111)
    assert 'taskbridge_client_pending_tasks{source="desktop"} 3' in metrics
    assert 'taskbridge_client_oldest_pending_seconds{source="desktop"} 21' in metrics
    assert 'taskbridge_client_conflicts{source="desktop"} 1' in metrics
    assert 'user_id=' not in metrics
    assert 'device_id=' not in metrics
    assert 'source="desktop"} 0' in sync_health.render_sync_health_metrics(now=2000)


def test_sync_health_endpoint_requires_auth_and_rejects_negative_counts(client):
    from tests.conftest import auth_headers

    payload = {"source": "web", "device_id": "browser", "pending_count": 2,
               "conflict_count": 0, "oldest_pending_seconds": 60}
    assert client.post("/api/v1/observability/sync-health", json=payload).status_code == 401
    headers = auth_headers(client, "sync-health", "sync-health@example.com")
    response = client.post("/api/v1/observability/sync-health", json=payload, headers=headers)
    assert response.status_code == 202
    assert response.json()["data"]["accepted"] is True
    payload["pending_count"] = -1
    assert client.post("/api/v1/observability/sync-health", json=payload, headers=headers).status_code == 422
