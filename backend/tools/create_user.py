from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.schemas.auth import UserCreate


def create_user(db: Session, *, username: str, email: str, password: str) -> User:
    payload = UserCreate(
        username=username,
        email=email,
        password=password,
        device_id="first-account-tool",
    )
    existing = db.scalar(
        select(User).where(or_(User.username == payload.username, User.email == payload.email)),
    )
    if existing is not None:
        raise ValueError("user already exists")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a TaskBridge user for self-hosted first-account setup.")
    parser.add_argument("--username", required=True, help="account username")
    parser.add_argument("--email", required=True, help="account email")
    parser.add_argument("--password", help="account password; omit to enter it interactively")
    parser.add_argument("--password-stdin", action="store_true", help="read the password from stdin")
    args = parser.parse_args(argv)

    if args.password_stdin:
        password = sys.stdin.readline().strip()
    elif args.password:
        password = args.password
    else:
        password = getpass.getpass("Password: ")

    with SessionLocal() as db:
        try:
            user = create_user(db, username=args.username, email=args.email, password=password)
        except Exception as error:
            print(f"failed to create user: {error}", file=sys.stderr)
            return 1

    print(f"created user {user.username} ({user.email})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
