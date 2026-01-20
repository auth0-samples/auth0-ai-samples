from fastapi import FastAPI, Request, HTTPException, Response, Depends
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from messenger_agent import create_and_send_message
from starlette.middleware.sessions import SessionMiddleware
from auth0_fastapi.server.routes import router, register_auth_routes
from auth0_fastapi.errors import AccessTokenForConnectionError
from auth0 import auth0_config, auth0_client
from config import Settings
import uvicorn

# Initialize settings
settings = Settings()

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=settings.SESSION_SECRET)
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
    try:
        store_options={"request": request, "response": response}
        gmail_token = await auth0_client.client.get_access_token_for_connection(
            {"connection": "google-oauth2"}, 
            store_options=store_options
        )

        result = await create_and_send_message(
            data.prompt,
            gmail_token
        )
        return {"response": result}
    
    except AccessTokenForConnectionError:
        # User hasn't connected their Google account yet
        # Instruct frontend to POST to /auth/connect to initiate Connected Accounts flow
        raise HTTPException(
            status_code=403,
            detail={
            "error": "google_account_not_connected",
            "message": "Please connect your Google account first",
            "connect_endpoint": "/auth/connect",
            "connect_params": {
                "connection": "google-oauth2"
                }
            }
        )


if __name__ == "__main__":
    uvicorn.run(app, host=settings.HOST, port=settings.PORT)