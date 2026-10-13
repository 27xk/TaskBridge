from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_container_entrypoint_trusts_the_configured_forwarded_proto_proxy() -> None:
    entrypoint = (REPO_ROOT / "backend/docker-entrypoint.sh").read_text(encoding="utf-8")
    compose = (REPO_ROOT / "deploy/docker-compose.release.yml").read_text(encoding="utf-8")

    assert "--proxy-headers" in entrypoint
    assert "--forwarded-allow-ips" in entrypoint
    assert "FORWARDED_ALLOW_IPS" in entrypoint
    assert "FORWARDED_ALLOW_IPS:" in compose
