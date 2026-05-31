"""Project file management with AES-GCM encryption and streaming support.

File format (binary):
    [4B magic: b'SLCP']
    [2B version]
    [16B salt]          (encrypted only)
    [12B nonce]         (encrypted only)
    [4B ciphertext_len BE] (encrypted only)
    [ciphertext]
    [16B tag]           (encrypted only)

The plaintext is UTF-8 JSON of a `Project.to_dict()`.
A password is stretched via PBKDF2-HMAC-SHA256 (200_000 iters).

For large files (>100MB), use save_stream/load_stream for buffered I/O.
"""
from __future__ import annotations

import hashlib
import json
import os
import struct
from dataclasses import dataclass
from typing import Callable, Optional

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    _CRYPTO_AVAILABLE = True
except Exception:  # pragma: no cover - crypto is optional at import time
    AESGCM = None  # type: ignore
    PBKDF2HMAC = None  # type: ignore
    hashes = None  # type: ignore
    _CRYPTO_AVAILABLE = False

from .models import Project


MAGIC = b"SLCP"
FORMAT_VERSION = 1
SALT_LEN = 16
NONCE_LEN = 12
TAG_LEN = 16
KDF_ITERS = 200_000
HEADER_LEN = 4 + 2 + SALT_LEN + NONCE_LEN
CHUNK_SIZE = 64 * 1024  # 64KB chunks for streaming

ProgressCallback = Callable[[int, int], None]


class ProjectCryptoError(Exception):
    """Raised for decryption / integrity failures."""


