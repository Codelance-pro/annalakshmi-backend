const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { sendOtpViaMSG91 } = require('../services/otp');
const { appendVerifiedUser } = require('../services/sheets');

// In-memory OTP store: { mobile -> { otp, expiresAt, attempts } }
const otpStore = new Map();

const OTP_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const MAX_ATTEMPTS = 5;

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isValidMobile(mobile) {
  return /^[6-9]\d{9}$/.test(mobile);
}

// POST /api/send-otp
router.post('/send-otp', async (req, res) => {
  const { mobile } = req.body;

  if (!mobile || !isValidMobile(mobile)) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
  }

  // Rate limiting: prevent spamming
  const existing = otpStore.get(mobile);
  if (existing && existing.expiresAt > Date.now()) {
    const remaining = Math.ceil((existing.expiresAt - Date.now()) / 1000);
    if (remaining > 240) { // block resend for 1 min
      return res.status(429).json({ error: `OTP already sent. Please wait ${60 - Math.ceil((OTP_TTL_MS - (existing.expiresAt - Date.now())) / 1000)}s before resending.` });
    }
  }

  const otp = generateOTP();
  otpStore.set(mobile, {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  // Auto-cleanup after TTL
  setTimeout(() => otpStore.delete(mobile), OTP_TTL_MS + 1000);

  try {
    await sendOtpViaMSG91(mobile, otp);
    res.json({ success: true, message: 'OTP sent successfully. Valid for 5 minutes.' });
  } catch (err) {
    otpStore.delete(mobile);
    res.status(500).json({ error: err.message || 'Failed to send OTP. Please try again.' });
  }
});

// POST /api/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { mobile, otp } = req.body;

  if (!mobile || !isValidMobile(mobile)) {
    return res.status(400).json({ error: 'Invalid mobile number.' });
  }
  if (!otp || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit OTP.' });
  }

  const record = otpStore.get(mobile);

  if (!record) {
    return res.status(400).json({ error: 'OTP not found. Please request a new OTP.' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(mobile);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  record.attempts += 1;
  if (record.attempts > MAX_ATTEMPTS) {
    otpStore.delete(mobile);
    return res.status(429).json({ error: 'Too many failed attempts. Please request a new OTP.' });
  }

  if (record.otp !== otp) {
    const left = MAX_ATTEMPTS - record.attempts;
    return res.status(400).json({ error: `Incorrect OTP. ${left} attempt${left !== 1 ? 's' : ''} remaining.` });
  }

  // OTP verified — clean up
  otpStore.delete(mobile);

  // Issue JWT (24h)
  const token = jwt.sign(
    { mobile },
    process.env.JWT_SECRET || 'annalakshmi_tote_secret_2024',
    { expiresIn: '24h' }
  );

  // Log to Google Sheets (non-blocking)
  appendVerifiedUser(mobile).catch(console.error);

  res.json({
    success: true,
    message: 'Mobile verified successfully!',
    token,
    mobile,
  });
});

module.exports = router;
