from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket
from redis import Redis
from redis.exceptions import RedisError

from app.core.redis import get_redis_client
from app.schemas.sync import OnlineDevice, SyncNotification
from app.utils.time import utc_iso

ONLINE_TTL_SECONDS = 90


@dataclass(frozen=True)
class ConnectionKey:
    user_id: int
    device_id: str


class RedisOnlineDeviceStore:
    def __init__(self, redis_client: Redis | None = None) -> None:
        self.redis = redis_client or get_redis_client()

    def mark_online(self, user_id: int, device_id: str) -> None:
        now = utc_iso()
        payload = f"{now}|{now}"
        try:
            self.redis.sadd(self._user_key(user_id), device_id)
            self.redis.setex(self._device_key(user_id, device_id), ONLINE_TTL_SECONDS, payload)
            self.redis.expire(self._user_key(user_id), ONLINE_TTL_SECONDS)
        except RedisError:
            return

    def refresh(self, user_id: int, device_id: str) -> None:
        now = utc_iso()
        try:
            existing = self.redis.get(self._device_key(user_id, device_id))
            connected_at = str(existing).split("|", maxsplit=1)[0] if existing else now
            self.redis.sadd(self._user_key(user_id), device_id)
            self.redis.setex(
                self._device_key(user_id, device_id),
                ONLINE_TTL_SECONDS,
                f"{connected_at}|{now}",
            )
            self.redis.expire(self._user_key(user_id), ONLINE_TTL_SECONDS)
        except RedisError:
            return

    def mark_offline(self, user_id: int, device_id: str) -> None:
        try:
            self.redis.srem(self._user_key(user_id), device_id)
            self.redis.delete(self._device_key(user_id, device_id))
        except RedisError:
            return

    def list_online(self, user_id: int) -> list[OnlineDevice]:
        try:
            device_ids = self.redis.smembers(self._user_key(user_id))
        except RedisError:
            return []

        devices: list[OnlineDevice] = []
        for raw_device_id in device_ids:
            device_id = str(raw_device_id)
            try:
                value = self.redis.get(self._device_key(user_id, device_id))
            except RedisError:
                continue
            if not value:
                continue
            connected_at, last_seen_at = str(value).split("|", maxsplit=1)
            devices.append(
                OnlineDevice(
                    user_id=user_id,
                    device_id=device_id,
                    connected_at=connected_at,
                    last_seen_at=last_seen_at,
                    source="redis",
                ),
            )
        return devices

    @staticmethod
    def _user_key(user_id: int) -> str:
        return f"taskbridge:online:{user_id}"

    @staticmethod
    def _device_key(user_id: int, device_id: str) -> str:
        return f"taskbridge:online:{user_id}:{device_id}"


class WebSocketManager:
    def __init__(self, online_store: RedisOnlineDeviceStore | None = None) -> None:
        self._connections: dict[ConnectionKey, set[WebSocket]] = defaultdict(set)
        self._memory_online: dict[ConnectionKey, OnlineDevice] = {}
        self._online_store = online_store or RedisOnlineDeviceStore()

    async def connect(self, user_id: int, device_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        key = ConnectionKey(user_id=user_id, device_id=device_id)
        now = utc_iso()
        self._connections[key].add(websocket)
        self._memory_online[key] = OnlineDevice(
            user_id=user_id,
            device_id=device_id,
            connected_at=self._memory_online.get(key).connected_at
            if key in self._memory_online
            else now,
            last_seen_at=now,
            source="memory",
        )
        self._online_store.mark_online(user_id, device_id)

    def refresh(self, user_id: int, device_id: str) -> None:
        key = ConnectionKey(user_id=user_id, device_id=device_id)
        if key in self._memory_online:
            current = self._memory_online[key]
            self._memory_online[key] = OnlineDevice(
                user_id=user_id,
                device_id=device_id,
                connected_at=current.connected_at,
                last_seen_at=utc_iso(),
                source="memory",
            )
        self._online_store.refresh(user_id, device_id)

    def disconnect(self, user_id: int, device_id: str, websocket: WebSocket) -> None:
        key = ConnectionKey(user_id=user_id, device_id=device_id)
        self._connections[key].discard(websocket)
        if not self._connections[key]:
            self._connections.pop(key, None)
            self._memory_online.pop(key, None)
            self._online_store.mark_offline(user_id, device_id)

    async def notify_user_except_device(
        self,
        user_id: int,
        excluded_device_id: str,
        payload: SyncNotification | dict[str, Any],
    ) -> None:
        content = payload.model_dump() if isinstance(payload, SyncNotification) else payload
        for key, websockets in list(self._connections.items()):
            if key.user_id != user_id or key.device_id == excluded_device_id:
                continue
            for websocket in list(websockets):
                await websocket.send_json(content)

    async def notify_user(self, user_id: int, payload: dict[str, Any]) -> None:
        for key, websockets in list(self._connections.items()):
            if key.user_id != user_id:
                continue
            for websocket in list(websockets):
                await websocket.send_json(payload)

    def online_devices(self, user_id: int) -> list[OnlineDevice]:
        memory_devices = [
            device for key, device in self._memory_online.items() if key.user_id == user_id
        ]
        redis_devices = self._online_store.list_online(user_id)
        return redis_devices or memory_devices


websocket_manager = WebSocketManager()
