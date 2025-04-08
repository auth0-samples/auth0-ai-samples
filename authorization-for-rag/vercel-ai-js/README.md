# RAG with Authorization using Vercel AI SDK and OpenFGA

This example demonstrates how to implement Retrieval-Augmented Generation (RAG) with fine-grained authorization using the Vercel AI SDK and OpenFGA.

## Overview

The application uses:
- **Vercel AI SDK**: For streaming AI responses
- **OpenFGA**: For fine-grained authorization
- **FAISS**: For vector similarity search
- **OpenAI**: For embeddings and completions

## How It Works

1. Documents are embedded and stored in a FAISS vector store
2. When a user makes a query, the system:
   - Retrieves relevant documents based on vector similarity
   - Filters documents based on the user's permissions using OpenFGA
   - Generates a response using only the documents the user has access to
   - Streams the response using Vercel AI SDK

## Setup

### Prerequisites

- Node.js 18+
- An OpenAI API key
- An OpenFGA store

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Copy the `.env.example` file to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

### Initialize OpenFGA

Run the initialization script to set up the OpenFGA store with the necessary authorization model:

```bash
bun run fga:init
```

This script configures the authorization model and sets up initial permissions (all users can view the public document).

## Running the Example

Start the application:

```bash
bun run start
```

The application will:
1. Load and embed documents
2. Process a sample query
3. Filter results based on user permissions
4. Generate and stream a response

## Authorization Model

The example uses a simple authorization model:
- All users can access the public document
- Specific users can be granted access to private documents

## Extending the Example

To use this in a web application:
- Import the `generateStreamingResponse` function
- Pass the user query and user ID
- Return the streaming response to the client

Example:
```typescript
import { generateStreamingResponse } from './src/index';

// In your API route handler
export async function POST(req) {
  const { query, userId } = await req.json();
  return generateStreamingResponse(query, userId);
}
```

## License

Apache-2.0 