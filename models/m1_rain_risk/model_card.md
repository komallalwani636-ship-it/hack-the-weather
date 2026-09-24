# M1 RainRisk model card

- Geographic scope: JKUAT Conduit station only (`-1.0982`, `37.0144`)
- Conduit history length: limited; NASA POWER / Open-Meteo used as labelled historical surrogates
- Gaps: expected missing overnight / station outages
- Metrics: PR_AUC=0.0, Brier=1.0
- Fallback: persistence of rolling rainfall when LightGBM is not trained
