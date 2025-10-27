import base64
import requests
from email.mime.text import MIMEText
from typing_extensions import Annotated
from agent_framework import ai_function
from pydantic import Field
from config import Settings

settings = Settings()

def create_email_sender(gmail_token: str):
    @ai_function(name="send_email", description="Sends an email using Gmail API.")
    async def send_email(
           subject: Annotated[str, Field(description="The subject of the email message.")], 
           body: Annotated[str, Field(description="The body of the email message.")],
           type: Annotated[str, Field(description="The type of the issue: 'technical' or 'administrative'.")]
   )-> str: 
        try: 
            to_email = settings.TECHNICAL_SUPPORT_EMAIL_ADDRESS if type.lower() == "technical" else settings.ADMINISTRATIVE_SUPPORT_EMAIL_ADDRESS
            message = MIMEText(body) 
            message['to'] = to_email 
            message['subject'] = subject 
            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8') 
            response = requests.post( 
                'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 
                    headers={ 
                    'Authorization': f'Bearer {gmail_token}', 
                    'Content-Type': 'application/json' 
                }, 
                json={'raw': raw_message} 
            ) 
            response.raise_for_status() 
            sent_message = response.json() 
            return f"Email sent successfully to {to_email}. Message ID: {sent_message['id']}" 
        except Exception as e: 
            return f"Unexpected error sending email: {e}"
    
    return send_email