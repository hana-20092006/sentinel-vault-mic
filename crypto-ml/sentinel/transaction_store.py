from datetime import datetime, timezone
from threading import Lock
from typing import Dict, Optional

from .models import (
    RiskAssessment,
    Transaction,
    TransactionContext,
    TransactionStatus,
    TransactionCreate,
)


class InvalidTransactionState(Exception):
    """Raised when an invalid transaction state transition is requested."""


class TransactionNotFound(Exception):
    """Raised when a transaction does not exist."""


# Allowed transaction state transitions.
ALLOWED_TRANSITIONS = {
    TransactionStatus.CREATED: {
        TransactionStatus.ANALYZED,
        TransactionStatus.BLOCKED,
        TransactionStatus.EXPIRED,
    },
    TransactionStatus.ANALYZED: {
        TransactionStatus.QR_GENERATED,
        TransactionStatus.BLOCKED,
        TransactionStatus.EXPIRED,
    },
    TransactionStatus.QR_GENERATED: {
        TransactionStatus.SCANNED,
        TransactionStatus.EXPIRED,
        TransactionStatus.BLOCKED,
    },
    TransactionStatus.SCANNED: {
        TransactionStatus.AWAITING_APPROVAL,
        TransactionStatus.BLOCKED,
        TransactionStatus.EXPIRED,
    },
    TransactionStatus.AWAITING_APPROVAL: {
        TransactionStatus.APPROVED,
        TransactionStatus.REJECTED,
        TransactionStatus.BLOCKED,
        TransactionStatus.EXPIRED,
    },
    TransactionStatus.APPROVED: {
        TransactionStatus.EXECUTED,
    },
    TransactionStatus.REJECTED: set(),
    TransactionStatus.BLOCKED: set(),
    TransactionStatus.EXECUTED: set(),
    TransactionStatus.EXPIRED: set(),
}


class TransactionStore:
    """
    In-memory transaction store for the SentinelVault MVP.

    This is intentionally simple for the hackathon.
    It can later be replaced with PostgreSQL/Redis without
    changing the transaction API.
    """

    def __init__(self):
        self._transactions: Dict[str, Transaction] = {}
        self._lock = Lock()

    def create(self, transaction: Transaction) -> Transaction:
        """Store a new transaction."""

        with self._lock:
            if transaction.transaction_id in self._transactions:
                raise ValueError(
                    f"Transaction {transaction.transaction_id} already exists"
                )

            self._transactions[transaction.transaction_id] = transaction
            return transaction

    def get(self, transaction_id: str) -> Transaction:
        """Retrieve a transaction by ID."""

        with self._lock:
            transaction = self._transactions.get(transaction_id)

            if transaction is None:
                raise TransactionNotFound(
                    f"Transaction {transaction_id} not found"
                )

            return transaction

    def update_status(
        self,
        transaction_id: str,
        new_status: TransactionStatus,
    ) -> Transaction:
        """Safely transition a transaction to a new state."""

        with self._lock:
            transaction = self._transactions.get(transaction_id)

            if transaction is None:
                raise TransactionNotFound(
                    f"Transaction {transaction_id} not found"
                )

            current_status = transaction.status

            if new_status == current_status:
                return transaction

            allowed = ALLOWED_TRANSITIONS.get(current_status, set())

            if new_status not in allowed:
                raise InvalidTransactionState(
                    f"Invalid transition: "
                    f"{current_status.value} -> {new_status.value}"
                )

            transaction.status = new_status
            return transaction

    def attach_context(
        self,
        transaction_id: str,
        context: TransactionContext,
    ) -> Transaction:
        """Attach contextual transaction features."""

        with self._lock:
            transaction = self.get(transaction_id)
            transaction.context = context
            return transaction

    def attach_risk(
        self,
        transaction_id: str,
        risk: RiskAssessment,
    ) -> Transaction:
        """Attach the backend risk assessment."""

        with self._lock:
            transaction = self.get(transaction_id)
            transaction.risk = risk
            return transaction

    def list_transactions(self) -> list[Transaction]:
        """Return all transactions."""

        with self._lock:
            return list(self._transactions.values())

    def delete_all(self) -> None:
        """Clear the store. Useful for tests."""

        with self._lock:
            self._transactions.clear()


def create_transaction(
    data: TransactionCreate,
    transaction_id: str,
    expires_at: datetime,
) -> Transaction:
    """
    Convert an incoming TransactionCreate request into
    the internal SentinelVault Transaction object.
    """

    now = datetime.now(timezone.utc)

    return Transaction(
        transaction_id=transaction_id,
        sender=data.sender,
        destination=data.destination,
        amount=data.amount,
        currency=data.currency.upper(),
        transaction_type=data.transaction_type,
        device_id=data.device_id,
        timestamp=now,
        created_at=now,
        expires_at=expires_at,
        status=TransactionStatus.CREATED,
    )


# Shared store instance for the MVP.
transaction_store = TransactionStore()