import { DynamoDBClient, PutItemCommand, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDBClient({});

export const handler = async (event) => {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

    try {
        const token = await getGoogleToken(credentials);
        console.log('✓ Got Google token');

        // Get all folders the service account can access
        const folders = await getAllFolders(token);
        console.log(`Found ${folders.length} total folders`);

        // Extract project numbers from folder names
        const projectNumbers = new Map();
        for (const folder of folders) {
            const numbers = folder.name.match(/^\d{4,}/); // Match numbers at start of folder name
            if (numbers) {
                const num = numbers[0];
                const yearPattern = /^20\d{2}$/;
                if (!projectNumbers.has(num) && !yearPattern.test(num)) {
                    projectNumbers.set(num, {
                        projectNumber: num,
                        folderName: folder.name,
                        folderId: folder.id
                    });
                }
            }
        }

        console.log(`Found ${projectNumbers.size} unique project numbers`);

        // Clear existing project numbers
        await clearProjectsTable();

        // Save all project numbers to DynamoDB
        for (const [num, project] of projectNumbers) {
            await dynamodb.send(new PutItemCommand({
                TableName: 'email-classifier-projects',
                Item: {
                    projectNumber: { S: project.projectNumber },
                    folderName: { S: project.folderName },
                    folderId: { S: project.folderId }
                }
            }));
        }

        console.log(`Saved ${projectNumbers.size} projects to DynamoDB`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                foldersScanned: folders.length,
                projectsSaved: projectNumbers.size
            })
        };

    } catch (err) {
        console.error('Error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function getAllFolders(token) {
    const query = encodeURIComponent("mimeType='application/vnd.google-apps.folder'");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1000`;
    
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    const data = await response.json();
    return data.files || [];
}

async function clearProjectsTable() {
    const result = await dynamodb.send(new ScanCommand({
        TableName: 'email-classifier-projects'
    }));
    
    for (const item of result.Items || []) {
        await dynamodb.send(new DeleteItemCommand({
            TableName: 'email-classifier-projects',
            Key: { projectNumber: item.projectNumber }
        }));
    }
}

async function getGoogleToken(credentials) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
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