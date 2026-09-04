from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .models import TransactionCreate, TransactionContext, TransactionStatus
from .transaction_store import (
    InvalidTransactionState,
    TransactionNotFound,
    create_transaction,
    transaction_store,
)
from .risk_engine import risk_engine
from .qr_protocol import encode_signed_qr_payload
from .signing import generate_key_pair


router = APIRouter(
    prefix="/sentinel",
    tags=["SentinelVault"],
)


# Hackathon MVP signing key.
# Production: use KMS/HSM or hardware-backed key storage.
_PRIVATE_KEY, _PUBLIC_KEY = generate_key_pair()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class SentinelTransactionRequest(BaseModel):
    sender: str
    destination: str
    amount: float = Field(..., gt=0)
    currency: str = "INR"
    transaction_type: str = "TRANSFER"
    device_id: str
    context: Optional[Dict[str, Any]] = None
    expires_in_seconds: int = Field(default=120, gt=0, le=900)


class DeviceResultRequest(BaseModel):
    device_id: str
    result: Any
    timestamp: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class AuthorizationRequest(BaseModel):
    decision: str
    authorization_method: Optional[str] = None


# ---------------------------------------------------------------------------
# CREATE TRANSACTION
# ---------------------------------------------------------------------------

@router.post("/transactions")
def create_sentinel_transaction(
    request: SentinelTransactionRequest,
):
    """
    Create transaction -> contextual risk analysis -> signed QR payload.
    """

    now = datetime.now(timezone.utc)

    transaction_id = f"SV-{uuid4().hex[:12].upper()}"
    expires_at = now + timedelta(
        seconds=request.expires_in_seconds
    )

    try:
        transaction_data = TransactionCreate(
            sender=request.sender,
            destination=request.destination,
            amount=request.amount,
            currency=request.currency,
            transaction_type=request.transaction_type,
            device_id=request.device_id,
        )

        transaction = create_transaction(
            data=transaction_data,
            transaction_id=transaction_id,
            expires_at=expires_at,
        )

        transaction_store.create(transaction)

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unable to create transaction: {exc}",
        ) from exc

    # -----------------------------------------------------------------------
    # Context
    # -----------------------------------------------------------------------

    context_data = request.context or {}

    try:
        context = TransactionContext(**context_data)

        transaction_store.attach_context(
            transaction_id,
            context,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transaction context: {exc}",
        ) from exc

    # -----------------------------------------------------------------------
    # Risk analysis
    # -----------------------------------------------------------------------

    try:
        risk = risk_engine.analyze(
            transaction,
            context,
        )

        transaction_store.attach_risk(
            transaction_id,
            risk,
        )

        transaction_store.update_status(
            transaction_id,
            TransactionStatus.ANALYZED,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Risk analysis failed: {exc}",
        ) from exc

    # -----------------------------------------------------------------------
    # Generate complete signed QR
    # -----------------------------------------------------------------------

    try:
        signed_qr_payload = encode_signed_qr_payload(
            transaction,
            _PRIVATE_KEY,
        )

        transaction_store.update_status(
            transaction_id,
            TransactionStatus.QR_GENERATED,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"QR generation failed: {exc}",
        ) from exc

    return {
        "transaction_id": transaction.transaction_id,
        "status": transaction.status.value,
        "backend_risk": {
            "score": risk.score,
            "level": risk.level.value,
            "reasons": [
                {
                    "code": reason.code,
                    "message": reason.message,
                }
                for reason in risk.reasons
            ],
        },
        "qr_payload": signed_qr_payload,
        "created_at": transaction.created_at.isoformat(),
        "expires_at": transaction.expires_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# GET TRANSACTION
# ---------------------------------------------------------------------------

@router.get("/transactions/{transaction_id}")
def get_sentinel_transaction(
    transaction_id: str,
):
    try:
        transaction = transaction_store.get(transaction_id)

    except TransactionNotFound:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    return transaction


# ---------------------------------------------------------------------------
# DEVICE RESULT
# ---------------------------------------------------------------------------

@router.post("/transactions/{transaction_id}/device-result")
def submit_device_result(
    transaction_id: str,
    request: DeviceResultRequest,
):
    """
    Receive the result from ESP32-CAM / TinyML.
    """

    try:
        transaction = transaction_store.get(transaction_id)

    except TransactionNotFound:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    now = datetime.now(timezone.utc)

    if now >= transaction.expires_at:
        raise HTTPException(
            status_code=410,
            detail="Transaction has expired",
        )

    transaction.device_result = {
        "device_id": request.device_id,
        "result": request.result,
        "timestamp": request.timestamp or now.isoformat(),
        "details": request.details,
    }

    try:
        transaction_store.update_status(
            transaction_id,
            TransactionStatus.SCANNED,
        )

        transaction_store.update_status(
            transaction_id,
            TransactionStatus.AWAITING_APPROVAL,
        )

    except InvalidTransactionState as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc

    return {
        "transaction_id": transaction_id,
        "status": transaction.status.value,
        "device_result": transaction.device_result,
    }


# ---------------------------------------------------------------------------
# AUTHORIZE
# ---------------------------------------------------------------------------

@router.post("/transactions/{transaction_id}/authorize")
def authorize_transaction(
    transaction_id: str,
    request: AuthorizationRequest,
):
    try:
        transaction = transaction_store.get(transaction_id)

    except TransactionNotFound:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    now = datetime.now(timezone.utc)

    if now >= transaction.expires_at:
        raise HTTPException(
            status_code=410,
            detail="Transaction has expired",
        )

    decision = request.decision.lower()

    if decision == "deny":
        new_status = TransactionStatus.REJECTED

    elif decision == "approve":

        risk_level = (
            transaction.risk.level.value.lower()
            if transaction.risk
            else "unknown"
        )

        # Elevated-risk transactions require device verification.
        if risk_level in {"medium", "high", "critical"}:
            if not getattr(transaction, "device_result", None):
                raise HTTPException(
                    status_code=403,
                    detail="Device verification required before approval",
                )

        new_status = TransactionStatus.APPROVED

    else:
        raise HTTPException(
            status_code=400,
            detail="Decision must be 'approve' or 'deny'",
        )

    try:
        transaction_store.update_status(
            transaction_id,
            new_status,
        )

    except InvalidTransactionState as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc

    return {
        "transaction_id": transaction_id,
        "status": transaction.status.value,
        "authorization_method": request.authorization_method,
        "can_execute": transaction.status == TransactionStatus.APPROVED,
    }


# ---------------------------------------------------------------------------
# SIMULATED EXECUTION
# ---------------------------------------------------------------------------

@router.post("/transactions/{transaction_id}/execute")
def execute_transaction(
    transaction_id: str,
):
    """
    Simulate execution.
    No real money movement occurs.
    """

    try:
        transaction = transaction_store.get(transaction_id)

    except TransactionNotFound:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found",
        )

    if transaction.status != TransactionStatus.APPROVED:
        raise HTTPException(
            status_code=403,
            detail="Transaction has not been approved",
        )

    try:
        transaction_store.update_status(
            transaction_id,
            TransactionStatus.EXECUTED,
        )

    except InvalidTransactionState as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc

    return {
        "transaction_id": transaction_id,
        "status": transaction.status.value,
        "simulated": True,
        "message": "Transaction execution simulated successfully",
    }