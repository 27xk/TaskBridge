from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DeviceRegister(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)
    device_name: str = Field(min_length=1, max_length=128)
    device_type: str = Field(min_length=1, max_length=32)


class DeviceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    device_id: str
    device_name: str
    device_type: str
    last_online_at: datetime | None
    created_at: datetime
    updated_at: datetime

