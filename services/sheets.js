const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let sheetsClient = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const keyFilePath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || './service-account.json');
  
  if (!fs.existsSync(keyFilePath)) {
    console.warn('⚠️  Google Sheets: service-account.json not found. Sheet logging is disabled.');
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (err) {
    console.error('Google Sheets auth error:', err.message);
    return null;
  }
}

/**
 * Append a verified user row to the Google Sheet.
 * Columns: Mobile Number | Verification Status | Date & Time | Source
 */
async function appendVerifiedUser(mobile) {
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId || sheetId === 'YOUR_GOOGLE_SHEET_ID_HERE') {
    console.log(`📊 [DEV MODE] Would log to Google Sheets: ${mobile} | Verified | ${new Date().toLocaleString('en-IN')} | Tote Bag Designer`);
    return;
  }

  const sheets = getSheetsClient();
  if (!sheets) return;

  const now = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[mobile, 'Verified', now, 'Tote Bag Designer']],
      },
    });
    console.log(`✅ Logged to Google Sheets: ${mobile}`);
  } catch (err) {
    // Don't fail the OTP flow if Sheets fails
    console.error('Google Sheets append error:', err.message);
  }
}

/**
 * Append a custom design submission to the Google Sheet.
 * Columns: Design ID | Date & Time | Customer Name | Mobile Number | Bag Model | Bag Color | Artwork URL | Preview URL
 */
async function appendDesignSubmission(design, name, bagModelName) {
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId || sheetId === 'YOUR_GOOGLE_SHEET_ID_HERE') {
    console.log(`📊 [DEV MODE] Google Sheets: Would append design submission: ${design.id} | ${name} | ${bagModelName}`);
    return;
  }

  const sheets = getSheetsClient();
  if (!sheets) return;

  const now = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:H', // Columns A to H
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          design.id,
          now,
          name || 'N/A',
          design.mobile || 'N/A',
          bagModelName || 'Default Tote',
          design.bagColor || 'natural',
          design.artworkUrl || '',
          design.previewUrl ? `${process.env.API_BASE_URL || 'http://localhost:5000'}${design.previewUrl}` : ''
        ]],
      },
    });
    console.log(`✅ Logged design submission to Google Sheets: ${design.id}`);
  } catch (err) {
    console.error('Google Sheets design append error:', err.message);
  }
}

module.exports = { appendVerifiedUser, appendDesignSubmission };
