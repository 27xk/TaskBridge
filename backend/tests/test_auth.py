import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.user import RefreshToken


def test_register_login_refresh_and_me(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "Alice",
            "email": "alice@example.com",
            "password": "password123",
            "device_id": "alice-device",
        },
    )

    assert register_response.status_code == 201
    register_body = register_response.json()
    assert register_body["code"] == 0
    assert register_body["data"]["user"]["username"] == "alice"
    assert register_body["data"]["access_token"]
    assert register_body["data"]["refresh_token"]

    login_response = client.post(
        "/api/v1/auth/login",
        json={"username_or_email": "Alice", "password": "password123", "device_id": "alice-device"},
    )

    assert login_response.status_code == 200
    login_body = login_response.json()
    assert login_body["code"] == 0
    assert login_body["data"]["access_token"]

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": login_body["data"]["refresh_token"]},
    )

    assert refresh_response.status_code == 200
    refresh_body = refresh_response.json()
    assert refresh_body["code"] == 0
    assert refresh_body["data"]["access_token"]
    assert refresh_body["data"]["refresh_token"]

    me_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {refresh_body['data']['access_token']}"},
    )

    assert me_response.status_code == 200
    assert me_response.json()["data"]["email"] == "alice@example.com"


def test_current_user_can_change_password_and_revoke_other_sessions(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "password-change",
            "email": "password-change@example.com",
            "password": "password123",
            "device_id": "password-change-desktop",
        },
    )
    desktop_pair = register_response.json()["data"]
    desktop_headers = {"Authorization": f"Bearer {desktop_pair['access_token']}"}
    phone_response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "password-change",
            "password": "password123",
            "device_id": "password-change-phone",
        },
    )
    phone_pair = phone_response.json()["data"]

    change_response = client.put(
        "/api/v1/auth/password",
        headers=desktop_headers,
        json={"current_password": "password123", "new_password": "new-password-456"},
    )

    assert change_response.status_code == 200
    assert change_response.json()["data"] == {"revoked": 1}
    assert client.get("/api/v1/auth/me", headers=desktop_headers).status_code == 200
    assert client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": phone_pair["refresh_token"],
            "device_id": "password-change-phone",
        },
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "password-change",
            "password": "password123",
            "device_id": "password-change-old-password",
        },
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "password-change",
            "password": "new-password-456",
            "device_id": "password-change-new-password",
        },
    ).status_code == 200


def test_change_password_rejects_wrong_current_password(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "password-change-wrong",
            "email": "password-change-wrong@example.com",
            "password": "password123",
            "device_id": "password-change-wrong-device",
        },
    )
    headers = {
        "Authorization": f"Bearer {register_response.json()['data']['access_token']}"
    }

    response = client.put(
        "/api/v1/auth/password",
        headers=headers,
        json={"current_password": "not-the-password", "new_password": "new-password-456"},
    )

    assert response.status_code == 401
    assert response.json()["message"] == "current password is incorrect"


def test_duplicate_registration_returns_uniform_error(client: TestClient) -> None:
    payload = {
        "username": "duplicate",
        "email": "duplicate@example.com",
        "password": "password123",
        "device_id": "duplicate-device",
    }

    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    response = client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 409
    assert response.json() == {
        "code": 409,
        "message": "registration failed",
        "data": None,
    }


def test_registration_can_be_disabled(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "registration_enabled", False)

    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "disabled",
            "email": "disabled@example.com",
            "password": "password123",
            "device_id": "disabled-device",
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "code": 403,
        "message": "registration disabled",
        "data": None,
    }


def test_token_issue_does_not_run_refresh_token_cleanup_on_request(
    client: TestClient,
) -> None:
    from app.services import auth_service

    assert not hasattr(auth_service, "cleanup_refresh_tokens")

    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "no-cleanup",
            "email": "no-cleanup@example.com",
            "password": "password123",
            "device_id": "no-cleanup-device",
        },
    )

    assert response.status_code == 201


def test_deleting_device_revokes_its_refresh_tokens(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "device-refresh",
            "email": "device-refresh@example.com",
            "password": "password123",
            "device_id": "desktop-revoke",
        },
    )
    token_pair = register_response.json()["data"]
    headers = {"Authorization": f"Bearer {token_pair['access_token']}"}

    device_response = client.post(
        "/api/v1/devices/register",
        headers=headers,
        json={
            "device_id": "desktop-revoke",
            "device_name": "Desktop",
            "device_type": "windows",
        },
    )
    assert device_response.status_code == 201

    delete_response = client.delete("/api/v1/devices/desktop-revoke", headers=headers)
    assert delete_response.status_code == 200

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": token_pair["refresh_token"]},
    )
    assert refresh_response.status_code == 401


