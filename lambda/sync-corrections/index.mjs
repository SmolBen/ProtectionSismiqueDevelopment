import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDBClient({});

export const handler = async (event) => {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        // 1. Get Google token
        const token = await getGoogleToken(credentials);
        console.log('✓ Got Google token');

        // 2. Read Review tab
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Review!A2:J1000`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        const rows = data.values || [];
        console.log(`Found ${rows.length} rows in Review tab`);

        // 3. Find corrections (where Correct Category differs from AI Category)
        let newCorrections = 0;
        for (let i = 0; i < rows.length; i++) {
            const [date, from, subject, content, vietnamese, link, summary, aiCategory, correctCategory, processed] = rows[i];
            
            // Skip if no correction, already processed, or same category
            if (!correctCategory || correctCategory === aiCategory || correctCategory === '' || processed === 'Yes') continue;

            // Create correction record
            const correction = {
                id: { S: `correction-${Date.now()}-${i}` },
                from: { S: from || '' },
                subject: { S: subject || '' },
                summary: { S: (summary || '').substring(0, 200) },
                wrongCategory: { S: aiCategory || '' },
                correctCategory: { S: correctCategory },
                createdAt: { S: new Date().toISOString() }
            };

            // Save to DynamoDB
            await dynamodb.send(new PutItemCommand({
                TableName: 'email-classifier-corrections',
                Item: correction
            }));

            newCorrections++;
            console.log(`Saved correction: "${subject}" → ${correctCategory}`);

            // Mark as processed in sheet (column J)
            await markProcessed(token, sheetId, i + 2);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                correctionsAdded: newCorrections
            })
        };

    } catch (err) {
        console.error('Error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function markProcessed(token, sheetId, rowNum) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Review!J${rowNum}?valueInputOption=USER_ENTERED`;
    await fetch(url, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [['Yes']] })
    });
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