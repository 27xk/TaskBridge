"""Root workspace entry point; does not depend on the caller's working directory."""

import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    raise SystemExit(subprocess.call(
        [sys.executable, "-m", "tools.client_contract", "--check"],
        cwd=Path(__file__).resolve().parents[1],
    ))
