#\!/bin/bash
# Auto-load Arcadia secrets from Cloudflare KV
# Runs at SessionStart in cloud sessions

SECRETS_URL="https://arcadia-secrets.arcadia-digital.workers.dev"
BEARER="995437e7bafa6d08df345ed22b2eb29490c43679f19c1f740ef99123a7ce0810"

# Fetch all secrets and write to a sourceable file
curl -sf -H "Authorization: Bearer $BEARER" "$SECRETS_URL/" > /tmp/.arcadia-secrets 2>/dev/null

if [ -s /tmp/.arcadia-secrets ]; then
  source /tmp/.arcadia-secrets
  rm -f /tmp/.arcadia-secrets
  echo "Secrets loaded."
fi

exit 0

