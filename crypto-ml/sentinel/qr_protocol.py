import base64
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict

from .models import Transaction


PROTOCOL_VERSION = "SV-QR-1.0"


class QRProtocolError(Exception):
    """Base exception for QR protocol errors."""


class QRPayloadExpired(QRProtocolError):
    """Raised when a QR payload has expired."""


class QRPayloadInvalid(QRProtocolError):
    """Raised when a QR payload is malformed or invalid."""


def _canonical_json(data: Dict[str, Any]) -> str:
    """
    Convert a dictionary into deterministic JSON.

    The exact same data will always produce the same JSON string.
    This is important for signing and verification.
    """

    return json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def _encode_payload(data: Dict[str, Any]) -> str:
    """
    Encode the canonical JSON into URL-safe Base64.

    This gives us a compact string suitable for QR transport.
    """

    canonical = _canonical_json(data)

    return base64.urlsafe_b64encode(
        canonical.encode("utf-8")
    ).decode("ascii")


def _decode_payload(encoded_payload: str) -> Dict[str, Any]:
    """Decode URL-safe Base64 back into a JSON dictionary."""

    try:
        decoded = base64.urlsafe_b64decode(
            encoded_payload.encode("ascii")
        ).decode("utf-8")

        data = json.loads(decoded)

    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise QRPayloadInvalid(
            "QR payload is not valid encoded JSON"
        ) from exc

    if not isinstance(data, dict):
        raise QRPayloadInvalid(
            "QR payload root must be a JSON object"
        )

    return data


def build_qr_payload(
    transaction: Transaction,
) -> Dict[str, Any]:
    """
    Build the complete SentinelVault QR payload.

    This is the payload consumed by the ESP32-CAM.
    """

    if transaction.risk is None:
        raise QRPayloadInvalid(
            "Transaction must have a risk assessment before QR generation"
        )

    if transaction.context is None:
        raise QRPayloadInvalid(
            "Transaction must have contextual information before QR generation"
        )

    payload = {
        "protocol_version": PROTOCOL_VERSION,

        "transaction": {
            "transaction_id": transaction.transaction_id,
            "sender": transaction.sender,
            "destination": transaction.destination,
            "amount": transaction.amount,
            "currency": transaction.currency,
            "transaction_type": transaction.transaction_type.value,
            "device_id": transaction.device_id,
            "timestamp": transaction.timestamp.isoformat(),
        },

        "context": {
            "new_device": transaction.context.new_device,
            "new_beneficiary": transaction.context.new_beneficiary,
            "unusual_time": transaction.context.unusual_time,
            "amount_deviation": transaction.context.amount_deviation,
            "recent_transaction_count": (
                transaction.context.recent_transaction_count
            ),
            "additional_features": (
                transaction.context.additional_features
            ),
        },

        "backend_risk": {
            "score": transaction.risk.score,
            "level": transaction.risk.level.value,
            "reasons": [
                {
                    "code": reason.code,
                    "message": reason.message,
                }
                for reason in transaction.risk.reasons
            ],
        },

        "created_at": transaction.created_at.isoformat(),
        "expires_at": transaction.expires_at.isoformat(),
    }

    return payload


def create_qr_payload(
    transaction: Transaction,
) -> Dict[str, Any]:
    """
    Build the payload and add a deterministic payload hash.

    The hash allows the receiver to verify that the decoded
    transaction data has not been accidentally modified.
    """

    payload = build_qr_payload(transaction)

    payload_without_hash = dict(payload)

    canonical = _canonical_json(payload_without_hash)

    payload_hash = hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()

    payload["payload_hash"] = payload_hash

    return payload


def encode_qr_payload(
    transaction: Transaction,
) -> str:
    """
    Build and encode the complete transaction payload.

    The returned string is what the QR generator should encode.
    """

    payload = create_qr_payload(transaction)

    return _encode_payload(payload)


def decode_qr_payload(
    encoded_payload: str,
) -> Dict[str, Any]:
    """
    Decode a QR payload and validate its structure.
    """

    payload = _decode_payload(encoded_payload)

    required_fields = {
        "protocol_version",
        "transaction",
        "context",
        "backend_risk",
        "created_at",
        "expires_at",
        "payload_hash",
    }

    missing = required_fields - payload.keys()

    if missing:
        raise QRPayloadInvalid(
            f"Missing required fields: {sorted(missing)}"
        )

    if payload["protocol_version"] != PROTOCOL_VERSION:
        raise QRPayloadInvalid(
            f"Unsupported protocol version: "
            f"{payload['protocol_version']}"
        )

    return payload


def verify_payload_hash(
    payload: Dict[str, Any],
) -> bool:
    """
    Verify that the payload has not been modified.

    Returns True when the hash matches.
    """

    received_hash = payload.get("payload_hash")

    if not received_hash:
        return False

    payload_without_hash = dict(payload)
    payload_without_hash.pop("payload_hash", None)

    canonical = _canonical_json(payload_without_hash)

    calculated_hash = hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()

    return calculated_hash == received_hash


def validate_expiry(
    payload: Dict[str, Any],
    now: datetime | None = None,
) -> None:
    """
    Ensure the QR payload has not expired.
    """

    expires_at_string = payload.get("expires_at")

    if not expires_at_string:
        raise QRPayloadInvalid(
            "Missing expires_at"
        )

    try:
        expires_at = datetime.fromisoformat(
            expires_at_string.replace("Z", "+00:00")
        )

    except ValueError as exc:
        raise QRPayloadInvalid(
            "Invalid expires_at timestamp"
        ) from exc

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    current_time = now or datetime.now(timezone.utc)

    if current_time >= expires_at:
        raise QRPayloadExpired(
            "QR transaction authorization has expired"
        )


def validate_qr_payload(
    encoded_payload: str,
) -> Dict[str, Any]:
    """
    Complete validation pipeline for the ESP32/backend receiver.

    1. Decode
    2. Validate protocol
    3. Verify hash
    4. Check expiry
    """

    payload = decode_qr_payload(encoded_payload)

    if not verify_payload_hash(payload):
        raise QRPayloadInvalid(
            "Payload integrity check failed"
        )

    validate_expiry(payload)

    return payload