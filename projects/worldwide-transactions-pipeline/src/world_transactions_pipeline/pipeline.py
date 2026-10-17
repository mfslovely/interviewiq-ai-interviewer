import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .analytics import build_summary
from .config import PipelineConfig
from .extract import extract_csv
from .load import load_sqlite
from .transform import transform_rows


def _write_clean_csv(path: Path, rows: list[object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    payload = [row.to_dict() for row in rows]
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(payload[0]))
        writer.writeheader()
        writer.writerows(payload)


def run_pipeline(source: Path, output_dir: Path, config: PipelineConfig | None = None) -> dict[str, object]:
    config = config or PipelineConfig()
    started = datetime.now(timezone.utc)
    extracted = list(extract_csv(source))
    clean, rejected = transform_rows(extracted, config)
    finished = datetime.now(timezone.utc)
    run = {
        "run_id": str(uuid4()),
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "source_path": source.as_posix(),
        "extracted_count": len(extracted),
        "loaded_count": len(clean),
        "rejected_count": len(rejected),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / "world_transactions.db"
    load_sqlite(db_path, clean, rejected, run)
    _write_clean_csv(output_dir / "clean_transactions.csv", clean)
    summary = build_summary(db_path, run)
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary
