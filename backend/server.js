const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { isDatabaseConfigured, initializeDatabase, createOrderInDb, getOrdersFromDb, updateOrderInDb, deleteOrderInDb } = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const tokens = new Set();

// Daraja API Configuration
const DARAJA_CONFIG = {
  consumerKey: process.env.DARAJA_CONSUMER_KEY || '',
  consumerSecret: process.env.DARAJA_CONSUMER_SECRET || '',
  businessShortCode: process.env.DARAJA_BUSINESS_SHORT_CODE || '0722345600',
  passkey: process.env.DARAJA_PASSKEY || '',
  callbackUrl: process.env.DARAJA_CALLBACK_URL || 'http://localhost:5000/api/payment-callback',
  isProduction: process.env.NODE_ENV === 'production'
};

const DARAJA_URLs = {
  production: 'https://api.safaricom.co.ke',
  sandbox: 'https://sandbox.safaricom.co.ke'
};

const BASE_URL = DARAJA_CONFIG.isProduction ? DARAJA_URLs.production : DARAJA_URLs.sandbox;

// Serve the frontend static files
const FRONTEND_DIR = path.join(__dirname, '..', 'fronted');
app.use(express.static(FRONTEND_DIR));


// Security & middleware
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

app.use(helmet()); // Sets secure HTTP headers

// Tighten CORS in production
if (process.env.NODE_ENV === 'production') {
    app.use(cors({
        origin: process.env.FRONTEND_URL || 'https://yourdomain.com',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));
} else {
    app.use(cors());
}

app.use(express.json()); // Parses incoming JSON data
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Basic rate limiting
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // limit each IP to 60 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

app.get('/api', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'API is running',
        endpoints: {
            health: '/api/health',
            adminLogin: 'POST /api/admin/login',
            createOrder: 'POST /api/orders',
            getOrders: 'GET /api/orders (admin only)',
            pay: 'POST /api/pay',
            callback: 'POST /api/payment-callback'
        }
    });
});

app.get('/api/health', (req, res) => {
    res.status(200).json({ success: true, message: 'Backend is healthy' });
});

// Daraja Helper Functions
let darajaAccessToken = null;
let tokenExpiry = 0;

async function getDarajaAccessToken() {
    // Return cached token if still valid
    if (darajaAccessToken && Date.now() < tokenExpiry) {
        return darajaAccessToken;
    }

    try {
        const auth = Buffer.from(`${DARAJA_CONFIG.consumerKey}:${DARAJA_CONFIG.consumerSecret}`).toString('base64');
        const response = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });
        
        darajaAccessToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in * 1000);
        console.log('[Daraja] Access token obtained successfully');
        return darajaAccessToken;
    } catch (err) {
        console.error('[Daraja] Failed to get access token:', err.response?.data || err.message);
        return null;
    }
}

function generateTimestamp() {
    return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
}

function generatePassword(shortCode, passkey, timestamp) {
    const crypto = require('crypto');
    const text = shortCode + passkey + timestamp;
    return crypto.createHash('sha256').update(text).digest('base64');
}

function formatPhoneNumber(phoneNumber) {
    let formattedPhone = `${phoneNumber || ''}`.trim();
    if (!formattedPhone) return '';

    if (formattedPhone.startsWith('0')) {
        formattedPhone = `254${formattedPhone.substring(1)}`;
    }

    return formattedPhone.replace(/\D/g, '');
}

function createOrderRecord(items, totalAmount, deliveryLocation, extraInfo = {}) {
    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    return {
        orderId,
        items,
        totalAmount,
        deliveryLocation,
        timestamp: new Date().toISOString(),
        status: 'pending',
        paymentMethod: 'mpesa',
        paymentStatus: 'pending',
        ...extraInfo
    };
}

function updateOrderById(orderId, updates) {
    const orders = readOrders();
    const idx = orders.findIndex(order => order.orderId === orderId);
    if (idx === -1) return null;

    orders[idx] = { ...orders[idx], ...updates };
    writeOrders(orders);
    return orders[idx];
}

function updateOrderByCheckoutRequestId(checkoutRequestId, updates) {
    const orders = readOrders();
    const idx = orders.findIndex(order => order.checkoutRequestId === checkoutRequestId);
    if (idx === -1) return null;

    orders[idx] = { ...orders[idx], ...updates };
    writeOrders(orders);
    return orders[idx];
}

// Auth middleware for admin routes
const verifyAdminToken = (req, res, next) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token || !tokens.has(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

// Login endpoint
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ success: false, message: 'Password required' });
    }
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Invalid password' });
    }
    const token = 'token_' + Math.random().toString(36).substring(2, 15);
    tokens.add(token);
    res.status(200).json({ success: true, token });
});

