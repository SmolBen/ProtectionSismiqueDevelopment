import { DynamoDBClient, ScanCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDBClient({});

export const handler = async (event) => {
    const params = event.queryStringParameters || {};
    if (params.validationToken) {
        console.log('Validation request received');
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: params.validationToken
        };
    }

    const body = JSON.parse(event.body || '{}');
    if (!body.value || body.value.length === 0) {
        return { statusCode: 202, body: 'No notifications' };
    }

    const corrections = await loadCorrections();
    const projectNumbers = await loadProjectNumbers();
    console.log(`Loaded ${corrections.length} corrections, ${projectNumbers.size} project numbers`);

    for (const notification of body.value) {
        try {
            const messageId = notification.resourceData?.id;
            if (!messageId) continue;

            if (!await tryClaimEmail(messageId)) {
                console.log('Skipping duplicate:', messageId);
                continue;
            }

            console.log('Processing email:', messageId);

            const msToken = await getMicrosoftToken();
            const email = await fetchEmail(msToken, messageId);
            if (!email) continue;

            // Skip sent emails
            const senderEmail = email.from?.emailAddress?.address || '';
            const userEmail = process.env.USER_EMAIL.toLowerCase();
            if (senderEmail.toLowerCase() === userEmail) {
                console.log('Skipping sent email:', email.subject);
                continue;
            }

            console.log('Email subject:', email.subject);

            const { category, summary, vietnamese, content, projectNumber } = await classifyEmail(email, corrections, projectNumbers);
            console.log('Classified as:', category);

            const clientName = await getCompanyName(senderEmail);
            
            // Use AI-extracted project number, fallback to regex search for known projects only
            let projectNumberFound = projectNumber;
if (projectNumberFound && !projectNumbers.has(projectNumberFound)) {
    projectNumberFound = null; // AI found a number but it's not in our system
}
if (!projectNumberFound) {
    const projectResult = findProjectNumberInEmail(email, projectNumbers);
    projectNumberFound = projectResult && projectResult.exists ? projectResult.number : 'N/A';
}

            await writeToSheet(email, category, summary, vietnamese, content, clientName, projectNumberFound);
            console.log('Written to sheet');

        } catch (err) {
            console.error('Error processing notification:', err);
        }
    }

    return { statusCode: 202, body: 'Processed' };
};

async function tryClaimEmail(emailId) {
    try {
        await dynamodb.send(new PutItemCommand({
            TableName: 'email-classifier-processed',
            Item: {
                emailId: { S: emailId },
                processedAt: { S: new Date().toISOString() }
            },
            ConditionExpression: 'attribute_not_exists(emailId)'
        }));
        return true;
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            return false;
        }
        console.error('Error claiming email:', err);
        return false;
    }
}

async function loadCorrections() {
    try {
        const result = await dynamodb.send(new ScanCommand({
            TableName: 'email-classifier-corrections',
            Limit: 50
        }));
        return (result.Items || []).map(item => ({
            subject: item.subject?.S || '',
            wrongCategory: item.wrongCategory?.S || '',
            correctCategory: item.correctCategory?.S || ''
        }));
    } catch (err) {
        console.error('Failed to load corrections:', err);
        return [];
    }
}

async function loadProjectNumbers() {
    try {
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
    } catch (err) {
        console.error('Failed to load project numbers:', err);
        return new Set();
    }
}

function findProjectNumberInEmail(email, projectNumbers) {
    const subject = email.subject || '';
    const body = email.body?.content || '';
    const text = `${subject} ${body}`;
    
    // Find all 4+ digit numbers
    const numbers = text.match(/\b\d{4,5}\b/g) || [];
    
    // Only return if it matches a known project number
    const yearPat = /^20\d{2}$/;
    for (const num of numbers) {
        if (projectNumbers.has(num) && !yearPat.test(num)) {
            return { number: num, exists: true };
        }
    }
    
    return null;
}

async function getMicrosoftToken() {
    const response = await fetch(
        `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                scope: 'https://graph.microsoft.com/.default',
                grant_type: 'client_credentials'
            })
        }
    );
    const data = await response.json();
    return data.access_token;
}

async function fetchEmail(token, messageId) {
    const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${process.env.USER_EMAIL}/messages/${messageId}?$select=id,subject,from,receivedDateTime,body,webLink`,
        { headers: { Authorization: `Bearer ${token}`, 'Prefer': 'outlook.body-content-type="text"' } }
    );
    if (!response.ok) {
        console.error('Failed to fetch email:', await response.text());
        return null;
    }
    return response.json();
}

