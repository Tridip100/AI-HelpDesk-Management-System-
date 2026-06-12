from pydantic_settings import BaseSettings, SettingsConfigDict
import os 

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str 
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    APP_ENV: str 

    IMAP_HOST:          str
    IMAP_PORT:          int
    IMAP_USER:          str
    IMAP_PASSWORD:      str
    IMAP_POLL_INTERVAL: int
    IMAP_MAILBOX:       str
    TAVILY_API_KEY:     str 


    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),  # ← points to root .env
        extra="ignore"
    )

settings = Settings()