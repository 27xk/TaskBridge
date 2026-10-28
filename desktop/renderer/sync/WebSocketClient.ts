export interface WebSocketConfig {
  wsUrl: string;
  ticket: string;
  deviceId: string;
}

export interface SyncSocketMessage {
  event: string;
  action?: string;
  task_id?: number;
  version?: number;
  server_time?: string;
  message?: string;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempt = 0;
  private manualClose = false;

  constructor(
    private readonly getConfig: () => Promise<WebSocketConfig | null>,
    private readonly onMessage: (message: SyncSocketMessage) => void,
    private readonly onStatus: (status: string) => void,
  ) {}

  async connect(): Promise<void> {
    this.manualClose = false;
    const config = await this.getConfig();
    if (!config) {
      this.onStatus("ws: unauthenticated");
      return;
    }

    this.closeSocketOnly();
    const url = new URL(config.wsUrl);
    url.searchParams.set("ticket", config.ticket);
    url.searchParams.set("device_id", config.deviceId);

    this.socket = new WebSocket(url.toString());
    this.socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.onStatus("ws: connected");
      this.startHeartbeat();
    };
    this.socket.onmessage = (event) => {
      const parsed = this.parseMessage(event.data);
      if (parsed) this.onMessage(parsed);
    };
    this.socket.onerror = () => {
      this.onStatus("ws: error");
    };
    this.socket.onclose = () => {
      this.stopHeartbeat();
      this.onStatus("ws: disconnected");
      if (!this.manualClose) this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSocketOnly();
    this.stopHeartbeat();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send("ping");
      }
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private closeSocketOnly(): void {
    if (!this.socket) return;
    this.socket.onclose = null;
    this.socket.close();
    this.socket = null;
  }

  private parseMessage(data: unknown): SyncSocketMessage | null {
    if (typeof data !== "string") return null;
    try {
      return JSON.parse(data) as SyncSocketMessage;
    } catch {
      return null;
    }
  }
}