async function classifyEmail(email, corrections, projectNumbers) {
    let correctionsText = '';
    if (corrections.length > 0) {
        correctionsText = '\nLEARN FROM THESE PAST CORRECTIONS:\n';
        for (const c of corrections) {
            correctionsText += `- "${c.subject}" was wrongly classified as "${c.wrongCategory}", correct category is "${c.correctCategory}"\n`;
        }
        correctionsText += '\nUse these examples to avoid similar mistakes.\n';
    }

    const rawContent = email.body?.content || 'No content';
    const projectResult = findProjectNumberInEmail(email, projectNumbers);
    let projectContext = '';
    if (projectResult) {
        projectContext = projectResult.exists
            ? `\nNOTE: Project number ${projectResult.number} was found in this email and EXISTS in our system.`
            : `\nNOTE: Project number ${projectResult.number} was found in this email but is NOT in our system (may be new or unknown).`;
    } else {
        projectContext = '\nNOTE: No project number was found in this email.';
    }

    const prompt = `You are an email classifier for a construction/engineering company. Classify this email into exactly one category.

CATEGORIES:
- Engineering - Existing Projects: Engineering/technical emails for projects that exist (project number found in our system)
- Engineering - Unknown Projects: Engineering/technical emails but project is unknown or not specified
- New Projects: Requests to open/create/start a new project
- Price Requests: Quotes, pricing, bids, cost estimates
- Existing Projects - Certificate Requests: MTRs, mill certs, compliance docs, test reports, certificates
- Other: Business emails that don't fit above categories
- Spam: Marketing, newsletters, promotional content, system notifications (Google, Microsoft, automated emails)
${correctionsText}${projectContext}

EMAIL:
From: ${email.from?.emailAddress?.address || 'Unknown'}
Subject: ${email.subject || 'No subject'}
Body: ${rawContent}

Reply in this exact format:
CATEGORY: [exact category name from the list above]
CONTENT: [Extract only the main message content. Remove email signatures, contact info, phone numbers, addresses, forwarded email chains, image placeholders like [cid:...], tracking URLs, and legal disclaimers. Keep only the actual message the sender wrote.]
SUMMARY: [1-2 sentence summary in English of what this email is about and any action needed]
VIETNAMESE: [Vietnamese translation of the CONTENT]
PROJECT_NUMBER: [Extract the project number ONLY if it matches a known project in our system. Project numbers are 4-5 digits (like 9659, 10256). If the number found does not exist in our known project numbers list, write NONE — it is likely the client's own reference number, not ours. Do NOT return 3-digit numbers, years (2024, 2025, 2026), phone numbers, or postal codes. Write NONE if no known project number is found.]`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    const data = await response.json();
    console.log('Claude API status:', response.status);
console.log('Claude API response:', JSON.stringify(data).substring(0, 500));
    const responseText = data.content?.[0]?.text?.trim() || '';
    console.log('Claude response:', responseText.substring(0, 500));
    
    // Parse category
    const categoryMatch = responseText.match(/CATEGORY:\s*(.+?)(?=CONTENT:|$)/is);
    let category = categoryMatch ? categoryMatch[1].trim() : 'Other';
    
    const validCategories = [
        'Engineering - Existing Projects',
        'Engineering - Unknown Projects', 
        'New Projects',
        'Price Requests',
        'Existing Projects - Certificate Requests',
        'Other',
        'Spam'
    ];
    category = validCategories.find(c => category.toLowerCase() === c.toLowerCase()) || 'Other';
    
    // Parse content
    const contentMatch = responseText.match(/CONTENT:\s*(.+?)(?=SUMMARY:|$)/is);
    const content = contentMatch ? contentMatch[1].trim() : '';

    // Parse summary
    const summaryMatch = responseText.match(/SUMMARY:\s*(.+?)(?=VIETNAMESE:|$)/is);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';

    // Parse Vietnamese
    const vietnameseMatch = responseText.match(/VIETNAMESE:\s*(.+?)(?=PROJECT_NUMBER:|$)/is);
    const vietnamese = vietnameseMatch ? vietnameseMatch[1].trim() : '';

    // Parse Project Number
    const projectMatch = responseText.match(/PROJECT_NUMBER:\s*(.+)/is);
    let projectNumber = projectMatch ? projectMatch[1].trim() : 'NONE';
    if (projectNumber.toUpperCase() === 'NONE' || projectNumber === '') {
        projectNumber = null;
    }

    return { category, summary, vietnamese, content, projectNumber };
}

async function writeToSheet(email, category, summary, vietnamese, content, clientName, projectNumberFound) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const token = await getGoogleToken(credentials);
    const sheetId = process.env.GOOGLE_SHEET_ID;

    const row = [
        new Date(email.receivedDateTime).toLocaleDateString('en-US', { timeZone: 'America/Toronto' }),
        email.from?.emailAddress?.address || 'Unknown',
        email.subject || 'No subject',
        content,
        vietnamese,
        email.webLink || '',
        summary
    ];

    if (category === 'Engineering - Existing Projects') {
        const engRow = [
            row[0], // Date
            row[1], // From
            row[2], // Subject
            projectNumberFound, // Project Number
            row[3], // Content
            row[4], // Vietnamese
            row[5], // Email Link
            row[6]  // Summary
        ];
        await insertRowAtTop(token, sheetId, category, engRow);
    } else {
        await insertRowAtTop(token, sheetId, category, row);
    }

    const reviewRow = [...row, category, '', '', clientName, projectNumberFound];
    await insertRowAtTop(token, sheetId, 'Review', reviewRow);
}

async function insertRowAtTop(token, sheetId, tabName, row) {
    // Get the sheet's numeric ID
    const sheetInfoUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`;
    const sheetInfoResponse = await fetch(sheetInfoUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const sheetInfo = await sheetInfoResponse.json();
    const sheet = sheetInfo.sheets.find(s => s.properties.title === tabName);
    const sheetIdNum = sheet?.properties?.sheetId;
    
    if (sheetIdNum === undefined) {
        console.error(`Sheet "${tabName}" not found`);
        return;
    }

    // Insert blank row at row 2 (index 1)
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            requests: [{
                insertDimension: {
                    range: {
                        sheetId: sheetIdNum,
                        dimension: 'ROWS',
                        startIndex: 1,
                        endIndex: 2
                    }
                }
            }]
        })
    });

    // Write data to row 2
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A2?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [row] })
    });
}

async function getCompanyName(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return 'Unknown';

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
                max_tokens: 50,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = await response.json();
        return data.content?.[0]?.text?.trim() || domain;
    } catch (err) {
        console.error('Error getting company name:', err);
        return domain;
    }
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