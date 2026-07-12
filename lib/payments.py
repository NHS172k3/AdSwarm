from __future__ import annotations

import asyncio
import logging
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Literal, Protocol

from .config import CONFIG

logger = logging.getLogger(__name__)

ConfirmCallback = Callable[["PayReceipt"], Awaitable[None] | None]


@dataclass
class PayReceipt:
    payment_id: str
    tx_hash: str
    explorer_url: str
    status: Literal["pending"] = "pending"
    kind: Literal["deposit", "fee", "adbuy"] = "fee"
    from_label: str = ""
    to_label: str = ""
    from_address: str = ""
    to_address: str = ""
    amount_usdc: float = 0.0
    memo: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


class PaymentProvider(Protocol):
    async def pay(
        self,
        from_party: str,
        to_address: str,
        amount_usdc: float,
        memo: str,
        *,
        to_label: str = "",
        kind: Literal["deposit", "fee", "adbuy"] = "fee",
        metadata: dict[str, Any] | None = None,
    ) -> PayReceipt: ...

    async def settle(self) -> None: ...


def _random_tx_hash() -> str:
    return "0x" + secrets.token_hex(32)


def _explorer_url(tx_hash: str) -> str:
    return f"{CONFIG.explorer_base}/tx/{tx_hash}"


class MockPaymentProvider:
    def __init__(
        self,
        *,
        treasury_address: str,
        on_confirmed: ConfirmCallback | None = None,
        confirm_delay_ms: int | None = None,
        explorer_base: str | None = None,
    ) -> None:
        self.treasury_address = treasury_address
        self._on_confirmed = on_confirmed
        self._confirm_delay_ms = confirm_delay_ms or CONFIG.mock_confirm_delay_ms
        self._explorer_base = explorer_base or CONFIG.explorer_base
        self._pending: dict[str, PayReceipt] = {}
        self._tasks: set[asyncio.Task[None]] = set()

    async def pay(
        self,
        from_party: str,
        to_address: str,
        amount_usdc: float,
        memo: str,
        *,
        to_label: str = "",
        kind: Literal["deposit", "fee", "adbuy"] = "fee",
        metadata: dict[str, Any] | None = None,
    ) -> PayReceipt:
        tx_hash = _random_tx_hash()
        receipt = PayReceipt(
            payment_id=tx_hash,
            tx_hash=tx_hash,
            explorer_url=f"{self._explorer_base}/tx/{tx_hash}",
            kind=kind,
            from_label=from_party,
            to_label=to_label or to_address,
            from_address=from_party if from_party.startswith("0x") else "",
            to_address=to_address,
            amount_usdc=round(amount_usdc, 6),
            memo=memo,
            metadata=metadata or {},
        )
        self._pending[receipt.payment_id] = receipt
        task = asyncio.create_task(self._confirm_later(receipt.payment_id))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return receipt

    async def _confirm_later(self, payment_id: str) -> None:
        await asyncio.sleep(self._confirm_delay_ms / 1000)
        receipt = self._pending.get(payment_id)
        if receipt is None:
            return
        if self._on_confirmed:
            maybe = self._on_confirmed(receipt)
            if asyncio.iscoroutine(maybe):
                await maybe
        self._pending.pop(payment_id, None)

    async def settle(self) -> None:
        if not self._tasks:
            return
        await asyncio.gather(*list(self._tasks), return_exceptions=True)


class OnChainSinglePaymentProvider(MockPaymentProvider):
    def __init__(
        self,
        *,
        treasury_address: str,
        on_confirmed: ConfirmCallback | None = None,
        confirm_delay_ms: int | None = None,
        explorer_base: str | None = None,
    ) -> None:
        super().__init__(
            treasury_address=treasury_address,
            on_confirmed=on_confirmed,
            confirm_delay_ms=confirm_delay_ms,
            explorer_base=explorer_base,
        )

    async def pay(
        self,
        from_party: str,
        to_address: str,
        amount_usdc: float,
        memo: str,
        *,
        to_label: str = "",
        kind: Literal["deposit", "fee", "adbuy"] = "fee",
        metadata: dict[str, Any] | None = None,
    ) -> PayReceipt:
        receipt = await super().pay(
            from_party,
            to_address,
            amount_usdc,
            memo,
            to_label=to_label,
            kind=kind,
            metadata={"transport": "onchain-single", **(metadata or {})},
        )
        return receipt


def build_payment_provider(
    *,
    mode: str,
    treasury_address: str,
    on_confirmed: ConfirmCallback | None = None,
) -> tuple[PaymentProvider, str]:
    resolved_mode = mode
    if mode == "onchain-single":
        if CONFIG.rpc_url and CONFIG.usdc_address and treasury_address:
            return (
                OnChainSinglePaymentProvider(
                    treasury_address=treasury_address,
                    on_confirmed=on_confirmed,
                    confirm_delay_ms=CONFIG.mock_confirm_delay_ms,
                    explorer_base=CONFIG.explorer_base,
                ),
                resolved_mode,
            )
        logger.warning("onchain-single requested but RPC/USDC/Treasury env is incomplete; using mock provider")
        resolved_mode = "mock"
    return (
        MockPaymentProvider(
            treasury_address=treasury_address,
            on_confirmed=on_confirmed,
            confirm_delay_ms=CONFIG.mock_confirm_delay_ms,
            explorer_base=CONFIG.explorer_base,
        ),
        resolved_mode,
    )