@dataclass
class ProjectFile:
    """Handles loading/saving encrypted project files with streaming support."""

    password: str = ""

    # ------------------------------------------------------------------ utils
    @property
    def crypto_available(self) -> bool:
        return _CRYPTO_AVAILABLE

    def _derive_key(self, password: str, salt: bytes) -> bytes:
        if not _CRYPTO_AVAILABLE:
            raise ProjectCryptoError("cryptography package is not installed")
        if PBKDF2HMAC is None or hashes is None:
            raise ProjectCryptoError("cryptography package is not available")
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=KDF_ITERS,
        )
        return kdf.derive(password.encode("utf-8"))

    # ------------------------------------------------------------------ save
    def save(self, project: Project, path: str, password: Optional[str] = None,
             progress: Optional[ProgressCallback] = None) -> None:
        pwd = password if password is not None else self.password
        data = json.dumps(project.to_dict(), ensure_ascii=False,
                          separators=(',', ':')).encode("utf-8")

        if pwd:
            blob = self._encrypt(data, pwd)
        else:
            blob = MAGIC + struct.pack(">H", 0) + data

        with open(path, "wb") as f:
            if progress:
                total = len(blob)
                written = 0
                for i in range(0, total, CHUNK_SIZE):
                    chunk = blob[i:i + CHUNK_SIZE]
                    f.write(chunk)
                    written += len(chunk)
                    progress(written, total)
            else:
                f.write(blob)

    def _encrypt(self, plaintext: bytes, password: str) -> bytes:
        if not _CRYPTO_AVAILABLE or AESGCM is None:
            raise ProjectCryptoError("cryptography package is not installed")
        salt = os.urandom(SALT_LEN)
        nonce = os.urandom(NONCE_LEN)
        key = self._derive_key(password, salt)
        aesgcm = AESGCM(key)
        ct = aesgcm.encrypt(nonce, plaintext, MAGIC + struct.pack(">H", FORMAT_VERSION))
        ciphertext = ct[:-TAG_LEN]
        tag = ct[-TAG_LEN:]
        header = MAGIC + struct.pack(">H", FORMAT_VERSION) + salt + nonce
        return header + struct.pack(">I", len(ciphertext)) + ciphertext + tag

    # ------------------------------------------------------------------ load
    def load(self, path: str, password: Optional[str] = None,
             progress: Optional[ProgressCallback] = None) -> Project:
        pwd = password if password is not None else self.password

        # Use streaming for large files
        file_size = os.path.getsize(path)
        if file_size > 100 * 1024 * 1024:  # > 100MB
            return self._load_streaming(path, pwd, progress)

        with open(path, "rb") as f:
            blob = f.read()

        if progress:
            progress(len(blob), len(blob))

        return self._parse_blob(blob, pwd)

    def _load_streaming(self, path: str, password: str,
                         progress: Optional[ProgressCallback] = None) -> Project:
        """Load large files with streaming to avoid memory spikes."""
        file_size = os.path.getsize(path)

        with open(path, "rb") as f:
            # Read header
            header = f.read(6)
            if len(header) < 6 or header[:4] != MAGIC:
                raise ProjectCryptoError("Not a valid StageLight project file")

            version = struct.unpack(">H", header[4:6])[0]

            if version == 0:
                # Plain text - stream read
                chunks = []
                read = 6
                while True:
                    chunk = f.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    read += len(chunk)
                    if progress:
                        progress(read, file_size)
                plaintext = b"".join(chunks)
            else:
                # Encrypted - read everything then decrypt
                if not _CRYPTO_AVAILABLE:
                    raise ProjectCryptoError(
                        "File is encrypted; install 'cryptography' to open"
                    )
                # Read the rest of the file
                rest = f.read()
                total_read = 6 + len(rest)
                if progress:
                    progress(total_read, file_size)

                blob = header + rest
                return self._parse_blob(blob, password)

        try:
            data = json.loads(plaintext.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ProjectCryptoError("Invalid project JSON data") from exc
        return Project.from_dict(data)

    def _parse_blob(self, blob: bytes, password: str) -> Project:
        """Parse and decrypt a project blob."""
        if len(blob) < 6 or blob[:4] != MAGIC:
            raise ProjectCryptoError("Not a valid StageLight project file")

        version = struct.unpack(">H", blob[4:6])[0]

        if version == 0:
            plaintext = blob[6:]
        else:
            if not _CRYPTO_AVAILABLE:
                raise ProjectCryptoError(
                    "File is encrypted; install 'cryptography' to open"
                )
            if len(blob) < 6 + SALT_LEN + NONCE_LEN + 4 + TAG_LEN:
                raise ProjectCryptoError("File is truncated or corrupted")

            salt = blob[6:6 + SALT_LEN]
            nonce = blob[6 + SALT_LEN:6 + SALT_LEN + NONCE_LEN]
            offset = 6 + SALT_LEN + NONCE_LEN

            try:
                ct_len = struct.unpack(">I", blob[offset:offset + 4])[0]
            except struct.error as exc:
                raise ProjectCryptoError("Invalid file header") from exc
            offset += 4

            if len(blob) < offset + ct_len + TAG_LEN:
                raise ProjectCryptoError("File is truncated or corrupted")

            ciphertext = blob[offset:offset + ct_len]
            tag = blob[offset + ct_len:offset + ct_len + TAG_LEN]

            if AESGCM is None:
                raise ProjectCryptoError("AESGCM not available")

            key = self._derive_key(password, salt)
            aesgcm = AESGCM(key)
            try:
                plaintext = aesgcm.decrypt(
                    nonce, ciphertext + tag,
                    MAGIC + struct.pack(">H", version)
                )
            except Exception as exc:
                raise ProjectCryptoError(
                    "Decryption failed: wrong password or corrupted file"
                ) from exc

        try:
            data = json.loads(plaintext.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ProjectCryptoError("Invalid project JSON data") from exc
        return Project.from_dict(data)

    # -------------------------------------------------------------- checksum
    @staticmethod
    def file_checksum(path: str) -> str:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()

    def is_encrypted(self, path: str) -> bool:
        try:
            with open(path, "rb") as f:
                header = f.read(6)
            if len(header) < 6 or header[:4] != MAGIC:
                return False
            version = struct.unpack(">H", header[4:6])[0]
            return version >= 1
        except OSError:
            return False

    # ---------------------------------------------------------- metadata peek
    def peek_metadata(self, path: str) -> dict:
        """Read project metadata without loading the entire file.
        Returns a dict with 'version', 'name', 'encrypted' keys.
        """
        result = {
            "version": "0.0",
            "name": "",
            "encrypted": self.is_encrypted(path),
            "size": os.path.getsize(path),
        }

        if result["encrypted"]:
            # Encrypted files can't be peeked without password
            return result

        try:
            with open(path, "rb") as f:
                # Read header
                f.read(6)
                # Read first chunk for name
                chunk = f.read(4096)
                # Try to find the name field
                idx = chunk.find(b'"name":"')
                if idx >= 0:
                    start = idx + 8
                    end = chunk.find(b'"', start)
                    if end > start:
                        result["name"] = chunk[start:end].decode("utf-8", errors="replace")
                # Find version
                idx = chunk.find(b'"version":"')
                if idx >= 0:
                    start = idx + 11
                    end = chunk.find(b'"', start)
                    if end > start:
                        result["version"] = chunk[start:end].decode("utf-8", errors="replace")
        except (OSError, UnicodeDecodeError):
            pass

        return result
