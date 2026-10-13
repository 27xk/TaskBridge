import asyncio
from threading import Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
from starlette.websockets import WebSocketDisconnect

from app.api.deps import get_db
from app.api.v1 import websocket as socket_route
from app.core.database import Base
from app.main import create_app
from app.services.websocket_manager import WebSocketManager
from tests.conftest import auth_headers, register_test_device


class MemoryOnlyOnlineStore:
    """Keep network presence out of the database lifetime regression."""

    def mark_online(self, *_args):
        pass

    def refresh(self, *_args):
        pass

    def mark_offline(self, *_args):
        pass

    def list_online(self, _user_id):
        return []


@pytest.fixture()
def pooled_socket_client(monkeypatch):
    # A shared StaticPool/Session masks connections pinned by long-lived dependencies.
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=QueuePool,
        pool_size=1,
        max_overflow=0,
        pool_timeout=0.2,
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False)
    application = create_app()

    def request_session():
        with sessions() as session:
            yield session

    application.dependency_overrides[get_db] = request_session
    manager = WebSocketManager(online_store=MemoryOnlyOnlineStore())
    monkeypatch.setattr(socket_route, "websocket_manager", manager)
    try:
        with TestClient(application) as client:
            headers = auth_headers(
                client, "pool-user", "pool-user@example.com", device_id="pool-device",
            )
            register_test_device(client, headers, "pool-device", "windows")
            yield client, engine, headers, manager
    finally:
        application.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_idle_sockets_do_not_reserve_connections_needed_by_http(pooled_socket_client):
    client, engine, headers, _manager = pooled_socket_client
    with client.websocket_connect("/ws/sync?device_id=pool-device", headers=headers) as first:
        first.send_text("ping")
        assert first.receive_json()["event"] == "pong"
        assert engine.pool.checkedout() == 0

        with client.websocket_connect("/ws/sync?device_id=pool-device", headers=headers) as second:
            second.send_text("ping")
            assert second.receive_json()["event"] == "pong"
            assert engine.pool.checkedout() == 0
            assert client.get("/api/v1/tasks", headers=headers).status_code == 200

        first.send_text("ping")
        assert first.receive_json()["event"] == "pong"
    assert engine.pool.checkedout() == 0


def test_socket_authentication_does_not_execute_sql_on_event_loop(pooled_socket_client):
    client, engine, headers, _manager = pooled_socket_client
    queries_on_event_loop = []

    def capture_query_thread(*_args):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            queries_on_event_loop.append(False)
        else:
            queries_on_event_loop.append(True)

    event.listen(engine, "before_cursor_execute", capture_query_thread)
    try:
        with client.websocket_connect("/ws/sync?device_id=pool-device", headers=headers) as socket:
            socket.send_text("ping")
            assert socket.receive_json()["event"] == "pong"
    finally:
        event.remove(engine, "before_cursor_execute", capture_query_thread)
    assert queries_on_event_loop
    assert not any(queries_on_event_loop)


def test_rejected_socket_returns_its_authentication_connection(pooled_socket_client):
    client, engine, headers, _manager = pooled_socket_client
    with pytest.raises(WebSocketDisconnect) as rejected:
        with client.websocket_connect("/ws/sync?device_id=another-device", headers=headers):
            pytest.fail("Mismatched device unexpectedly connected")
    assert rejected.value.code == 4401
    assert engine.pool.checkedout() == 0
    assert client.get("/api/v1/tasks", headers=headers).status_code == 200


def test_handler_failure_removes_online_socket(pooled_socket_client, monkeypatch):
    client, engine, headers, manager = pooled_socket_client
    handled = Event()

    async def failing_handler(*_args):
        handled.set()
        raise RuntimeError("simulated message handler failure")

    monkeypatch.setattr(socket_route, "_handle_client_message", failing_handler)
    with pytest.raises(RuntimeError, match="simulated message handler failure"):
        with client.websocket_connect("/ws/sync?device_id=pool-device", headers=headers) as socket:
            assert len(manager.online_devices(1)) == 1
            socket.send_text("ping")
            assert handled.wait(2), "WebSocket handler did not receive the message"

    assert manager.online_devices(1) == []
    assert engine.pool.checkedout() == 0
