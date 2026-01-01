const crypto = require('crypto');

/**
 * URL Obfuscation Utility
 * Provides methods to encode/decode sensitive URL parameters
 */
class URLEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits

    // Use environment variable or generate a key
    this.key = process.env.URL_ENCRYPTION_KEY || this.generateKey();
  }

  /**
   * Generate a random encryption key
   */
  generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * Encrypt sensitive data for URL parameters
   */
  encrypt(data) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.key);

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Combine IV, encrypted data, and auth tag
      const result = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);

      // URL-safe base64 encoding
      return result.toString('base64url');
    } catch (error) {
      console.error('URL encryption error:', error);
      throw new Error('Failed to encrypt URL parameter');
    }
  }

  /**
   * Decrypt URL parameters
   */
  decrypt(encryptedData) {
    try {
      // URL-safe base64 decoding
      const buffer = Buffer.from(encryptedData, 'base64url');

      const iv = buffer.subarray(0, this.ivLength);
      const authTag = buffer.subarray(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = buffer.subarray(this.ivLength + this.tagLength);

      const decipher = crypto.createDecipher(this.algorithm, this.key);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      console.error('URL decryption error:', error);
      throw new Error('Invalid or tampered URL parameter');
    }
  }

  /**
   * Create obfuscated URL for sensitive routes
   */
  createSecureURL(baseUrl, sensitiveParams = {}) {
    const token = this.encrypt({
      ...sensitiveParams,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(8).toString('hex')
    });

    return `${baseUrl}?token=${token}`;
  }

  /**
   * Extract and validate parameters from secure URL
   */
  extractSecureParams(req) {
    const { token } = req.query;

    if (!token) {
      throw new Error('Missing security token');
    }

    try {
      const params = this.decrypt(token);

      // Check timestamp (5 minute expiration)
      const now = Date.now();
      const tokenAge = now - params.timestamp;

      if (tokenAge > 5 * 60 * 1000) { // 5 minutes
        throw new Error('Security token expired');
      }

      // Remove metadata
      const { timestamp, nonce, ...cleanParams } = params;

      return cleanParams;
    } catch (error) {
      throw new Error('Invalid security token');
    }
  }
}

/**
 * URL Obfuscation for non-sensitive data
 */
class URLEncoding {
  /**
   * Simple obfuscation using base64 with salt
   */
  static encode(data) {
    const salt = 'blog_secure_2024';
    const salted = JSON.stringify(data) + salt;
    return Buffer.from(salted).toString('base64url');
  }

  /**
   * Decode obfuscated data
   */
  static decode(encodedData) {
    try {
      const salted = Buffer.from(encodedData, 'base64url').toString('utf8');
      const salt = 'blog_secure_2024';
      const data = salted.replace(salt, '');
      return JSON.parse(data);
    } catch (error) {
      throw new Error('Invalid encoded data');
    }
  }

  /**
   * Create short URL slug for public sharing
   */
  static createSlug(data) {
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 8);

    return hash;
  }
}

module.exports = {
  URLEncryption: new URLEncryption(),
  URLEncoding
};
