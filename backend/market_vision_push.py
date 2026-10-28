"""Delivery of personal vision results using the private Supabase queue.

No credentials or device tokens are logged. The transport is the existing APNs worker.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
import re
import time
from typing import Any
from uuid import UUID


class MarketVisionPushDispatcher:
    def __init__(self, transport: Any) -> None:
        self.transport = transport

    @staticmethod
    def _payload(item: dict[str, Any]) -> dict[str, Any]:
        direction = item["direction"]
        outcome = item["outcome"]
        start = Decimal(str(item["starting_price"]))
        close = Decimal(str(item["closing_price"]))
        if not start.is_finite() or not close.is_finite() or start <= 0 or close <= 0:
            raise ValueError("invalid_vision_prices")
        if direction not in {"up", "down"}:
            raise ValueError("invalid_vision_direction")
        expected = ("unchanged" if close == start else
                    "confirmed" if ((direction == "up" and close > start) or
                                    (direction == "down" and close < start)) else "not_confirmed")
        if outcome != expected:
            raise ValueError("inconsistent_vision_outcome")
        vision_id = str(UUID(str(item["vision_id"])))
        asset_id = str(UUID(str(item["asset_id"])))
        change = (close / start - 1) * 100
        percent = f"{change:+.2f}".replace(".", ",") + " %"
        label = "hausse" if direction == "up" else "baisse"
        if outcome == "unchanged":
            body = "Cours inchangé à l’échéance de votre vision de 24 h."
        else:
            result = "confirmée" if outcome == "confirmed" else "non confirmée"
            body = f"Votre vision de {label} est {result}. Cours retenu à 24 h : {percent}."
        symbol = str(item.get("symbol") or "Actif")[:40]
        return {
            "aps": {"alert": {"title": f"{symbol} · Vision terminée", "body": body}, "sound": "default"},
            "type": "market_vision_settled",
            "vision_id": vision_id,
            "asset_id": asset_id,
            "outcome": outcome,
        }

    @staticmethod
    def _error_code(error: str | None) -> str | None:
        if not error:
            return None
        # Keep short provider codes only; never persist HTTP bodies or tokens.
        return error if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", error) else "APNsRejected"

    def run_once(self) -> dict[str, int]:
        stats = {"sent": 0, "failed": 0, "stale_ack": 0, "ack_failed": 0}
        # Claim ONE delivery immediately before sending. A large prefetched batch
        # could outlive the five-minute lease while other devices are processed.
        for _ in range(min(10, max(1, self.transport.batch_size))):
            rows = self.transport._request(
                "POST", "/rest/v1/rpc/claim_market_vision_push_iOS",
                body={"p_limit": 1, "p_environment": self.transport.environment},
            )
            if not isinstance(rows, list):
                raise ValueError("invalid_vision_claim_response")
            if not rows:
                break
            if len(rows) != 1:
                raise ValueError("unexpected_vision_claim_size")
            item = rows[0]
            try:
                payload = self._payload(item)
                if item.get("environment") not in {"sandbox", "production"}:
                    raise ValueError("invalid_vision_environment")
                if self.transport.environment != "both" and item["environment"] != self.transport.environment:
                    raise ValueError("unexpected_vision_environment")
                status, apns_id, error = self.transport._send(
                    {"device_token": item["device_token"], "environment": item["environment"]},
                    payload,
                    collapse_id=f"vision:{payload['vision_id']}",
                    expiration=int(time.time()) + 3600,
                )
                if status not in {"sent", "failed", "invalid_token"}:
                    raise ValueError("invalid_vision_delivery_status")
                error = self._error_code(error)
            except (ValueError, InvalidOperation, KeyError, TypeError):
                status, apns_id, error = "failed", None, "InvalidVisionPayload"
            except Exception:
                status, apns_id, error = "failed", None, "APNsTransportError"
            try:
                acknowledged = self.transport._request(
                    "POST", "/rest/v1/rpc/finish_market_vision_push_iOS",
                    body={"p_delivery_id": item["delivery_id"], "p_lease_token": item["lease_token"],
                          "p_status": status, "p_error_code": error, "p_apns_id": apns_id},
                )
                if acknowledged is True:
                    stats["sent" if status == "sent" else "failed"] += 1
                else:
                    stats["stale_ack"] += 1
            except Exception:
                # Leave the lease in place. Do not overwrite an uncertain accepted send
                # with a second acknowledgement pretending Apple rejected it.
                stats["ack_failed"] += 1
        return stats
