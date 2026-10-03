import json
import secrets
import sqlite3
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

from .config import DATASET_PATH, DB_PATH, IS_DEV, SEED_ADMIN_PASSWORD, SEED_LEARNER_PASSWORD, logger
from .passwords import hash_password, is_argon2_hash, verify_password
from .services.subtopics import extract_subtopics

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'learner'
);

CREATE TABLE IF NOT EXISTS learning_paths (
    id INTEGER PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY,
    path_id INTEGER NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    content TEXT NOT NULL,
    dependencies TEXT,
    sample_question TEXT,
    sample_answer TEXT,
    scenario_context TEXT,
    scenario_options TEXT,
    scenario_correct INTEGER,
    scenario_explanation TEXT,
    FOREIGN KEY(path_id) REFERENCES learning_paths(id)
);

CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(node_id) REFERENCES nodes(id)
);

CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    answer TEXT,
    score INTEGER,
    feedback TEXT,
    category TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(node_id) REFERENCES nodes(id)
);

CREATE TABLE IF NOT EXISTS scenario_assessments (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    chosen_option INTEGER NOT NULL,
    is_correct INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(node_id) REFERENCES nodes(id)
);
"""


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    """Open a connection that commits on success, rolls back on error and always closes."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def utc_now() -> datetime:
    return datetime.now(UTC)


# ── Migrations ──────────────────────────────────────────────
# Each migration runs once, in order; PRAGMA user_version records the last one applied.


def _m001_login_failures(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS login_failures (
               email TEXT PRIMARY KEY,
               count INTEGER NOT NULL DEFAULT 0,
               locked_until TEXT
           )"""
    )


def _m002_drop_legacy_password_hashes(conn: sqlite3.Connection) -> None:
    # Earlier versions stored unsalted SHA-256 hashes of hardcoded demo passwords.
    # Clear them so those credentials stop working; seeding sets fresh argon2id hashes.
    for row in conn.execute("SELECT id, password_hash FROM users WHERE password_hash IS NOT NULL").fetchall():
        if not is_argon2_hash(row["password_hash"]):
            conn.execute("UPDATE users SET password_hash = NULL WHERE id = ?", (row["id"],))


def _m003_fingen_email_domain(conn: sqlite3.Connection) -> None:
    # Rebrand: demo accounts on any other *.demo domain move to @fingen.demo.
    other_demo = "email LIKE '%@%.demo' AND email NOT LIKE '%@fingen.demo'"
    conn.execute(f"DELETE FROM login_failures WHERE {other_demo}")  # nosec B608 (constant SQL)
    conn.execute(
        f"UPDATE users SET email = substr(email, 1, instr(email, '@')) || 'fingen.demo' WHERE {other_demo}"  # nosec B608
    )


def _m004_progress_status(conn: sqlite3.Connection) -> None:
    """Replace the completed flag with a four-state status, one row per user and node."""
    conn.execute(
        "ALTER TABLE progress ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' "
        "CHECK (status IN ('pending', 'in_progress', 'done', 'skipped'))"
    )
    conn.execute("UPDATE progress SET status = 'done' WHERE completed = 1")
    conn.execute("DELETE FROM progress WHERE id NOT IN (SELECT MAX(id) FROM progress GROUP BY user_id, node_id)")
    conn.execute("ALTER TABLE progress RENAME COLUMN completed_at TO updated_at")
    conn.execute("ALTER TABLE progress DROP COLUMN completed")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_progress_user_node ON progress(user_id, node_id)")


def _m005_runbooks_and_subtopics(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS runbooks (
            id INTEGER PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            version TEXT NOT NULL,
            updated TEXT NOT NULL,
            description TEXT NOT NULL,
            preconditions TEXT NOT NULL,
            steps TEXT NOT NULL,
            escalation_triggers TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS node_runbooks (
            node_id INTEGER NOT NULL REFERENCES nodes(id),
            runbook_id INTEGER NOT NULL REFERENCES runbooks(id),
            position INTEGER NOT NULL,
            PRIMARY KEY (node_id, runbook_id)
        );
        CREATE TABLE IF NOT EXISTS node_subtopics (
            node_id INTEGER NOT NULL REFERENCES nodes(id),
            position INTEGER NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            PRIMARY KEY (node_id, position)
        );
        """
    )


_LEVEL_CHECK = "IN ('public', 'internal', 'confidential', 'restricted')"


