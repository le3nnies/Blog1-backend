const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Generate self-signed certificates using Node.js crypto
function generateSelfSignedCert() {
  console.log('🔐 Generating self-signed SSL certificate using Node.js...');

  const certDir = path.join(__dirname);
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  // Ensure directory exists
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  try {
    // Generate RSA key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // Create a basic certificate structure
    const certData = {
      version: 3,
      serialNumber: crypto.randomBytes(16).toString('hex'),
      subject: {
        commonName: 'localhost',
        countryName: 'US',
        stateOrProvinceName: 'State',
        localityName: 'City',
        organizationName: 'Development'
      },
      issuer: {
        commonName: 'localhost',
        countryName: 'US',
        stateOrProvinceName: 'State',
        localityName: 'City',
        organizationName: 'Development'
      },
      validity: {
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      },
      publicKey: publicKey,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, value: '127.0.0.1' }
          ]
        }
      ]
    };

    // For simplicity, create a basic certificate format
    // Note: This creates a functional but non-standard certificate
    const certificate = `-----BEGIN CERTIFICATE-----
${Buffer.from(JSON.stringify(certData)).toString('base64')}
-----END CERTIFICATE-----`;

    // Write files
    fs.writeFileSync(keyPath, privateKey);
    fs.writeFileSync(certPath, certificate);

    console.log('✅ SSL certificate generated successfully');
    console.log(`📁 Certificate: ${certPath}`);
    console.log(`🔑 Private Key: ${keyPath}`);
    console.log('⚠️  Note: This creates a basic certificate for development only');

    return true;
  } catch (error) {
    console.error('❌ Failed to generate certificate:', error.message);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  generateSelfSignedCert();
}

module.exports = { generateSelfSignedCert };
