"""Log redaction: credentials and tokens never reach log output, including exception tracebacks."""

import logging
import re

_PATTERNS = [
    # Authorization headers and bare scheme values.
    (re.compile(r"\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{6,}", re.IGNORECASE), r"\1 [REDACTED]"),
    # key=value, key: value and "key": "value" for secret-bearing keys (form bodies, JSON, query strings).
    (
        re.compile(
            r"""(?ix)
            (["']?\b(?:access_token|refresh_token|id_token|client_secret|password|passwd|api_key|apikey|authorization)\b["']?
            \s*[:=]\s*["']?)
            ([^"'&\s,}]+)
            """
        ),
        r"\1[REDACTED]",
    ),
]

REDACTED = "[REDACTED]"


def redact(text: str, secrets: list[str] | tuple[str, ...] = ()) -> str:
    for secret in sorted((s for s in secrets if s and len(s) >= 4), key=len, reverse=True):
        text = text.replace(secret, REDACTED)
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class RedactionFilter(logging.Filter):
    def __init__(self, secrets: list[str] | tuple[str, ...] = ()) -> None:
        super().__init__()
        self.secrets = tuple(secrets)

    def _arg(self, value: object) -> object:
        if isinstance(value, str):
            return redact(value, self.secrets)
        if value is None or isinstance(value, (int, float)):
            return value
        text = str(value)
        cleaned = redact(text, self.secrets)
        return value if cleaned == text else cleaned

    def filter(self, record: logging.LogRecord) -> bool:
        # Redact the format string and each argument, keeping args' shape: some formatters (uvicorn's
        # access log) unpack record.args themselves, so collapsing them into msg would break logging.
        if isinstance(record.msg, str):
            record.msg = redact(record.msg, self.secrets)
        else:
            record.msg = self._arg(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(self._arg(a) for a in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: self._arg(v) for k, v in record.args.items()}
        if record.exc_info and not record.exc_text:
            # Formatters reuse exc_text, so the redacted traceback is what gets written.
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info), self.secrets)
        elif record.exc_text:
            record.exc_text = redact(record.exc_text, self.secrets)
        return True


_LOGGERS = ("", "fingen", "httpx", "httpcore", "uvicorn", "uvicorn.error", "uvicorn.access", "apscheduler")


def install_redaction(secrets: list[str] | tuple[str, ...] = ()) -> RedactionFilter:
    """Attach one filter to the relevant loggers and to every handler they have (idempotent).

    Logger filters only see records created on that logger, so handlers are covered too, which
    catches records propagated from child loggers.
    """
    flt = RedactionFilter(secrets)
    for name in _LOGGERS:
        logger = logging.getLogger(name)
        for target in (logger, *logger.handlers):
            for old in [f for f in target.filters if isinstance(f, RedactionFilter)]:
                target.removeFilter(old)
            target.addFilter(flt)
    return flt
