import os
import keyring
from cryptography.fernet import Fernet
import base64

SERVICE_NAME = "AntigravityMemory"
KEY_ACCOUNT = "master_key"

class SecurityManager:
    def __init__(self):
        self.key = self._get_or_create_key()
        self.cipher = Fernet(self.key)

    def _get_or_create_key(self):
        """Lấy khóa từ macOS Keychain hoặc tạo mới nếu chưa có"""
        stored_key = keyring.get_password(SERVICE_NAME, KEY_ACCOUNT)
        
        if stored_key:
            return stored_key.encode()
        else:
            # Tạo khóa mới
            new_key = Fernet.generate_key()
            keyring.set_password(SERVICE_NAME, KEY_ACCOUNT, new_key.decode())
            return new_key

    def encrypt(self, plain_text):
        """Mã hóa văn bản"""
        if not plain_text:
            return ""
        return self.cipher.encrypt(plain_text.encode()).decode()

    def decrypt(self, encrypted_text):
        """Giải mã văn bản"""
        if not encrypted_text:
            return ""
        try:
            return self.cipher.decrypt(encrypted_text.encode()).decode()
        except Exception:
            # Nếu không giải mã được (có thể do dữ liệu cũ chưa mã hóa)
            return encrypted_text

if __name__ == "__main__":
    # Test nhanh
    sm = SecurityManager()
    test = "Đây là bí mật của Sếp Việt"
    enc = sm.encrypt(test)
    dec = sm.decrypt(enc)
    print(f"Original: {test}")
    print(f"Encrypted: {enc[:20]}...")
    print(f"Decrypted: {dec}")
