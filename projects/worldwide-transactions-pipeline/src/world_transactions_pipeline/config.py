from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class PipelineConfig:
    """Stable demo configuration; production values should come from managed config."""

    schema_version: str = "1.0"
    account_hash_salt: str = "world-transactions-demo-v1"
    high_value_usd: Decimal = Decimal("10000")
    fx_to_usd: dict[str, Decimal] = field(
        default_factory=lambda: {
            "USD": Decimal("1.0000"),
            "INR": Decimal("0.0120"),
            "GBP": Decimal("1.2700"),
            "EUR": Decimal("1.0900"),
            "BRL": Decimal("0.2000"),
            "SGD": Decimal("0.7400"),
            "NGN": Decimal("0.00065"),
            "AED": Decimal("0.2723"),
            "JPY": Decimal("0.0067"),
            "AUD": Decimal("0.6600"),
        }
    )
