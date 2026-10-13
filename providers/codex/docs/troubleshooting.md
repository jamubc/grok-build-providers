# Troubleshooting

## Model

`grok-codex` always passes `-m codex` to Grok.

Check the resolved Grok model entry:

```bash
grep -A7 '^\[model.codex\]' ~/.grok/config.toml
```

Expected:

```toml
model = "gpt-6-luna"
base_url = "http://127.0.0.1:8319/v1"
```

## Inline Proxy Test

Since the proxy server runs inline, it is only active while the `grok-codex` command is executing. To test it:

1. Launch `grok-codex` in your terminal.
2. In a separate terminal session, extract the key and run the test:

```bash
KEY=$(grep GROK_CODEX_PROXY_API_KEY ~/.cli-proxy-api/grok-codex.env | cut -d= -f2)
curl -s \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8319/v1/chat/completions \
  -d '{"model":"gpt-6-luna","messages":[{"role":"user","content":"Say ok"}],"stream":false}' | python3 -m json.tool
```

## Permissions/Sandbox

If Grok is running in a sandbox, it must have network permissions to connect to `127.0.0.1:8319`.
