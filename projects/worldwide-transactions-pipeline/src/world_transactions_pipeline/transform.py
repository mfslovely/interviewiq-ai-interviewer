import hashlib
import json
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from .config import PipelineConfig
from .models import CleanTransaction, RejectedRow

VALID_DIRECTIONS = {"CREDIT", "DEBIT"}
VALID_STATUSES = {"COMPLETED", "PENDING", "FAILED"}


def _required(row: dict[str, str], key: str) -> str:
    value = (row.get(key) or "").strip()
    if not value:
        raise ValueError(f"missing {key}")
    return value


def _risk(
    amount_usd: Decimal,
    cross_border: bool,
    status: str,
    channel: str,
    high_value_usd: Decimal,
) -> tuple[int, str, str]:
    score = 0
    reasons: list[str] = []
    if amount_usd >= high_value_usd:
        score += 45
        reasons.append("HIGH_VALUE")
    if cross_border:
        score += 25
        reasons.append("CROSS_BORDER")
    if channel == "WIRE":
        score += 15
        reasons.append("WIRE_CHANNEL")
    if status == "FAILED":
        score += 20
        reasons.append("FAILED_STATUS")
    score = min(score, 100)
    band = "HIGH" if score >= 60 else "MEDIUM" if score >= 30 else "LOW"
    return score, band, "|".join(reasons)


def transform_rows(
    rows: list[tuple[int, dict[str, str]]], config: PipelineConfig
) -> tuple[list[CleanTransaction], list[RejectedRow]]:
    clean: list[CleanTransaction] = []
    rejected: list[RejectedRow] = []
    seen: set[str] = set()

    for row_number, row in rows:
        transaction_id = (row.get("transaction_id") or "").strip()
        try:
            transaction_id = _required(row, "transaction_id")
            if transaction_id in seen:
                raise ValueError("duplicate transaction_id")
            account_id = _required(row, "account_id")
            country = _required(row, "country").upper()
            currency = _required(row, "currency").upper()
            direction = _required(row, "direction").upper()
            status = _required(row, "status").upper()
            channel = _required(row, "channel").upper()
            counterparty = _required(row, "counterparty_country").upper()
            if len(country) != 2 or len(counterparty) != 2:
                raise ValueError("country codes must be ISO alpha-2")
            if direction not in VALID_DIRECTIONS:
                raise ValueError(f"invalid direction {direction}")
            if status not in VALID_STATUSES:
                raise ValueError(f"invalid status {status}")
            if currency not in config.fx_to_usd:
                raise ValueError(f"unsupported currency {currency}")
            try:
                amount = Decimal(_required(row, "amount"))
            except InvalidOperation as exc:
                raise ValueError("amount is not numeric") from exc
            if amount <= 0:
                raise ValueError("amount must be positive")
            try:
                occurred_at = datetime.fromisoformat(_required(row, "occurred_at").replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError("invalid occurred_at") from exc
            if occurred_at.tzinfo is None:
                raise ValueError("occurred_at must include a timezone")

            amount_usd = (amount * config.fx_to_usd[currency]).quantize(Decimal("0.01"), ROUND_HALF_UP)
            cross_border = country != counterparty
            risk_score, risk_band, risk_reasons = _risk(
                amount_usd, cross_border, status, channel, config.high_value_usd
            )
            account_hash = hashlib.sha256(f"{config.account_hash_salt}:{account_id}".encode()).hexdigest()
            clean.append(
                CleanTransaction(
                    transaction_id=transaction_id,
                    account_hash=account_hash,
                    occurred_at=occurred_at.isoformat(),
                    country=country,
                    currency=currency,
                    direction=direction,
                    channel=channel,
                    merchant_category=(row.get("merchant_category") or "UNKNOWN").strip().upper(),
                    merchant_name=(row.get("merchant_name") or "UNKNOWN").strip(),
                    amount=float(amount.quantize(Decimal("0.01"), ROUND_HALF_UP)),
                    amount_usd=float(amount_usd),
                    status=status,
                    counterparty_country=counterparty,
                    is_cross_border=int(cross_border),
                    risk_score=risk_score,
                    risk_band=risk_band,
                    risk_reasons=risk_reasons,
                    schema_version=config.schema_version,
                )
            )
            seen.add(transaction_id)
        except (ValueError, KeyError) as exc:
            rejected.append(
                RejectedRow(
                    row_number=row_number,
                    transaction_id=transaction_id,
                    reason=str(exc),
                    raw_payload=json.dumps(row, sort_keys=True),
                )
            )
    return clean, rejected
