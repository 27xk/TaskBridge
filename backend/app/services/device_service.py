from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceRegister
from app.utils.time import utc_now


def register_device(db: Session, current_user: User, payload: DeviceRegister) -> Device:
    device = db.scalar(
        select(Device).where(
            Device.user_id == current_user.id,
            Device.device_id == payload.device_id,
        ),
    )
    if device is None:
        device = Device(user_id=current_user.id, device_id=payload.device_id)

    device.device_name = payload.device_name
    device.device_type = payload.device_type
    device.last_online_at = utc_now()
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def list_devices(db: Session, current_user: User) -> list[Device]:
    return list(
        db.scalars(
            select(Device)
            .where(Device.user_id == current_user.id)
            .order_by(Device.updated_at.desc(), Device.id.desc()),
        ),
    )


def ensure_device_registered(db: Session, current_user: User, device_id: str) -> Device:
    return ensure_device_registered_by_user_id(db, current_user.id, device_id)


def ensure_device_registered_by_user_id(db: Session, user_id: int, device_id: str) -> Device:
    device = db.scalar(
        select(Device).where(Device.user_id == user_id, Device.device_id == device_id),
    )
    if device is None:
        raise AppException(status_code=403, message="device is not registered")
    return device


def delete_device(db: Session, current_user: User, device_id: str) -> Device:
    device = db.scalar(
        select(Device).where(Device.user_id == current_user.id, Device.device_id == device_id),
    )
    if device is None:
        raise AppException(status_code=404, message="device not found")

    snapshot = Device(
        id=device.id,
        user_id=device.user_id,
        device_id=device.device_id,
        device_name=device.device_name,
        device_type=device.device_type,
        last_online_at=device.last_online_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )
    db.delete(device)
    db.commit()
    return snapshot
