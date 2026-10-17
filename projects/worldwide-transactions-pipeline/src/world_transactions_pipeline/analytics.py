import sqlite3
from contextlib import closing
from pathlib import Path


def build_summary(db_path: Path, run: dict[str, object]) -> dict[str, object]:
    with closing(sqlite3.connect(db_path)) as connection:
        connection.row_factory = sqlite3.Row
        totals = connection.execute(
            """SELECT COUNT(*) AS transactions,
                      ROUND(SUM(amount_usd), 2) AS gross_volume_usd,
                      SUM(is_cross_border) AS cross_border_transactions,
                      SUM(CASE WHEN risk_band = 'HIGH' THEN 1 ELSE 0 END) AS high_risk_transactions
               FROM clean_transactions"""
        ).fetchone()
        by_country = connection.execute(
            """SELECT country, COUNT(*) AS transactions, ROUND(SUM(amount_usd), 2) AS volume_usd
               FROM clean_transactions GROUP BY country ORDER BY volume_usd DESC"""
        ).fetchall()
        by_category = connection.execute(
            """SELECT merchant_category, COUNT(*) AS transactions,
                      ROUND(SUM(amount_usd), 2) AS volume_usd
               FROM clean_transactions GROUP BY merchant_category ORDER BY volume_usd DESC"""
        ).fetchall()
    return {
        "pipeline_run": run,
        "totals": dict(totals),
        "by_country": [dict(row) for row in by_country],
        "by_category": [dict(row) for row in by_category],
    }
