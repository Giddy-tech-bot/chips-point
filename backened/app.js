const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Fallback path to save orders (adjust this path if your folder structure is deep)
const ORDERS_FILE = path.join(__dirname, '../orders.json');

/**
 * Route: POST /routes/users/api/orders
 * (Note: The exact URL depends on how you imported this router in server.js)
 */
router.post('/api/orders', (req, res) => {
    const { items, totalAmount, timestamp } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = { orderId, items, totalAmount, timestamp };

    let existingOrders = [];
    if (fs.existsSync(ORDERS_FILE)) {
        const fileData = fs.readFileSync(ORDERS_FILE, 'utf-8');
        existingOrders = fileData ? JSON.parse(fileData) : [];
    }

    existingOrders.push(newOrder);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(existingOrders, null, 2));

    console.log(`[Success] New Order Created in users.js: ${orderId}`);

    res.status(201).json({
        success: true,
        message: 'Order saved successfully!',
        orderId: orderId
    });
});

/**
 * Route: POST /routes/users/api/pay
 */
router.post('/api/pay', (req, res) => {
    const { phoneNumber, amount, items } = req.body;

    if (!phoneNumber || !amount || !items) {
        return res.status(400).json({ success: false, message: 'Missing payment parameters' });
    }

    let formattedPhone = phoneNumber;
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
    }

    const checkoutRequestId = 'ws_CO_20062026_' + Math.floor(100000000 + Math.random() * 900000000);

    console.log(`\n======================================`);
    console.log(`[STK PUSH] Handled via users.js router`);
    console.log(`Sending Prompt to: +${formattedPhone} | Amount: Ksh ${amount}`);
    console.log(`======================================\n`);

    res.status(200).json({
        success: true,
        message: 'STK push successfully initiated',
        checkoutRequestId: checkoutRequestId
    });
});

// CRITICAL: Export the router so server.js can read it
module.exports = router;