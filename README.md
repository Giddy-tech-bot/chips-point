# Café FastFood - Food Ordering System

A full-stack food ordering application built with Node.js/Express and vanilla HTML/CSS/JavaScript.

## Features

- **Customer Frontend**: Browse menu, add to cart, place orders via pay-on-delivery or M-Pesa
- **Admin Panel**: View all orders, filter by status, export to CSV, mark orders as completed
- **Authentication**: Simple password-based admin login
- **Order Management**: Create, update (status), and delete orders
- **Responsive Design**: Works on desktop and mobile

## Project Structure

```
chips point/
├── fronted/                    # Frontend static files
│   ├── index.html             # Customer ordering page
│   ├── admin.html             # Admin dashboard (requires auth)
│   ├── admin-login.html       # Admin login page
│   ├── images.ke/             # Food images
│   └── images/                # Additional images
├── backened/                  # Node.js backend
│   ├── server.js              # Express server with all API endpoints
│   ├── app.js                 # Router (optional; main logic in server.js)
│   ├── package.json           # Dependencies
│   ├── node_modules/          # (auto-installed)
│   └── orders.json            # Orders database (auto-created)
└── README.md                  # This file
```

## Tech Stack

- **Backend**: Node.js, Express.js, CORS
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Storage**: JSON file-based (orders.json)
- **Authentication**: Simple token-based admin auth

## Getting Started

### Prerequisites

- Node.js 16+ and npm installed

### Installation

1. **Install backend dependencies**:
   ```bash
   cd "backened"
   npm install
   ```

2. **Start the server**:
   ```bash
   node server.js
   ```
   The server will start at `http://localhost:5000`

### Usage

#### Customer Ordering

1. Open http://localhost:5000 in a browser
2. Browse the menu (Bites & Meals, Chilled Drinks)
3. Add items to your order (select sizes for items like Chips and Bhajia)
4. Enter your M-Pesa phone number (if paying via M-Pesa)
5. Choose:
   - "Place Order (Pay on Delivery)" — saves order with status "pending"
   - "Pay Now via M-Pesa" — initiates M-Pesa STK push (mock implementation)
6. Order ID will be displayed upon success

#### Admin Panel

1. Open http://localhost:5000/admin-login.html
2. Enter password: `admin123` (default)
3. Click "Login" — you'll be redirected to the admin dashboard
4. **Admin Dashboard Features**:
   - **View Orders**: All orders displayed in cards with Order ID, status, and total
   - **Search**: Filter orders by Order ID using the search box
   - **Filter by Status**: Show only "pending" or "completed" orders
   - **View Details**: Click "View Details" button to see full order info in a modal
   - **Mark Completed**: Change order status to "completed"
   - **Delete Orders**: Remove orders from the system
   - **Export CSV**: Download current filtered orders as a CSV file
   - **Auto-refresh**: Orders update every 5 seconds
5. Click "Logout" to return to login page

### API Endpoints

#### Public Endpoints

- **POST /api/orders**: Create a new order
  ```json
  { "items": [...], "totalAmount": 100, "timestamp": "2026-06-20T12:00:00Z" }
  ```
  Response: `{ "success": true, "orderId": "ORD-123456" }`

- **POST /api/pay**: Initiate M-Pesa payment
  ```json
  { "phoneNumber": "0712345678", "amount": 100, "items": [...] }
  ```
  Response: `{ "success": true, "checkoutRequestId": "..." }`

#### Admin Endpoints (Require Bearer Token)

- **POST /api/admin/login**: Get auth token
  ```json
  { "password": "admin123" }
  ```
  Response: `{ "success": true, "token": "token_..." }`

- **GET /api/orders**: List all orders (requires `Authorization: Bearer <token>`)
  Response: `{ "success": true, "orders": [...] }`

- **PUT /api/orders/:orderId**: Update order (requires auth)
  ```json
  { "status": "completed" }
  ```

- **DELETE /api/orders/:orderId**: Delete order (requires auth)

### Environment Variables

Optional: Set admin password via environment variable:
```bash
set ADMIN_PASSWORD=your_secure_password
node server.js
```

Default (dev): `admin123`

### Database

Orders are stored in `backened/orders.json`:
```json
[
  {
    "orderId": "ORD-123456",
    "items": [{ "name": "Chapati", "price": 20, "quantity": 2 }],
    "totalAmount": 40,
    "timestamp": "2026-06-20T12:00:00Z",
    "status": "pending"
  }
]
```

## Development

### Running in Dev Mode

For auto-restart on file changes (requires `nodemon`):
```bash
cd backened
npm install --save-dev nodemon  # if not already installed
npm run dev
```

### Customizing Menu Items

Edit `fronted/index.html` to add/remove food items:
- Update the `<img src="images.ke/...">` paths if images are in different folders
- Modify price values in the `onclick="addToCart(...)"` calls
- Add new sections by copying the `<section>` block pattern

### Customizing Admin Password

Either:
1. Set `ADMIN_PASSWORD` environment variable before starting server
2. Edit the default in `backened/server.js` line: `const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';`

## Deployment Notes

- **Production**: Use environment variables for `ADMIN_PASSWORD`
- **Database**: For production, consider using MongoDB or PostgreSQL instead of JSON
- **CORS**: Currently allows all origins; restrict to your domain in production
- **SSL/HTTPS**: Deploy behind a reverse proxy (nginx, Apache) with SSL certificates
- **Port**: Change `PORT` in `server.js` if port 5000 is already in use

## License

ISC

## Support

For issues or questions, refer to the code comments in `server.js` and `fronted/admin.html`.
