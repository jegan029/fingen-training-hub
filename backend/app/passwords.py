from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# argon2-cffi defaults are argon2id with RFC 9106 low-memory parameters.
_hasher = PasswordHasher()

# Verifying against this keeps login timing similar when the email does not exist.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def is_argon2_hash(value: str | None) -> bool:
    return bool(value) and value.startswith("$argon2")


def verify_password(stored_hash: str | None, password: str) -> bool:
    target = stored_hash if is_argon2_hash(stored_hash) else _DUMMY_HASH
    try:
        ok = _hasher.verify(target, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return ok and target is stored_hash
