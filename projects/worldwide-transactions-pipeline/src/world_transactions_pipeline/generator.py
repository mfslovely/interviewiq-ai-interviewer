import csv
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


COUNTRIES = [
    ("IN", "INR", (18.52, 73.86)),
    ("US", "USD", (40.71, -74.01)),
    ("GB", "GBP", (51.51, -0.13)),
    ("DE", "EUR", (52.52, 13.41)),
    ("BR", "BRL", (-23.55, -46.63)),
    ("SG", "SGD", (1.35, 103.82)),
    ("NG", "NGN", (6.52, 3.38)),
    ("AE", "AED", (25.20, 55.27)),
    ("JP", "JPY", (35.68, 139.69)),
    ("AU", "AUD", (-33.87, 151.21)),
]
CATEGORIES = ["GROCERIES", "TRAVEL", "UTILITIES", "SHOPPING", "DINING", "SALARY", "TRANSFER"]
CHANNELS = ["CARD", "BANK_TRANSFER", "UPI", "ACH", "WIRE", "MOBILE_WALLET"]
MERCHANTS = ["Northwind Market", "Contoso Travel", "Globex Energy", "Fabrikam Store", "Adventure Works"]
FIELDS = [
    "transaction_id", "account_id", "occurred_at", "country", "currency", "direction",
    "channel", "merchant_category", "merchant_name", "amount", "status",
    "counterparty_country", "latitude", "longitude", "description",
]


def generate_transactions(path: Path, count: int = 1000, seed: int = 42) -> Path:
    """Create reproducible synthetic data with deliberate quality edge cases."""
    if count < 1:
        raise ValueError("count must be at least 1")
    rng = random.Random(seed)
    path.parent.mkdir(parents=True, exist_ok=True)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows: list[dict[str, object]] = []

    for index in range(1, count + 1):
        country, currency, coordinates = rng.choice(COUNTRIES)
        counterparty = country if rng.random() < 0.76 else rng.choice(COUNTRIES)[0]
        category = rng.choice(CATEGORIES)
        direction = "CREDIT" if category == "SALARY" or rng.random() < 0.28 else "DEBIT"
        base_amount = rng.lognormvariate(4.4, 1.2)
        if rng.random() < 0.025:
            base_amount *= 150
        row = {
            "transaction_id": f"WTX-{index:07d}",
            "account_id": f"ACC-{rng.randint(1, max(20, count // 8)):06d}",
            "occurred_at": (start + timedelta(minutes=rng.randint(0, 180 * 24 * 60))).isoformat(),
            "country": country,
            "currency": currency,
            "direction": direction,
            "channel": rng.choice(CHANNELS),
            "merchant_category": category,
            "merchant_name": "Global Payroll Ltd" if category == "SALARY" else rng.choice(MERCHANTS),
            "amount": f"{base_amount:.2f}",
            "status": rng.choices(["COMPLETED", "PENDING", "FAILED"], [0.91, 0.05, 0.04])[0],
            "counterparty_country": counterparty,
            "latitude": f"{coordinates[0] + rng.uniform(-0.2, 0.2):.5f}",
            "longitude": f"{coordinates[1] + rng.uniform(-0.2, 0.2):.5f}",
            "description": f"Synthetic {category.lower()} transaction",
        }
        # About 2% of rows exercise quarantine handling.
        if index % 97 == 0:
            row["amount"] = "not-a-number"
        elif index % 89 == 0:
            row["country"] = ""
        rows.append(row)

    # Deliberate duplicate IDs exercise deterministic de-duplication.
    if count >= 25:
        duplicate = dict(rows[9])
        duplicate["description"] = "Intentional duplicate transaction ID"
        rows.insert(24, duplicate)

    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return path
