from fastapi.testclient import TestClient


def test_register_login_refresh_and_me(client: TestClient) -> None:
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "alice",
            "email": "alice@example.com",
            "password": "password123",
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
        json={"username_or_email": "alice", "password": "password123"},
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


def test_duplicate_registration_returns_uniform_error(client: TestClient) -> None:
    payload = {
        "username": "duplicate",
        "email": "duplicate@example.com",
        "password": "password123",
    }

    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    response = client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 409
    assert response.json() == {
        "code": 409,
        "message": "username or email already exists",
        "data": None,
    }

