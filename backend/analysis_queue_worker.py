from __future__ import annotations

import os
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import requests


AnalysisCallback = Callable[[str, str, str], dict[str, Any]]


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnalysisQueueWorker:
    def __init__(self, analyze: AnalysisCallback) -> None:
        self.analyze = analyze
        self.supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        self.service_key = "".join(
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").split()
        )
        self.batch_size = _env_int("CBPR_QUEUE_BATCH_SIZE", 1, 1, 20)
        self.poll_seconds = _env_int("CBPR_QUEUE_POLL_SECONDS", 5, 1, 60)
        self.delay_seconds = _env_int("CBPR_DELAY_BETWEEN_ASSETS", 3, 3, 60)
        self.outputsize = _env_int("CBPR_OUTPUTSIZE", 300, 200, 5000)
        self._stop = threading.Event()

        if not self.supabase_url:
            raise RuntimeError("SUPABASE_URL is required by the queue worker")
        if not self.service_key:
            raise RuntimeError(
                "SUPABASE_SERVICE_ROLE_KEY is required by the queue worker"
            )

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.service_key,
            "Content-Type": "application/json",
        }
        if not self.service_key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.service_key}"
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
                f"Supabase {method} {path}: HTTP {response.status_code}: "
                f"{response.text[:1000]}"
            )
        return response.json() if response.content else None

    def _claim_jobs(self) -> list[dict[str, Any]]:
        rows = self._request(
            "POST",
            "/rest/v1/rpc/claim_analysis_jobs_iOS",
            body={"p_limit": self.batch_size},
        )
        return rows if isinstance(rows, list) else []

    def _fetch_asset(self, asset_id: str) -> dict[str, Any]:
        rows = self._request(
            "GET",
            "/rest/v1/assets_iOS",
            params={
                "select": "id,symbol,name,exchange,mic_code,asset_type",
                "id": f"eq.{asset_id}",
                "twelve_data_accessible": "eq.true",
                "cbpr_validated": "eq.true",
                "limit": "1",
            },
        )
        if not isinstance(rows, list) or not rows:
            raise RuntimeError("Actif absent ou indisponible")
        return rows[0]

    def _queue_filter(self, job: dict[str, Any]) -> dict[str, str]:
        return {
            "asset_id": f"eq.{job['asset_id']}",
            "timeframe": f"eq.{job['timeframe']}",
            "model_version": f"eq.{job['model_version']}",
        }

    def _complete_job(self, job: dict[str, Any]) -> None:
        self._request(
            "PATCH",
            "/rest/v1/analysis_queue_iOS",
            params=self._queue_filter(job),
            body={
                "status": "completed",
                "completed_at": _utc_now(),
                "locked_at": None,
                "last_error": None,
                "updated_at": _utc_now(),
            },
        )

    def _fail_job(self, job: dict[str, Any], error: Exception) -> None:
        attempts = max(1, int(job.get("attempts", 1) or 1))
        retry_seconds = min(300, 5 * (2 ** min(attempts - 1, 6)))
        available_at = datetime.now(timezone.utc) + timedelta(seconds=retry_seconds)
        self._request(
            "PATCH",
            "/rest/v1/analysis_queue_iOS",
            params=self._queue_filter(job),
            body={
                "status": "failed",
                "available_at": available_at.isoformat(),
                "locked_at": None,
                "last_error": str(error)[:2000],
                "updated_at": _utc_now(),
            },
        )

    @staticmethod
    def _source_datetime(response: dict[str, Any]) -> str:
        values = response.get("values")
        if isinstance(values, list) and values:
            last_value = values[-1]
            if isinstance(last_value, dict):
                value = str(last_value.get("datetime", "")).strip()
                if value:
                    return value
        raise RuntimeError("La réponse ne contient aucune bougie")

    def _latest_result(
        self,
        asset_id: str,
        timeframe: str,
        model_version: str,
    ) -> dict[str, Any] | None:
        rows = self._request(
            "GET",
            "/rest/v1/analysis_results_iOS",
            params={
                "select": "id,signal,source_candle_datetime,analyzed_at",
                "asset_id": f"eq.{asset_id}",
                "timeframe": f"eq.{timeframe}",
                "model_version": f"eq.{model_version}",
                "order": "analyzed_at.desc",
                "limit": "1",
            },
        )
        return rows[0] if isinstance(rows, list) and rows else None

    def _insert_run(self, asset_id: str, timeframe: str) -> str:
        run_id = str(uuid.uuid4())
        self._request(
            "POST",
            "/rest/v1/analysis_runs_iOS",
            body={
                "id": run_id,
                "asset_id": asset_id,
                "timeframe": timeframe,
                "status": "running",
            },
        )
        return run_id

    def _finish_run(
        self,
        run_id: str,
        started: float,
        status: str,
        error: Exception | None = None,
    ) -> None:
        body: dict[str, Any] = {
            "status": status,
            "finished_at": _utc_now(),
            "duration_ms": max(0, round((time.monotonic() - started) * 1000)),
            "error_code": type(error).__name__ if error else None,
            "error_message": str(error)[:2000] if error else None,
        }
        self._request(
            "PATCH",
            "/rest/v1/analysis_runs_iOS",
            params={"id": f"eq.{run_id}"},
            body=body,
        )

    def _store_market_data(
        self,
        job: dict[str, Any],
        response: dict[str, Any],
        source_datetime: str,
    ) -> None:
        quote = response.get("quote") if isinstance(response.get("quote"), dict) else {}
        current_price = float(quote.get("price", 0) or 0)
        change = float(quote.get("change", 0) or 0)
        self._request(
            "POST",
            "/rest/v1/asset_market_data_iOS",
            params={"on_conflict": "asset_id,timeframe"},
            body={
                "asset_id": job["asset_id"],
                "timeframe": job["timeframe"],
                "model_version": job["model_version"],
                "current_price": current_price,
                "previous_close": current_price - change,
                "change": change,
                "change_percent": float(quote.get("changePercent", 0) or 0),
                "currency": str(quote.get("currency", "") or ""),
                "chart": response.get("values") or [],
                "source_candle_datetime": source_datetime,
                "updated_at": _utc_now(),
            },
            prefer="resolution=merge-duplicates,return=minimal",
        )

    def _store_result(
        self,
        job: dict[str, Any],
        run_id: str,
        response: dict[str, Any],
        source_datetime: str,
        previous: dict[str, Any] | None,
    ) -> None:
        analysis = response.get("analysis")
        if not isinstance(analysis, dict):
            raise RuntimeError("Bloc analysis absent")
        signal = str(analysis.get("signal", "NEUTRE") or "NEUTRE").upper()
        score = max(0, min(100, int(analysis.get("score", 0) or 0)))
        previous_signal = str(previous.get("signal", "")) if previous else None
        payload = {
            "model": job["model_version"],
            "explanation": analysis.get("explanation") or {},
            "indicators": analysis.get("indicators") or {},
            "quote": response.get("quote") or {},
            "meta": response.get("meta") or {},
        }
        rows = self._request(
            "POST",
            "/rest/v1/analysis_results_iOS",
            body={
                "run_id": run_id,
                "asset_id": job["asset_id"],
                "timeframe": job["timeframe"],
                "model_version": job["model_version"],
                "source_candle_datetime": source_datetime,
                "signal": signal,
                "previous_signal": previous_signal,
                "score": score,
                "payload": payload,
                "analyzed_at": _utc_now(),
            },
            prefer="return=representation",
        )
        if not isinstance(rows, list) or not rows:
            raise RuntimeError("Insertion du résultat sans représentation")
        if previous_signal and previous_signal != signal:
            self._request(
                "POST",
                "/rest/v1/signal_events_iOS",
                body={
                    "analysis_result_id": rows[0]["id"],
                    "asset_id": job["asset_id"],
                    "timeframe": job["timeframe"],
                    "model_version": job["model_version"],
                    "source_candle_datetime": source_datetime,
                    "previous_signal": previous_signal,
                    "new_signal": signal,
                    "score": score,
                },
                prefer="resolution=ignore-duplicates,return=minimal",
            )

    def _process_job(self, job: dict[str, Any]) -> str:
        asset = self._fetch_asset(str(job["asset_id"]))
        symbol = str(asset.get("symbol", "")).strip()
        if not symbol:
            raise RuntimeError("Symbole manquant")

        started = time.monotonic()
        run_id = self._insert_run(str(job["asset_id"]), str(job["timeframe"]))
        try:
            response = self.analyze(
                symbol,
                str(job["timeframe"]),
                str(job["model_version"]),
            )
            source_datetime = self._source_datetime(response)
            self._store_market_data(job, response, source_datetime)
            previous = self._latest_result(
                str(job["asset_id"]),
                str(job["timeframe"]),
                str(job["model_version"]),
            )
            if not previous or previous.get("source_candle_datetime") != source_datetime:
                self._store_result(
                    job,
                    run_id,
                    response,
                    source_datetime,
                    previous,
                )
            self._finish_run(run_id, started, "succeeded")
            self._complete_job(job)
            return symbol
        except Exception as error:
            self._finish_run(run_id, started, "failed", error)
            raise

    def run_forever(self) -> None:
        print(
            "[QUEUE] Worker started "
            f"(batch={self.batch_size}, poll={self.poll_seconds}s, "
            f"delay={self.delay_seconds}s)"
        )
        while not self._stop.is_set():
            try:
                jobs = self._claim_jobs()
                if not jobs:
                    self._stop.wait(self.poll_seconds)
                    continue

                for index, job in enumerate(jobs):
                    try:
                        symbol = self._process_job(job)
                        print(f"[QUEUE] Completed {symbol} ({job['asset_id']})")
                    except Exception as error:
                        print(f"[QUEUE] Failed {job.get('asset_id')}: {error}")
                        try:
                            self._fail_job(job, error)
                        except Exception as queue_error:
                            print(f"[QUEUE] Could not release failed job: {queue_error}")

                    if index < len(jobs) - 1:
                        self._stop.wait(self.delay_seconds)
            except Exception as error:
                print(f"[QUEUE] Polling error: {error}")
                self._stop.wait(self.poll_seconds)


_worker_thread: threading.Thread | None = None


def start_analysis_queue_worker(analyze: AnalysisCallback) -> None:
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return

    worker = AnalysisQueueWorker(analyze)
    _worker_thread = threading.Thread(
        target=worker.run_forever,
        name="cbpr-analysis-queue",
        daemon=True,
    )
    _worker_thread.start()
