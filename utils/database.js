// utils/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log('🔗 Connecting to MongoDB Atlas...');

    // Remove deprecated options that cause warnings
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Remove deprecated options:
      // useNewUrlParser: true, // REMOVED - deprecated since Mongoose 6
      // useUnifiedTopology: true, // REMOVED - deprecated since Mongoose 6
      
      // Modern connection options:
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000, // 45 second socket timeout
      
      // SSL/TLS options (for MongoDB Atlas):
      ssl: true,
      tlsAllowInvalidCertificates: false, // Keep this false for production
      
      // Other options:
      retryWrites: true,
      w: 'majority',
      maxPoolSize: 10, // Connection pool size
      minPoolSize: 2,
      maxIdleTimeMS: 30000
    });

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    // Log connection state
    console.log(`🔌 Connection state: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
    
    // Set up connection event listeners
    mongoose.connection.on('connected', () => {
      console.log('✅ Mongoose connected to MongoDB');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ Mongoose connection error:', err.message);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ Mongoose disconnected from MongoDB');
    });

    return conn;
  } catch (error) {
    console.error('❌ MongoDB Atlas connection failed:', error.message);

    // Provide specific troubleshooting tips
    if (error.message.includes('SSL') || error.message.includes('TLS')) {
      console.log('🔧 SSL/TLS Issue Detected:');
      console.log('1. This is a common network/firewall issue');
      console.log('2. Try using a different network (mobile hotspot, etc.)');
      console.log('3. Check if your organization blocks MongoDB Atlas');
    }
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.log('🔧 DNS Resolution Issue:');
      console.log('1. Check your internet connection');
      console.log('2. Verify the MongoDB Atlas URI is correct');
      console.log('3. Try using 8.8.8.8 as DNS server');
    }

    console.log('⚠️ Server will continue, but database features will be limited');
    console.log('💡 You can still use the server, but sessions and data persistence will not work');
    
    // Return a mock connection to allow server to start
    return {
      connection: {
        host: 'disconnected',
        name: 'none'
      }
    };
  }
};

// Helper function to check if DB is connected
const isDBConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Helper function to wait for DB connection
const waitForDB = async (maxAttempts = 30, interval = 1000) => {
  for (let i = 0; i < maxAttempts; i++) {
    if (isDBConnected()) {
      return true;
    }
    console.log(`⏳ Waiting for database connection... (${i + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Database connection timeout');
};

module.exports = { connectDB, isDBConnected, waitForDB };
