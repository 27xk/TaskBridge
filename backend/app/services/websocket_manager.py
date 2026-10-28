import asyncio
import json
import logging
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from fastapi import WebSocket
from redis import Redis
from redis.asyncio import Redis as AsyncRedis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.redis import get_redis_client
from app.schemas.sync import OnlineDevice, SyncNotification
from app.utils.time import utc_iso

ONLINE_TTL_SECONDS = 90
NOTIFICATION_CHANNEL = "taskbridge:task-changes:v1"
logger = logging.getLogger("taskbridge.notifications")


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
    def __init__(self, online_store: RedisOnlineDeviceStore | None = None, *, redis_client=None) -> None:
        self._connections: dict[ConnectionKey, set[WebSocket]] = defaultdict(set)
        self._memory_online: dict[ConnectionKey, OnlineDevice] = {}
        self._online_store = online_store or RedisOnlineDeviceStore()
        self._redis_client = redis_client
        self._owns_redis = redis_client is None
        self._loop = None
        self._closing = False
        self._queue = None
        self._sender = None
        self._listener = None
        self._pubsub = None
        self._origin = uuid4().hex
        self._seen = set()
        self._seen_order = deque()
        self._publish_retry_at = 0.0
        self._presence_tasks = set()
        self._presence_by_key = {}
        self._presence_pending = {}
        self._presence_lock = asyncio.Lock()

    async def start(self) -> None:
        self._closing = False
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue(maxsize=1024)
        self._presence_lock = asyncio.Lock()
        if self._redis_client is None:
            self._redis_client = AsyncRedis.from_url(
                settings.redis_url, decode_responses=True,
                socket_connect_timeout=0.25, socket_timeout=0.5,
            )
        if self._redis_client is not False:
            await self._subscribe()
            self._listener = asyncio.create_task(self._listen())
        self._sender = asyncio.create_task(self._send_committed())

    async def stop(self) -> None:
        # Stop accepting new submissions before draining or closing transports.
        self._closing = True
        if self._queue is not None:
            try:
                await asyncio.wait_for(self._queue.join(), timeout=2)
            except TimeoutError:
                logger.warning("notification shutdown drain timed out")
        for task in (self._sender, self._listener):
            if task is not None:
                task.cancel()
        await asyncio.gather(*(task for task in (self._sender, self._listener) if task), return_exceptions=True)
        try:
            await asyncio.wait_for(asyncio.gather(*self._presence_tasks, return_exceptions=True), timeout=2)
        except TimeoutError:
            logger.warning("presence shutdown drain timed out")
        if self._pubsub is not None:
            await self._pubsub.aclose()
            self._pubsub = None
        if self._owns_redis and self._redis_client:
            await self._redis_client.aclose()
            self._redis_client = None
        self._sender = self._listener = None
        self._loop = None
        self._connections.clear()
        self._memory_online.clear()

    def submit_committed(self, user_id: int, excluded_device_id: str | None, payload: dict) -> None:
        loop = self._loop
        if self._closing or loop is None or loop.is_closed():
            return
        loop.call_soon_threadsafe(self._enqueue, user_id, excluded_device_id, payload)

    def _enqueue(self, user_id, excluded_device_id, payload) -> None:
        try:
            self._queue.put_nowait((user_id, excluded_device_id, payload))
        except asyncio.QueueFull:
            # Notifications are hints: durable HTTP pull remains authoritative.
            logger.warning("notification queue full; clients must recover through HTTP sync")

    async def drain(self) -> None:
        await asyncio.sleep(0)
        if self._queue is not None:
            await self._queue.join()

    async def _send_committed(self) -> None:
        while True:
            user_id, excluded_device_id, payload = await self._queue.get()
            try:
                await asyncio.gather(
                    self.notify_user_except_device(user_id, excluded_device_id, payload),
                    self._publish_committed(user_id, excluded_device_id, payload),
                )
            except Exception:
                logger.exception("committed notification failed")
            finally:
                self._queue.task_done()

    async def _publish_committed(self, user_id, excluded_device_id, payload) -> None:
        if not self._redis_client or asyncio.get_running_loop().time() < self._publish_retry_at:
            return
        message = {"origin": self._origin, "id": uuid4().hex, "user_id": user_id,
                   "excluded_device_id": excluded_device_id, "payload": payload}
        try:
            await self._redis_client.publish(NOTIFICATION_CHANNEL, json.dumps(message))
        except (RedisError, OSError):
            self._publish_retry_at = asyncio.get_running_loop().time() + 5
            logger.warning("cross-process notification unavailable; HTTP sync remains active")

    async def _subscribe(self) -> bool:
        try:
            if self._pubsub is not None:
                await self._pubsub.aclose()
            self._pubsub = self._redis_client.pubsub()
            await self._pubsub.subscribe(NOTIFICATION_CHANNEL)
            self._publish_retry_at = 0
            return True
        except (RedisError, OSError):
            if self._pubsub is not None:
                await self._pubsub.aclose()
            self._pubsub = None
            self._publish_retry_at = asyncio.get_running_loop().time() + 5
            return False

    async def _listen(self) -> None:
        while True:
            if self._pubsub is None:
                if not await self._subscribe():
                    await asyncio.sleep(1)
                    continue
            try:
                message = await self._pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                if message is not None:
                    await self._receive(message.get("data"))
                else:
                    await asyncio.sleep(0.02)
            except (RedisError, OSError):
                await self._pubsub.aclose()
                self._pubsub = None
                await asyncio.sleep(1)

    async def _receive(self, raw) -> None:
        try:
            message = json.loads(raw)
            if not isinstance(message, dict):
                return
            event_id = message["id"]
            user_id = message["user_id"]
            payload = message["payload"]
            if not isinstance(event_id, str) or not isinstance(user_id, int) or not isinstance(payload, dict):
                return
            if message.get("origin") == self._origin or event_id in self._seen:
                return
            self._seen.add(event_id)
            self._seen_order.append(event_id)
            if len(self._seen_order) > 2048:
                self._seen.discard(self._seen_order.popleft())
            await self.notify_user_except_device(user_id, message.get("excluded_device_id"), payload)
        except (ValueError, TypeError, KeyError):
            logger.warning("invalid cross-process notification ignored")

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
        async with self._presence_lock:
            await asyncio.to_thread(self._online_store.mark_online, user_id, device_id)

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
        self._schedule_presence(self._online_store.refresh, user_id, device_id)

    def disconnect(self, user_id: int, device_id: str, websocket: WebSocket) -> None:
        key = ConnectionKey(user_id=user_id, device_id=device_id)
        self._connections[key].discard(websocket)
        if not self._connections[key]:
            self._connections.pop(key, None)
            self._memory_online.pop(key, None)
            self._schedule_presence(self._online_store.mark_offline, user_id, device_id)

    def _schedule_presence(self, method, *args) -> None:
        if self._loop is None:
            method(*args)
            return
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            method(*args)
            return
        key = ConnectionKey(user_id=args[0], device_id=args[1])
        self._presence_pending[key] = (method, args)
        if key in self._presence_by_key:
            return

        async def update_presence():
            try:
                while key in self._presence_pending:
                    async with self._presence_lock:
                        current_method, current_args = self._presence_pending.pop(key)
                        if current_method.__name__ == "mark_offline" and key in self._connections:
                            continue
                        if current_method.__name__ == "refresh" and key not in self._connections:
                            continue
                        await asyncio.to_thread(current_method, *current_args)
            finally:
                self._presence_by_key.pop(key, None)
                self._presence_pending.pop(key, None)

        task = asyncio.create_task(update_presence())
        self._presence_by_key[key] = task
        self._presence_tasks.add(task)
        task.add_done_callback(self._presence_tasks.discard)

    async def notify_user_except_device(
        self,
        user_id: int,
        excluded_device_id: str | None,
        payload: SyncNotification | dict[str, Any],
    ) -> None:
        content = payload.model_dump() if isinstance(payload, SyncNotification) else payload
        async def deliver(key, websocket):
            try:
                await asyncio.wait_for(websocket.send_json(content), timeout=2)
            except Exception:
                self.disconnect(key.user_id, key.device_id, websocket)

        await asyncio.gather(*(
            deliver(key, websocket)
            for key, websockets in list(self._connections.items())
            if key.user_id == user_id and key.device_id != excluded_device_id
            for websocket in list(websockets)
        ))

    async def notify_user(self, user_id: int, payload: dict[str, Any]) -> None:
        await self.notify_user_except_device(user_id, None, payload)

    def online_devices(self, user_id: int) -> list[OnlineDevice]:
        memory_devices = [
            device for key, device in self._memory_online.items() if key.user_id == user_id
        ]
        redis_devices = self._online_store.list_online(user_id)
        return redis_devices or memory_devices


websocket_manager = WebSocketManager()
