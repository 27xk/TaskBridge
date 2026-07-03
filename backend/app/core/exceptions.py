class AppException(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        code: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.code = code if code is not None else status_code
        self.headers = headers or {}
