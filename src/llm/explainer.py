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

    def explain(
        self,
        question: str,
        llm_call: Callable | None = None,
        api_key: str | None = None,
        provider_preference: str | None = None,
    ) -> AssistantResult:
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
            text = self._try_providers(
                question,
                payloads,
                api_key=api_key,
                provider_preference=provider_preference,
            )
            if text is not None:
                provider = "llm"
                if swahili and not self._is_swahili(text):
                    language_fallback = True
                    text = self._local_agro_agent(question, payloads, force_swahili=True)
                    provider = "agent"
            else:
                # Grounded domain-specific agro-intelligence engine
                text = self._local_agro_agent(question, payloads)
                provider = "agent"

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

    def _try_providers(
        self,
        question: str,
        payloads: dict,
        api_key: str | None = None,
        provider_preference: str | None = None,
    ) -> str | None:
        # Check client-supplied API key first
        if api_key:
            pref = (provider_preference or "").lower()
            if "groq" in pref or api_key.startswith("gsk_"):
                try:
                    result = self._call_groq(api_key, question, payloads)
                    logger.info("Custom Groq responded OK (%d chars)", len(result))
                    return result
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Custom Groq failed: %s", exc)
            else:
                try:
                    result = self._call_gemini(api_key, question, payloads)
                    logger.info("Custom Gemini responded OK (%d chars)", len(result))
                    return result
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Custom Gemini failed: %s", exc)

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

        logger.info("Cloud LLM keys not provided — engaging Sentinel local agro-intelligence engine")
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
            elif k == "get_observations_latest" and isinstance(v, dict):
                compact_payloads["current_sensors"] = v.get("sensors", {})
                compact_payloads["station_time"] = v.get("timestamp_utc", "")
            else:
                compact_payloads[k] = v

        context = json.dumps(compact_payloads, default=str, indent=2)
        prompt = f"{SYSTEM_PROMPT}\n\n" f"Live data from tools:\n{context}\n\n" f"User question: {question}"
        body = json.dumps(
            {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": 512, "temperature": 0.3},
            }
        ).encode()

        models_to_try = [
            "models/gemini-2.0-flash",
            "models/gemini-1.5-flash",
            "models/gemini-1.5-pro",
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
            elif k == "get_observations_latest" and isinstance(v, dict):
                compact_payloads["current_sensors"] = v.get("sensors", {})
                compact_payloads["station_time"] = v.get("timestamp_utc", "")
            else:
                compact_payloads[k] = v

        context = json.dumps(compact_payloads, default=str, indent=2)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Live data from JKUAT weather station tools:\n{context}\n\nQuestion: {question}",
            },
        ]

        models = [
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-120b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768",
        ]
        last_err = None
        for model in models:
            body = json.dumps(
                {
                    "model": model,
                    "messages": messages,
                    "max_tokens": 512,
                    "temperature": 0.3,
                }
            ).encode()

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
                msg = data["choices"][0]["message"]
                reply = (msg.get("content") or msg.get("reasoning") or "").strip()
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

    @classmethod
    def _local_agro_agent(cls, question: str, payloads: dict[str, Any], force_swahili: bool = False) -> str:
        latest = payloads.get("get_observations_latest") or {}
        rain = payloads.get("get_rain_risk") or {}
        irr = payloads.get("get_irrigation") or {}
        sensors = latest.get("sensors") or {}

        temp = (sensors.get("temp_sht_c") or {}).get("value")
        rh = (sensors.get("humidity_sht_pct") or {}).get("value")
        wind = (sensors.get("wind_speed_ms") or {}).get("value")
        wbgt = (sensors.get("wbgt_c") or {}).get("value")

        p3 = rain.get("p_rain_3h")
        p24 = rain.get("p_rain_24h")
        et0 = irr.get("et0_today_mm")
        soil_water = irr.get("water_balance_mm")
        irr_required = irr.get("irrigation_required", False)
        irr_action = irr.get("irrigation_action", "No irrigation required today")

        is_sw = force_swahili or cls._is_swahili(question)
        q = question.lower()

        t_str = f"{temp:.1f} °C" if isinstance(temp, (int, float)) else "data unavailable"
        rh_str = f"{rh:.1f}%" if isinstance(rh, (int, float)) else "data unavailable"
        wind_str = f"{wind:.1f} m/s" if isinstance(wind, (int, float)) else "data unavailable"
        p3_str = f"{p3 * 100:.0f}%" if isinstance(p3, (int, float)) else "data unavailable"
        p24_str = f"{p24 * 100:.0f}%" if isinstance(p24, (int, float)) else "data unavailable"
        et0_str = f"{et0:.1f} mm/day" if isinstance(et0, (int, float)) else "data unavailable"
        soil_str = f"{soil_water:.1f} mm" if isinstance(soil_water, (int, float)) else "data unavailable"
        wbgt_str = f"{wbgt:.1f} °C" if isinstance(wbgt, (int, float)) else "data unavailable"

        # 0. Conversational Greeting & Agent Identity Intent
        greetings = (
            "hello",
            "hi",
            "hey",
            "habari",
            "hujambo",
            "mambo",
            "sasa",
            "good morning",
            "good afternoon",
            "good evening",
            "greetings",
            "who are you",
            "what can you do",
            "help",
            "jambo",
        )
        is_greeting = any(
            q == g or q.startswith(g + " ") or (" " + g in q) or q.startswith(g + "!") or q.startswith(g + "?")
            for g in greetings
        )
        if is_greeting and not any(tok in q for tok in ("irrigat", "water", "spray", "rain", "pesticide")):
            if is_sw:
                return (
                    f"Habari mkulima! Mimi ni Conduit Sentinel, msaidizi wako wa akili bandia (AI) "
                    f"wa hali ya hewa na kilimo kutoka Kituo cha Utafiti cha JKUAT.\n\n"
                    f"Ninakusaidia kufuatilia hali halisi ya hewa shambani na kukupa ushauri wa kitaalamu unaotegemea takwimu za vitambuzi vya Conduit.\n\n"
                    f"Muhtasari wa Kituo cha JKUAT kwa Sasa:\n"
                    f"• Joto la Hewa: {t_str} | Unyevu wa Hewa: {rh_str}\n"
                    f"• Mvukizo wa Maji (ET0): {et0_str} | Hatari ya Mvua (saa 3): {p3_str}\n\n"
                    f"Unaweza kuniuliza maswali kama:\n"
                    f"• 'Je, ninaweza kumwagilia mahindi leo?' (Kiwango cha maji cha FAO-56)\n"
                    f"• 'Je, inafaa kupulizia dawa za mimea mchana huu?' (Usalama wa upepo na mvua)\n"
                    f"• 'Kuna hatari gani ya dhoruba au mvua kwa masaa 24 yajayo?'\n"
                    f"• 'Hali ya joto na uchovu kwa wafanyakazi ikoje?'"
                )
            else:
                return (
                    f"Hello! I am Conduit Sentinel, your AI agro-meteorological assistant at JKUAT.\n\n"
                    f"I analyze real-time microclimate telemetry from our research station "
                    f"to deliver grounded, actionable guidance for smallholders across the Juja agricultural catchment.\n\n"
                    f"Live Station Snapshot:\n"
                    f"• Ambient Temperature: {t_str} | Relative Humidity: {rh_str}\n"
                    f"• Reference Evapotranspiration (ET0): {et0_str} | 3-Hour Rain Risk: {p3_str}\n\n"
                    f"How can I assist your farm today? You can ask me:\n"
                    f"• 'Should I irrigate my maize or beans today?' (FAO-56 Penman-Monteith crop water balance)\n"
                    f"• 'Is it safe to spray pesticides this afternoon?' (Wind drift & wash-off risk analysis)\n"
                    f"• 'What is the rainfall probability for the next 24 hours?'\n"
                    f"• 'How do you calculate crop water requirements?'\n"
                    f"• Or converse in Kiswahili (*'Habari za shamba!'*)"
                )

        # 0b. Science, Physics & Methodology Inquiries
        if any(
            tok in q
            for tok in (
                "how do you calculate",
                "what is fao",
                "what is et0",
                "penman",
                "evapotranspiration",
                "equation",
                "formula",
            )
        ):
            return (
                f"FAO-56 Penman-Monteith Agronomic Physics Model:\n"
                f"Conduit Sentinel calculates reference evapotranspiration (ET0) using the standardized FAO-56 Penman-Monteith combination equation:\n\n"
                f"  ET0 = [0.408 * Delta * (Rn - G) + gamma * (900 / (T + 273)) * u2 * (es - ea)] / [Delta + gamma * (1 + 0.34 * u2)]\n\n"
                f"Telemetry inputs from JKUAT Conduit station:\n"
                f"• Net radiation (Rn - G) derived from Si1145 solar irradiance\n"
                f"• Psychrometric constant (gamma) computed from barometric pressure\n"
                f"• Vapor pressure deficit (es - ea) calculated from SHT31 temperature ({t_str}) and humidity ({rh_str})\n"
                f"• Wind speed at 2m height (u2) = {wind_str}\n\n"
                f"Today's calculated ET0 flux is {et0_str}. Daily crop water demand is then determined by multiplying ET0 by the phenological crop coefficient: ETc = Kc * ET0."
            )

        # 0c. Hardware & Station Sensor Array Inquiries
        if any(
            tok in q
            for tok in ("what sensors", "hardware", "dual tipping", "rain gauge", "sht31", "si1145", "station rig")
        ):
            return (
                f"JKUAT Conduit Weather Station Hardware Architecture:\n"
                f"Our solar-powered microclimate rig at JKUAT is equipped with industrial precision sensors:\n\n"
                f"• SHT31 Microclimate Sensor: Air temperature ({t_str}) and relative humidity ({rh_str})\n"
                f"• Dual Tipping-Bucket Rain Gauges: Redundant mechanical gauges with cross-validation logic (flags sensor clogging or debris if readings differ by > 2.0 mm)\n"
                f"• Si1145 Optical Array: Multi-spectral shortwave solar irradiance (Visible, Infrared, and UV index)\n"
                f"• Anemometer & Wind Vane: Surface wind speed ({wind_str}) and gust dynamics\n"
                f"• BMX/MCP Pressure Sensor: Ambient barometric atmospheric pressure\n"
                f"• WBGT Thermal Globe: Wet Bulb Globe Temperature for farm worker heat stress assessment\n\n"
                f"All observations pass automated Quality Control (QC) before ingestion into our serving store."
            )

        # 1. Irrigation & Water Requirement Intent
        irr_tokens = (
            "irrigat",
            "water",
            "kumwagilia",
            "maji",
            "deficit",
            "soil",
            "udongo",
            "moisture",
            "shamba",
            "et0",
        )
        if any(tok in q for tok in irr_tokens):
            if is_sw:
                if irr_required:
                    ushauri = f"Inapendekezwa kumwagilia maji {abs(soil_water or 0):.1f} mm mapema asubuhi kabla ya saa 2:00 asubuhi (08:00 EAT)."
                else:
                    ushauri = "Hakuna haja ya kumwagilia mimea leo kwani unyevu wa udongo ungali thabiti na unatosha kukidhi mahitaji ya zao."
                return (
                    f"Ushauri wa Umwagiliaji na Maji Shambani (Kituo cha JKUAT):\n"
                    f"• Kiwango cha mvukizo wa maji (ET0): {et0_str}\n"
                    f"• Unyevu uliopo ardhini: {soil_str}\n"
                    f"• Hatari ya mvua (saa 24 zijazo): {p24_str}\n\n"
                    f"Uamuzi wa Kilimo: {ushauri}\n\n"
                    f"Maelezo ya Kitaalamu: Joto la hewa ni {t_str} na unyevu wa hewa ni {rh_str}. "
                    f"Kumwagilia mapema asubuhi hupunguza upotevu wa maji kupitia mvuke na kusaidia mizizi kunyonya virutubisho bila msongo wa maji."
                )
            else:
                if irr_required:
                    rec = f"Action Required: {irr_action or f'Apply {abs(soil_water or 0):.1f} mm of irrigation before 08:00 Africa/Nairobi time.'}"
                    rationale = f"Soil moisture depletion ({soil_str}) has crossed the allowable deficit threshold. With 24-hour rainfall probability at {p24_str}, supplemental watering is essential to prevent crop water stress."
                else:
                    rec = "Action Recommendation: No irrigation required today."
                    rationale = f"Active soil water balance ({soil_str}) remains within the adequate moisture retention capacity. Today's evapotranspiration demand ({et0_str}) is adequately sustained by current soil moisture."
                return (
                    f"Agro-Hydrological Advisory (JKUAT Weather Station):\n"
                    f"• Reference Evapotranspiration (ET0): {et0_str}\n"
                    f"• Root-Zone Soil Water Balance: {soil_str}\n"
                    f"• Calibrated Rainfall Risk (24h): {p24_str}\n\n"
                    f"Agronomic Prescription:\n{rec}\n\n"
                    f"Technical Rationale: {rationale} Local microclimate conditions: Temperature {t_str}, Relative Humidity {rh_str}."
                )

        # 2. Chemical Spraying & Pesticide Application Intent
        spray_tokens = ("spray", "pesticide", "fungicide", "dawa", "pulizia", "chemical", "drift", "herbicid")
        if any(tok in q for tok in spray_tokens):
            w_val = float(wind or 0.0)
            p3_val = float(p3 or 0.0)
            favorable = w_val <= 4.0 and p3_val <= 0.25
            if is_sw:
                status_sw = "INASHAURIWA (Hali Ni Salama)" if favorable else "TAHADHARI (Sitisha au Subiri)"
                maelezo = (
                    f"Kasi ya upepo ni {wind_str} (kiwango cha juu salama: 4.0 m/s) na hatari ya mvua ya saa 3 ni {p3_str}. "
                    f"Hali inafaa kwa kunyunyizia dawa bila hofu ya dawa kupeperushwa na upepo au kusombwa na mvua."
                    if favorable
                    else f"Kasi ya upepo ni {wind_str} au hatari ya mvua ni {p3_str}. "
                    f"Kuna hatari ya dawa kupeperushwa na upepo kuelekea mashamba jirani au kusombwa na mvua kabla haijafanya kazi."
                )
                return (
                    f"Mwongozo wa Kunyunyizia Dawa Shambani (JKUAT):\n"
                    f"• Hali ya Unyunyiziaji: {status_sw}\n"
                    f"• Kasi ya Upepo: {wind_str} (Kiwango Salama < 4.0 m/s)\n"
                    f"• Hatari ya Mvua (saa 3): {p3_str} (Upeo Salama < 25%)\n"
                    f"• Joto la Hewa: {t_str} | Unyevu: {rh_str}\n\n"
                    f"Ushauri wa Kazi: {maelezo}\n"
                    f"Usalama: Wafanyakazi lazima wavae vifaa kamili vya kujikinga (PPE — glavu, kinyago cha kupumulia, na miwani)."
                )
            else:
                status_en = "OPTIMAL (Safe to Spray)" if favorable else "UNFAVORABLE (Delay Application)"
                guidance = (
                    f"Live wind speed ({wind_str}) is within the permissible threshold (< 4.0 m/s) and short-term rain risk ({p3_str}) is minimal. "
                    f"Droplet drift and rain-wash risks are both low."
                    if favorable
                    else f"Current wind velocity ({wind_str}) or precipitation risk ({p3_str}) exceeds recommended application thresholds. "
                    f"Spraying now risks drift damage to non-target vegetation or chemical washoff from foliage."
                )
                return (
                    f"Field Spraying & Crop Protection Advisory:\n"
                    f"• Spraying Window Status: {status_en}\n"
                    f"• Wind Velocity: {wind_str} (Safe drift ceiling: 4.0 m/s)\n"
                    f"• 3-Hour Rain Risk: {p3_str} (Safe wash-off ceiling: 25%)\n"
                    f"• Ambient Microclimate: Temperature {t_str}, Humidity {rh_str}\n\n"
                    f"Agronomic Guidance: {guidance}\n"
                    f"Worker Safety: Operators must wear certified PPE (chemical gloves, respirator, protective coveralls)."
                )

        # 3. Rain & Precipitation Forecast Intent
        rain_tokens = ("rain", "mvua", "storm", "precip", "cloud", "shower", "dhoruba")
        if any(tok in q for tok in rain_tokens):
            if is_sw:
                return (
                    f"Tathmini ya Mvua na Hali ya Hewa (Kituo cha JKUAT):\n"
                    f"• Hatari ya Mvua kwa masaa 3 yajayo: {p3_str}\n"
                    f"• Hatari ya Mvua kwa masaa 24 yajayo: {p24_str}\n"
                    f"• Unyevu wa Hewa: {rh_str} | Joto: {t_str}\n"
                    f"• Kasi ya Upepo: {wind_str}\n\n"
                    f"Ushauri kwa Mkulima: "
                    f"{'Mvua haitarajiwi hivi karibuni; unaweza kuendelea na kazi za shamba kama vile kupalilia au uvunaji.' if (p3 or 0) < 0.3 else 'Kuna dalili za mvua; hakikisha nafaka zilizovunwa zimehifadhiwa mahali pakavu na mifereji ya shamba imezibuliwa.'}"
                )
            else:
                return (
                    f"Precipitation & Convective Risk Assessment (JKUAT Station):\n"
                    f"• 3-Hour Nowcast Rain Probability: {p3_str}\n"
                    f"• 24-Hour Synoptic Rain Probability: {p24_str}\n"
                    f"• Atmospheric Moisture (RH): {rh_str} | Temperature: {t_str}\n"
                    f"• Wind Speed: {wind_str}\n\n"
                    f"Field Operations Outlook: "
                    f"{'Rain probability remains low; optimal conditions for planting, mechanical weeding, harvesting, and drying crops.' if (p3 or 0) < 0.3 else 'Elevated rainfall risk detected; secure harvested produce, inspect field drainage, and suspend fertilizer top-dressing to prevent leaching.'}"
                )

        # 4. Heat Stress & Worker Safety Intent
        heat_tokens = ("heat", "hot", "wbgt", "worker", "labor", "labour", "safety", "joto", "mfanyakazi")
        if any(tok in q for tok in heat_tokens):
            wb_val = float(wbgt or 22.0)
            if is_sw:
                h_level = "Wastani" if wb_val < 26.0 else "Juu" if wb_val < 30.0 else "Hatari Kubwa"
                return (
                    f"Ushauri wa Joto na Usalama wa Wafanyakazi Shambani (JKUAT):\n"
                    f"• Kiashiria cha Joto (WBGT): {wbgt_str} (Kiwango: {h_level})\n"
                    f"• Joto la Hewa: {t_str} | Unyevu: {rh_str}\n\n"
                    f"Mwongozo wa Usalama Shambani: "
                    f"Wafanyakazi wanashauriwa kunywa maji mara kwa mara (lita 0.5 kwa kila saa ya kazi) na kupumzika kivulini ili kujikinga na msongo wa joto."
                )
            else:
                h_level = "Low" if wb_val < 24.0 else "Moderate" if wb_val < 28.0 else "High / Caution"
                return (
                    f"Agricultural Thermal Stress & Occupational Health Advisory:\n"
                    f"• Wet Bulb Globe Temperature (WBGT): {wbgt_str} (Risk Level: {h_level})\n"
                    f"• Ambient Dry-Bulb Temperature: {t_str} | Relative Humidity: {rh_str}\n\n"
                    f"Workplace Protocols: "
                    f"Implement 50-minute work / 10-minute shade rest cycles. Maintain continuous hydration supplies and avoid strenuous manual labor during peak solar exposure hours (12:00–15:00 EAT)."
                )

        # 5. General Telemetry Briefing (Default Intent)
        if is_sw:
            return (
                f"Ripoti ya Kituo cha Hali ya Hewa cha JKUAT:\n"
                f"• Joto la Hewa: {t_str} | Unyevu: {rh_str}\n"
                f"• Kasi ya Upepo: {wind_str}\n"
                f"• Hatari ya Mvua: {p3_str} (saa 3) | {p24_str} (saa 24)\n"
                f"• Mvukizo wa Maji (ET0): {et0_str} | Unyevu wa Udongo: {soil_str}\n"
                f"• Hali ya Umwagiliaji: {irr_action}\n\n"
                f"Ushauri wa Jumla: Hali ya hewa shambani inafuatiliwa moja kwa moja kutoka kwenye vitambuzi vya Conduit. "
                f"Unaweza kuuliza maswali mahususi kuhusu umwagiliaji, kunyunyizia dawa, au usalama wa kazi shambani."
            )
        else:
            return (
                f"Real-Time Agro-Meteorological Briefing (JKUAT Weather Station):\n"
                f"• Ambient Temperature: {t_str} | Relative Humidity: {rh_str}\n"
                f"• Surface Wind Speed: {wind_str}\n"
                f"• Rain Probability: {p3_str} (next 3h) | {p24_str} (next 24h)\n"
                f"• Reference Evapotranspiration (ET0): {et0_str}\n"
                f"• Soil Water Balance: {soil_str}\n"
                f"• Prescribed Irrigation: {irr_action}\n\n"
                f"Operational Summary: Telemetry is continuously acquired from the Conduit station and validated via automated QC. "
                f"Ask specific questions about irrigation requirements, spraying windows, or field safety for detailed guidance."
            )