def test_deleted_device_access_token_cannot_reach_business_endpoints(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "device-access-revoke",
            "email": "device-access-revoke@example.com",
            "password": "password123",
            "device_id": "desktop-access-revoke",
        },
    )
    token_pair = register_response.json()["data"]
    headers = {"Authorization": f"Bearer {token_pair['access_token']}"}

    device_response = client.post(
        "/api/v1/devices/register",
        headers=headers,
        json={
            "device_id": "desktop-access-revoke",
            "device_name": "Desktop",
            "device_type": "windows",
        },
    )
    assert device_response.status_code == 201

    delete_response = client.delete("/api/v1/devices/desktop-access-revoke", headers=headers)
    assert delete_response.status_code == 200

    tasks_response = client.get("/api/v1/tasks", headers=headers)
    devices_response = client.get("/api/v1/devices", headers=headers)
    sync_response = client.get(
        "/api/v1/sync/pull",
        headers=headers,
        params={"last_sync_time": "1970-01-01T00:00:00Z"},
    )
    ticket_response = client.post(
        "/api/v1/auth/ws-ticket",
        headers=headers,
        json={"device_id": "desktop-access-revoke"},
    )

    assert tasks_response.status_code == 401
    assert devices_response.status_code == 401
    assert sync_response.status_code == 401
    assert ticket_response.status_code == 401


def test_legacy_refresh_token_binds_to_current_device_without_mismatch_revocation(
    client: TestClient,
    db_session: Session,
) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "legacy-refresh",
            "email": "legacy-refresh@example.com",
            "password": "password123",
            "device_id": "legacy-device",
        },
    )
    token_pair = register_response.json()["data"]
    db_session.execute(update(RefreshToken).values(device_id=None))
    db_session.commit()

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": token_pair["refresh_token"], "device_id": "legacy-device"},
    )

    assert refresh_response.status_code == 200
    refreshed_token = refresh_response.json()["data"]["refresh_token"]

    mismatch_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refreshed_token, "device_id": "other-device"},
    )
    assert mismatch_response.status_code == 401

    retry_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refreshed_token, "device_id": "legacy-device"},
    )
    assert retry_response.status_code == 200


def test_refresh_token_reuse_revokes_active_tokens_for_same_device(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "reuse-refresh",
            "email": "reuse-refresh@example.com",
            "password": "password123",
            "device_id": "reuse-device",
        },
    )
    token_pair = register_response.json()["data"]

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": token_pair["refresh_token"], "device_id": "reuse-device"},
    )
    assert refresh_response.status_code == 200
    rotated_refresh_token = refresh_response.json()["data"]["refresh_token"]

    reuse_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": token_pair["refresh_token"], "device_id": "reuse-device"},
    )
    assert reuse_response.status_code == 401

    rotated_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": rotated_refresh_token, "device_id": "reuse-device"},
    )
    assert rotated_response.status_code == 401


def test_current_user_can_list_active_refresh_sessions(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "session-list",
            "email": "session-list@example.com",
            "password": "password123",
            "device_id": "desktop-session",
        },
    )
    token_pair = register_response.json()["data"]
    headers = {"Authorization": f"Bearer {token_pair['access_token']}"}

    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "session-list",
            "password": "password123",
            "device_id": "phone-session",
        },
    )
    assert login_response.status_code == 200

    response = client.get("/api/v1/auth/sessions", headers=headers)

    assert response.status_code == 200
    sessions = response.json()["data"]
    assert {session["device_id"] for session in sessions} == {"desktop-session", "phone-session"}
    assert all("token_hash" not in session for session in sessions)
    assert all(session["revoked_at"] is None for session in sessions)


