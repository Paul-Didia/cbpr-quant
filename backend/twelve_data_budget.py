"""Shared provider budget in Supabase, never a per-process rate limit.

Every outgoing attempt needs its own reservation. RPC failure fails closed:
no provider call can bypass the budget during an outage or missing migration.
"""
from __future__ import annotations

import math
import os
import time
from typing import Any

import requests


class TwelveDataError(Exception):
    pass


class TwelveDataDeferredError(TwelveDataError):
    def __init__(self, message: str, retry_after: float = 65) -> None:
        super().__init__(message)
        self.retry_after = max(5, min(3600, math.ceil(retry_after)))


def _rpc(name: str, body: dict[str, Any]) -> dict[str, Any]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = "".join(os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").split())
    if not url or not key:
        raise TwelveDataDeferredError("Twelve Data budget: Supabase configuration missing")
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    try:
        response = requests.post(
            f"{url}/rest/v1/rpc/{name}", json=body, headers=headers, timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Unexpected budget RPC response")
        return data
    except (requests.RequestException, ValueError) as error:
        # Never expose URLs/headers/keys in an exception or fall back locally.
        raise TwelveDataDeferredError("Twelve Data budget temporarily unavailable") from error


def acquire(endpoint: str) -> None:
    # Bounded waiting also keeps API threads and queue leases from hanging.
    deadline = time.monotonic() + 10
    logged = False
    while True:
        data = _rpc("reserve_twelve_data_credit_iOS", {"p_endpoint": endpoint})
        if data.get("granted") is True:
            return
        try:
            wait = max(0.1, float(data["retry_after"]))
            if not math.isfinite(wait):
                raise ValueError("Invalid wait")
        except (KeyError, TypeError, ValueError) as error:
            raise TwelveDataDeferredError("Invalid Twelve Data budget response") from error
        if not logged:
            print(f"[TWELVE_BUDGET] Waiting endpoint={endpoint} retry_in={math.ceil(wait)}s", flush=True)
            logged = True
        if time.monotonic() + wait > deadline:
            raise TwelveDataDeferredError("Twelve Data budget: request deferred", wait)
        time.sleep(min(wait, 5))


def pause(seconds: float) -> None:
    seconds = max(65, min(3600, math.ceil(seconds)))
    _rpc("pause_twelve_data_budget_iOS", {"p_seconds": seconds})
    print(f"[TWELVE_BUDGET] Provider rate limit: shared cooldown {seconds}s", flush=True)
