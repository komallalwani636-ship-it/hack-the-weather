# QC report notebook (run after ingest)

from src.processing.qc import QCModule
from src.demo_data import build_demo_silver

df = build_demo_silver()
print(df["qc_flag"].value_counts(normalize=True))
