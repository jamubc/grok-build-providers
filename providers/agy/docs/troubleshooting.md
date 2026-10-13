# Troubleshooting

## Model

`grok-agy` always passes `-m agy` to Grok.

Check the resolved Grok model entry:

```bash
grep -A7 '^\[model.agy\]' ~/.grok/config.toml
```

Expected:

```toml
model = "gemini-3.8-flash-high"
base_url = "http://127.0.0.1:8318/v1"
```

## Inline Proxy Test

Since the proxy server runs inline, it is only active while the `grok-agy` command is executing. To test it:

1. Launch `grok-agy` in your terminal.
2. In a separate terminal session, extract the key and run the test:

```bash
KEY=$(grep GROK_AGY_PROXY_API_KEY ~/.cli-proxy-api/grok-agy.env | cut -d= -f2)
curl -s \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8318/v1/chat/completions \
  -d '{"model":"gemini-3.8-flash-high","messages":[{"role":"user","content":"Say ok"}],"stream":false}' | python3 -m json.tool
```

## Permissions/Sandbox

If Grok is running in a sandbox, it must have network permissions to connect to `127.0.0.1:8318`.
