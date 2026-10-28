import { request, unwrap } from "./request";

export interface DeviceRegisterPayload {
  device_id: string;
  device_name: string;
  device_type: string;
}

export function registerDevice(payload: DeviceRegisterPayload): Promise<unknown> {
  return unwrap(request.post("/devices/register", payload));
}
