# M4 ET0 / water balance

FAO-56 Penman-Monteith:

`ET0 = [0.408·Δ·(Rn-G) + γ·(900/(T+273))·u2·(es-ea)] / [Δ + γ·(1+0.34·u2)]`

Default Kc values:
- maize: initial 0.3, mid 1.2, late 0.6
- beans: initial 0.4, mid 1.15, late 0.35
- pasture: initial 0.4, mid 0.95, late 0.85
- cabbage: initial 0.45, mid 1.05, late 0.95
- potatoes: initial 0.5, mid 1.15, late 0.75
- coffee: initial 0.9, mid 1.05, late 0.95
- tomatoes: initial 0.6, mid 1.15, late 0.8
- bananas: initial 0.5, mid 1.10, late 1.0

Missing sensor values are substituted from Open-Meteo.
