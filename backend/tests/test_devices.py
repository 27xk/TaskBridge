from fastapi.testclient import TestClient

from tests.conftest import auth_headers


def test_register_list_and_delete_device(client: TestClient) -> None:
    headers = auth_headers(client, "device-user", "device-user@example.com")

    register_response = client.post(
        "/api/v1/devices/register",
        headers=headers,
        json={
            "device_id": "win-001",
            "device_name": "Office PC",
            "device_type": "windows",
        },
    )

    assert register_response.status_code == 201
    device = register_response.json()["data"]
    assert device["device_id"] == "win-001"
    assert device["device_name"] == "Office PC"

    list_response = client.get("/api/v1/devices", headers=headers)
    assert list_response.status_code == 200
    assert [item["device_id"] for item in list_response.json()["data"]] == ["win-001"]

    delete_response = client.delete("/api/v1/devices/win-001", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["device_id"] == "win-001"

    empty_response = client.get("/api/v1/devices", headers=headers)
    assert empty_response.status_code == 200
    assert empty_response.json()["data"] == []

