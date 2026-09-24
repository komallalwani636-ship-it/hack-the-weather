from datetime import datetime, timedelta, timezone

from src.alerts.telegram import TelegramBot
from src.decision.rules import Advisory


def _adv(kind="rain_risk", ts=None):
    ts = ts or datetime(2024, 6, 1, 8, tzinfo=timezone.utc)
    return Advisory(
        id="a1",
        type=kind,
        severity="warning",
        location="JKUAT Conduit Station",
        valid_from=ts,
        valid_until=ts + timedelta(hours=3),
        action="Delay spraying or harvest drying operations",
        reason="test",
        evidence={"p_rain_3h": 0.8, "p_rain_24h": 0.6},
    )


def test_dedup_and_complete():
    sent = []
    clock = {"t": datetime(2024, 6, 1, 8, tzinfo=timezone.utc)}

    def now():
        return clock["t"]

    bot = TelegramBot(token="x", chat_ids="111", sender=lambda c, t: sent.append((c, t)), clock=now)
    bot.notify(_adv())
    bot.notify(_adv())
    # Feature: conduit-sentinel, Property 30: Telegram De-duplication
    assert len(sent) == 1
    clock["t"] = clock["t"] + timedelta(minutes=61)
    bot.notify(_adv())
    # Feature: conduit-sentinel, Property 31: Telegram Delivery Completeness
    assert len(sent) == 2
