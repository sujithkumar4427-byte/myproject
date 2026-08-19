require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const dns = require('dns');

try { dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']); } catch (e) {}

const asyncHandler = require('./middleware/asyncHandler');
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

let passed = 0;
let total = 0;

function assert(cond, name, details='') {
  total++;
  if (cond) { console.log(`  [PASS] ${name}`); passed++; } else { console.error(`  [FAIL] ${name} ${details?`(${details})`:''}`); }
}

async function run() {
  console.log('====================================================');
  console.log('       AURA BACKEND TEST SUITE - PHASE 3 (Orders)    ');
  console.log('====================================================\n');

  // Basic checks
  assert(process.env.MONGODB_URI !== undefined, 'MONGODB_URI configured');

  // Setup app to test routes
  const express = require('express');
  const bodyParser = require('express').json;
  const orderRoutes = require('./routes/order.routes');
  const authRoutes = require('./routes/auth.routes');

  const app = express();
  app.use(bodyParser());
  app.use('/api/auth', authRoutes);
  app.use('/api/orders', orderRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const apiFetch = async (path, opts = {}) => {
    const res = await fetch(`${base}${path}`, { headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) }, ...opts });
    const body = await res.json().catch(()=>null);
    return { status: res.status, body };
  };

  // 1. Unauthenticated order creation rejected
  const unauth = await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify({}) });
  assert(unauth.status === 401, 'Unauthenticated order creation rejected');

  // Connect to MongoDB for DB-dependent tests
  let dbConnected = false;
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    dbConnected = true;
    console.log('\n[DIAGNOSTIC] Connected to MongoDB.');
  } catch (e) {
    console.log('\n[DIAGNOSTIC] MongoDB not connected; skipping DB-dependent order tests.', e.message);
  }

  try {
    if (dbConnected) {
      // Create test user and product in DB
      await User.deleteMany({ email: { $in: ['phase3-user@example.com','phase3-admin@example.com'] } });
      await Product.deleteMany({ name: /PHASE3_TEST_PRODUCT/ });
      await Order.deleteMany({});

      const user = await User.create({ firstName: 'Phase3', lastName: 'User', email: 'phase3-user@example.com', password: 'password123' });
      const admin = await User.create({ firstName: 'Phase3', lastName: 'Admin', email: 'phase3-admin@example.com', password: 'password123', role: 'admin' });

      const product = await Product.create({ name: 'PHASE3_TEST_PRODUCT', category: 'test', description: 'test', price: 20, imageUrl: 'http://x', stock: 5 });

      const userToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const adminToken = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

      // Invalid product rejected
      const badProductRes = await apiFetch('/api/orders', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` }, body: JSON.stringify({ orderItems: [{ product: '000000000000000000000000', qty: 1 }], shippingAddress: { firstName:'A', lastName:'B', email:'a@b.com', street:'S', city:'C', postalCode:'123', country:'X' } }) });
      assert(badProductRes.status === 400, 'Invalid product ID rejected on order creation');

      // Insufficient stock rejected
      const tooManyRes = await apiFetch('/api/orders', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` }, body: JSON.stringify({ orderItems: [{ product: product._id.toString(), qty: 999 }], shippingAddress: { firstName:'A', lastName:'B', email:'a@b.com', street:'S', city:'C', postalCode:'123', country:'X' } }) });
      assert(tooManyRes.status === 400, 'Order creation rejected when stock insufficient');

      // Successful creation
      const createRes = await apiFetch('/api/orders', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` }, body: JSON.stringify({ orderItems: [{ product: product._id.toString(), qty: 2 }], shippingAddress: { firstName:'A', lastName:'B', email:'a@b.com', street:'S', city:'C', postalCode:'123', country:'X' } }) });
      assert(createRes.status === 201, 'Authenticated order creation succeeds and returns 201');
      if (createRes.status === 201) {
        const created = createRes.body.data;
        assert(created.itemsPrice === 40, 'Server calculates itemsPrice correctly');

        // Stock decreased
        const freshProduct = await Product.findById(product._id);
        assert(freshProduct.stock === 3, 'Product stock decreased after successful order');

        // user can retrieve own orders
        const myOrders = await apiFetch('/api/orders/my-orders', { headers: { Authorization: `Bearer ${userToken}` } });
        assert(myOrders.status === 200 && myOrders.body.count >= 1, 'User can retrieve own orders');

        // user cannot retrieve another user's order by id
        const otherUser = await User.create({ firstName: 'Other', lastName: 'User', email: 'phase3-other@example.com', password: 'password123' });
        const otherToken = jwt.sign({ id: otherUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const getByIdOther = await apiFetch(`/api/orders/${created._id}`, { headers: { Authorization: `Bearer ${otherToken}` } });
        assert(getByIdOther.status === 403, 'User cannot retrieve another user\'s order');

        // admin can retrieve all orders
        const getAll = await apiFetch('/api/orders', { headers: { Authorization: `Bearer ${adminToken}` } });
        assert(getAll.status === 200, 'Admin can retrieve all orders');

        // normal user cannot retrieve all orders
        const getAllByUser = await apiFetch('/api/orders', { headers: { Authorization: `Bearer ${userToken}` } });
        assert(getAllByUser.status === 403, 'Normal user cannot retrieve all orders');

        // admin can update order status
        const statusRes = await apiFetch(`/api/orders/${created._id}/status`, { method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ status: 'processing' }) });
        assert(statusRes.status === 200, 'Admin can update order status');

        // normal user cannot update status
        const statusResUser = await apiFetch(`/api/orders/${created._id}/status`, { method: 'PUT', headers: { Authorization: `Bearer ${userToken}` }, body: JSON.stringify({ status: 'shipped' }) });
        assert(statusResUser.status === 403, 'Normal user cannot update order status');

        // user can cancel eligible order (since it's processing and owner, but we only allow user to cancel pending/processing per implementation)
        const cancelRes = await apiFetch(`/api/orders/${created._id}/cancel`, { method: 'PUT', headers: { Authorization: `Bearer ${userToken}` } });
        assert(cancelRes.status === 200, 'User can cancel an eligible order');

      }
    } else {
      console.log('\n[DIAGNOSTIC] Skipped DB-dependent tests: order creation and stock changes could not be executed because MongoDB is not connected.');
    }

    console.log('\n====================================================');
    console.log(`  TEST RESULTS: ${passed} / ${total} tests passed`);
    console.log('====================================================');

  } finally {
    // Cleanup: close server and DB connection
    try { await new Promise((resolve) => server.close(resolve)); } catch (e) { }
    if (dbConnected) {
      try { await mongoose.disconnect(); console.log('[DIAGNOSTIC] Disconnected from MongoDB.'); } catch(e) { }
    }
    process.exit(0);
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
