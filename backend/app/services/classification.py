"""Internal classification levels, lowest to highest. Anything unknown is treated as restricted."""

from typing import Literal, get_args

Level = Literal["public", "internal", "confidential", "restricted"]
LEVELS: tuple[Level, ...] = get_args(Level)
FAIL_CLOSED: Level = "restricted"


def rank(level: str | None) -> int:
    """Position of a level in LEVELS; unknown or missing values rank as restricted (fail closed)."""
    return LEVELS.index(level) if level in LEVELS else LEVELS.index(FAIL_CLOSED)
