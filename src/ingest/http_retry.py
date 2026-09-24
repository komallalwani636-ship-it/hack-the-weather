"""HTTP retry helper: 5s → 10s → 20s for 5xx/network; no retry on 4xx except 429."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Callable
import time

import requests

logger = logging.getLogger(__name__)

BACKOFF_SECONDS = (5, 10, 20)
MAX_ATTEMPTS = 3


def write_actions_summary(message: str) -> None:
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        return
    Path(summary).parent.mkdir(parents=True, exist_ok=True)
    with open(summary, "a", encoding="utf-8") as fh:
        fh.write(message.rstrip() + "\n")


def request_with_retry(
    method: str,
    url: str,
    *,
    sleep: Callable[[float], None] = time.sleep,
    session: requests.Session | None = None,
    timeout: float = 30,
    **kwargs,
) -> requests.Response:
    client = session or requests
    last_error: Exception | None = None
    response: requests.Response | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = client.request(method, url, timeout=timeout, **kwargs)
        except requests.RequestException as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS - 1:
                delay = BACKOFF_SECONDS[attempt]
                logger.warning("Network error on %s %s: %s; retry in %ss", method, url, exc, delay)
                sleep(delay)
                continue
            raise
        retryable = response.status_code == 429 or response.status_code >= 500
        if retryable and attempt < MAX_ATTEMPTS - 1:
            delay = BACKOFF_SECONDS[attempt]
            logger.warning(
                "HTTP %s on %s %s; retry in %ss",
                response.status_code,
                method,
                url,
                delay,
            )
            sleep(delay)
            continue
        return response
    if response is not None:
        return response
    if last_error:
        raise last_error
    raise RuntimeError("request_with_retry exhausted without a response")