// 1. Standard Checkout Endpoint
app.post('/api/orders', async (req, res) => {
    const { items, totalAmount, timestamp, deliveryLocation } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    if (!deliveryLocation) {
        return res.status(400).json({ success: false, message: 'Delivery location is required' });
    }

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = { orderId, items, totalAmount, timestamp, deliveryLocation, status: 'pending', paymentMethod: 'cash', paymentStatus: 'pending' };

    try {
        const savedOrder = await saveOrder(newOrder);
        console.log(`[Success] Order Saved: ${orderId} - Total: Ksh ${totalAmount}`);
        return res.status(201).json({
            success: true,
            message: 'Order saved successfully!',
            orderId: orderId
        });
    } catch (error) {
        console.error('[Order Save Error]', error.message || error);
        return res.status(500).json({ success: false, message: 'Failed to save order' });
    }
});

app.post('/api/orders/cash', async (req, res) => {
    const { items, totalAmount, timestamp, deliveryLocation, customerName } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    if (!deliveryLocation) {
        return res.status(400).json({ success: false, message: 'Delivery location is required' });
    }

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = {
        orderId,
        items,
        totalAmount,
        timestamp,
        deliveryLocation,
        customerName: customerName || 'Walk-in Customer',
        status: 'pending',
        paymentMethod: 'cash',
        paymentStatus: 'pending'
    };

    try {
        const savedOrder = await saveOrder(newOrder);
        console.log(`[Success] Cash Order Saved: ${orderId} - Total: Ksh ${totalAmount}`);
        return res.status(201).json({
            success: true,
            message: 'Cash order placed successfully',
            orderId: orderId,
            paymentMethod: 'cash'
        });
    } catch (error) {
        console.error('[Cash Order Save Error]', error.message || error);
        return res.status(500).json({ success: false, message: 'Failed to save cash order' });
    }
});

// Helper functions for orders file
function readOrders() {
    if (!fs.existsSync(ORDERS_FILE)) return [];
    const data = fs.readFileSync(ORDERS_FILE, 'utf-8');
    return data ? JSON.parse(data) : [];
}

function writeOrders(orders) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

async function saveOrder(order) {
    if (isDatabaseConfigured()) {
        return createOrderInDb(order);
    }

    let existingOrders = readOrders();
    existingOrders.push(order);
    writeOrders(existingOrders);
    return order;
}

async function getAllOrders() {
    if (isDatabaseConfigured()) {
        return getOrdersFromDb();
    }

    return readOrders();
}

async function updateOrder(orderId, updates) {
    if (isDatabaseConfigured()) {
        return updateOrderInDb(orderId, updates);
    }

    const orders = readOrders();
    const idx = orders.findIndex(order => order.orderId === orderId);
    if (idx === -1) return null;

    orders[idx] = { ...orders[idx], ...updates };
    writeOrders(orders);
    return orders[idx];
}

async function deleteOrder(orderId) {
    if (isDatabaseConfigured()) {
        return deleteOrderInDb(orderId);
    }

    const orders = readOrders();
    const idx = orders.findIndex(order => order.orderId === orderId);
    if (idx === -1) return null;
    const removed = orders.splice(idx, 1)[0];
    writeOrders(orders);
    return removed;
}

// Get all orders (admin - protected)
app.get('/api/orders', verifyAdminToken, async (req, res) => {
    try {
        const orders = await getAllOrders();
        res.status(200).json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not read orders' });
    }
});

