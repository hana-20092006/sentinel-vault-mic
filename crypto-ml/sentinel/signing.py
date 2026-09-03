import base64
import json
from typing import Any, Dict, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.exceptions import InvalidSignature


class SignatureError(Exception):
    """Base exception for SentinelVault signing errors."""


def canonical_json(data: Dict[str, Any]) -> bytes:
    """
    Convert a payload into deterministic JSON bytes.

    Both signing and verification MUST use the exact same
    canonical representation.
    """

    return json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def generate_key_pair() -> Tuple[Ed25519PrivateKey, Ed25519PublicKey]:
    """
    Generate an Ed25519 signing key pair.

    For the hackathon MVP the keys are generated in memory.
    Production deployment should use a secure key-management
    system or hardware-backed key storage.
    """

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    return private_key, public_key


def sign_payload(
    payload: Dict[str, Any],
    private_key: Ed25519PrivateKey,
) -> str:
    """
    Sign the canonical transaction payload.

    Returns a Base64-encoded Ed25519 signature.
    """

    try:
        message = canonical_json(payload)

        signature = private_key.sign(message)

        return base64.urlsafe_b64encode(
            signature
        ).decode("ascii")

    except Exception as exc:
        raise SignatureError(
            "Failed to sign SentinelVault payload"
        ) from exc


def verify_signature(
    payload: Dict[str, Any],
    signature: str,
    public_key: Ed25519PublicKey,
) -> bool:
    """
    Verify that a payload was signed by the trusted
    SentinelVault private key.
    """

    try:
        message = canonical_json(payload)

        decoded_signature = base64.urlsafe_b64decode(
            signature.encode("ascii")
        )

        public_key.verify(
            decoded_signature,
            message,
        )

        return True

    except (InvalidSignature, ValueError, TypeError):
        return False


def public_key_to_base64(
    public_key: Ed25519PublicKey,
) -> str:
    """
    Export the public key as Base64.

    The ESP32 teammate can use the corresponding public key
    to verify backend signatures.
    """

    raw_key = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )

    return base64.urlsafe_b64encode(
        raw_key
    ).decode("ascii")