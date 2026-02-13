import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDBClient({});

export const handler = async (event) => {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const sheetId = process.env.GOOGLE_SHEET_ID;

    try {
        // 1. Load project numbers from DynamoDB
        const projectNumbers = await loadProjectNumbers();
        console.log(`Loaded ${projectNumbers.size} project numbers`);

        // 2. Get Google token
        const token = await getGoogleToken(credentials);
        console.log('✓ Got Google token');

        // 3. Read Review sheet (columns C=Subject, D=Content, L=Project Number found)
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Review!A2:L5000`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        const rows = data.values || [];
        console.log(`Found ${rows.length} rows in Review sheet`);

        // 4. Process each row and find project numbers
        let updatedCount = 0;
        let skippedCount = 0;
        
        // Years to detect bad extractions
        const yearPattern = /^20\d{2}$/;
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const subject = row[2] || ''; // Column C
            const content = row[3] || ''; // Column D
            const currentProjectNum = row[11] || ''; // Column L

            // Skip if already has a valid project number (not N/A, not empty, not a year)
            if (currentProjectNum && 
                currentProjectNum !== 'N/A' && 
                currentProjectNum !== '' &&
                !yearPattern.test(currentProjectNum) &&
                projectNumbers.has(currentProjectNum)) {
                skippedCount++;
                continue;
            }

            // First try to find a known project number via regex
            const text = `${subject} ${content}`;
            const numbers = text.match(/\b\d{4,5}\b/g) || [];
            let foundNumber = null;
            
            const yearPat = /^20\d{2}$/;
            for (const num of numbers) {
                if (projectNumbers.has(num) && !yearPat.test(num)) {
                    foundNumber = num;
                    break;
                }
            }

            // If no known project found, ask Claude to extract
            if (!foundNumber && (subject || content)) {
                foundNumber = await extractProjectNumberWithAI(subject, content);
            }

            if (foundNumber) {
                // Update column L (row i+2 because of header and 1-indexing)
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Review!L${i + 2}?valueInputOption=USER_ENTERED`;
                await fetch(updateUrl, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ values: [[foundNumber]] })
                });
                updatedCount++;
                
                if (updatedCount % 20 === 0) {
                    console.log(`Updated ${updatedCount} rows...`);
                }
            } else if (currentProjectNum && currentProjectNum !== 'N/A') {
                // Clear bad project numbers (like years)
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Review!L${i + 2}?valueInputOption=USER_ENTERED`;
                await fetch(updateUrl, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ values: [['N/A']] })
                });
                updatedCount++;
            }
        }

        console.log(`✓ Updated ${updatedCount} rows, skipped ${skippedCount} rows with valid project numbers`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                totalRows: rows.length,
                updatedRows: updatedCount,
                skippedRows: skippedCount
            })
        };

    } catch (err) {
        console.error('Error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function extractProjectNumberWithAI(subject, content) {
    const prompt = `Extract the project number from this email if one exists.

Project numbers are typically 4-5 digit identifiers (like 9659, 10245, 810) that refer to construction/engineering projects.

Do NOT return:
- Years (2024, 2025, 2026, etc.)
- Phone numbers
- Postal codes
- Address numbers
- Random reference numbers

Email Subject: ${subject}
Email Content: ${content.substring(0, 500)}

Reply with ONLY the project number (just the digits), or NONE if no project number is found.`;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 20,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = await response.json();
        const result = data.content?.[0]?.text?.trim() || 'NONE';
        
        if (result.toUpperCase() === 'NONE' || result === '') {
            return null;
        }
        
        // Validate it looks like a project number (4-5 digits, not a year)
        const yearPattern = /^20\d{2}$/;
        if (/^\d{4,5}$/.test(result) && !yearPattern.test(result)) {
            return result;
        }
        
        return null;
    } catch (err) {
        console.error('Error extracting project number:', err);
        return null;
    }
}

async function loadProjectNumbers() {
    const result = await dynamodb.send(new ScanCommand({
        TableName: 'email-classifier-projects'
    }));
    const numbers = new Set();
    (result.Items || []).forEach(item => {
        if (item.projectNumber?.S) {
            numbers.add(item.projectNumber.S);
        }
    });
    return numbers;
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