# Arcadia Digital — Cloud Session Setup

## Auto-Load Secrets
At the start of every session that needs API access, run this command to load all client secrets:

```bash
eval "$(curl -sf -H 'Authorization: Bearer 995437e7bafa6d08df345ed22b2eb29490c43679f19c1f740ef99123a7ce0810' https://arcadia-secrets.arcadia-digital.workers.dev/)"
```

To load only a specific client's secrets (plus shared), use the `client` parameter:
```bash
eval "$(curl -sf -H 'Authorization: Bearer 995437e7bafa6d08df345ed22b2eb29490c43679f19c1f740ef99123a7ce0810' 'https://arcadia-secrets.arcadia-digital.workers.dev/?client=catholic-herald')"
```

Available clients: arcadia, catholic-herald, cbm-ireland, chc, m10, net-ireland, norum, redzone, shared, stmtf

