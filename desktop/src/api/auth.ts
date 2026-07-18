import { request, unwrap } from "./request";

export interface UserDto {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenPairDto {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserDto;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  device_id: string;
}

export interface LoginPayload {
  username_or_email: string;
  password: string;
  device_id: string;
}

export interface WebSocketTicketDto {
  ticket: string;
  expires_in: number;
}

export interface RegistrationStatusDto {
  registration_enabled: boolean;
}

export interface RefreshSessionDto {
  id: number;
  device_id: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface RevokeSessionsDto {
  revoked: number;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export function register(payload: RegisterPayload): Promise<TokenPairDto> {
  return unwrap(request.post("/auth/register", payload));
}

export function login(payload: LoginPayload): Promise<TokenPairDto> {
  return unwrap(request.post("/auth/login", payload));
}

export function getMe(): Promise<UserDto> {
  return unwrap(request.get("/auth/me"));
}

export function getRegistrationStatus(): Promise<RegistrationStatusDto> {
  return unwrap(request.get("/auth/registration"));
}

export function createWebSocketTicket(deviceId: string): Promise<WebSocketTicketDto> {
  return unwrap(request.post("/auth/ws-ticket", { device_id: deviceId }));
}

export function listSessions(): Promise<RefreshSessionDto[]> {
  return unwrap(request.get("/auth/sessions"));
}

export function revokeSession(sessionId: number): Promise<RefreshSessionDto> {
  return unwrap(request.delete(`/auth/sessions/${sessionId}`));
}

export function revokeOtherSessions(deviceId: string): Promise<RevokeSessionsDto> {
  return unwrap(request.post("/auth/sessions/revoke-other-devices", { device_id: deviceId }));
}

export function changePassword(payload: ChangePasswordPayload): Promise<RevokeSessionsDto> {
  return unwrap(request.put("/auth/password", payload));
}
