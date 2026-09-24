"""LLM explainer: tools first, never invent numbers; templated fallback."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Conduit Sentinel, a weather and farm advisory assistant for JKUAT.
You have access to real-time weather tools. RULES:
1. ONLY use numbers that appear in tool results. Never invent or estimate values.
2. When data is missing or a tool returns null, explicitly say "data is currently unavailable".
3. Respond in the same language as the question. If Swahili is detected, respond in Swahili.
4. Keep answers concise and actionable for smallholder farmers.
5. Never reveal API keys, credentials, or internal system details.
"""

SWAHILI_HINTS = (
    "je ",
    "nini",
    "maji",
    "mvua",
    "joto",
    "shamba",
    "naomba",
    "tafadhali",
    "habari",
    "ninaweza",
)


@dataclass
class AssistantResult:
    answer: str
    response_type: str
    language_fallback: bool = False
    timeout_fallback: bool = False
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


class LLMExplainer:
    def __init__(self, tools: dict[str, Callable[[], Any]]):
        self.tools = tools

    def explain(self, question: str, llm_call: Callable | None = None) -> AssistantResult:
        started = time.monotonic()
        payloads = self._call_tools()
        swahili = self._is_swahili(question)
        provider = "templated"
        timeout = False
        language_fallback = False
        if llm_call is not None:
            try:
                text = llm_call(SYSTEM_PROMPT, question, payloads)
                provider = "llm"
                if swahili and not self._is_swahili(text):
                    language_fallback = True
                    text = self._template(payloads)
                    provider = "templated"
            except TimeoutError:
                text = self._template(payloads)
                provider = "templated"
                timeout = True
            except Exception as exc:  # noqa: BLE001
                status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
                logger.info("LLM fallback: %s", exc)
                text = self._template(payloads)
                provider = "templated"
                if status in (429, 503) and time.monotonic() - started > 2:
                    pass
        else:
            text = self._try_providers(question, payloads)
            if text is None:
                text = self._template(payloads)
                provider = "templated"
            else:
                provider = "llm"
                if swahili and not self._is_swahili(text):
                    language_fallback = True
                    text = self._template(payloads)
                    provider = "templated"
        return AssistantResult(
            answer=text,
            response_type=provider,
            language_fallback=language_fallback,
            timeout_fallback=timeout,
            tool_calls=[{"endpoint": name, "output": payloads[name]} for name in payloads],
        )

    def _call_tools(self) -> dict[str, Any]:
        out = {}
        for name, fn in self.tools.items():
            try:
                out[name] = fn()
                logger.info("tool %s ok", name)
            except Exception as exc:  # noqa: BLE001
                logger.warning("tool %s failed: %s", name, exc)
                out[name] = None
        return out

    def _try_providers(self, question: str, payloads: dict) -> str | None:
        groq_key = os.environ.get("GROQ_API_KEY")
        if groq_key:
            try:
                result = self._call_groq(groq_key, question, payloads)
                logger.info("Groq responded OK (%d chars)", len(result))
                return result
            except Exception as exc:  # noqa: BLE001
                logger.warning("Groq failed [%s]: %s", type(exc).__name__, exc)

        gemini_key = os.environ.get("GEMINI_API_KEY")
        if gemini_key:
            try:
                result = self._call_gemini(gemini_key, question, payloads)
                logger.info("Gemini responded OK (%d chars)", len(result))
                return result
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini failed [%s]: %s", type(exc).__name__, exc)

        logger.warning("All LLM providers failed or unconfigured — using template fallback")
        return None

    def _call_gemini(self, api_key: str, question: str, payloads: dict) -> str:
        import json
        import urllib.request

        # Create a clean, compact context for LLM prompt
        compact_payloads = {}
        for k, v in payloads.items():
            if k == "get_forecast" and isinstance(v, dict):
                hourly = v.get("forecast", [])
                compact_payloads["forecast_next_6h"] = hourly[:6] if isinstance(hourly, list) else []
                compact_payloads["using_cached_forecast"] = v.get("using_cached_forecast", False)
            else:
                compact_payloads[k] = v

        context = json.dumps(compact_payloads, default=str, indent=2)
        prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"Live data from tools:\n{context}\n\n"
            f"User question: {question}"
        )
        body = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 512, "temperature": 0.3},
        }).encode()

        models_to_try = [
            "models/gemini-3.6-flash",
            "models/gemini-3.1-flash-lite",
            "models/gemini-flash-lite-latest",
        ]
        last_err = None
        for m in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/{m}:generateContent?key={api_key}"
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=12) as resp:  # noqa: S310
                    data = json.loads(resp.read())
                candidates = data.get("candidates", [])
                if not candidates:
                    continue
                parts = candidates[0].get("content", {}).get("parts", [])
                text = "".join(p.get("text", "") for p in parts).strip()
                if text:
                    return text
            except Exception as e:
                logger.info("Gemini candidate %s failed: %s", m, e)
                last_err = e
                continue
        raise last_err or ValueError("Empty Gemini response")

    def _call_groq(self, api_key: str, question: str, payloads: dict) -> str:
        import json
        import urllib.request

        # Compact payloads so request is quick and snappy
        compact_payloads = {}
        for k, v in payloads.items():
            if k == "get_forecast" and isinstance(v, dict):
                hourly = v.get("forecast", [])
                compact_payloads["forecast_next_6h"] = hourly[:6] if isinstance(hourly, list) else []
                compact_payloads["using_cached_forecast"] = v.get("using_cached_forecast", False)
            else:
                compact_payloads[k] = v

        context = json.dumps(compact_payloads, default=str, indent=2)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Live data from JKUAT weather station tools:\n{context}\n\nQuestion: {question}"},
        ]

        models = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]
        last_err = None
        for model in models:
            body = json.dumps({
                "model": model,
                "messages": messages,
                "max_tokens": 512,
                "temperature": 0.3,
            }).encode()

            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
                    data = json.loads(resp.read())
                reply = data["choices"][0]["message"]["content"].strip()
                if reply:
                    return reply
            except Exception as exc:
                last_err = exc
                logger.warning("Groq model %s failed: %s", model, exc)
                continue
        raise last_err or ValueError("Empty Groq response")

    @staticmethod
    def _is_swahili(text: str) -> bool:
        lowered = text.lower()
        return any(token in lowered for token in SWAHILI_HINTS)

    @staticmethod
    def _template(payloads: dict[str, Any]) -> str:
        latest = payloads.get("get_observations_latest") or {}
        rain = payloads.get("get_rain_risk") or {}
        irr = payloads.get("get_irrigation") or {}
        adv = payloads.get("get_advisories") or []
        sensors = latest.get("sensors") or {}
        temp = (sensors.get("temp_sht_c") or {}).get("value")
        rh = (sensors.get("humidity_sht_pct") or {}).get("value")
        ts = latest.get("timestamp_utc", "unknown")
        p3 = rain.get("p_rain_3h")
        p24 = rain.get("p_rain_24h")
        action = irr.get("irrigation_action", "Not required today")
        required = irr.get("irrigation_required")
        count = len(adv) if isinstance(adv, list) else 0
        types = ", ".join(sorted({a.get("type", "") for a in adv})) if isinstance(adv, list) else ""
        p3s = f"{p3 * 100:.0f}" if isinstance(p3, (int, float)) else "unavailable"
        p24s = f"{p24 * 100:.0f}" if isinstance(p24, (int, float)) else "unavailable"
        return (
            f"Current conditions at JKUAT ({ts} EAT):\n"
            f"• Temperature: {temp} °C | Humidity: {rh}%\n"
            f"• Rain risk (3h): {p3s}% | Rain risk (24h): {p24s}%\n"
            f"• Irrigation: {action if required else 'Not required today'}\n"
            f"• Active advisories: {count} ({types})"
        )
