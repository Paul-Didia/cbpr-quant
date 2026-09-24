from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import jwt
import requests


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default

    return max(minimum, min(maximum, value))


class PushNotificationWorker:
    def __init__(self) -> None:
        self.supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        self.service_key = "".join(
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").split()
        )

        self.key_id = os.getenv("APNS_KEY_ID", "").strip()
        self.team_id = os.getenv("APNS_TEAM_ID", "").strip()
        self.bundle_id = os.getenv("APNS_BUNDLE_ID", "").strip()
        self.private_key_path = os.getenv(
            "APNS_PRIVATE_KEY_PATH",
            "",
        ).strip()

        self.environment = os.getenv(
            "APNS_ENVIRONMENT",
            "sandbox",
        ).strip().lower()

        self.poll_seconds = _env_int(
            "APNS_POLL_SECONDS",
            5,
            1,
            60,
        )

        self.batch_size = _env_int(
            "APNS_BATCH_SIZE",
            10,
            1,
            50,
        )

        self.max_delivery_attempts = _env_int(
            "APNS_MAX_ATTEMPTS",
            5,
            1,
            10,
        )

        self._stop = threading.Event()
        self._jwt: str | None = None
        self._jwt_created_at = 0.0

        required = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": self.service_key,
            "APNS_KEY_ID": self.key_id,
            "APNS_TEAM_ID": self.team_id,
            "APNS_BUNDLE_ID": self.bundle_id,
            "APNS_PRIVATE_KEY_PATH": self.private_key_path,
        }

        missing = [
            name
            for name, value in required.items()
            if not value
        ]

        if missing:
            raise RuntimeError(
                f"Missing push configuration: {', '.join(missing)}"
            )

        if self.environment not in {
            "sandbox",
            "production",
            "both",
        }:
            raise RuntimeError(
                "APNS_ENVIRONMENT must be sandbox, production, or both"
            )

        self.private_key = Path(
            self.private_key_path
        ).read_text(encoding="utf-8")

        self.apns = httpx.Client(
            http2=True,
            timeout=20.0,
        )

    def _headers(
        self,
        prefer: str | None = None,
    ) -> dict[str, str]:
        headers = {
            "apikey": self.service_key,
            "Content-Type": "application/json",
        }

        if not self.service_key.startswith("sb_secret_"):
            headers["Authorization"] = (
                f"Bearer {self.service_key}"
            )

        if prefer:
            headers["Prefer"] = prefer

        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        body: Any | None = None,
        prefer: str | None = None,
    ) -> Any:
        response = requests.request(
            method,
            f"{self.supabase_url}{path}",
            params=params,
            json=body,
            headers=self._headers(prefer),
            timeout=30,
        )

        if response.status_code >= 400:
            raise RuntimeError(
                f"Supabase {method} {path}: "
                f"HTTP {response.status_code}: "
                f"{response.text[:1000]}"
            )

        return response.json() if response.content else None

    def _claim_events(self) -> list[dict[str, Any]]:
        rows = self._request(
            "POST",
            "/rest/v1/rpc/claim_signal_events_iOS",
            body={
                "p_limit": self.batch_size,
            },
        )

        return rows if isinstance(rows, list) else []

    def _asset(
        self,
        asset_id: str,
    ) -> dict[str, Any]:
        rows = self._request(
            "GET",
            "/rest/v1/assets_iOS",
            params={
                "select": "id,symbol,name",
                "id": f"eq.{asset_id}",
                "limit": "1",
            },
        )

        if not isinstance(rows, list) or not rows:
            raise RuntimeError(
                f"Asset {asset_id} not found"
            )

        return rows[0]

    def _eligible_devices(
        self,
        asset_id: str,
    ) -> list[dict[str, Any]]:
        favorites = self._request(
            "GET",
            "/rest/v1/favorites_iOS",
            params={
                "select": "user_id",
                "asset_id": f"eq.{asset_id}",
            },
        )

        user_ids = {
            str(row["user_id"])
            for row in favorites or []
            if isinstance(row, dict) and row.get("user_id")
        }

        if not user_ids:
            return []

        encoded_users = ",".join(
            sorted(user_ids)
        )

        profiles = self._request(
            "GET",
            "/rest/v1/profiles_iOS",
            params={
                "select": "user_id",
                "user_id": f"in.({encoded_users})",
                "signal_notifications_enabled": "eq.true",
            },
        )

        enabled_users = {
            str(row["user_id"])
            for row in profiles or []
            if isinstance(row, dict) and row.get("user_id")
        }

        if not enabled_users:
            return []

        params = {
            "select": (
                "id,user_id,device_token,environment"
            ),
            "user_id": (
                f"in.({','.join(sorted(enabled_users))})"
            ),
            "notifications_enabled": "eq.true",
        }

        if self.environment != "both":
            params["environment"] = (
                f"eq.{self.environment}"
            )

        rows = self._request(
            "GET",
            "/rest/v1/push_devices_iOS",
            params=params,
        )

        return rows if isinstance(rows, list) else []

    def _prepare_deliveries(
        self,
        event_id: str,
        devices: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not devices:
            return []

        self._request(
            "POST",
            "/rest/v1/push_deliveries_iOS",
            body=[
                {
                    "event_id": event_id,
                    "device_id": str(device["id"]),
                }
                for device in devices
            ],
            prefer=(
                "resolution=ignore-duplicates,"
                "return=minimal"
            ),
        )

        rows = self._request(
            "GET",
            "/rest/v1/push_deliveries_iOS",
            params={
                "select": (
                    "event_id,device_id,status,attempts"
                ),
                "event_id": f"eq.{event_id}",
                "status": "in.(pending,failed)",
                "attempts": (
                    f"lt.{self.max_delivery_attempts}"
                ),
            },
        )

        return rows if isinstance(rows, list) else []

    def _provider_token(self) -> str:
        now = time.time()

        if (
            self._jwt
            and now - self._jwt_created_at < 45 * 60
        ):
            return self._jwt

        encoded = jwt.encode(
            {
                "iss": self.team_id,
                "iat": int(now),
            },
            self.private_key,
            algorithm="ES256",
            headers={
                "kid": self.key_id,
            },
        )

        self._jwt = encoded
        self._jwt_created_at = now

        return encoded

    @staticmethod
    def _signal_label(signal: str) -> str:
        normalized = signal.strip().upper()

        return {
            # Ancienne terminologie :
            "ACHAT": "Opportunité",
            "VENTE": "Risque",

            # Terminologie actuelle :
            "OPPORTUNITE": "Opportunité",
            "OPPORTUNITÉ": "Opportunité",
            "NEUTRE": "Neutre",
            "RISQUE": "Risque",
        }.get(
            normalized,
            signal.title(),
        )

    def _payload(
        self,
        event: dict[str, Any],
        asset: dict[str, Any],
    ) -> dict[str, Any]:
        symbol = str(
            asset.get("symbol") or "Actif"
        )

        previous = self._signal_label(
            str(event.get("previous_signal") or "")
        )

        current = self._signal_label(
            str(event.get("new_signal") or "")
        )

        score = event.get("score")

        score_suffix = (
            f" · Score {score}/100"
            if score is not None
            else ""
        )

        return {
            "aps": {
                "alert": {
                    "title": (
                        f"{symbol} passe en {current}"
                    ),
                    "body": (
                        f"{previous} → {current}"
                        f"{score_suffix}"
                    ),
                },
                "sound": "default",
            },
            "asset_id": str(event["asset_id"]),
            "symbol": symbol,
            "signal": str(
                event.get("new_signal") or ""
            ),
            "timeframe": str(
                event.get("timeframe") or "4h"
            ),
        }

    def _send(
        self,
        device: dict[str, Any],
        payload: dict[str, Any],
    ) -> tuple[
        str,
        str | None,
        str | None,
    ]:
        environment = str(
            device["environment"]
        )

        host = (
            "api.sandbox.push.apple.com"
            if environment == "sandbox"
            else "api.push.apple.com"
        )

        response = self.apns.post(
            (
                f"https://{host}/3/device/"
                f"{device['device_token']}"
            ),
            content=json.dumps(
                payload,
                separators=(",", ":"),
            ).encode("utf-8"),
            headers={
                "authorization": (
                    f"bearer {self._provider_token()}"
                ),
                "apns-topic": self.bundle_id,
                "apns-push-type": "alert",
                "apns-priority": "10",
            },
        )

        apns_id = response.headers.get(
            "apns-id"
        )

        if response.status_code == 200:
            return "sent", apns_id, None

        try:
            reason = str(
                response.json().get("reason")
                or response.text
            )
        except ValueError:
            reason = (
                response.text
                or f"HTTP {response.status_code}"
            )

        invalid_reasons = {
            "BadDeviceToken",
            "DeviceTokenNotForTopic",
            "Unregistered",
        }

        status = (
            "invalid_token"
            if (
                response.status_code == 410
                or reason in invalid_reasons
            )
            else "failed"
        )

        return (
            status,
            apns_id,
            reason[:1000],
        )

    def _update_delivery(
        self,
        event_id: str,
        device_id: str,
        status: str,
        attempts: int,
        apns_id: str | None,
        error: str | None,
    ) -> None:
        self._request(
            "PATCH",
            "/rest/v1/push_deliveries_iOS",
            params={
                "event_id": f"eq.{event_id}",
                "device_id": f"eq.{device_id}",
            },
            body={
                "status": status,
                "attempts": attempts,
                "apns_id": apns_id,
                "last_error": error,
                "sent_at": (
                    _utc_now()
                    if status == "sent"
                    else None
                ),
                "updated_at": _utc_now(),
            },
        )

    def _disable_invalid_device(
        self,
        device_id: str,
    ) -> None:
        self._request(
            "PATCH",
            "/rest/v1/push_devices_iOS",
            params={
                "id": f"eq.{device_id}",
            },
            body={
                "notifications_enabled": False,
                "updated_at": _utc_now(),
            },
        )

    def _finish_event(
        self,
        event_id: str,
        status: str,
        error: str | None = None,
    ) -> None:
        self._request(
            "PATCH",
            "/rest/v1/signal_events_iOS",
            params={
                "id": f"eq.{event_id}",
            },
            body={
                "delivery_status": status,
                "processed_at": _utc_now(),
                "locked_at": None,
                "error_message": error,
            },
        )

    def _process(
        self,
        event: dict[str, Any],
    ) -> None:
        event_id = str(event["id"])
        asset_id = str(event["asset_id"])

        asset = self._asset(asset_id)
        devices = self._eligible_devices(asset_id)

        if not devices:
            self._finish_event(
                event_id,
                "sent",
                "No eligible devices",
            )
            return

        device_by_id = {
            str(device["id"]): device
            for device in devices
        }

        deliveries = self._prepare_deliveries(
            event_id,
            devices,
        )

        payload = self._payload(
            event,
            asset,
        )

        sent = 0
        failed = 0

        for delivery in deliveries:
            device_id = str(
                delivery["device_id"]
            )

            device = device_by_id.get(
                device_id
            )

            if not device:
                continue

            status, apns_id, error = self._send(
                device,
                payload,
            )

            attempts = (
                int(
                    delivery.get("attempts", 0)
                    or 0
                )
                + 1
            )

            self._update_delivery(
                event_id,
                device_id,
                status,
                attempts,
                apns_id,
                error,
            )

            if status == "sent":
                sent += 1
            else:
                failed += 1

                if status == "invalid_token":
                    self._disable_invalid_device(
                        device_id
                    )

        if failed == 0:
            self._finish_event(
                event_id,
                "sent",
            )
        elif sent > 0:
            self._finish_event(
                event_id,
                "partial",
                f"{failed} delivery failure(s)",
            )
        else:
            self._finish_event(
                event_id,
                "failed",
                "All deliveries failed",
            )

    def run_forever(self) -> None:
        print(
            "[PUSH] Worker started "
            f"(environment={self.environment}, "
            f"batch={self.batch_size}, "
            f"poll={self.poll_seconds}s)"
        )

        while not self._stop.is_set():
            try:
                events = self._claim_events()

                if not events:
                    self._stop.wait(
                        self.poll_seconds
                    )
                    continue

                for event in events:
                    try:
                        self._process(event)

                        print(
                            "[PUSH] Processed event "
                            f"{event['id']}"
                        )
                    except Exception as error:
                        print(
                            "[PUSH] Event "
                            f"{event.get('id')} "
                            f"failed: {error}"
                        )

                        try:
                            self._finish_event(
                                str(event["id"]),
                                "failed",
                                str(error)[:1000],
                            )
                        except Exception as update_error:
                            print(
                                "[PUSH] Could not "
                                "release event: "
                                f"{update_error}"
                            )

            except Exception as error:
                print(
                    f"[PUSH] Polling error: {error}"
                )

                self._stop.wait(
                    self.poll_seconds
                )


_worker_thread: threading.Thread | None = None


def start_push_notification_worker() -> None:
    global _worker_thread

    if (
        _worker_thread
        and _worker_thread.is_alive()
    ):
        return

    worker = PushNotificationWorker()

    _worker_thread = threading.Thread(
        target=worker.run_forever,
        name="cbpr-push-notifications",
        daemon=True,
    )

    _worker_thread.start()
