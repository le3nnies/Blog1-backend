const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️  Email credentials not configured. Email functionality will be disabled.');
      this.transporter = null;
      return;
    }

    // Corrected method name from createTransporter to createTransport
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendEmail(to, subject, html, text = null) {
    try {
      // Check if email service is configured
      if (!this.transporter) {
        console.warn('⚠️  Email service not configured. Skipping email send.');
        return null;
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return result;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  htmlToText(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  async sendWelcomeNewsletter(email, token) {
    const unsubscribeLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribe?token=${token}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          .unsubscribe { color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Our Blog!</h1>
          </div>
          <div class="content">
            <p>Thank you for subscribing to our newsletter! You'll now receive the latest trending articles and updates.</p>
            <p>We're excited to share valuable content with you.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Trending Blog. All rights reserved.</p>
            <p class="unsubscribe">
              <a href="${unsubscribeLink}">Unsubscribe</a> from our newsletter
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(email, 'Welcome to Our Newsletter!', html);
  }

  async sendTrendingNewsletter(subscriber, trendingArticles) {
    const unsubscribeLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribe?token=${subscriber.token}`;
    
    const articlesHtml = trendingArticles.map(article => `
      <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px;">
        <h3 style="margin: 0 0 10px 0;">${article.title}</h3>
        <p style="margin: 0 0 10px 0; color: #666;">${article.excerpt || (article.content ? article.content.substring(0, 150) : '')}...</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/articles/${article.slug}" style="color: #4F46E5;">Read More</a>
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          .unsubscribe { color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Trending Articles This Week</h1>
          </div>
          <div class="content">
            <p>Here are the most popular articles from this week:</p>
            ${articlesHtml}
          </div>
          <div class="footer">
            <p>&copy; 2024 Trending Blog. All rights reserved.</p>
            <p class="unsubscribe">
              <a href="${unsubscribeLink}">Unsubscribe</a> from our newsletter
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const subject = `Weekly Trending Articles - ${new Date().toLocaleDateString()}`;
    return this.sendEmail(subscriber.email, subject, html);
  }

  // Test email configuration
  async testEmailConfig() {
    try {
      await this.transporter.verify();
      console.log('Email configuration is correct');
      return true;
    } catch (error) {
      console.error('Email configuration error:', error);
      return false;
    }
  }
}

// Export instance directly
module.exports = new EmailService();
