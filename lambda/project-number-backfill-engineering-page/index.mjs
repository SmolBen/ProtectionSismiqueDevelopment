import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDBClient({});

export const handler = async () => {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const token = await getGoogleToken(credentials);
    const sheetId = process.env.GOOGLE_SHEET_ID;

    // Load known project numbers from DynamoDB
    const result = await dynamodb.send(new ScanCommand({
        TableName: 'email-classifier-projects'
    }));
    const projectNumbers = new Set();
    (result.Items || []).forEach(item => {
        if (item.projectNumber?.S) projectNumbers.add(item.projectNumber.S);
    });
    console.log(`Loaded ${projectNumbers.size} project numbers`);

    // Read the sheet
    const sheetName = encodeURIComponent('Engineering - Existing Projects');
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!A:H`;
    const readResp = await fetch(readUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const sheetData = await readResp.json();
    const rows = sheetData.values || [];

    if (rows.length < 2) {
        return { statusCode: 200, body: 'No data rows found' };
    }

    // Column layout after insert: A=Date, B=From, C=Subject, D=Project Number, E=Content, F=Vietnamese, G=Email Link, H=Summary
    const updates = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const projectNum = (row[3] || '').trim(); // Column D

        // Skip if already filled
        if (projectNum) continue;

        const subject = row[2] || ''; // Column C
        const content = row[4] || ''; // Column E
        const text = `${subject} ${content}`;

        // Find known project numbers
        const numbers = text.match(/\b\d{4,5}\b/g) || [];
        const yearPat = /^20\d{2}$/;
        let found = null;
        for (const num of numbers) {
            if (projectNumbers.has(num) && !yearPat.test(num)) {
                found = num;
                break;
            }
        }

        if (found) {
            updates.push({ row: i + 1, value: found });
        }
    }

    console.log(`Found ${updates.length} rows to update out of ${rows.length - 1}`);

    // Write updates in batches
    for (const update of updates) {
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!D${update.row}?valueInputOption=USER_ENTERED`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values: [[update.value]] })
            }
        );
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ updated: updates.length, total: rows.length - 1 })
    };
};

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