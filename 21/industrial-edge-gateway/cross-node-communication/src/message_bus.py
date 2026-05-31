"""
消息总线 - 服务间内部消息通信
"""
import json
import threading
from typing import Any, Callable, Dict, List
from datetime import datetime
from shared.src.models import Message
from shared.src.logger import get_logger

logger = get_logger("message_bus")


class MessageBus:
    """消息总线 - 进程内消息发布/订阅"""

    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = {}
        self._lock = threading.Lock()
        self._message_history: List[Dict] = []

    def subscribe(self, topic: str, callback: Callable):
        with self._lock:
            if topic not in self._subscribers:
                self._subscribers[topic] = []
            self._subscribers[topic].append(callback)
            logger.debug(f"订阅消息主题: {topic}")

    def unsubscribe(self, topic: str, callback: Callable = None):
        with self._lock:
            if topic in self._subscribers:
                if callback:
                    self._subscribers[topic] = [c for c in self._subscribers[topic] if c != callback]
                else:
                    del self._subscribers[topic]
                logger.debug(f"取消订阅消息主题: {topic}")

    def publish(self, topic: str, message: Message):
        self._message_history.append({
            "topic": topic,
            "message": message.to_dict(),
            "timestamp": datetime.utcnow().isoformat(),
        })

        subscribers = self._subscribers.get(topic, [])
        for callback in subscribers:
            try:
                callback(message)
            except Exception as e:
                logger.error(f"消息回调执行失败 ({topic}): {e}")

        logger.debug(f"发布消息到 {topic}: {message.msg_type}")

    def publish_data(self, source: str, data: Dict):
        message = Message(
            msg_type="data",
            source=source,
            target="all",
            payload=data,
        )
        self.publish(f"data/{source}", message)

    def publish_event(self, source: str, event_type: str, data: Dict):
        message = Message(
            msg_type="event",
            source=source,
            target="all",
            payload={"event_type": event_type, **data},
        )
        self.publish(f"event/{source}", message)

    def get_subscribers(self, topic: str = None) -> Dict:
        if topic:
            return {topic: self._subscribers.get(topic, [])}
        return dict(self._subscribers)

    def get_message_history(self, topic: str = None, limit: int = 100) -> List[Dict]:
        if topic:
            return [h for h in self._message_history if h["topic"] == topic][-limit:]
        return self._message_history[-limit:]

    def clear_history(self):
        self._message_history.clear()

    def get_stats(self) -> Dict:
        return {
            "total_subscribers": sum(len(v) for v in self._subscribers.values()),
            "topics": list(self._subscribers.keys()),
            "total_messages": len(self._message_history),
        }


_global_message_bus = None


def get_message_bus() -> MessageBus:
    global _global_message_bus
    if _global_message_bus is None:
        _global_message_bus = MessageBus()
    return _global_message_bus