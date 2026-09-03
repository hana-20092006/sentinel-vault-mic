from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TransactionType(str, Enum):
    TRANSFER = "TRANSFER"
    PAYMENT = "PAYMENT"
    PURCHASE = "PURCHASE"
    WITHDRAWAL = "WITHDRAWAL"
    DEPOSIT = "DEPOSIT"


class TransactionStatus(str, Enum):
    CREATED = "CREATED"
    ANALYZED = "ANALYZED"
    QR_GENERATED = "QR_GENERATED"
    SCANNED = "SCANNED"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    BLOCKED = "BLOCKED"
    EXECUTED = "EXECUTED"
    EXPIRED = "EXPIRED"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class TransactionCreate(BaseModel):
    sender: str = Field(..., min_length=1)
    destination: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    transaction_type: TransactionType = TransactionType.TRANSFER
    device_id: str = Field(..., min_length=1)


class RiskReason(BaseModel):
    code: str
    message: str


class RiskAssessment(BaseModel):
    score: float = Field(..., ge=0.0, le=1.0)
    level: RiskLevel
    reasons: List[RiskReason] = Field(default_factory=list)


class TransactionContext(BaseModel):
    new_device: bool = False
    new_beneficiary: bool = False
    unusual_time: bool = False
    amount_deviation: float = Field(default=0.0, ge=0.0, le=1.0)
    recent_transaction_count: int = Field(default=0, ge=0)

    # Allows us to add contextual features later without
    # redesigning the whole transaction model.
    additional_features: Dict[str, Any] = Field(default_factory=dict)


class Transaction(BaseModel):
    transaction_id: str
    sender: str
    destination: str
    amount: float
    currency: str
    transaction_type: TransactionType
    device_id: str

    timestamp: datetime
    created_at: datetime
    expires_at: datetime

    status: TransactionStatus = TransactionStatus.CREATED

    context: Optional[TransactionContext] = None
    risk: Optional[RiskAssessment] = None


class TransactionResponse(BaseModel):
    transaction: Transaction


class AuthorizationRequest(BaseModel):
    device_id: str
    decision: str
    local_risk_score: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
    )
    local_risk_level: Optional[RiskLevel] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)