def _m006_servicenow_knowledge(conn: sqlite3.Connection) -> None:
    """ServiceNow knowledge: articles, applications, documents, sync runs, node links, audit and clearance."""
    conn.executescript(
        f"""
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY,
            external_sys_id TEXT,
            app_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'servicenow' CHECK (source IN ('servicenow', 'local')),
            active INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kb_articles (
            id INTEGER PRIMARY KEY,
            external_sys_id TEXT UNIQUE NOT NULL,
            kb_number TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            body_markdown TEXT NOT NULL DEFAULT '',
            body_raw_html TEXT NOT NULL DEFAULT '',
            classification TEXT NOT NULL DEFAULT 'restricted' CHECK (classification {_LEVEL_CHECK}),
            source_classification TEXT,
            article_type TEXT,
            kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('runbook', 'sop', 'other')),
            knowledge_base TEXT,
            category TEXT,
            version TEXT,
            workflow_state TEXT,
            valid_to TEXT,
            source_updated_at TEXT,
            synced_at TEXT,
            content_hash TEXT,
            active INTEGER NOT NULL DEFAULT 0,
            source_url TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_kb_articles_visible ON kb_articles(active, classification);
        CREATE INDEX IF NOT EXISTS ix_kb_articles_updated ON kb_articles(source_updated_at);
        CREATE TABLE IF NOT EXISTS article_applications (
            article_id INTEGER NOT NULL REFERENCES kb_articles(id),
            application_id INTEGER NOT NULL REFERENCES applications(id),
            PRIMARY KEY (article_id, application_id)
        );
        CREATE TABLE IF NOT EXISTS article_documents (
            id INTEGER PRIMARY KEY,
            article_id INTEGER NOT NULL REFERENCES kb_articles(id),
            external_sys_id TEXT,
            file_name TEXT NOT NULL,
            content_type TEXT,
            size_bytes INTEGER,
            sha256 TEXT,
            storage_path TEXT,
            kind TEXT NOT NULL CHECK (kind IN ('attachment', 'linked_article')),
            linked_kb_number TEXT,
            synced_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ux_article_documents_attachment
            ON article_documents(article_id, external_sys_id);
        CREATE TABLE IF NOT EXISTS sync_runs (
            id INTEGER PRIMARY KEY,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            mode TEXT NOT NULL CHECK (mode IN ('incremental', 'full')),
            trigger TEXT NOT NULL DEFAULT 'manual',
            status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
            articles_seen INTEGER NOT NULL DEFAULT 0,
            articles_created INTEGER NOT NULL DEFAULT 0,
            articles_updated INTEGER NOT NULL DEFAULT 0,
            articles_unchanged INTEGER NOT NULL DEFAULT 0,
            articles_retired INTEGER NOT NULL DEFAULT 0,
            articles_failed INTEGER NOT NULL DEFAULT 0,
            documents_downloaded INTEGER NOT NULL DEFAULT 0,
            documents_rejected INTEGER NOT NULL DEFAULT 0,
            watermark TEXT,
            error_summary TEXT
        );
        CREATE TABLE IF NOT EXISTS article_nodes (
            article_id INTEGER NOT NULL REFERENCES kb_articles(id),
            node_id INTEGER NOT NULL REFERENCES nodes(id),
            origin TEXT NOT NULL CHECK (origin IN ('mapping', 'manual')),
            PRIMARY KEY (article_id, node_id, origin)
        );
        CREATE TABLE IF NOT EXISTS kb_access_log (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            article_id INTEGER NOT NULL REFERENCES kb_articles(id),
            document_id INTEGER REFERENCES article_documents(id),
            action TEXT NOT NULL CHECK (action IN ('view', 'download')),
            at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_kb_access_log_at ON kb_access_log(at);
        """
    )
    # Existing runbooks are local content, classified internal; synced ones are projections of articles.
    conn.execute(
        "ALTER TABLE runbooks ADD COLUMN source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'servicenow'))"
    )
    conn.execute("ALTER TABLE runbooks ADD COLUMN kb_article_id INTEGER REFERENCES kb_articles(id)")
    conn.execute(
        f"ALTER TABLE runbooks ADD COLUMN classification TEXT NOT NULL DEFAULT 'internal' CHECK (classification {_LEVEL_CHECK})"
    )
    conn.execute(
        f"ALTER TABLE users ADD COLUMN max_classification TEXT NOT NULL DEFAULT 'internal' "
        f"CHECK (max_classification {_LEVEL_CHECK})"
    )
    # Admins can raise any clearance, their own included, so they start with full clearance.
    conn.execute("UPDATE users SET max_classification = 'restricted' WHERE role = 'admin'")


MIGRATIONS: list[Callable[[sqlite3.Connection], None]] = [
    _m001_login_failures,
    _m002_drop_legacy_password_hashes,
    _m003_fingen_email_domain,
    _m004_progress_status,
    _m005_runbooks_and_subtopics,
    _m006_servicenow_knowledge,
]

