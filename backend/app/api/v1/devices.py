from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.response import api_success
from app.models.user import User
from app.schemas.device import DeviceRead, DeviceRegister
from app.services.device_service import delete_device, list_devices, register_device

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("/register")
def register(
    payload: DeviceRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = register_device(db, current_user, payload)
    return api_success(DeviceRead.model_validate(device), status_code=201)


@router.get("")
def read_devices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    devices = list_devices(db, current_user)
    return api_success([DeviceRead.model_validate(device) for device in devices])


@router.delete("/{device_id}")
def remove_device(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = delete_device(db, current_user, device_id)
    return api_success(DeviceRead.model_validate(device))
