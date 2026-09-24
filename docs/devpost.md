# Devpost — Conduit Sentinel

## Problem & Relevance
JKUAT’s Conduit station already measures the farm microclimate, but farmers still guess about spraying, irrigation, and heat. Sentinel turns those sensors into explicit decisions in Africa/Nairobi time.

## Innovation
Physics first: FAO-56 ET0, dual rain-gauge cross-checks, and local Open-Meteo bias correction sit in front of LightGBM. The LLM is only allowed to narrate API numbers.

## Technical & Conduit use
Bronze → Silver (QC flags, never silent drops) → Gold features → five models → decision engine → FastAPI + React + Telegram. Conduit is the primary station source; NASA POWER and Open-Meteo are labelled historical surrogates.

## Scalability
Station coordinates are a constant; collectors are source-agnostic; the API is stateless; free-tier limits and a paid path are logged in `docs/decisions.md`.

## Impact
Actionable millimetres of irrigation, hours of spray delay, and WBGT rest guidance — with evidence objects on every advisory.
