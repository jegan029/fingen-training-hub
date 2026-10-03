"""Internal classification levels, lowest to highest, and the visibility rules built on them.

Both directions fail closed:
  * content with an unknown or missing level is treated as restricted (rank of the highest level),
  * a user with an unknown clearance is treated as public (the lowest).
Every query that returns knowledge content filters with `visible_sql`, so hiding happens in the
database layer, never in the frontend.
"""

from typing import Literal, get_args

Level = Literal["public", "internal", "confidential", "restricted"]
LEVELS: tuple[Level, ...] = get_args(Level)
FAIL_CLOSED: Level = "restricted"
# Levels that are audited when someone views or downloads them.
AUDITED: frozenset[str] = frozenset({"confidential", "restricted"})


def rank(level: str | None) -> int:
    """Position of a content level in LEVELS; unknown or missing values rank as restricted (fail closed)."""
    return LEVELS.index(level) if level in LEVELS else LEVELS.index(FAIL_CLOSED)


def clearance_rank(clearance: str | None) -> int:
    """Position of a user's clearance; unknown or missing values rank as public (fail closed)."""
    return LEVELS.index(clearance) if clearance in LEVELS else 0


def allowed_levels(clearance: str | None) -> tuple[Level, ...]:
    return LEVELS[: clearance_rank(clearance) + 1]


def can_see(clearance: str | None, level: str | None) -> bool:
    return level in LEVELS and rank(level) <= clearance_rank(clearance)


def visible_sql(column: str, clearance: str | None) -> tuple[str, tuple[str, ...]]:
    """A SQL condition and its bound parameters limiting `column` to levels the user may see.

    `column` is always a constant from our own code (e.g. "k.classification"), never user input.
    """
    levels = allowed_levels(clearance)
    return f"{column} IN ({', '.join('?' * len(levels))})", levels


def visible_sql_named(column: str, clearance: str | None) -> tuple[str, dict[str, str]]:
    """visible_sql for queries that use named parameters (:lvl0, :lvl1, ...)."""
    levels = allowed_levels(clearance)
    names = [f"lvl{i}" for i in range(len(levels))]
    return f"{column} IN ({', '.join(':' + n for n in names)})", dict(zip(names, levels, strict=True))


def llm_allowed(level: str | None, ceiling: str | None) -> bool:
    """Content above the configured ceiling never goes to the LLM provider, whoever asks."""
    return level in LEVELS and rank(level) <= clearance_rank(ceiling)
