from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "Bilgi Maratonu"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    DATABASE_URL: str
    SYNC_DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379"
    TENANT_DOMAIN: str = "bilgimaratonu.com"
    TENANT_TIMEZONE: str = "Europe/Istanbul"
    FIRST_ADMIN_EMAIL: str
    FIRST_ADMIN_PASSWORD: str
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    class Config:
        env_file = ".env"

settings = Settings()
