# PostgreSQL setup for Chips Point

## 1) Install PostgreSQL
If PostgreSQL is not already installed, install it locally and make sure the service is running.

On Windows, install PostgreSQL from:
https://www.postgresql.org/download/windows/

## 2) Create the database
Open the PostgreSQL shell or pgAdmin and run:

```sql
CREATE DATABASE chips_point;
CREATE USER postgres WITH PASSWORD 'postgres';
ALTER ROLE postgres WITH SUPERUSER;
```

If your local PostgreSQL already has a different username/password, use those instead.

## 3) Configure the app
Create a .env file in the backened folder:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chips_point
```

## 4) Start the backend
```bash
cd backened
npm install
node server.js
```

The backend will create the orders table automatically on startup.

## 5) Verify it works
Visit:
- http://localhost:5000/api

You should see the API status JSON.
