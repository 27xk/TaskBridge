from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import RefreshToken, User
from app.utils.time import utc_now


def reset_password(
    db: Session,
    *,
    username_or_email: str,
    password: str,
) -> User:
    identifier = username_or_email.strip().lower()
    if not identifier:
        raise ValueError("username or email is required")
    if not 8 <= len(password) <= 128:
        raise ValueError("password must contain 8 to 128 characters")

    user = db.scalar(
        select(User).where(or_(User.username == identifier, User.email == identifier)),
    )
    if user is None:
        raise ValueError("user not found")

    now = utc_now()
    user.password_hash = hash_password(password)
    user.updated_at = now
    db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Reset a TaskBridge account password and revoke all active sessions.",
    )
    parser.add_argument("--username-or-email", required=True, help="account username or email")
    parser.add_argument("--password", help="new password; omit to enter it interactively")
    parser.add_argument("--password-stdin", action="store_true", help="read the password from stdin")
    args = parser.parse_args(argv)

    if args.password_stdin:
        password = sys.stdin.readline().rstrip("\r\n")
    elif args.password:
        password = args.password
    else:
        password = getpass.getpass("New password: ")

    with SessionLocal() as db:
        try:
            user = reset_password(
                db,
                username_or_email=args.username_or_email,
                password=password,
            )
        except Exception as error:
            print(f"failed to reset password: {error}", file=sys.stderr)
            return 1

    print(f"reset password for {user.username} ({user.email}); active sessions revoked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
