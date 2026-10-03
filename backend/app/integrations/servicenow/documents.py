"""Attachment checks: allowed types only, real type verified by magic bytes, size limit, safe storage."""

import hashlib
import io
import os
import re
import tempfile
import zipfile
from pathlib import Path

# Hard allowlist; mapping.documents.allowed_types can only narrow it.
MIME = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "txt": "text/plain",
    "png": "image/png",
    "jpg": "image/jpeg",
}
EXTENSIONS = {
    "pdf": "pdf",
    "docx": "docx",
    "xlsx": "xlsx",
    "pptx": "pptx",
    "txt": "txt",
    "png": "png",
    "jpg": "jpg",
    "jpeg": "jpg",
}
_DECLARED_ALIASES = {"image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg"}
_OOXML_PREFIX = {"docx": "word/", "xlsx": "xl/", "pptx": "ppt/"}
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class DocumentRejected(Exception):
    """The attachment is not stored; the message is safe to show admins."""


def expected_type(file_name: str, declared: str, size: int, allowed: list[str], max_bytes: int) -> str:
    """Check what ServiceNow says about an attachment before downloading it."""
    ext = Path(file_name).suffix.lower().lstrip(".")
    kind = EXTENSIONS.get(ext)
    if kind is None or kind not in allowed:
        raise DocumentRejected("file type not allowed")
    main = declared.split(";")[0].strip().lower()
    if _DECLARED_ALIASES.get(main, main) != MIME[kind]:
        raise DocumentRejected("declared content type does not match the file extension")
    if size > max_bytes:
        raise DocumentRejected("larger than the size limit")
    return kind


def sniff(data: bytes) -> str | None:
    """The real type of a file from its content, for the allowlisted types only."""
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"PK\x03\x04"):
        try:
            # Only the central directory is read; nothing is decompressed (no zip bomb exposure).
            names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        except zipfile.BadZipFile:
            return None
        if "[Content_Types].xml" not in names:
            return None
        for kind, prefix in _OOXML_PREFIX.items():
            if any(name.startswith(prefix) for name in names):
                return kind
        return None
    if b"\x00" in data:
        return None
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return "txt"


def verify_content(kind: str, data: bytes, max_bytes: int) -> None:
    if len(data) > max_bytes:
        raise DocumentRejected("larger than the size limit")
    if sniff(data) != kind:
        raise DocumentRejected("content does not match the declared type")


def store(directory: Path, data: bytes) -> str:
    """Write content addressed (sha256 name, deduplicated, atomic); returns the file name."""
    digest = hashlib.sha256(data).hexdigest()
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / digest
    if not target.exists():
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".incoming-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.replace(tmp, target)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
    return digest


def stored_path(directory: Path, digest: str) -> Path:
    """Resolve a stored file by its sha256 name; anything else is refused (no path traversal)."""
    if not _SHA256.match(digest or ""):
        raise ValueError("invalid document reference")
    return directory / digest
