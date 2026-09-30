"""Stateless, time-limited HMAC tokens; compatible with existing sessions."""
import base64
import hashlib
import hmac
import json
import time
from .models import Envelope


def encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + '=' * (-len(data) % 4))


def sign_question(envelope: Envelope, key: str) -> str:
    payload = encode(json.dumps(envelope.model_dump(exclude_none=True), separators=(',', ':')).encode())
    signature = encode(hmac.digest(key.encode(), payload.encode(), 'sha256'))
    return f'{payload}.{signature}'


def verify_question(token: str, key: str) -> Envelope | None:
    try:
        if not key:
            return None
        payload, signature = token.split('.')
        expected = hmac.new(key.encode(), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(decode(signature), expected):
            return None
        value = Envelope.model_validate_json(decode(payload))
        return value if value.expires > int(time.time() * 1000) else None
    except (ValueError, TypeError):
        return None
