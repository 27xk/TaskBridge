import asyncio

import pytest

from app.services.websocket_manager import WebSocketManager


class OnlineStore:
    def mark_online(self, *args):
        pass

    def mark_offline(self, *args):
        pass


class Socket:
    def __init__(self, broken=False):
        self.messages = []
        self.broken = broken

    async def accept(self):
        pass

    async def send_json(self, content):
        if self.broken:
            raise RuntimeError("closed")
        self.messages.append(content)


@pytest.mark.asyncio
async def test_failed_connection_does_not_block_other_devices():
    manager = WebSocketManager(online_store=OnlineStore())
    broken, healthy = Socket(True), Socket()
    await manager.connect(1, "broken", broken)
    await manager.connect(1, "healthy", healthy)
    await manager.notify_user_except_device(1, "source", {"event": "task_changed"})
    assert healthy.messages == [{"event": "task_changed"}]


@pytest.mark.asyncio
async def test_slow_connection_does_not_delay_a_healthy_device():
    manager = WebSocketManager(online_store=OnlineStore())
    release, delivered = asyncio.Event(), asyncio.Event()

    class Slow(Socket):
        async def send_json(self, content):
            await release.wait()

    class Healthy(Socket):
        async def send_json(self, content):
            delivered.set()

    await manager.connect(1, "slow", Slow())
    await manager.connect(1, "healthy", Healthy())
    sending = asyncio.create_task(manager.notify_user_except_device(1, "source", {}))
    try:
        await asyncio.wait_for(delivered.wait(), timeout=0.2)
    finally:
        release.set()
        await sending


@pytest.mark.asyncio
async def test_presence_refresh_coalesces_repeated_pings_while_redis_is_slow():
    from threading import Event

    entered, release = Event(), Event()

    class SlowPresence(OnlineStore):
        def refresh(self, *args):
            entered.set()
            release.wait(2)

    manager = WebSocketManager(online_store=SlowPresence(), redis_client=False)
    await manager.start()
    try:
        await manager.connect(1, "receiver", Socket())
        manager.refresh(1, "receiver")
        assert await asyncio.to_thread(entered.wait, 1)
        for _ in range(200):
            manager.refresh(1, "receiver")
        assert len(manager._presence_tasks) == 1
    finally:
        release.set()
        await manager.stop()


@pytest.mark.asyncio
async def test_shutdown_cleanup_keeps_presence_io_off_the_event_loop():
    on_event_loop = []

    class TrackingPresence(OnlineStore):
        def mark_offline(self, *args):
            try:
                asyncio.get_running_loop()
                on_event_loop.append(True)
            except RuntimeError:
                on_event_loop.append(False)

    manager = WebSocketManager(online_store=TrackingPresence(), redis_client=False)
    await manager.start()
    await manager.connect(1, "broken", Socket(True))
    manager.submit_committed(1, "source", {"event": "task_changed"})
    await asyncio.sleep(0)
    await manager.stop()
    assert on_event_loop == [False]


@pytest.mark.asyncio
async def test_committed_notifications_can_be_submitted_from_worker_thread():
    manager = WebSocketManager(online_store=OnlineStore(), redis_client=False)
    await manager.start()
    try:
        socket = Socket()
        await manager.connect(1, "receiver", socket)
        await asyncio.to_thread(manager.submit_committed, 1, "source", {"event": "task_changed"})
        await asyncio.wait_for(manager.drain(), timeout=1)
        assert socket.messages == [{"event": "task_changed"}]
    finally:
        await manager.stop()


class Hub:
    def __init__(self):
        self.subscriptions = []

    def pubsub(self):
        subscription = Subscription(self)
        self.subscriptions.append(subscription)
        return subscription

    async def publish(self, channel, data):
        for subscription in self.subscriptions:
            await subscription.messages.put({"data": data})


class Subscription:
    def __init__(self, hub):
        self.hub = hub
        self.messages = asyncio.Queue()

    async def subscribe(self, channel):
        pass

    async def get_message(self, **kwargs):
        return await self.messages.get()

    async def aclose(self):
        self.hub.subscriptions.remove(self)


@pytest.mark.asyncio
async def test_committed_change_reaches_another_manager_without_echo_or_cross_user_leak():
    hub = Hub()
    first = WebSocketManager(online_store=OnlineStore(), redis_client=hub)
    second = WebSocketManager(online_store=OnlineStore(), redis_client=hub)
    await first.start()
    await second.start()
    try:
        source, remote, other_user = Socket(), Socket(), Socket()
        await first.connect(1, "source", source)
        await second.connect(1, "receiver", remote)
        await second.connect(2, "other", other_user)
        first.submit_committed(1, "source", {"event": "task_changed"})
        await first.drain()
        for _ in range(10):
            if remote.messages:
                break
            await asyncio.sleep(0)
        assert remote.messages == [{"event": "task_changed"}]
        assert source.messages == []
        assert other_user.messages == []
        import json

        envelope = json.dumps({"id": "same", "origin": "remote", "user_id": 1,
                               "payload": {"event": "task_changed"}})
        await second._receive(envelope)
        await second._receive(envelope)
        assert len(remote.messages) == 2
        await second._receive("[]")
        await second._receive("invalid")
    finally:
        await first.stop()
        await second.stop()
    assert hub.subscriptions == []
