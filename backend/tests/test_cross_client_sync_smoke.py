from fastapi.testclient import TestClient

from tests.conftest import auth_headers, register_test_device


def _push_one(
    client: TestClient,
    headers: dict[str, str],
    *,
    device_id: str,
    change: dict,
) -> dict:
    response = client.post(
        "/api/v1/sync/push",
        headers=headers,
        json={"device_id": device_id, "changes": [change]},
    )
    assert response.status_code == 200
    return response.json()["data"]["results"][0]


def test_windows_android_sync_smoke_merges_disjoint_edits_and_surfaces_real_conflicts(client: TestClient) -> None:
    headers = auth_headers(client, "cross-client-smoke-user", "cross-smoke@example.com")
    register_test_device(client, headers, "windows-smoke", "windows")
    register_test_device(client, headers, "android-smoke", "android")

    created = _push_one(
        client,
        headers,
        device_id="windows-smoke",
        change={
            "local_id": "win-create-smoke",
            "server_id": None,
            "action": "create",
            "title": "Original cross-client task",
            "content": "Created from Windows",
            "priority": 1,
            "version": 0,
            "local_updated_at": "2026-05-17T12:00:00Z",
        },
    )
    assert created["status"] == "applied"
    assert created["version"] == 1
    server_id = created["server_id"]

    android_initial_pull = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )
    assert android_initial_pull.status_code == 200
    initial_tasks = android_initial_pull.json()["data"]["changed_tasks"]
    assert [task["id"] for task in initial_tasks] == [server_id]
    assert initial_tasks[0]["title"] == "Original cross-client task"
    assert initial_tasks[0]["priority"] == 1

    windows_title_update = _push_one(
        client,
        headers,
        device_id="windows-smoke",
        change={
            "local_id": "win-title-smoke",
            "server_id": server_id,
            "action": "update",
            "title": "Desktop title wins",
            "version": 1,
            "local_updated_at": "2026-05-17T12:01:00Z",
        },
    )
    assert windows_title_update["status"] == "applied"
    assert windows_title_update["version"] == 2

    android_priority_update = _push_one(
        client,
        headers,
        device_id="android-smoke",
        change={
            "local_id": "android-priority-smoke",
            "server_id": server_id,
            "action": "update",
            "priority": 5,
            "version": 1,
            "local_updated_at": "2026-05-17T12:02:00Z",
        },
    )
    assert android_priority_update["status"] == "applied"
    assert android_priority_update["version"] == 3
    assert android_priority_update["task"]["title"] == "Desktop title wins"
    assert android_priority_update["task"]["priority"] == 5

    android_title_conflict = _push_one(
        client,
        headers,
        device_id="android-smoke",
        change={
            "local_id": "android-title-conflict-smoke",
            "server_id": server_id,
            "action": "update",
            "title": "Stale Android title",
            "version": 1,
            "local_updated_at": "2026-05-17T12:03:00Z",
        },
    )
    assert android_title_conflict["status"] == "conflict"
    assert android_title_conflict["version"] == 3
    assert android_title_conflict["server_task"]["title"] == "Desktop title wins"
    assert android_title_conflict["server_task"]["priority"] == 5

    windows_final_pull = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )
    assert windows_final_pull.status_code == 200
    pull_data = windows_final_pull.json()["data"]
    assert pull_data["deleted_tasks"] == []
    assert pull_data["has_more"] is False
    final_tasks = pull_data["changed_tasks"]
    assert [task["id"] for task in final_tasks] == [server_id]
    assert final_tasks[0]["version"] == 3
    assert final_tasks[0]["title"] == "Desktop title wins"
    assert final_tasks[0]["priority"] == 5
