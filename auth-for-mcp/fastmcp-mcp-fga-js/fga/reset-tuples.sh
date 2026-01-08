
#!/bin/bash

# This script resets all tuples in the FGA store, by deleting all tuples and re-adding them from the tuples file.
# 
# Prerequisites:
#   - Auth0 CLI installed and authenticated (auth0 login)
#   - FGA CLI installed (fga)
#   - For Auth0 FGA:
#       FGA_API_URL, FGA_STORE_ID, FGA_API_TOKEN_ISSUER, FGA_API_AUDIENCE, FGA_CLIENT_ID and FGA_CLIENT_SECRET environment variables set
#   - For OpenFGA:
#       - FGA_STORE_ID environment variable set# 
# Usage:
#   ./fga/reset-tuples.sh

fga tuple read --output-format=simple-json --max-pages=0 > tuples.json
fga tuple delete --file tuples.json
fga tuple write --file tuples.yaml