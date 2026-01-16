async function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message) {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML += `<div class="alert alert-primary ms-auto" style="max-width:80%">${message}</div>`;
        input.value = '';
        
        const response = await fetch(`/prompt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: message })
        });

        const data = await response.json();
        
        // Handle connected account error
        if (data.error === 'google_account_not_connected') {
            messagesContainer.innerHTML += `<div class="alert alert-warning" style="max-width:80%">${data.message}</div>`;
            
            // Redirect to /auth/connect to initiate the Connected Accounts flow
            const connection = data.connect_params?.connection || 'google-oauth2';
            window.location.href = `/auth/connect?connection=${connection}`;
            return;
        }
        
        // Display the response or error
        const messageText = data.response || data.message || 'An error occurred';
        messagesContainer.innerHTML += `<div class="alert alert-secondary" style="max-width:80%">${messageText}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    sendButton.addEventListener('click', sendMessage);
});