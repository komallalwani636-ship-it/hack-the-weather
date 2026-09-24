"""Telegram warning delivery with cool-down and offline queue."""

from __future__ import annotations

import logging
import os
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Callable

import requests

from src.decision.rules import Advisory

logger = logging.getLogger(__name__)

COOLDOWN = timedelta(minutes=60)
BACKOFF = (2, 4, 8)


class TelegramBot:
    def __init__(
        self,
        token: str | None = None,
        chat_ids: str | None = None,
        sender: Callable | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.token = token if token is not None else os.environ.get("TELEGRAM_BOT_TOKEN", "")
        raw_ids = chat_ids if chat_ids is not None else os.environ.get("TELEGRAM_CHAT_ID", "")
        self.chat_ids = [c.strip() for c in raw_ids.split(",") if c.strip()]
        self.sender = sender
        self.clock = clock or (lambda: datetime.now(tz=timezone.utc))
        self._last: dict[tuple[str, str], datetime] = {}
        self.queue: deque[Advisory] = deque(maxlen=50)
        self.deliveries: list[dict] = []

    def notify(self, advisory: Advisory, sleep: Callable[[float], None] = time.sleep) -> list[str]:
        if advisory.severity != "warning":
            return []
        sent: list[str] = []
        now = self.clock()
        for chat_id in self.chat_ids:
            key = (advisory.type, chat_id)
            last = self._last.get(key)
            if last and now - last < COOLDOWN:
                continue
            ok = self._send(advisory, chat_id, sleep=sleep)
            if ok:
                self._last[key] = now
                sent.append(chat_id)
                self.deliveries.append(
                    {
                        "advisory_type": advisory.type,
                        "chat_id": chat_id,
                        "delivered_at_utc": now,
                        "advisory_id": advisory.id,
                    }
                )
            else:
                self.queue.append(advisory)
        return sent

    def retry_queue(self) -> None:
        pending = list(self.queue)
        self.queue.clear()
        window_end = self.clock() + timedelta(minutes=30)
        for advisory in pending:
            if self.clock() > window_end:
                self.queue.append(advisory)
                continue
            for _ in range(3):
                sent = self.notify(advisory)
                if sent:
                    break

    def _send(self, advisory: Advisory, chat_id: str, sleep: Callable[[float], None]) -> bool:
        text = self._format(advisory)
        if self.sender is not None:
            try:
                self.sender(chat_id, text)
                return True
            except Exception as exc:  # noqa: BLE001
                logger.error("Telegram sender failed advisory=%s chat=%s: %s", advisory.id, chat_id, exc)
                return False
        if not self.token:
            logger.error("TELEGRAM_BOT_TOKEN missing; cannot send")
            return False
        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        last_status = None
        for attempt in range(3):
            try:
                response = requests.post(url, json={"chat_id": chat_id, "text": text}, timeout=15)
                last_status = response.status_code
                if response.status_code == 200:
                    return True
                if response.status_code in (429,) or response.status_code >= 500:
                    sleep(BACKOFF[attempt])
                    continue
                break
            except requests.RequestException:
                sleep(BACKOFF[min(attempt, 2)])
        logger.error(
            "Telegram delivery failed advisory=%s chat=%s ts=%s status=%s",
            advisory.id,
            chat_id,
            datetime.now(tz=timezone.utc).isoformat(),
            last_status,
        )
        return False

    @staticmethod
    def _format(advisory: Advisory) -> str:
        until = advisory.valid_until
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        eat = until.astimezone(timezone.utc).strftime("%H:%M") + " EAT"
        p3 = advisory.evidence.get("p_rain_3h")
        p24 = advisory.evidence.get("p_rain_24h")
        rain_line = ""
        if p3 is not None:
            rain_line = f"\nRain probability: {float(p3)*100:.0f}% (3h) | {float(p24 or 0)*100:.0f}% (24h)"
        return (
            f"{advisory.type.replace('_', ' ').upper()} {advisory.severity.upper()} — {advisory.location}\n"
            f"{advisory.action}{rain_line}\n"
            f"Valid until: {eat}\n"
            f"— Conduit Sentinel"
        )
