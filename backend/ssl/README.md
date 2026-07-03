This folder contains self-signed TLS certificate and key for local development only.

Do NOT use these certificates in production.

Files:
- `cert.pem` - self-signed certificate
- `key.pem` - private key

To start the server with HTTPS locally:

```powershell
# from backened folder
setx HTTPS true
setx SSL_CERT "%CD%\ssl\cert.pem"
setx SSL_KEY "%CD%\ssl\key.pem"
node server.js
```

Or set env vars inline:

```powershell
HTTPS=true SSL_CERT=ssl\cert.pem SSL_KEY=ssl\key.pem node server.js
```
