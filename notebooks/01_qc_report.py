# QC report notebook (run after ingest)
import sys
from pathlib import Path

# Add project root to sys.path so notebook script can run standalone
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.demo_data import build_demo_silver

df = build_demo_silver()
print(df["qc_flag"].value_counts(normalize=True))

