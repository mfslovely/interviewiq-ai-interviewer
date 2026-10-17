import csv
import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from world_transactions_pipeline.generator import generate_transactions
from world_transactions_pipeline.pipeline import run_pipeline


class PipelineTests(unittest.TestCase):
    def test_end_to_end_pipeline_quarantines_bad_and_duplicate_rows(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = generate_transactions(root / "raw.csv", count=100, seed=7)
            summary = run_pipeline(source, root / "output")

            self.assertEqual(summary["pipeline_run"]["extracted_count"], 101)
            self.assertEqual(summary["pipeline_run"]["loaded_count"], 98)
            self.assertEqual(summary["pipeline_run"]["rejected_count"], 3)
            self.assertEqual(summary["totals"]["transactions"], 98)
            self.assertTrue((root / "output" / "clean_transactions.csv").exists())
            self.assertTrue((root / "output" / "summary.json").exists())

            with closing(sqlite3.connect(root / "output" / "world_transactions.db")) as connection:
                reasons = [row[0] for row in connection.execute("SELECT reason FROM rejected_transactions")]
            self.assertTrue(any("duplicate" in reason for reason in reasons))
            self.assertTrue(any("amount" in reason for reason in reasons))
            self.assertTrue(any("country" in reason for reason in reasons))

    def test_outputs_do_not_expose_raw_account_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = generate_transactions(root / "raw.csv", count=10, seed=1)
            with source.open(encoding="utf-8") as stream:
                first_account = next(csv.DictReader(stream))["account_id"]
            run_pipeline(source, root / "output")
            clean_text = (root / "output" / "clean_transactions.csv").read_text(encoding="utf-8")
            self.assertNotIn(first_account, clean_text)
            self.assertNotIn("account_id", clean_text.splitlines()[0])

    def test_summary_is_valid_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = generate_transactions(root / "raw.csv", count=20, seed=3)
            run_pipeline(source, root / "output")
            payload = json.loads((root / "output" / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(payload["pipeline_run"]["loaded_count"], 20)


if __name__ == "__main__":
    unittest.main()
