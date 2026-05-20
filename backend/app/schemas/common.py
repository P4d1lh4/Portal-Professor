from typing import Generic, TypeVar

from pydantic import BaseModel


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str


T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    """Resposta paginada genérica.

    `total` é a contagem absoluta no servidor (após filtros), independente
    de `limit`/`offset`. `items` traz a janela solicitada.
    """

    items: list[T]
    total: int
    limit: int
    offset: int