# ServiceNow runbooks live in the runbooks table with id = RUNBOOK_ID_OFFSET + kb_articles.id, so the
# dataset's upsert by id can never overwrite one (dataset runbook ids must stay below this).
RUNBOOK_ID_OFFSET = 100_000


def _run_migrations(conn: sqlite3.Connection) -> None:
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    for version, migration in enumerate(MIGRATIONS, start=1):
        if version <= current:
            continue
        migration(conn)
        conn.execute(f"PRAGMA user_version = {int(version)}")  # PRAGMA cannot take bound parameters
        conn.commit()


def init_db() -> None:
    with connection() as conn:
        conn.executescript(SCHEMA_SQL)
        _run_migrations(conn)
        _sync_dataset(conn)
        if IS_DEV:
            _seed_demo_users(conn)
            _seed_demo_assessments(conn)
            _seed_login_accounts(conn)


# ── Seeding ─────────────────────────────────────────────────


def _sync_dataset(conn: sqlite3.Connection) -> None:
    """Upsert paths, nodes and runbooks from the dataset by id on every startup.

    The JSON file is the source of truth for content, so edits show up after a restart
    without deleting the database. Users, progress and assessments are never touched.
    """
    if not DATASET_PATH.exists():
        return

    with open(DATASET_PATH, encoding="utf-8") as f:
        payload = json.load(f)

    for rb in payload.get("runbooks", []):
        if rb["id"] >= RUNBOOK_ID_OFFSET:
            raise ValueError(f"Dataset runbook ids must stay below {RUNBOOK_ID_OFFSET} (ServiceNow range)")
        conn.execute(
            """INSERT INTO runbooks (id, slug, title, category, version, updated, description,
                                     preconditions, steps, escalation_triggers)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title,
                   category = excluded.category, version = excluded.version, updated = excluded.updated,
                   description = excluded.description, preconditions = excluded.preconditions,
                   steps = excluded.steps, escalation_triggers = excluded.escalation_triggers""",
            (
                rb["id"],
                rb["slug"],
                rb["title"],
                rb["category"],
                rb["version"],
                rb["updated"],
                rb["description"],
                json.dumps(rb["preconditions"]),
                json.dumps(rb["steps"]),
                json.dumps(rb["escalation_triggers"]),
            ),
        )

    # Derived rows are rebuilt each time so they always match the current content.
    conn.execute("DELETE FROM node_runbooks")
    conn.execute("DELETE FROM node_subtopics")

    for path in payload.get("paths", []):
        conn.execute(
            """INSERT INTO learning_paths (id, slug, title, description) VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title,
                   description = excluded.description""",
            (path["id"], path["slug"], path["title"], path["description"]),
        )
        for node in path.get("nodes", []):
            opts = node.get("scenario_options")
            conn.execute(
                """INSERT INTO nodes
                   (id, path_id, slug, title, description, content, dependencies,
                    sample_question, sample_answer,
                    scenario_context, scenario_options, scenario_correct, scenario_explanation)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                       path_id = excluded.path_id, slug = excluded.slug, title = excluded.title,
                       description = excluded.description, content = excluded.content,
                       dependencies = excluded.dependencies, sample_question = excluded.sample_question,
                       sample_answer = excluded.sample_answer, scenario_context = excluded.scenario_context,
                       scenario_options = excluded.scenario_options, scenario_correct = excluded.scenario_correct,
                       scenario_explanation = excluded.scenario_explanation""",
                (
                    node["id"],
                    path["id"],
                    node["slug"],
                    node["title"],
                    node["description"],
                    node["content"],
                    ",".join(str(d) for d in node.get("dependencies", [])) if node.get("dependencies") else "",
                    node.get("sample_question", ""),
                    node.get("sample_answer", ""),
                    node.get("scenario_context", ""),
                    json.dumps(opts) if opts else None,
                    node.get("scenario_correct"),
                    node.get("scenario_explanation", ""),
                ),
            )
            for position, runbook_id in enumerate(node.get("runbook_ids", [])):
                conn.execute(
                    "INSERT INTO node_runbooks (node_id, runbook_id, position) VALUES (?, ?, ?)",
                    (node["id"], runbook_id, position),
                )
            for position, sub in enumerate(extract_subtopics(node["content"])):
                conn.execute(
                    "INSERT INTO node_subtopics (node_id, position, title, summary) VALUES (?, ?, ?, ?)",
                    (node["id"], position, sub["title"], sub["summary"]),
                )


