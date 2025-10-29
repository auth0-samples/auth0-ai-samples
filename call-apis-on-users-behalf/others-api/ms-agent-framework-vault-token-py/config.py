from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Server settings
    SESSION_SECRET: str
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Auth0 settings
    AUTH0_DOMAIN: str
    AUTH0_CLIENT_ID: str
    AUTH0_CLIENT_SECRET: str
    
    # OpenAI settings
    OPENAI_API_KEY: str
    OPENAI_CHAT_MODEL_ID: str = "gpt-3.5-turbo"
    
    # Email settings
    TECHNICAL_SUPPORT_EMAIL_ADDRESS: str
    ADMINISTRATIVE_SUPPORT_EMAIL_ADDRESS: str
    
    @property
    def app_base_url(self) -> str:
        return f"http://{self.HOST}:{self.PORT}"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # This will ignore any extra fields in the environment