const axios = require('axios');

/**
 * Send OTP via MSG91
 * Docs: https://docs.msg91.com/reference/send-otp
 */
async function sendOtpViaMSG91(mobile, otp) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const senderId = process.env.MSG91_SENDER_ID || 'ANNBAG';

  if (!authKey || authKey === 'YOUR_MSG91_AUTH_KEY_HERE') {
    // Development fallback — log OTP to console
    console.log(`\n🔐 [DEV MODE] OTP for ${mobile}: ${otp}\n`);
    return { success: true, dev: true };
  }

  try {
    const response = await axios.post(
      'https://control.msg91.com/api/v5/otp',
      {
        template_id: templateId,
        mobile: `91${mobile}`,
        authkey: authKey,
        otp,
        sender: senderId,
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return { success: true, data: response.data };
  } catch (err) {
    console.error('MSG91 error:', err.response?.data || err.message);
    throw new Error('Failed to send OTP. Please try again.');
  }
}

module.exports = { sendOtpViaMSG91 };
