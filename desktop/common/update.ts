export type UpdateState =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateStatus {
  state: UpdateState;
  message: string;
  version?: string;
  percent?: number;
  error?: string;
  checkedAt: string;
}
