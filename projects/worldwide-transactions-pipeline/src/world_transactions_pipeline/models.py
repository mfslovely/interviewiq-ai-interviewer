from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class CleanTransaction:
    transaction_id: str
    account_hash: str
    occurred_at: str
    country: str
    currency: str
    direction: str
    channel: str
    merchant_category: str
    merchant_name: str
    amount: float
    amount_usd: float
    status: str
    counterparty_country: str
    is_cross_border: int
    risk_score: int
    risk_band: str
    risk_reasons: str
    schema_version: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class RejectedRow:
    row_number: int
    transaction_id: str
    reason: str
    raw_payload: str
