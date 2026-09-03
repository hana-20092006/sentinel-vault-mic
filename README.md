# SentinelVault

## Pre-Commitment Risk Intelligence & Hardware Authorization

SentinelVault is an **air-gapped, hardware-backed pre-commitment firewall** designed to protect financial transactions before they become irreversible.

It combines **contextual financial-risk intelligence**, **independent local TinyML anomaly detection**, **trusted transaction display**, and **cryptographically verified user authorization**.

---

## Problem

Modern financial systems primarily evaluate actions individually.

A transfer, new beneficiary, trade, invoice, login, or account change may appear legitimate when examined on its own. However, the actual risk may exist in the surrounding context:

- A beneficiary was changed shortly before a large transfer.
- The account was accessed from a new device.
- Several unusual actions occurred in sequence.
- A transaction is significantly larger than the user's normal behaviour.
- Multiple individually legitimate entities form a suspicious network.
- An apparently legitimate instruction is inconsistent with its surrounding context.

Existing controls often identify these signals separately, while the actual harm emerges from their combination.

### Core Problem

How do we identify **contextual, sequential, behavioural, and network-based risk** and surface it **before the user makes an irreversible financial commitment**, without unnecessarily blocking legitimate activity?

---

## Our Solution

SentinelVault acts as a **pre-commitment security boundary** between an online financial system and final transaction authorization.

It combines three major layers:

### 1. Risk Intelligence

A backend ML/risk engine analyzes the transaction together with its surrounding context.

It can consider:

- Transaction amount and type
- Historical transaction behaviour
- Beneficiary history
- Device and login behaviour
- Recent account changes
- Transaction sequences
- Behavioural deviations
- Counterparty relationships
- Network-level signals

The system produces both a risk assessment and structured explanations for why the transaction was flagged.

### 2. Trusted Hardware Boundary

The air-gapped SentinelVault independently receives and verifies the transaction.

The device:

- Verifies the backend signature
- Validates the transaction
- Performs freshness and replay checks
- Runs a local TinyML anomaly check
- Displays the transaction on a trusted display
- Requires PIN authentication
- Requires explicit physical approval or rejection

### 3. Cryptographic Authorization

After explicit user approval, the secure element signs the **exact transaction**.

The backend verifies the hardware signature before execution.

---