def test_current_user_can_revoke_other_device_refresh_sessions(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "session-revoke",
            "email": "session-revoke@example.com",
            "password": "password123",
            "device_id": "desktop-session-revoke",
        },
    )
    desktop_token_pair = register_response.json()["data"]
    headers = {"Authorization": f"Bearer {desktop_token_pair['access_token']}"}

    phone_login_response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "session-revoke",
            "password": "password123",
            "device_id": "phone-session-revoke",
        },
    )
    phone_token_pair = phone_login_response.json()["data"]

    revoke_response = client.post(
        "/api/v1/auth/sessions/revoke-other-devices",
        headers=headers,
        json={"device_id": "desktop-session-revoke"},
    )

    assert revoke_response.status_code == 200
    assert revoke_response.json()["data"] == {"revoked": 1}

    phone_refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": phone_token_pair["refresh_token"],
            "device_id": "phone-session-revoke",
        },
    )
    assert phone_refresh_response.status_code == 401

    desktop_refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": desktop_token_pair["refresh_token"],
            "device_id": "desktop-session-revoke",
        },
    )
    assert desktop_refresh_response.status_code == 200


def test_revoke_other_device_sessions_rejects_access_token_device_spoofing(
    client: TestClient,
) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "session-spoof",
            "email": "session-spoof@example.com",
            "password": "password123",
            "device_id": "desktop-session-spoof",
        },
    )
    desktop_token_pair = register_response.json()["data"]

    phone_login_response = client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": "session-spoof",
            "password": "password123",
            "device_id": "phone-session-spoof",
        },
    )
    phone_token_pair = phone_login_response.json()["data"]
    phone_headers = {"Authorization": f"Bearer {phone_token_pair['access_token']}"}

    revoke_response = client.post(
        "/api/v1/auth/sessions/revoke-other-devices",
        headers=phone_headers,
        json={"device_id": "desktop-session-spoof"},
    )

    assert revoke_response.status_code == 404
    assert revoke_response.json()["message"] == "current session not found"

    desktop_refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": desktop_token_pair["refresh_token"],
            "device_id": "desktop-session-spoof",
        },
    )
    assert desktop_refresh_response.status_code == 200


def test_revoked_current_session_cannot_keep_using_access_token_for_session_governance(
    client: TestClient,
) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "session-self-revoke",
            "email": "session-self-revoke@example.com",
            "password": "password123",
            "device_id": "desktop-self-revoke",
        },
    )
    token_pair = register_response.json()["data"]
    headers = {"Authorization": f"Bearer {token_pair['access_token']}"}

    sessions_response = client.get("/api/v1/auth/sessions", headers=headers)
    assert sessions_response.status_code == 200
    session_id = sessions_response.json()["data"][0]["id"]

    revoke_response = client.delete(f"/api/v1/auth/sessions/{session_id}", headers=headers)
    assert revoke_response.status_code == 200

    retry_response = client.get("/api/v1/auth/sessions", headers=headers)
    assert retry_response.status_code == 401


def test_revoked_current_session_cannot_keep_using_access_token_for_business_apis(
    client: TestClient,
) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "session-business-revoke",
            "email": "session-business-revoke@example.com",
            "password": "password123",
            "device_id": "desktop-business-revoke",
        },
    )
    token_pair = register_response.json()["data"]
    headers = {"Authorization": f"Bearer {token_pair['access_token']}"}

    sessions_response = client.get("/api/v1/auth/sessions", headers=headers)
    assert sessions_response.status_code == 200
    session_id = sessions_response.json()["data"][0]["id"]

    revoke_response = client.delete(f"/api/v1/auth/sessions/{session_id}", headers=headers)
    assert revoke_response.status_code == 200

    me_response = client.get("/api/v1/auth/me", headers=headers)
    tasks_response = client.get("/api/v1/tasks", headers=headers)
    ticket_response = client.post(
        "/api/v1/auth/ws-ticket",
        headers=headers,
        json={"device_id": "desktop-business-revoke"},
    )

    assert me_response.status_code == 401
    assert tasks_response.status_code == 401
    assert ticket_response.status_code == 401


def test_revoke_other_device_sessions_requires_current_device_session(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "session-revoke-missing",
            "email": "session-revoke-missing@example.com",
            "password": "password123",
            "device_id": "desktop-session-present",
        },
    )
    token_pair = register_response.json()["data"]
    headers = {"Authorization": f"Bearer {token_pair['access_token']}"}

    revoke_response = client.post(
        "/api/v1/auth/sessions/revoke-other-devices",
        headers=headers,
        json={"device_id": "not-a-current-session"},
    )

    assert revoke_response.status_code == 404
    assert revoke_response.json()["message"] == "current session not found"

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": token_pair["refresh_token"],
            "device_id": "desktop-session-present",
        },
    )
    assert refresh_response.status_code == 200
