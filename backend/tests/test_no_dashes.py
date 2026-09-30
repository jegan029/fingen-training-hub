import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_no_dashes.py"


def test_no_dashes_in_user_facing_text():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--list"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_checker_catches_dashes_and_ignores_code():
    sys.path.insert(0, str(SCRIPT.parent))
    import check_no_dashes as c

    assert c.find("Settlement — check the batch")
    assert c.find("P1–P4")
    assert c.find("Title - subtitle")
    assert c.find("a real-time feed")
    assert not c.find("a real time feed with TXN-001 and fingen-payments-oncall")
    # Code, SQL and markdown list markers are not prose.
    assert not c.find(c.prose("Run `a — b` then\n- item", sql=True))
    assert not c.find(c.prose("SELECT a FROM t WHERE d >= NOW() - INTERVAL '1 day';", sql=True))
