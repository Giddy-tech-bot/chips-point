const { Pool } = require('pg');

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
  });
}

function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

async function initializeDatabase() {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id TEXT UNIQUE NOT NULL,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        delivery_location TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_method TEXT NOT NULL DEFAULT 'cash',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        phone_number TEXT,
        customer_name TEXT,
        checkout_request_id TEXT,
        callback_result JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}

function mapOrderRow(row) {
  return {
    orderId: row.order_id,
    items: row.items || [],
    totalAmount: Number(row.total_amount),
    deliveryLocation: row.delivery_location,
    timestamp: row.timestamp,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    phoneNumber: row.phone_number,
    customerName: row.customer_name,
    checkoutRequestId: row.checkout_request_id,
    callbackResult: row.callback_result,
    createdAt: row.created_at
  };
}

async function createOrderInDb(order) {
  if (!pool) return null;

  const result = await pool.query(
    `INSERT INTO orders (
      order_id,
      items,
      total_amount,
      delivery_location,
      timestamp,
      status,
      payment_method,
      payment_status,
      phone_number,
      customer_name,
      checkout_request_id,
      callback_result
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      order.orderId,
      JSON.stringify(order.items || []),
      order.totalAmount,
      order.deliveryLocation,
      order.timestamp,
      order.status || 'pending',
      order.paymentMethod || 'cash',
      order.paymentStatus || 'pending',
      order.phoneNumber || null,
      order.customerName || null,
      order.checkoutRequestId || null,
      order.callbackResult ? JSON.stringify(order.callbackResult) : null
    ]
  );

  return mapOrderRow(result.rows[0]);
}

async function getOrdersFromDb() {
  if (!pool) return [];
  const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
  return result.rows.map(mapOrderRow);
}

async function updateOrderInDb(orderId, updates) {
  if (!pool) return null;

  const fields = [];
  const values = [];
  let index = 1;

  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) return;

    const column = {
      orderId: 'order_id',
      items: 'items',
      totalAmount: 'total_amount',
      deliveryLocation: 'delivery_location',
      timestamp: 'timestamp',
      status: 'status',
      paymentMethod: 'payment_method',
      paymentStatus: 'payment_status',
      phoneNumber: 'phone_number',
      customerName: 'customer_name',
      checkoutRequestId: 'checkout_request_id',
      callbackResult: 'callback_result'
    }[key];

    if (!column) return;

    fields.push(`${column} = $${index}`);
    values.push(
      column === 'callback_result' && value !== null
        ? JSON.stringify(value)
        : (column === 'items' ? JSON.stringify(value) : value)
    );
    index += 1;
  });

  if (fields.length === 0) {
    return null;
  }

  values.push(orderId);
  const result = await pool.query(
    `UPDATE orders SET ${fields.join(', ')} WHERE order_id = $${index} RETURNING *`,
    values
  );

  return result.rows[0] ? mapOrderRow(result.rows[0]) : null;
}

async function deleteOrderInDb(orderId) {
  if (!pool) return null;
  const result = await pool.query('DELETE FROM orders WHERE order_id = $1 RETURNING *', [orderId]);
  return result.rows[0] ? mapOrderRow(result.rows[0]) : null;
}

module.exports = {
  isDatabaseConfigured,
  initializeDatabase,
  createOrderInDb,
  getOrdersFromDb,
  updateOrderInDb,
  deleteOrderInDb
};
