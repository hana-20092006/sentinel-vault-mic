import base64
import hashlib
import json
from typing import Any, Dict

from .models import Transaction
from .signing import sign_payload, verify_signature


PROTOCOL_VERSION = "SV-QR-1.0"


QR_FEATURES = [
    "Avg_min_between_sent_tnx",
    "Avg_min_between_received_tnx",
    "Time_Diff_between_first_and_last_Mins_",
    "Sent_tnx",
    "Received_Tnx",
    "total_transactions",
    "avg_val_received",
    "avg_val_sent",
]


class QRProtocolError(Exception):
    """Base exception for QR protocol errors."""


class QRPayloadExpired(QRProtocolError):
    """Raised when a QR payload has expired."""


class QRPayloadInvalid(QRProtocolError):
    """Raised when a QR payload is malformed or invalid."""


def _canonical_json(data: Dict[str, Any]) -> str:
    return json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def _encode_payload(data: Dict[str, Any]) -> str:
    canonical = _canonical_json(data)

    return base64.urlsafe_b64encode(
        canonical.encode("utf-8")
    ).decode("ascii")


def _decode_payload(encoded_payload: str) -> Dict[str, Any]:
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


def _get_features(transaction: Transaction) -> Dict[str, Any]:
    """
    Extract exactly the 8 USO behavioural features.
    """

    if transaction.context is None:
        raise QRPayloadInvalid(
            "Transaction context is required before QR generation"
        )

    features = transaction.context.additional_features or {}

    missing = [
        feature
        for feature in QR_FEATURES
        if feature not in features
    ]

    if missing:
        raise QRPayloadInvalid(
            f"Missing required QR features: {', '.join(missing)}"
        )

    return {
        feature: features[feature]
        for feature in QR_FEATURES
    }


def build_qr_payload(
    transaction: Transaction,
) -> Dict[str, Any]:
    """
    Build the QR payload.

    The payload contains ONLY the 8 USO behavioural features.
    """

    return _get_features(transaction)


def create_qr_payload(
    transaction: Transaction,
) -> Dict[str, Any]:
    """
    Build the 8-feature payload and add its integrity hash.
    """

    payload = build_qr_payload(transaction)

    payload_hash = hashlib.sha256(
        _canonical_json(payload).encode("utf-8")
    ).hexdigest()

    return {
        **payload,
        "payload_hash": payload_hash,
    }


def encode_qr_payload(
    transaction: Transaction,
) -> str:
    """
    Encode the 8-feature QR payload.
    """

    payload = create_qr_payload(transaction)

    return _encode_payload(payload)


def decode_qr_payload(
    encoded_payload: str,
) -> Dict[str, Any]:
    """
    Decode and validate the 8-feature QR payload.
    """

    payload = _decode_payload(encoded_payload)

    required_fields = set(QR_FEATURES) | {"payload_hash"}

    missing = required_fields - payload.keys()

    if missing:
        raise QRPayloadInvalid(
            f"Missing required fields: {sorted(missing)}"
        )

    unexpected = set(payload.keys()) - required_fields

    if unexpected:
        raise QRPayloadInvalid(
            f"Unexpected QR fields: {sorted(unexpected)}"
        )

    return payload


def verify_payload_hash(
    payload: Dict[str, Any],
) -> bool:
    """
    Verify that the 8-feature payload has not been modified.
    """

    received_hash = payload.get("payload_hash")

    if not received_hash:
        return False

    feature_payload = {
        feature: payload[feature]
        for feature in QR_FEATURES
    }

    calculated_hash = hashlib.sha256(
        _canonical_json(feature_payload).encode("utf-8")
    ).hexdigest()

    return calculated_hash == received_hash


def validate_expiry(
    payload: Dict[str, Any],
    now=None,
) -> None:
    """
    Kept for compatibility with the existing protocol.

    Expiry is now handled by the transaction/backend layer,
    because the QR itself contains only the 8 USO features.
    """

    return None


def validate_qr_payload(
    encoded_payload: str,
) -> Dict[str, Any]:
    """
    Validate the unsigned 8-feature QR payload.
    """

    payload = decode_qr_payload(encoded_payload)

    if not verify_payload_hash(payload):
        raise QRPayloadInvalid(
            "Payload integrity check failed"
        )

    return payload


# =========================================================
# SIGNED QR
# =========================================================

def create_signed_qr_payload(
    transaction: Transaction,
    private_key,
) -> Dict[str, Any]:
    """
    Create the 8-feature payload and digitally sign it.
    """

    payload = create_qr_payload(transaction)

    signature = sign_payload(
        payload,
        private_key,
    )

    return {
        "protocol_version": PROTOCOL_VERSION,
        "payload": payload,
        "signature": signature,
    }


def encode_signed_qr_payload(
    transaction: Transaction,
    private_key,
) -> str:
    """
    Encode the signed 8-feature QR package.
    """

    signed_package = create_signed_qr_payload(
        transaction,
        private_key,
    )

    return _encode_payload(signed_package)


def decode_signed_qr_payload(
    encoded_payload: str,
) -> Dict[str, Any]:
    """
    Decode a signed QR package.
    """

    package = _decode_payload(encoded_payload)

    required_fields = {
        "protocol_version",
        "payload",
        "signature",
    }

    missing = required_fields - package.keys()

    if missing:
        raise QRPayloadInvalid(
            f"Missing signed QR fields: {sorted(missing)}"
        )

    if package["protocol_version"] != PROTOCOL_VERSION:
        raise QRPayloadInvalid(
            f"Unsupported protocol version: "
            f"{package['protocol_version']}"
        )

    if not isinstance(package["payload"], dict):
        raise QRPayloadInvalid(
            "Signed QR payload must contain a JSON object"
        )

    if not isinstance(package["signature"], str):
        raise QRPayloadInvalid(
            "QR signature must be a string"
        )

    return package


def validate_signed_qr_payload(
    encoded_payload: str,
    public_key,
) -> Dict[str, Any]:
    """
    Validate the signed 8-feature QR package.

    Checks:
    1. Decode
    2. Protocol version
    3. Exactly 8 features
    4. Payload hash
    5. Digital signature
    """

    package = decode_signed_qr_payload(encoded_payload)

    payload = package["payload"]
    signature = package["signature"]

    required_fields = set(QR_FEATURES) | {"payload_hash"}

    missing = required_fields - payload.keys()

    if missing:
        raise QRPayloadInvalid(
            f"Missing QR features: {sorted(missing)}"
        )

    unexpected = set(payload.keys()) - required_fields

    if unexpected:
        raise QRPayloadInvalid(
            f"Unexpected QR fields: {sorted(unexpected)}"
        )

    if not verify_payload_hash(payload):
        raise QRPayloadInvalid(
            "Payload integrity check failed"
        )

    if not verify_signature(
        payload,
        signature,
        public_key,
    ):
        raise QRPayloadInvalid(
            "Digital signature verification failed"
        )

    return payload