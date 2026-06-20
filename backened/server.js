const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // Default for dev; change in prod
const tokens = new Set(); // Simple in-memory token store

// Serve the frontend static files (makes frontend available at http://localhost:5000)
const FRONTEND_DIR = path.join(__dirname, '..', 'fronted');
app.use(express.static(FRONTEND_DIR));


// Middleware
app.use(cors()); // Allows frontend connection
app.use(express.json()); // Parses incoming JSON data

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
app.post('/api/orders', (req, res) => {
    const { items, totalAmount, timestamp, deliveryLocation } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    if (!deliveryLocation) {
        return res.status(400).json({ success: false, message: 'Delivery location is required' });
    }

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = { orderId, items, totalAmount, timestamp, deliveryLocation, status: 'pending' };

    let existingOrders = [];
    if (fs.existsSync(ORDERS_FILE)) {
        const fileData = fs.readFileSync(ORDERS_FILE, 'utf-8');
        existingOrders = fileData ? JSON.parse(fileData) : [];
    }

    existingOrders.push(newOrder);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(existingOrders, null, 2));

    console.log(`[Success] Order Saved: ${orderId} - Total: Ksh ${totalAmount}`);

    res.status(201).json({
        success: true,
        message: 'Order saved successfully!',
        orderId: orderId
    });
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

// Get all orders (admin - protected)
app.get('/api/orders', verifyAdminToken, (req, res) => {
    try {
        const orders = readOrders();
        res.status(200).json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not read orders' });
    }
});

// Update order status or fields (admin - protected)
app.put('/api/orders/:orderId', verifyAdminToken, (req, res) => {
    const { orderId } = req.params;
    const updates = req.body || {};

    let orders = readOrders();
    const idx = orders.findIndex(o => o.orderId === orderId);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });

    orders[idx] = { ...orders[idx], ...updates };
    writeOrders(orders);
    res.status(200).json({ success: true, order: orders[idx] });
});

// Delete an order (admin - protected)
app.delete('/api/orders/:orderId', verifyAdminToken, (req, res) => {
    const { orderId } = req.params;
    let orders = readOrders();
    const idx = orders.findIndex(o => o.orderId === orderId);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Order not found' });

    const removed = orders.splice(idx, 1)[0];
    writeOrders(orders);
    res.status(200).json({ success: true, removed });
});

// 2. M-Pesa Payment Endpoint
app.post('/api/pay', (req, res) => {
    const { phoneNumber, amount, items, deliveryLocation } = req.body;

    if (!phoneNumber || !amount || !items) {
        return res.status(400).json({ success: false, message: 'Missing payment parameters' });
    }

    if (!deliveryLocation) {
        return res.status(400).json({ success: false, message: 'Delivery location is required' });
    }

    let formattedPhone = phoneNumber;
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
    }

    const checkoutRequestId = 'ws_CO_20062026_' + Math.floor(100000000 + Math.random() * 900000000);

    console.log(`\n======================================`);
    console.log(`[STK PUSH TRIGGERED]`);
    console.log(`Sending Prompt to: +${formattedPhone}`);
    console.log(`Amount: Ksh ${amount}`);
    console.log(`Delivery Location: ${deliveryLocation}`);
    console.log(`======================================\n`);

    res.status(200).json({
        success: true,
        message: 'STK push successfully initiated',
        checkoutRequestId: checkoutRequestId
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Café FastFood backend is active at http://localhost:${PORT}`);
});

// Serve index.html for the root path (useful when opening http://localhost:5000)
app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});