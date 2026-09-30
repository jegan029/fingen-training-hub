from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..config import LOGIN_LOCKOUT_MINUTES, LOGIN_LOCKOUT_THRESHOLD, LOGIN_RATE_LIMIT
from ..db import connection, utc_now
from ..passwords import verify_password
from ..schemas import AuthUser, LoginRequest
from ..security import CurrentUser, clear_session_cookie, get_current_user, limiter, set_session_cookie

router = APIRouter()


def _invalid() -> HTTPException:
    return HTTPException(status_code=401, detail="Invalid email or password")


def _is_locked_out(conn, email: str) -> bool:
    row = conn.execute("SELECT locked_until FROM login_failures WHERE email = ?", (email,)).fetchone()
    return bool(row and row["locked_until"] and datetime.fromisoformat(row["locked_until"]) > utc_now())


def _record_failure(conn, email: str) -> None:
    row = conn.execute("SELECT count FROM login_failures WHERE email = ?", (email,)).fetchone()
    count = (row["count"] if row else 0) + 1
    locked_until = None
    if count >= LOGIN_LOCKOUT_THRESHOLD:
        locked_until = (utc_now() + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)).isoformat()
        count = 0
    conn.execute(
        """INSERT INTO login_failures (email, count, locked_until) VALUES (?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET count = excluded.count,
               locked_until = COALESCE(excluded.locked_until, login_failures.locked_until)""",
        (email, count, locked_until),
    )


@router.post("/login", response_model=AuthUser)
@limiter.limit(LOGIN_RATE_LIMIT)
def login(request: Request, response: Response, payload: LoginRequest) -> AuthUser:
    email = payload.email.strip().lower()
    with connection() as conn:
        if _is_locked_out(conn, email):
            # Same message as a bad password so lockout does not reveal which emails exist.
            raise _invalid()
        row = conn.execute(
            "SELECT id, name, email, role, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()
        if not verify_password(row["password_hash"] if row else None, payload.password):
            _record_failure(conn, email)
            conn.commit()
            raise _invalid()
        conn.execute("DELETE FROM login_failures WHERE email = ?", (email,))
    set_session_cookie(response, row["id"])
    return AuthUser(id=row["id"], name=row["name"], email=row["email"], role=row["role"])


@router.get("/me", response_model=AuthUser)
def me(user: CurrentUser = Depends(get_current_user)) -> AuthUser:
    return AuthUser(id=user.id, name=user.name, email=user.email, role=user.role)


@router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    clear_session_cookie(response)
    response.status_code = 204
    return response
