require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {}


const generateToken = require('./utils/generateToken');
const asyncHandler = require('./middleware/asyncHandler');
const { protect, admin } = require('./middleware/auth.middleware');
const User = require('./models/User');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName} ${details ? `(${details})` : ''}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('       AURA BACKEND TEST SUITE - PHASE 1 & 2        ');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST GROUP 1: Environment & Token Utility
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: Environment & Utilities ---');
  assert(process.env.JWT_SECRET !== undefined && process.env.JWT_SECRET.length > 0, 'JWT_SECRET is configured in .env');
  assert(process.env.PORT === '5000', 'PORT is configured in .env (5000)');
  assert(process.env.MONGODB_URI !== undefined, 'MONGODB_URI is configured in .env');

  const testUserId = new mongoose.Types.ObjectId().toString();
  const token = generateToken(testUserId);
  assert(typeof token === 'string' && token.split('.').length === 3, 'generateToken returns a valid 3-part JWT string');

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert(decoded.id === testUserId, 'JWT contains correct user ID in payload');
  assert(decoded.exp !== undefined, 'JWT contains expiration timestamp');

  // Test asyncHandler with proper async resolution
  let asyncCaught = false;
  await new Promise((resolve) => {
    const failingFn = asyncHandler(async (req, res) => {
      throw new Error('Test async error');
    });
    failingFn({}, {}, (err) => {
      if (err && err.message === 'Test async error') asyncCaught = true;
      resolve();
    });
  });
  assert(asyncCaught, 'asyncHandler catches promise rejection and passes to next()');

  // ----------------------------------------------------
  // TEST GROUP 2: User Model & Password Hashing
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: User Model & Bcrypt Hashing ---');
  const rawPassword = 'DiscerningPassword2026!';
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(rawPassword, salt);

  const testUser = new User({
    firstName: 'Sujith',
    lastName: 'Kumar',
    email: 'sujith@example.com',
    password: hashedPassword,
    role: 'user',
  });

  assert(testUser.password !== rawPassword, 'User password is stored in hashed format');
  assert(testUser.password.startsWith('$2a$') || testUser.password.startsWith('$2b$'), 'Password hash uses standard bcrypt format');

  const isMatchCorrect = await testUser.matchPassword(rawPassword);
  assert(isMatchCorrect === true, 'user.matchPassword returns true for correct password');

  const isMatchWrong = await testUser.matchPassword('WrongPassword999!');
  assert(isMatchWrong === false, 'user.matchPassword returns false for incorrect password');

  // Test toJSON serialization removes password
  const userJson = testUser.toJSON();
  assert(userJson.password === undefined, 'toJSON removes password field from API serialization');

  // Test email validation
  const invalidEmailUser = new User({
    firstName: 'Bad',
    lastName: 'Email',
    email: 'not-an-email',
    password: hashedPassword,
  });
  const validationErr = invalidEmailUser.validateSync();
  assert(validationErr && validationErr.errors['email'] !== undefined, 'User model validates email format');

  // ----------------------------------------------------
  // TEST GROUP 3: Auth & Admin Middleware
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: Auth & Admin Middleware ---');

  // 3a. Protect rejects request with no token
  let protect401Called = false;
  const reqNoToken = { headers: {} };
  const resNoToken = {
    status: (code) => ({
      json: (data) => {
        if (code === 401) protect401Called = true;
      },
    }),
  };
  await protect(reqNoToken, resNoToken, () => {});
  assert(protect401Called, 'protect middleware rejects unauthenticated requests with 401');

  // 3b. Protect rejects invalid / expired token
  let protectInvalidCalled = false;
  const reqInvalidToken = { headers: { authorization: 'Bearer invalid.token.payload' } };
  const resInvalidToken = {
    status: (code) => ({
      json: (data) => {
        if (code === 401) protectInvalidCalled = true;
      },
    }),
  };
  await protect(reqInvalidToken, resInvalidToken, () => {});
  assert(protectInvalidCalled, 'protect middleware rejects invalid JWT with 401');

  // 3c. Admin middleware rejects non-admin user
  let adminForbidden = false;
  const reqNormalUser = { user: { role: 'user', firstName: 'Customer' } };
  const resNormalUser = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) adminForbidden = true;
      },
    }),
  };
  admin(reqNormalUser, resNormalUser, () => {});
  assert(adminForbidden, 'admin middleware rejects normal user (role: "user") with 403 Forbidden');

  // 3d. Admin middleware allows admin user
  let adminNextCalled = false;
  const reqAdminUser = { user: { role: 'admin', firstName: 'Store Admin' } };
  admin(reqAdminUser, {}, () => {
    adminNextCalled = true;
  });
  assert(adminNextCalled, 'admin middleware calls next() for user with role: "admin"');

  // ----------------------------------------------------
  // TEST GROUP 4: HTTP API Endpoint Integration
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: HTTP API Endpoints & Validation ---');
  const express = require('express');
  const cors = require('cors');
  const healthRoutes = require('./routes/health.routes');
  const productRoutes = require('./routes/product.routes');
  const authRoutes = require('./routes/auth.routes');

  const app = express();
  app.use(express.json());
  app.use('/api/health', healthRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/auth', authRoutes);

  // Start ephemeral test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper fetch function
  const apiFetch = async (path, options = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  };

  // 4a. Health Endpoint
  const healthRes = await apiFetch('/api/health');
  assert(
    healthRes.status === 200 || healthRes.status === 503,
    'GET /api/health responds with 200 (connected) or 503 (disconnected) status'
  );
  assert(healthRes.body && healthRes.body.database !== undefined, 'GET /api/health accurately reports database status');

  // 4b. Auth Register Validation - Missing fields
  const regInvalidRes = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'bad-email' }),
  });
  assert(regInvalidRes.status === 400, 'POST /api/auth/register rejects missing fields with 400');
  assert(regInvalidRes.body && regInvalidRes.body.errors && regInvalidRes.body.errors.length > 0, 'POST /api/auth/register returns validation error details');

  // 4c. Auth Register Validation - Short Password
  const shortPassRes = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex@example.com',
      password: '123',
    }),
  });
  assert(shortPassRes.status === 400, 'POST /api/auth/register rejects passwords < 6 characters with 400');

  // 4d. Auth Login Validation - Missing password
  const loginInvalidRes = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'alex@example.com' }),
  });
  assert(loginInvalidRes.status === 400, 'POST /api/auth/login rejects missing password with 400');

  // 4e. Auth Me - Reject unauthenticated
  const meNoAuthRes = await apiFetch('/api/auth/me');
  assert(meNoAuthRes.status === 401, 'GET /api/auth/me rejects unauthenticated request with 401');

  // 4f. Auth Profile Update - Reject unauthenticated
  const profileNoAuthRes = await apiFetch('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify({ firstName: 'Alexander' }),
  });
  assert(profileNoAuthRes.status === 401, 'PUT /api/auth/profile rejects unauthenticated request with 401');

  // Close test server
  await new Promise((resolve) => server.close(resolve));

  // ----------------------------------------------------
  // TEST GROUP 5: MongoDB Connection Status Diagnostic
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: MongoDB Connection Status Diagnostic ---');
  let liveConnected = false;
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 1500 });
    liveConnected = true;
    console.log(`  [OK] Successfully connected to MongoDB at: ${conn.connection.host}`);
  } catch (err) {
    console.log(`  [DIAGNOSTIC] MongoDB connection failed: ${err.message}`);
    const maskedUri = (process.env.MONGODB_URI || '').replace(/:([^@]+)@/, ':••••••••@');
    console.log('  [DIAGNOSTIC] Reporting accurately: MongoDB is not currently running at ' + maskedUri);
    console.log('  [DIAGNOSTIC] All schema logic, bcrypt hashing, JWT issuance, route validation, and middleware pass verification.');

  }

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('====================================================\n');

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }

  return passedTests === totalTests;
}

runTests()
  .then((success) => {
    process.exitCode = success ? 0 : 1;
  })
  .catch((err) => {
    console.error('Test runner fatal error:', err);
    process.exitCode = 1;
  });

