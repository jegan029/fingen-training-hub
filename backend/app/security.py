from dataclasses import dataclass
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import APP_SECRET_KEY, COOKIE_SECURE, JWT_ALGORITHM, JWT_TTL_MINUTES, SESSION_COOKIE
from .db import connection, utc_now


@dataclass(frozen=True)
class CurrentUser:
    id: int
    name: str
    email: str
    role: str
    # Highest classification this user may read; reloaded with the user on every request.
    max_classification: str = "public"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


# ── Session tokens ──────────────────────────────────────────


def create_session_token(user_id: int) -> str:
    now = utc_now()
    claims = {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=JWT_TTL_MINUTES)}
    return jwt.encode(claims, APP_SECRET_KEY, algorithm=JWT_ALGORITHM)


def set_session_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(user_id),
        max_age=JWT_TTL_MINUTES * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=COOKIE_SECURE, samesite="strict")


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def get_current_user(request: Request) -> CurrentUser:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise _unauthorized()
    try:
        claims = jwt.decode(token, APP_SECRET_KEY, algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub"]})
        user_id = int(claims["sub"])
    except (jwt.PyJWTError, ValueError):
        raise _unauthorized() from None
    # Reload from the database so deleted users and role changes take effect immediately.
    with connection() as conn:
        row = conn.execute(
            "SELECT id, name, email, role, max_classification FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if not row:
        raise _unauthorized()
    user = CurrentUser(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        max_classification=row["max_classification"],
    )
    request.state.user = user
    return user


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


# ── Rate limiting ───────────────────────────────────────────


def user_or_ip_key(request: Request) -> str:
    user = getattr(request.state, "user", None)
    return f"user:{user.id}" if user else f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=get_remote_address)


# ── Middleware ──────────────────────────────────────────────

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "fetch"


class CSRFMiddleware(BaseHTTPMiddleware):
    """Rejects state-changing API requests that lack a custom header.

    Cross-site forms cannot set custom headers, and a cross-origin fetch that sets one
    triggers a CORS preflight that our CORS policy refuses. Combined with SameSite=Strict
    session cookies this blocks CSRF without a token round trip.
    """

    async def dispatch(self, request: Request, call_next):
        if (
            request.method in _UNSAFE_METHODS
            and request.url.path.startswith("/api/")
            and request.headers.get(CSRF_HEADER) != CSRF_VALUE
        ):
            return JSONResponse({"detail": "Missing or invalid CSRF header"}, status_code=403)
        return await call_next(request)


_SECURITY_HEADERS = {
    # The API only returns JSON, so it never needs to load or run anything.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cache-Control": "no-store",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Swagger UI (development only) loads its assets from a CDN, so it keeps FastAPI's defaults.
        is_docs = request.url.path in ("/docs", "/redoc", "/docs/oauth2-redirect")
        for name, value in _SECURITY_HEADERS.items():
            if is_docs and name in ("Content-Security-Policy", "Cache-Control"):
                continue
            response.headers.setdefault(name, value)
        forwarded_proto = request.headers.get("x-forwarded-proto", "")
        if request.url.scheme == "https" or forwarded_proto == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response
