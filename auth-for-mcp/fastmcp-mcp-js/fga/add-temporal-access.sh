#!/bin/bash

# Add Temporal Access Script
# 
# This script grants time-limited access to a tool for an Auth0 user.
# 
# Prerequisites:
#   - Auth0 CLI installed and authenticated (auth0 login)
#   - FGA CLI installed (fga)
#   - FGA_STORE_ID environment variable set
# 
# Usage:
#   ./add-temporal-access.sh <email> <tool-name> <duration-seconds>
#   
# Example:
#   ./add-temporal-access.sh peter@gmail.com greet 3600s
#   ./add-temporal-access.sh alice@company.com whoami 7200s

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if required arguments are provided
if [ $# -ne 3 ]; then
  echo -e "${RED}❌ Error: Invalid number of arguments${NC}"
  echo ""
  echo "Usage: $0 <email> <tool-name> <duration-seconds>"
  echo ""
  echo "Arguments:"
  echo "  email              User's email address in Auth0"
  echo "  tool-name          Name of the tool to grant access to (e.g., greet, whoami, get_datetime)"
  echo "  duration-seconds   Duration of access in seconds (e.g., 3600 for 1 hour)"
  echo ""
  echo "Example:"
  echo "  $0 peter@gmail.com greet 3600      # Grant access to 'greet' tool for 1 hour"
  echo "  $0 alice@company.com whoami 7200   # Grant access to 'whoami' tool for 2 hours"
  echo ""
  echo "This script will:"
  echo "  1. Look up the user in Auth0 by email"
  echo "  2. Retrieve their user_id (e.g., auth0|123456)"
  echo "  3. Create a temporal tuple in FGA with a condition"
  echo "  4. Verify the access was granted"
  exit 1
fi

EMAIL="$1"
TOOL_NAME="$2"
DURATION="$3"

# Check if FGA_STORE_ID is set
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

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo -e "${RED}❌ Error: jq is not installed${NC}"
  echo "Install it: brew install jq"
  exit 1
fi

# Convert duration string to seconds for calculations
# Supports formats: 30s, 5m, 2h, 1h30m, etc.
convert_duration_to_seconds() {
  local duration_str="$1"
  local total_seconds=0
  
  # Extract hours
  if [[ $duration_str =~ ([0-9]+)h ]]; then
    total_seconds=$((total_seconds + ${BASH_REMATCH[1]} * 3600))
  fi
  
  # Extract minutes
  if [[ $duration_str =~ ([0-9]+)m ]]; then
    total_seconds=$((total_seconds + ${BASH_REMATCH[1]} * 60))
  fi
  
  # Extract seconds
  if [[ $duration_str =~ ([0-9]+)s ]]; then
    total_seconds=$((total_seconds + ${BASH_REMATCH[1]}))
  fi
  
  echo "$total_seconds"
}

DURATION_SECONDS=$(convert_duration_to_seconds "$DURATION")

if [ "$DURATION_SECONDS" -eq 0 ]; then
  echo -e "${RED}❌ Error: Invalid duration format: ${DURATION}${NC}"
  echo "Duration must be in Go duration format (e.g., 30s, 5m, 2h, 1h30m)"
  exit 1
fi

echo ""
echo -e "${BLUE}🚀 Starting process...${NC}"
echo -e "   Email: ${EMAIL}"
echo -e "   Tool: ${TOOL_NAME}"
echo -e "   Duration: ${DURATION} (${DURATION_SECONDS} seconds)"
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
  exit 1
fi

USER_NAME=$(echo "$USER_JSON" | jq -r '.[0].name // .[0].email' 2>/dev/null)

echo -e "${GREEN}✓ Found user: ${USER_NAME} (${USER_ID})${NC}"
echo ""

# Step 2: Get current timestamp in RFC 3339 format (UTC with Z suffix)
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CURRENT_EPOCH=$(date +%s)
EXPIRES_EPOCH=$((CURRENT_EPOCH + DURATION_SECONDS))
echo -e "${BLUE}⏰ Current timestamp: ${CURRENT_TIME}${NC}"
echo -e "   Grant time: $(date -r ${CURRENT_EPOCH} '+%Y-%m-%d %H:%M:%S')"
echo -e "   Expires: $(date -r ${EXPIRES_EPOCH} '+%Y-%m-%d %H:%M:%S')"
echo ""

# Step 3: Add temporal access in FGA
echo -e "${BLUE}📝 Granting temporal access to tool: ${TOOL_NAME}${NC}"

# Convert duration to Go duration string format (e.g., "10s", "1h30m")
# OpenFGA expects duration in this format

# Write tuple to FGA with temporal condition
# Note: grant_time must be in RFC 3339 format, grant_duration must be a duration string

# We delete the tuple first, as we can't write the tuple if it already exists
fga tuple delete --store-id=$FGA_STORE_ID \
  user:${USER_ID} can_use tool:${TOOL_NAME}  --on-missing ignore

fga tuple write --store-id=$FGA_STORE_ID \
  user:${USER_ID} can_use tool:${TOOL_NAME} \
  --condition-name temporal_access \
  --condition-context '{"grant_time": "'${CURRENT_TIME}'", "grant_duration": "'${DURATION}'"}'

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Successfully granted temporal access!${NC}"
  echo -e "   User: user:${USER_ID}"
  echo -e "   Relation: can_use"
  echo -e "   Object: tool:${TOOL_NAME}"
  echo -e "   Condition: temporal_access"
  echo -e "   Grant Time: ${CURRENT_TIME}"
  echo -e "   Duration: ${DURATION} (${DURATION_SECONDS} seconds)"
else
  echo -e "${RED}❌ Failed to write tuple to FGA${NC}"
  echo -e "${YELLOW}Note: Make sure your FGA model includes the 'temporal_access' condition${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✨ Process completed successfully!${NC}"
echo ""
echo "Access Details:"
echo "  User ID: ${USER_ID}"
echo "  Tool: ${TOOL_NAME}"
echo "  Granted at: $(date -r ${CURRENT_EPOCH} '+%Y-%m-%d %H:%M:%S')"
echo "  Expires at: $(date -r ${EXPIRES_EPOCH} '+%Y-%m-%d %H:%M:%S')"
echo "  Duration: ${DURATION} (${DURATION_SECONDS} seconds)" 
echo ""

