from fastapi import FastAPI, Request, Response, Depends
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pydantic import BaseModel
from messenger_agent import create_and_send_message
from starlette.middleware.sessions import SessionMiddleware
from auth0_fastapi.server.routes import router, register_auth_routes
from auth0 import auth0_config, auth0_client
import uvicorn
import os

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=os.getenv("SESSION_SECRET"))
app.state.auth_config = auth0_config
app.state.auth_client = auth0_client

register_auth_routes(router, auth0_config)
app.include_router(router)

# Mount the static directory for JS and other static assets
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index(request: Request, response: Response):
    try:
        await auth0_client.require_session(request, response)
    except Exception as e:
        return RedirectResponse(url="/auth/login")
    
    return FileResponse("static/index.html")

class Prompt(BaseModel):
    prompt: str

@app.post("/prompt")
async def submit_prompt(
    data: Prompt, 
    request: Request,
    response: Response,
    auth_session = Depends(auth0_client.require_session)
):

    store_options={"request": request, "response": response}
    gmail_token = await auth0_client.client.get_access_token_for_connection({"connection": "google-oauth2"}, store_options=store_options)

    result = await create_and_send_message(
        data.prompt,
        gmail_token
    )
    return {"response": result}


if __name__ == "__main__":
    # Get configuration from environment variables
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    
    uvicorn.run(app, host=host, port=port)