def _seed_demo_users(conn: sqlite3.Connection) -> None:
    """Learner personas with progress, so admin and analytics views have data. They cannot log in."""
    if conn.execute("SELECT COUNT(1) FROM users WHERE id = 2").fetchone()[0] > 0:
        return

    now = utc_now()
    demo_users = [
        (1, "Demo Learner", "demo@fingen.demo"),
        (2, "Alex Chen", "alex.chen@fingen.demo"),
        (3, "Sam Rivera", "sam.rivera@fingen.demo"),
        (4, "Jamie Okafor", "jamie.okafor@fingen.demo"),
        (5, "Morgan Lee", "morgan.lee@fingen.demo"),
    ]
    for uid, name, email in demo_users:
        conn.execute("INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)", (uid, name, email))

    persona_progress = [
        # Alex Chen: all 30 nodes complete (1 day ago)
        (2, list(range(1, 31)), 1),
        # Sam Rivera: Platform Core 7/10, Transaction Flows 5/10 (3 days ago)
        (3, list(range(1, 8)) + list(range(11, 16)), 3),
        # Jamie Okafor: Platform Core 3/10 (5 days ago)
        (4, list(range(1, 4)), 5),
        # Morgan Lee: 5 nodes per path (2 days ago)
        (5, list(range(1, 6)) + list(range(11, 16)) + list(range(21, 26)), 2),
    ]
    for uid, node_ids, days_ago in persona_progress:
        ts = (now - timedelta(days=days_ago)).isoformat()
        for node_id in node_ids:
            conn.execute(
                "INSERT OR IGNORE INTO progress (user_id, node_id, status, updated_at) VALUES (?, ?, 'done', ?)",
                (uid, node_id, ts),
            )


def _seed_demo_assessments(conn: sqlite3.Connection) -> None:
    """Open ended scores for the personas, so the admin "weakest topics" view has data."""
    if conn.execute("SELECT COUNT(1) FROM assessments WHERE user_id BETWEEN 2 AND 5").fetchone()[0] > 0:
        return
    if conn.execute("SELECT COUNT(1) FROM users WHERE id BETWEEN 2 AND 5").fetchone()[0] < 4:
        return

    def category(score: int) -> str:
        return "Excellent" if score >= 9 else "Good" if score >= 7 else "Partial" if score >= 4 else "Incorrect"

    # (user, node, score, days ago); only nodes the persona has done.
    scores = [
        (2, 1, 9, 20),
        (2, 4, 8, 18),
        (2, 6, 5, 16),
        (2, 13, 6, 12),
        (2, 16, 4, 9),
        (2, 24, 7, 4),
        (2, 28, 5, 2),
        (3, 1, 8, 14),
        (3, 4, 6, 12),
        (3, 6, 3, 10),
        (3, 13, 5, 6),
        (3, 15, 7, 4),
        (4, 1, 7, 8),
        (4, 3, 6, 6),
        (5, 1, 9, 9),
        (5, 4, 7, 8),
        (5, 13, 4, 6),
        (5, 24, 6, 4),
        (5, 25, 8, 3),
    ]
    now = utc_now()
    for uid, node_id, score, days_ago in scores:
        conn.execute(
            """INSERT INTO assessments (user_id, node_id, answer, score, feedback, category, created_at)
               VALUES (?, ?, NULL, ?, 'Seeded demo score.', ?, ?)""",
            (uid, node_id, score, category(score), (now - timedelta(days=days_ago)).isoformat()),
        )


def _seed_login_accounts(conn: sqlite3.Connection) -> None:
    """Development-only login accounts. Passwords come from env vars or are generated and printed once."""
    accounts = [
        (6, "Admin User", "admin@fingen.demo", "admin", SEED_ADMIN_PASSWORD, "SEED_ADMIN_PASSWORD"),
        (7, "Demo Learner", "learner@fingen.demo", "learner", SEED_LEARNER_PASSWORD, "SEED_LEARNER_PASSWORD"),
    ]
    for uid, name, email, role, configured, env_name in accounts:
        row = conn.execute("SELECT password_hash FROM users WHERE email = ?", (email,)).fetchone()
        if row and row["password_hash"]:
            # A configured password is the source of truth, so changing the env var takes effect on restart.
            if not configured or verify_password(row["password_hash"], configured):
                continue
            conn.execute("DELETE FROM login_failures WHERE email = ?", (email,))
        password = configured or secrets.token_urlsafe(12)
        pw_hash = hash_password(password)
        if row:
            conn.execute("UPDATE users SET password_hash = ?, role = ? WHERE email = ?", (pw_hash, role, email))
        else:
            conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, max_classification) VALUES (?, ?, ?, ?, ?, ?)",
                (uid, name, email, pw_hash, role, "restricted" if role == "admin" else "internal"),
            )
        if configured:
            logger.warning("Set %s account %s password from %s.", role, email, env_name)
        else:
            # Printed once, when the account is created; set the env var to choose your own.
            print(f"[seed] {role} account {email} password: {password}  (set {env_name} to choose one)", flush=True)
