const mongoose = require('mongoose');
const dns = require('dns');

// Configure public DNS servers to resolve MongoDB Atlas SRV records reliably on Windows
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  // Ignore if not supported in environment
}


const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('CRITICAL: MONGODB_URI is not defined in environment variables.');
    return;
  }

  mongoose.connection.on('connected', () => {
    console.log('MongoDB event: Connection established');
  });

  mongoose.connection.on('error', (err) => {
    console.error(`MongoDB connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB event: Disconnected from database');
  });

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('\n======================================================');
    console.error('⚠️  MONGODB CONNECTION FAILED:');
    console.error(`   Message: ${error.message}`);
    console.error('   Please ensure MongoDB service is installed & running locally (port 27017)');
    console.error('   or update MONGODB_URI in server/.env with a valid MongoDB Atlas connection string.');
    console.error('======================================================\n');
  }
};

module.exports = connectDB;

