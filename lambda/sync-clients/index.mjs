export const handler = async (event) => {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const sheetId = process.env.GOOGLE_SHEET_ID;

  try {
      const token = await getGoogleToken(credentials);
      console.log('✓ Got Google token');

      // 1. Read all emails from Review sheet (column B = From)
      const reviewUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Review!B2:B5000`;
      const reviewResponse = await fetch(reviewUrl, {
          headers: { Authorization: `Bearer ${token}` }
      });
      const reviewData = await reviewResponse.json();
      const fromEmails = (reviewData.values || []).map(row => row[0]).filter(Boolean);
      console.log(`Found ${fromEmails.length} emails in Review sheet`);

      // 2. Group emails by domain
      const domainMap = {};
      for (const email of fromEmails) {
          const domain = email.split('@')[1]?.toLowerCase();
          if (!domain) continue;
          
          if (!domainMap[domain]) {
              domainMap[domain] = new Set();
          }
          domainMap[domain].add(email.toLowerCase());
      }
      console.log(`Found ${Object.keys(domainMap).length} unique domains`);

      // 3. Read existing Client sheet
      const clientUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Client!A2:C5000`;
      const clientResponse = await fetch(clientUrl, {
          headers: { Authorization: `Bearer ${token}` }
      });
      const clientData = await clientResponse.json();
      const existingClients = (clientData.values || []).map(row => ({
          companyName: row[0] || '',
          domain: row[1]?.replace('@', '').toLowerCase() || '',
          emails: (row[2] || '').split(', ').map(e => e.toLowerCase().trim()).filter(Boolean)
      }));

      const existingDomains = new Map();
      existingClients.forEach((client, index) => {
          if (client.domain) {
              existingDomains.set(client.domain, { ...client, rowIndex: index + 2 });
          }
      });
      console.log(`Found ${existingDomains.size} existing domains in Client sheet`);

      // 4. Process each domain
      const newRows = [];
      const updates = [];

      for (const [domain, emailSet] of Object.entries(domainMap)) {
          const emails = Array.from(emailSet);
          
          if (existingDomains.has(domain)) {
              // Domain exists - check if we need to add new emails
              const existing = existingDomains.get(domain);
              const newEmails = emails.filter(e => !existing.emails.includes(e));
              
              if (newEmails.length > 0) {
                  const allEmails = [...new Set([...existing.emails, ...newEmails])].join(', ');
                  updates.push({
                      rowIndex: existing.rowIndex,
                      companyName: existing.companyName,
                      domain: '@' + domain,
                      emails: allEmails
                  });
              }
          } else {
              // New domain - get company name from Claude
              const companyName = await getCompanyName(domain);
              newRows.push([
                  companyName,
                  '@' + domain,
                  emails.join(', ')
              ]);
              console.log(`New client: ${companyName} (@${domain})`);
          }
      }

      // 5. Update existing rows with new emails
      for (const update of updates) {
          const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Client!A${update.rowIndex}:C${update.rowIndex}?valueInputOption=USER_ENTERED`;
          await fetch(updateUrl, {
              method: 'PUT',
              headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  values: [[update.companyName, update.domain, update.emails]]
              })
          });
      }
      console.log(`Updated ${updates.length} existing domains`);

      // 6. Append new rows
      if (newRows.length > 0) {
          const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Client!A:C:append?valueInputOption=USER_ENTERED`;
          await fetch(appendUrl, {
              method: 'POST',
              headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ values: newRows })
          });
      }
      console.log(`Added ${newRows.length} new domains`);

      return {
          statusCode: 200,
          body: JSON.stringify({
              success: true,
              totalEmails: fromEmails.length,
              uniqueDomains: Object.keys(domainMap).length,
              newDomains: newRows.length,
              updatedDomains: updates.length
          })
      };

  } catch (err) {
      console.error('Error:', err);
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

async function getCompanyName(domain) {
  // Skip common providers
  const commonDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'live.com', 'msn.com'];
  if (commonDomains.includes(domain)) {
      return 'Personal Email';
  }

  const prompt = `Given this email domain: ${domain}

What is the company name? Reply with ONLY the company name, nothing else.
If you cannot determine the company name, make a reasonable guess based on the domain.
For example:
- steelco.com → Steel Co
- abc-construction.ca → ABC Construction
- protectionsismique2000.com → Protection Sismique 2000
- bfventilation.com → BF Ventilation`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }]
      })
  });

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || domain;
}

async function getGoogleToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${base64Header}.${base64Payload}`;

  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(credentials.private_key, 'base64url');

  const jwt = `${signatureInput}.${signature}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
      })
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}