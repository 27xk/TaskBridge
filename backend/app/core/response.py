from typing import Any

from fastapi.encoders import jsonable_encoder
from starlette.responses import JSONResponse


def api_success(data: Any = None, message: str = "success", status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(
            {
                "code": 0,
                "message": message,
                "data": data,
            },
        ),
    )


def api_error(
    code: int,
    message: str,
    status_code: int,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        headers=headers,
        content={
            "code": code,
            "message": message,
            "data": None,
        },
    )
