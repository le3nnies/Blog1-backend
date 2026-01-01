// utils/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log('🔗 Connecting to MongoDB Atlas...');

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ssl: true,
      tlsAllowInvalidCertificates: true, // Bypass SSL validation
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000, // 45 second socket timeout
      bufferCommands: false, // Disable command buffering
      retryWrites: true,
      w: 'majority'
    });

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);

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

    console.log('🚀 Server continuing without database connection');
    return null;
  }
};

module.exports = connectDB;
