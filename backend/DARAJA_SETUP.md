# Daraja API Integration Guide

This guide shows how to set up real M-Pesa payments using Safaricom's Daraja API.

## What is Daraja?

Daraja is Safaricom's API platform that allows developers to integrate M-Pesa payments into their applications. It handles:
- STK Push (prompt user to enter M-Pesa PIN)
- Payment confirmations and callbacks
- Transaction tracking

## Prerequisites

1. **M-Pesa Business Account**: You need either:
   - A Safaricom Till/PayBill number
   - A business account with Safaricom

2. **Daraja Account** (Free to register):
   - Go to https://developer.safaricom.co.ke/
   - Sign up for a developer account
   - Create an app to get credentials

## Step 1: Get Daraja Credentials

### Sandbox Environment (Testing)

1. Go to https://developer.safaricom.co.ke/
2. Sign up for a free account
3. Create a new app:
   - Click "Create App"
   - Name it something like "Chips FastFood"
   - Select your environment (Sandbox for testing)
4. You'll receive:
   - **Consumer Key**
   - **Consumer Secret**
5. Email Safaricom support to get:
   - **Business Short Code** (usually provided for testing)
   - **Online Passkey** (for STK Push authentication)

### Production Environment (Live Payments)

For live payments, you'll need:
- Valid M-Pesa Business Account
- Production Consumer Key & Secret
- Production Business Short Code
- Production Passkey
- SSL Certificate for callback URL

**Contact Safaricom** at: developer@safaricom.co.ke

---

## Step 2: Configure Your Application

### 1. Install Dependencies

```bash
cd backened
npm install axios dotenv
```

### 2. Create `.env` File

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
DARAJA_CONSUMER_KEY=your_actual_key_here
DARAJA_CONSUMER_SECRET=your_actual_secret_here
DARAJA_BUSINESS_SHORT_CODE=174379
DARAJA_PASSKEY=your_passkey_here
DARAJA_CALLBACK_URL=http://localhost:5000/api/payment-callback
NODE_ENV=development
```

### 3. Load Environment Variables in Node

Update the server to load `.env`:

```bash
npm install dotenv
```

Add to top of `backened/server.js`:
```javascript
require('dotenv').config();
```

---

## Step 3: Test the Integration

### Using PowerShell

```powershell
# 1. Start the server
cd "backened"
npm install  # if you haven't already
node server.js

# 2. In another terminal, test the payment endpoint
$payload = @{
  phoneNumber = '0712345678'
  amount = 100
  items = @(@{ name = 'Chapati'; price = 20; quantity = 5 })
  deliveryLocation = '123 Main St'
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:5000/api/pay `
  -Method Post `
  -Body $payload `
  -ContentType 'application/json'
```

**Expected Response** (Sandbox):
```json
{
  "success": true,
  "message": "STK push successfully sent",
  "checkoutRequestId": "ws1234567890",
  "orderId": "ORD-123456"
}
```

This will trigger an STK prompt on the phone number you provided (in sandbox).

---

## Step 4: Handle Payment Callbacks

When a user completes/cancels payment, M-Pesa sends data to your callback URL:

**Endpoint**: `POST /api/payment-callback`

**Callback Data Structure**:
```json
{
  "Result": {
    "ResultCode": 0,
    "ResultDesc": "The service request has been processed successfully.",
    "OriginatorConversationID": "...",
    "CheckoutRequestID": "ws...",
    "ResponseDescription": "Success. Request accepted for processing",
    "MerchantRequestID": "123456",
    "Items": [...]
  }
}
```

**ResultCode Values**:
- `0` = Success (payment completed)
- `1` = Insufficient funds
- `2` = Less than minimum transaction amount
- Other = Various errors

### Current Implementation

The callback endpoint (`/api/payment-callback`) logs all callbacks. Extend it to:
- Update order status to "completed"
- Send customer confirmation email/SMS
- Trigger delivery notifications

---

## Step 5: For Production Deployment

### 1. Use Environment Variables

**Never commit credentials to Git!** Use `.gitignore`:
```
.env
.env.local
node_modules/
```

### 2. Set Up HTTPS Callback

M-Pesa requires callbacks to use HTTPS:

**Option A: Reverse Proxy (nginx)**
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:5000;
    }
}
```

**Option B: ngrok (for testing with HTTPS)**
```bash
ngrok http 5000
```
Then set:
```
DARAJA_CALLBACK_URL=https://xxx.ngrok.io/api/payment-callback
```

### 3. Deploy to Cloud

Recommended platforms:
- **Heroku** (simple): `heroku create && git push heroku main`
- **AWS EC2** (scalable)
- **DigitalOcean** (affordable)
- **Railway.app** (Node.js friendly)

---

## Testing Checklist

- [ ] Created Daraja account at https://developer.safaricom.co.ke/
- [ ] Got Consumer Key & Secret
- [ ] Got Business Short Code & Passkey
- [ ] Created `.env` file with credentials
- [ ] Installed axios: `npm install axios`
- [ ] Started server: `node server.js`
- [ ] Tested payment endpoint with valid phone
- [ ] Received STK prompt on phone
- [ ] Completed/cancelled payment
- [ ] Checked server logs for callback

---

## Common Issues

### "Failed to authenticate with Daraja"
- Check Consumer Key and Secret are correct
- Verify NODE_ENV is set to 'development' or 'production' appropriately
- For sandbox, use Business Short Code: `174379`

### "Invalid passkey"
- Passkey must match exactly what Safaricom provided
- For sandbox testing, ask Safaricom: developer@safaricom.co.ke

### Callback URL not receiving data
- Must be HTTPS for production
- For local testing, use ngrok: `ngrok http 5000`
- Firewall must allow inbound traffic on port 5000

### "Phone number format invalid"
- M-Pesa requires: 254712345678 format
- App automatically converts 0712345678 to 254712345678
- Ensure country code (254) is included

---

## Support

**Safaricom Daraja Support**: developer@safaricom.co.ke

**Documentation**: https://developer.safaricom.co.ke/apis/docs/

---

## API Reference

### STK Push Request

```javascript
{
  BusinessShortCode: "174379",           // Your till/paybill
  Password: "...",                        // SHA256 encrypted
  Timestamp: "20230615120000",            // YYYYMMDDHHmmss
  TransactionType: "CustomerPayBillOnline",
  Amount: 100,                            // Minimum 1 KSH
  PartyA: "254712345678",                 // Customer phone
  PartyB: "174379",                       // Your business code
  PhoneNumber: "254712345678",
  CallBackURL: "https://yourdomain.com/api/payment-callback",
  AccountReference: "ORD-123456",
  TransactionDesc: "Food order ORD-123456"
}
```

### Response

```json
{
  "MerchantRequestID": "123456",
  "CheckoutRequestID": "ws_CO_DMZ_123456",
  "ResponseCode": "0",
  "ResponseDescription": "Success. Request accepted for processing",
  "CustomerMessage": "Success. Request accepted for processing"
}
```

---

You're all set! Your Café FastFood app is now ready to process real M-Pesa payments.
