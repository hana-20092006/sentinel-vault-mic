from dataclasses import dataclass
from typing import List

from .models import (
    RiskAssessment,
    RiskLevel,
    RiskReason,
    Transaction,
    TransactionContext,
)


@dataclass
class RiskConfig:
    """
    Configurable weights for contextual risk signals.

    The weights are intentionally simple for the MVP.
    They can later be replaced or combined with an ML model.
    """

    new_device_weight: float = 0.20
    new_beneficiary_weight: float = 0.20
    unusual_time_weight: float = 0.15
    amount_deviation_weight: float = 0.25
    transaction_burst_weight: float = 0.20

    medium_threshold: float = 0.35
    high_threshold: float = 0.70


class SentinelRiskEngine:

    def __init__(self, config: RiskConfig | None = None):
        self.config = config or RiskConfig()

    def analyze(
        self,
        transaction: Transaction,
        context: TransactionContext,
    ) -> RiskAssessment:

        score = 0.0
        reasons: List[RiskReason] = []

        # -------------------------------------------------
        # 1. NEW DEVICE
        # -------------------------------------------------

        if context.new_device:
            score += self.config.new_device_weight

            reasons.append(
                RiskReason(
                    code="NEW_DEVICE",
                    message="Transaction originated from a new device.",
                )
            )

        # -------------------------------------------------
        # 2. NEW BENEFICIARY
        # -------------------------------------------------

        if context.new_beneficiary:
            score += self.config.new_beneficiary_weight

            reasons.append(
                RiskReason(
                    code="NEW_BENEFICIARY",
                    message="Destination is a recently added beneficiary.",
                )
            )

        # -------------------------------------------------
        # 3. UNUSUAL TIME
        # -------------------------------------------------

        if context.unusual_time:
            score += self.config.unusual_time_weight

            reasons.append(
                RiskReason(
                    code="UNUSUAL_TIME",
                    message="Transaction occurred outside the user's normal time pattern.",
                )
            )

        # -------------------------------------------------
        # 4. AMOUNT DEVIATION
        # -------------------------------------------------

       # -------------------------------------------------
# 4. TRANSACTION AMOUNT + AMOUNT DEVIATION
# -------------------------------------------------

# The amount deviation represents how unusual this
# transaction amount is compared with normal behaviour.
#
# For the MVP, if the frontend provides an explicit
# amount_deviation, we use it. Otherwise, derive a
# simple amount-based signal from the transaction amount.

amount_deviation = context.amount_deviation

if amount_deviation <= 0:
    if transaction.amount >= 500000:
        amount_deviation = 1.0
    elif transaction.amount >= 100000:
        amount_deviation = 0.75
    elif transaction.amount >= 50000:
        amount_deviation = 0.50
    elif transaction.amount >= 10000:
        amount_deviation = 0.25
    else:
        amount_deviation = 0.0

if amount_deviation > 0:

    contribution = (
        amount_deviation
        * self.config.amount_deviation_weight
    )

    score += contribution

    if amount_deviation >= 0.70:
        reasons.append(
            RiskReason(
                code="HIGH_AMOUNT_DEVIATION",
                message=(
                    f"Transaction amount of {transaction.amount:,.2f} "
                    "is significantly above the normal risk range."
                ),
            )
        )

    elif amount_deviation >= 0.40:
        reasons.append(
            RiskReason(
                code="AMOUNT_DEVIATION",
                message=(
                    f"Transaction amount of {transaction.amount:,.2f} "
                    "is above the normal risk range."
                ),
            )
        )
            

        # -------------------------------------------------
        # 5. RECENT TRANSACTION BURST
        # -------------------------------------------------

        if context.recent_transaction_count >= 5:

            score += self.config.transaction_burst_weight

            reasons.append(
                RiskReason(
                    code="TRANSACTION_BURST",
                    message="Multiple transactions occurred within a short period.",
                )
            )

        # -------------------------------------------------
        # NORMALIZE
        # -------------------------------------------------

        score = min(max(score, 0.0), 1.0)

        # -------------------------------------------------
        # CLASSIFY
        # -------------------------------------------------

        if score >= self.config.high_threshold:
            level = RiskLevel.HIGH

        elif score >= self.config.medium_threshold:
            level = RiskLevel.MEDIUM

        else:
            level = RiskLevel.LOW

        return RiskAssessment(
            score=round(score, 4),
            level=level,
            reasons=reasons,
        )


# Shared engine instance for the MVP.
risk_engine = SentinelRiskEngine()