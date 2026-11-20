"""Erreurs structurées : aucun détail interne, aucun contenu d'image dans les messages."""

from __future__ import annotations


class ToolError(Exception):
    """Erreur métier ou technique stable, exposée au worker avec un code traçable."""

    def __init__(self, code: str, message: str, status: int = 422, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


class Unauthorized(ToolError):
    def __init__(self, message: str = "Jeton interne invalide ou absent.") -> None:
        super().__init__("unauthorized", message, 401)


class PayloadTooLarge(ToolError):
    def __init__(self, message: str) -> None:
        super().__init__("payload_too_large", message, 413)


class InvalidSource(ToolError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code, message, 422)


class SourceUnavailable(ToolError):
    def __init__(self, message: str) -> None:
        super().__init__("source_unavailable", message, 503, True)
