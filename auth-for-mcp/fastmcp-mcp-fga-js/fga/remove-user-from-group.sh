#!/bin/bash

# Remove User from Group Script
# 
# This script retrieves an Auth0 user by email and removes them from an FGA group.
# 
# Prerequisites:
#   - Auth0 CLI installed and authenticated (auth0 login)
#   - FGA CLI installed (fga)
#   - FGA_STORE_ID environment variable set
# 
# Usage:
#   ./scripts/remove-user-from-group.sh <email> <group-name>
#   
# Example:
#   ./scripts/remove-user-from-group.sh peter@gmail.com marketing

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if required arguments are provided
if [ $# -ne 2 ]; then
  echo -e "${RED}❌ Error: Invalid number of arguments${NC}"
  echo ""
  echo "Usage: $0 <email> <group-name>"
  echo ""
  echo "Arguments:"
  echo "  email        User's email address in Auth0"
  echo "  group-name   Name of the group to add the user to"
  echo ""
  echo "Example:"
  echo "  $0 peter@gmail.com marketing"
  echo "  $0 alice@company.com developers"
  echo ""
  echo "This script will:"
  echo "  1. Look up the user in Auth0 by email"
  echo "  2. Retrieve their user_id (e.g., auth0|123456)"
  echo "  3. Delete a tuple in FGA: user:<user_id> -> member -> group:<group-name>"
  exit 1
fi

EMAIL="$1"
GROUP_NAME="$2"

# Check if OPENFGA_STORE_ID is set
if [ -z "$FGA_STORE_ID" ]; then
  echo -e "${RED}❌ Error: FGA_STORE_ID environment variable is not set${NC}"
  echo "Please set it in your .env file or export it:"
  echo "  export FGA_STORE_ID=your-store-id"
  exit 1
fi

# Check if auth0 CLI is installed
if ! command -v auth0 &> /dev/null; then
  echo -e "${RED}❌ Error: auth0 CLI is not installed${NC}"
  echo "Install it from: https://auth0.github.io/auth0-cli/"
  exit 1
fi

# Check if fga CLI is installed
if ! command -v fga &> /dev/null; then
  echo -e "${RED}❌ Error: fga CLI is not installed${NC}"
  echo "Install it from: https://github.com/openfga/cli"
  echo "  macOS: brew install openfga/tap/fga"
  echo "  Other: https://github.com/openfga/cli/releases"
  exit 1
fi

echo ""
echo -e "${BLUE}🚀 Starting process...${NC}"
echo -e "   Email: ${EMAIL}"
echo -e "   Group: ${GROUP_NAME}"
echo -e "   Store ID: ${FGA_STORE_ID}"
echo ""

# Step 1: Get user ID from Auth0
echo -e "${BLUE}🔍 Looking up user with email: ${EMAIL}${NC}"

# Search for user by email using Auth0 CLI
USER_JSON=$(auth0 users search --query "email:\"${EMAIL}\"" --json 2>/dev/null)

if [ -z "$USER_JSON" ] || [ "$USER_JSON" == "[]" ]; then
  echo -e "${RED}❌ No user found with email: ${EMAIL}${NC}"
  exit 1
fi

# Extract user_id from JSON (get first result if multiple)
USER_ID=$(echo "$USER_JSON" | jq -r '.[0].user_id' 2>/dev/null)

if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
  echo -e "${RED}❌ Failed to extract user_id from Auth0 response${NC}"
  echo "Make sure jq is installed: brew install jq"
  exit 1
fi

USER_NAME=$(echo "$USER_JSON" | jq -r '.[0].name // .[0].email' 2>/dev/null)

echo -e "${GREEN}✓ Found user: ${USER_NAME} (${USER_ID})${NC}"
echo ""

# Step 2: Add user to group in FGA
echo -e "${BLUE}📝 Removeing user ${USER_ID} to group: ${GROUP_NAME}${NC}"

# Write tuple to FGA
fga tuple delete --store-id "$FGA_STORE_ID" \
  "user:${USER_ID}" member "group:${GROUP_NAME}" --on-missing ignore

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Successfully deleted user to group!${NC}"
  echo -e "   User: user:${USER_ID}"
  echo -e "   Relation: member"
  echo -e "   Object: group:${GROUP_NAME}"
else
  echo -e "${RED}❌ Failed to delete tuple to FGA${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✨ Process completed successfully!${NC}"
