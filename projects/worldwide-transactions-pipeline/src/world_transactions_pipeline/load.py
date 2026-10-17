import sqlite3
from contextlib import closing
from pathlib import Path

from .models import CleanTransaction, RejectedRow


SCHEMA = """
CREATE TABLE IF NOT EXISTS clean_transactions (
    transaction_id TEXT PRIMARY KEY,
    account_hash TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    country TEXT NOT NULL,
    currency TEXT NOT NULL,
    direction TEXT NOT NULL,
    channel TEXT NOT NULL,
    merchant_category TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    amount REAL NOT NULL,
    amount_usd REAL NOT NULL,
    status TEXT NOT NULL,
    counterparty_country TEXT NOT NULL,
    is_cross_border INTEGER NOT NULL,
    risk_score INTEGER NOT NULL,
    risk_band TEXT NOT NULL,
    risk_reasons TEXT NOT NULL,
    schema_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rejected_transactions (
    run_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    transaction_id TEXT,
    reason TEXT NOT NULL,
    raw_payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    source_path TEXT NOT NULL,
    extracted_count INTEGER NOT NULL,
    loaded_count INTEGER NOT NULL,
    rejected_count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_country ON clean_transactions(country);
CREATE INDEX IF NOT EXISTS idx_transactions_risk ON clean_transactions(risk_band);
CREATE INDEX IF NOT EXISTS idx_transactions_time ON clean_transactions(occurred_at);
"""


def load_sqlite(
    db_path: Path,
    clean: list[CleanTransaction],
    rejected: list[RejectedRow],
    run: dict[str, object],
) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(db_path)) as connection:
        with connection:
            connection.executescript(SCHEMA)
            connection.executemany(
                """INSERT OR REPLACE INTO clean_transactions VALUES (
                    :transaction_id, :account_hash, :occurred_at, :country, :currency,
                    :direction, :channel, :merchant_category, :merchant_name, :amount,
                    :amount_usd, :status, :counterparty_country, :is_cross_border,
                    :risk_score, :risk_band, :risk_reasons, :schema_version
                )""",
                [item.to_dict() for item in clean],
            )
            connection.executemany(
                """INSERT INTO rejected_transactions
                   (run_id, row_number, transaction_id, reason, raw_payload)
                   VALUES (:run_id, :row_number, :transaction_id, :reason, :raw_payload)""",
                [{"run_id": run["run_id"], **item.__dict__} for item in rejected],
            )
            connection.execute(
                """INSERT INTO pipeline_runs VALUES
                   (:run_id, :started_at, :finished_at, :source_path, :extracted_count,
                    :loaded_count, :rejected_count)""",
                run,
            )
