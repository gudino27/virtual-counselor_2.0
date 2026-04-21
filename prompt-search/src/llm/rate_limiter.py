import threading
import time


class TokenBucketRateLimiter:
    """
    Thread-safe token bucket rate limiter.
    Refills at a constant rate; blocks callers when the bucket is empty.
    """

    def __init__(self, requests_per_minute: int = 60):
        self._capacity = float(requests_per_minute)
        self._tokens = float(requests_per_minute)
        self._refill_rate = requests_per_minute / 60.0  # tokens per second
        self._last_refill = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self._capacity, self._tokens + elapsed * self._refill_rate)
        self._last_refill = now

    def acquire(self, tokens: int = 1):
        while True:
            with self._lock:
                self._refill()
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
            # sleep outside the lock to avoid blocking other threads
            time.sleep(0.05)
