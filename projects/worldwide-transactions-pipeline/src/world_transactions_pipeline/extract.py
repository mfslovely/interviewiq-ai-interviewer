import csv
from pathlib import Path
from typing import Iterator


def extract_csv(path: Path) -> Iterator[tuple[int, dict[str, str]]]:
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")
    with path.open("r", newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames:
            raise ValueError("Input CSV has no header")
        for row_number, row in enumerate(reader, start=2):
            yield row_number, dict(row)
