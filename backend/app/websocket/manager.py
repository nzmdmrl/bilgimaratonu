from fastapi import WebSocket
from typing import Dict, Optional
import asyncio

class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, Dict[str, WebSocket]] = {}
        self.user_match: Dict[str, str] = {}
        self.queue: list = []
        self.match_queues: Dict[str, Dict[str, asyncio.Queue]] = {}
        # Kullanıcının maça alındığında bildirim için event
        self.user_matched: Dict[str, asyncio.Event] = {}
        # Kullanıcının match_id'si (rakip tarafından set edilir)
        self.user_match_id: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.user_matched[user_id] = asyncio.Event()

    async def disconnect(self, user_id: str, match_id: Optional[str] = None):
        if match_id and match_id in self.connections:
            self.connections[match_id].pop(user_id, None)
            if not self.connections[match_id]:
                del self.connections[match_id]
                self.match_queues.pop(match_id, None)
        self.user_match.pop(user_id, None)
        self.user_matched.pop(user_id, None)
        self.user_match_id.pop(user_id, None)
        self.queue = [(uid, ws, elo) for uid, ws, elo in self.queue if uid != user_id]

    async def join_match(self, match_id: str, user_id: str, websocket: WebSocket):
        if match_id not in self.connections:
            self.connections[match_id] = {}
        self.connections[match_id][user_id] = websocket
        self.user_match[user_id] = match_id

    async def send_to_user(self, user_id: str, match_id: str, data: dict):
        ws = self.connections.get(match_id, {}).get(user_id)
        print(f"[SEND_TO_USER] match={match_id[:8]} user={user_id[:8]} type={data.get('type')} ws={'OK' if ws else 'NONE'} connections={list(self.connections.get(match_id, {}).keys())[:2]}")
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                pass

    async def broadcast_match(self, match_id: str, data: dict):
        for uid, ws in list(self.connections.get(match_id, {}).items()):
            try:
                await ws.send_json(data)
            except Exception:
                pass

    def add_to_queue(self, user_id: str, websocket: WebSocket, elo: float):
        self.queue = [(uid, ws, e) for uid, ws, e in self.queue if uid != user_id]
        self.queue.append((user_id, websocket, elo))
        # wait_for_match için event oluştur
        self.user_matched[user_id] = asyncio.Event()

    def remove_from_queue(self, user_id: str):
        self.queue = [(uid, ws, e) for uid, ws, e in self.queue if uid != user_id]

    def find_opponent(self, user_id: str, elo: float, elo_range: int = 300) -> Optional[tuple]:
        for uid, ws, e in self.queue:
            if uid != user_id and abs(e - elo) <= elo_range:
                return uid, ws, e
        return None

    def notify_matched(self, user_id: str, match_id: str):
        """Rakip tarafından eşleştirildiğinde çağrılır."""
        self.user_match_id[user_id] = match_id
        event = self.user_matched.get(user_id)
        if event:
            event.set()

    async def wait_for_match(self, user_id: str, timeout: float = 65.0) -> Optional[str]:
        """Maça alınmayı bekle. match_id döner."""
        event = self.user_matched.get(user_id)
        if not event:
            return None
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            return self.user_match_id.get(user_id)
        except asyncio.TimeoutError:
            return None

manager = ConnectionManager()