// Update order status or fields (admin - protected)
app.put('/api/orders/:orderId', verifyAdminToken, async (req, res) => {
    const { orderId } = req.params;
    const updates = req.body || {};

    const updatedOrder = await updateOrder(orderId, updates);
    if (!updatedOrder) {
        return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({ success: true, order: updatedOrder });
});

// Delete an order (admin - protected)
app.delete('/api/orders/:orderId', verifyAdminToken, async (req, res) => {
    const { orderId } = req.params;
    const removed = await deleteOrder(orderId);
    if (!removed) {
        return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({ success: true, removed });
});

// 2. M-Pesa Payment Endpoint (Daraja STK Push)
app.post('/api/pay', async (req, res) => {
    const { phoneNumber, amount, items, deliveryLocation } = req.body;

    if (!phoneNumber || !amount || !items) {
        return res.status(400).json({ success: false, message: 'Missing payment parameters' });
    }

    if (!deliveryLocation) {
        return res.status(400).json({ success: false, message: 'Delivery location is required' });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone || formattedPhone.length < 12) {
        return res.status(400).json({ success: false, message: 'Phone number must be in a valid format' });
    }

    const order = createOrderRecord(items, amount, deliveryLocation, {
        phoneNumber: formattedPhone,
        paymentMethod: 'mpesa',
        paymentStatus: 'initiating'
    });

    const existingOrders = readOrders();
    existingOrders.push(order);
    writeOrders(existingOrders);

    // Validate Daraja config
    if (!DARAJA_CONFIG.consumerKey || !DARAJA_CONFIG.consumerSecret || !DARAJA_CONFIG.passkey) {
        console.warn('[Daraja] Credentials not configured - using mock mode');
        const mockCheckoutRequestId = 'mock_' + Math.random().toString(36).substring(7);
        updateOrderById(order.orderId, {
            status: 'payment_pending',
            paymentStatus: 'mocked',
            checkoutRequestId: mockCheckoutRequestId
        });
        return res.status(200).json({
            success: true,
            message: 'STK push initiated (mock mode - configure Daraja for real payments)',
            checkoutRequestId: mockCheckoutRequestId,
            orderId: order.orderId
        });
    }

    try {
        const timestamp = generateTimestamp();
        const password = generatePassword(DARAJA_CONFIG.businessShortCode, DARAJA_CONFIG.passkey, timestamp);

        const token = await getDarajaAccessToken();
        if (!token) {
            updateOrderById(order.orderId, {
                status: 'payment_failed',
                paymentStatus: 'failed',
                error: 'Failed to authenticate with Daraja'
            });
            return res.status(500).json({ success: false, message: 'Failed to authenticate with Daraja' });
        }

        const stkPayload = {
            BusinessShortCode: DARAJA_CONFIG.businessShortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.floor(amount),
            PartyA: formattedPhone,
            PartyB: DARAJA_CONFIG.businessShortCode,
            PhoneNumber: formattedPhone,
            CallBackURL: DARAJA_CONFIG.callbackUrl,
            AccountReference: order.orderId,
            TransactionDesc: `Food order ${order.orderId}`
        };

        const response = await axios.post(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, stkPayload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        updateOrderById(order.orderId, {
            status: 'payment_pending',
            paymentStatus: 'initiated',
            checkoutRequestId: response.data.CheckoutRequestID
        });

        console.log(`[Daraja] STK Push sent: ${order.orderId} to ${formattedPhone}, Amount: Ksh ${amount}`);

        res.status(200).json({
            success: true,
            message: 'STK push successfully sent',
            checkoutRequestId: response.data.CheckoutRequestID,
            orderId: order.orderId
        });
    } catch (err) {
        updateOrderById(order.orderId, {
            status: 'payment_failed',
            paymentStatus: 'failed',
            error: err.response?.data?.errorMessage || err.message
        });
        console.error('[Daraja] STK Push error:', err.response?.data || err.message);
        res.status(500).json({
            success: false,
            message: err.response?.data?.errorMessage || 'Payment request failed'
        });
    }
});

// Start Server
async function startServer() {
    if (isDatabaseConfigured()) {
        try {
            await initializeDatabase();
            console.log('[DB] PostgreSQL connected and tables ready');
        } catch (err) {
            console.error('[DB] Failed to initialize PostgreSQL:', err.message);
        }
    } else {
        console.log('[DB] DATABASE_URL not set, using JSON file storage');
    }

    app.listen(PORT, () => {
        console.log(`Café FastFood backend is active at http://localhost:${PORT}`);
    });
}

startServer();

    // Optional: start HTTPS server when certs are provided (local dev only)
    if (process.env.HTTPS === 'true') {
        const https = require('https');
        const sslKeyPath = process.env.SSL_KEY || path.join(__dirname, 'ssl', 'key.pem');
        const sslCertPath = process.env.SSL_CERT || path.join(__dirname, 'ssl', 'cert.pem');

        if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
            const key = fs.readFileSync(sslKeyPath);
            const cert = fs.readFileSync(sslCertPath);
            https.createServer({ key, cert }, app).listen(process.env.HTTPS_PORT || 5443, () => {
                console.log(`Café FastFood HTTPS server running at https://localhost:${process.env.HTTPS_PORT || 5443}`);
            });
        } else {
            console.warn('[HTTPS] SSL files not found, skipping HTTPS server startup');
        }
    }

// Payment Callback - M-Pesa sends callback when payment is processed
app.post('/api/payment-callback', (req, res) => {
    try {
        const callbackData = req.body;
        console.log('[Callback] M-Pesa Payment Callback received:', JSON.stringify(callbackData, null, 2));

        res.status(200).json({ success: true, message: 'Callback received' });

        const result = callbackData?.Result;
        const checkoutRequestID = result?.CheckoutRequestID;

        if (!checkoutRequestID) {
            console.warn('[Callback] No checkout request ID in callback payload');
            return;
        }

        if (result?.ResultCode === 0) {
            updateOrderByCheckoutRequestId(checkoutRequestID, {
                status: 'completed',
                paymentStatus: 'completed',
                callbackResult: result
            });
            console.log(`[Success] Payment confirmed: ${checkoutRequestID}`);
        } else {
            updateOrderByCheckoutRequestId(checkoutRequestID, {
                status: 'payment_failed',
                paymentStatus: 'failed',
                callbackResult: result
            });
            console.log(`[Failed] Payment error: ${result?.ResultDesc}`);
        }
    } catch (err) {
        console.error('[Callback] Error processing payment callback:', err.message);
        res.status(200).json({ success: true });
    }
});

// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});