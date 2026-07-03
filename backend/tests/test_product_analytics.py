from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def test_product_events_are_accepted_and_summarized_per_user(client: TestClient) -> None:
    owner_headers = auth_headers(client, "analytics-owner", "analytics-owner@example.com")
    other_headers = auth_headers(client, "analytics-other", "analytics-other@example.com")

    first = client.post(
        "/api/v1/analytics/events",
        headers=owner_headers,
        json={
            "name": "task_created",
            "source": "desktop",
            "route": "/tasks",
            "app_version": "0.1.6",
            "session_id": "desktop-session-1",
            "properties": {"view": "today", "offline": False, "count": 1},
            "occurred_at": "2026-06-04T12:00:00Z",
        },
    )
    second = client.post(
        "/api/v1/analytics/events",
        headers=owner_headers,
        json={"name": "task_created", "source": "android", "route": "/today"},
    )
    client.post(
        "/api/v1/analytics/events",
        headers=other_headers,
        json={"name": "task_completed", "source": "web", "route": "/tasks"},
    )

    assert first.status_code == 202
    assert first.json()["data"]["accepted"] is True
    assert isinstance(first.json()["data"]["event_id"], int)
    assert second.status_code == 202

    summary = client.get("/api/v1/analytics/summary", headers=owner_headers)

    assert summary.status_code == 200
    data = summary.json()["data"]
    assert data["total_count"] == 2
    assert data["events"] == [{"name": "task_created", "count": 2}]
    assert data["sources"] == [
        {"source": "android", "count": 1},
        {"source": "desktop", "count": 1},
    ]


def test_product_events_reject_unknown_event_shape(client: TestClient) -> None:
    headers = auth_headers(client, "analytics-invalid", "analytics-invalid@example.com")

    response = client.post(
        "/api/v1/analytics/events",
        headers=headers,
        json={"name": "Task Created!", "source": "desktop"},
    )

    assert response.status_code == 422
