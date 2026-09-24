# M4 ET0 / water balance

FAO-56 Penman-Monteith:

`ET0 = [0.408·Δ·(Rn-G) + γ·(900/(T+273))·u2·(es-ea)] / [Δ + γ·(1+0.34·u2)]`

Default Kc values:
- maize: initial 0.3, mid 1.2, late 0.6
- beans: initial 0.4, mid 1.15, late 0.35
- pasture: initial 0.4, mid 0.95, late 0.85

Missing sensor values are substituted from Open-Meteo.
