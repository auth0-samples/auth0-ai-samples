import os
from dotenv import load_dotenv
from agent_framework.openai import OpenAIChatClient
from send_email import create_email_sender

# Load environment variables from .env file
load_dotenv()

# Get the OpenAI API key from environment variables
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY environment variable is not set. Please check your .env file.")

system_prompt = """
You are an email assistant. Your task is to help users compose and send emails based on their
requests. You have access to a tool called `send_email` which you can use to send emails.
When a user provides a request, you should first try to understand the content of the email they
want to send and determine the recipient's email address based on the context.
If the user's text is related to a technical problem, such as related to their computer, printer, internet connection, software or hardware, then send the email to the technical support email address.
If the user's text is related to an administrative issue, such as related to a contract, a billing issue, or a general inquiry, then send the email to the administrative support email address.
If the user's text does not clearly indicate the type of problem, ask the user to review their request in order to specify if it is a technical or administrative issue.
Compose the email by creating the subject and body of the email message.
After composing the email, use the `send_email` tool to send the email to the recipient and specify the type of message.
After sending the email, you should inform the user that the email has been sent successfully.
If there are any errors while sending the email, you should inform the user about the error.
"""

agent = OpenAIChatClient(
    model_id=os.environ["OPENAI_CHAT_MODEL_ID"],
    api_key=os.environ["OPENAI_API_KEY"],
).create_agent(
    instructions=system_prompt
)

async def create_and_send_message(prompt: str, gmail_token: str) -> str:
    """
    Create an email message based on the prompt and send it via email.
    
    Args:
        prompt (str): The prompt to send to the agent
        
    Returns:
        str: The result of sending the message
    """

    email_tool = create_email_sender(gmail_token)
    response = await agent.run(prompt, tools=[email_tool])
    return response.messages[0].contents[0].text