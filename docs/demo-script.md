# 3-minute demo script

Offline fallback: open `http://localhost:5173/?demo=1`.

1. **Live data (0:00–0:30)** — Live Station Panel. Point at temperature, humidity, QC badge, and the EAT timestamp.
2. **Rain risk (0:30–1:00)** — Alerts feed. If no warning, mention the 0.70 / 0.50 thresholds and show `/risk/rain` in `/docs`.
3. **Telegram (1:00–1:30)** — With `TELEGRAM_BOT_TOKEN` set, a warning advisory sends one message per chat per hour.
4. **Irrigation (1:30–2:15)** — Planner: switch crop/stage; bar chart updates from `GET /irrigation`.
5. **Ask Sentinel (2:15–3:00)** — “Should I irrigate my maize today?” Templated notice appears if the LLM quota is exhausted.
