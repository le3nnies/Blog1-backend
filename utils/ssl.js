const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

/**
 * SSL Configuration for HTTPS
 * Generates self-signed certificates for development
 */
class SSLConfig {
  constructor() {
    this.certDir = path.join(__dirname, '..', 'ssl');
    this.keyPath = path.join(this.certDir, 'key.pem');
    this.certPath = path.join(this.certDir, 'cert.pem');
  }

  /**
   * Ensure SSL directory exists
   */
  ensureCertDir() {
    if (!fs.existsSync(this.certDir)) {
      fs.mkdirSync(this.certDir, { recursive: true });
    }
  }

  /**
   * Generate self-signed certificate for development
   */
  generateSelfSignedCert() {
    try {
      console.log('🔐 Generating self-signed SSL certificate for development...');

      // Check if OpenSSL is available
      try {
        execSync('openssl version', { stdio: 'pipe' });
      } catch (error) {
        console.warn('⚠️  OpenSSL not found. Please install OpenSSL for certificate generation.');
        console.log('💡 On Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
        console.log('💡 On macOS: brew install openssl');
        console.log('💡 On Linux: sudo apt-get install openssl');
        return false;
      }

      this.ensureCertDir();

      // Generate private key
      execSync(`openssl genrsa -out "${this.keyPath}" 2048`, { stdio: 'inherit' });

      // Generate certificate
      execSync(`openssl req -new -x509 -key "${this.keyPath}" -out "${this.certPath}" -days 365 -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`, { stdio: 'inherit' });

      console.log('✅ SSL certificate generated successfully');
      console.log(`📁 Certificate saved to: ${this.certPath}`);
      console.log(`🔑 Private key saved to: ${this.keyPath}`);

      return true;
    } catch (error) {
      console.error('❌ Failed to generate SSL certificate:', error.message);
      return false;
    }
  }

  /**
   * Check if certificates exist and are valid
   */
  certsExist() {
    return fs.existsSync(this.keyPath) && fs.existsSync(this.certPath);
  }

  /**
   * Validate SSL certificates
   */
  validateCertificates() {
    try {
      const key = fs.readFileSync(this.keyPath);
      const cert = fs.readFileSync(this.certPath);

      // Try to create a secure context to validate the certificates
      tls.createSecureContext({
        key: key,
        cert: cert
      });

      console.log('✅ SSL certificates are valid');
      return true;
    } catch (error) {
      console.error('❌ SSL certificates are invalid:', error.message);
      return false;
    }
  }

  /**
   * Get SSL options for HTTPS server
   */
  getSSLOptions() {
    if (!this.certsExist()) {
      console.log('📄 SSL certificates not found, generating new ones...');
      if (!this.generateSelfSignedCert()) {
        console.warn('⚠️  SSL certificate generation failed. Falling back to HTTP.');
        return null;
      }
    }

    // Validate existing certificates
    if (!this.validateCertificates()) {
      console.log('🔄 SSL certificates are invalid, regenerating...');
      if (!this.generateSelfSignedCert()) {
        console.warn('⚠️  SSL certificate regeneration failed. Falling back to HTTP.');
        return null;
      }
    }

    try {
      return {
        key: fs.readFileSync(this.keyPath),
        cert: fs.readFileSync(this.certPath)
      };
    } catch (error) {
      console.error('❌ Error reading SSL certificates:', error.message);
      return null;
    }
  }

  /**
   * Create HTTPS server
   */
  createHTTPSServer(app, port) {
    const sslOptions = this.getSSLOptions();

    if (!sslOptions) {
      console.log('🔄 Falling back to HTTP server...');
      return app.listen(port, () => {
        console.log(`🔒 HTTP Server running on http://localhost:${port}`);
        console.log('⚠️  WARNING: Running in HTTP mode. URLs are not encrypted!');
        console.log('💡 To enable HTTPS, ensure OpenSSL is installed and certificates are generated.');
      });
    }

    const httpsServer = https.createServer(sslOptions, app);

    return httpsServer.listen(port, () => {
      console.log(`🔒 HTTPS Server running on https://localhost:${port}`);
      console.log('✅ URLs are now encrypted with SSL/TLS');
      console.log('⚠️  Note: Browser will show security warning for self-signed certificate');
      console.log('💡 Accept the certificate in your browser to proceed');
    });
  }
}

module.exports = new SSLConfig();
