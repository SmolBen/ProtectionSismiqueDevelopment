const containerStartTime = Date.now();
let isFirstInvocation = true;

import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, ListUsersCommand, AdminUpdateUserAttributesCommand, AdminDeleteUserCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PutObjectCommand} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { PDFDocument, rgb, degrees, StandardFonts, PDFName } from 'pdf-lib';


import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import crypto from 'crypto';

import fontkit from '@pdf-lib/fontkit';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sesClient = new SESClient({ region: 'us-east-1' });

const client = new DynamoDB({ region: 'us-east-1' });
const dynamodb = DynamoDBDocument.from(client);
const s3Client = new S3Client({ region: 'us-east-1' });
const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

const TABLE_NAME = 'Projects';
const USER_POOL_ID = 'us-east-1_EamgXZwav';

const EMAIL_TEMPLATES_TABLE = 'EmailTemplates';

// Users who are allowed to flatten even if admin, but only when they chose "Sign & Flatten"
const PRIVILEGED_FLATTEN_EMAILS = new Set([
    'hoangminhduc.ite@gmail.com',
    'anhquan1212004@gmail.com',
  ]);
  
  function shouldForceFlattenForUser(userInfo, project) {
    const email = (userInfo?.email || '').toLowerCase();
    return PRIVILEGED_FLATTEN_EMAILS.has(email) && !!project?.signDocument;
  }

// Helper: update form field appearances with a Unicode-capable font (supports Vietnamese characters like "đ")
async function updateFieldAppearancesWithUnicodeFont(pdfDoc, form) {
    pdfDoc.registerFontkit(fontkit);
    const fontPath = path.resolve('./fonts/RobotoCondensed-Regular.ttf');
    const fontBuffer = await fs.promises.readFile(fontPath);
    const unicodeFont = await pdfDoc.embedFont(new Uint8Array(fontBuffer));
    form.updateFieldAppearances(unicodeFont);
}

// CORS headers - define once, use everywhere
const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, x-user-email, x-user-admin, x-user-firstname, x-user-lastname, x-user-company, x-user-domain, x-user-id',
    'Access-Control-Max-Age': '86400'
};

export const handler = async (event) => {
    const handlerStartTime = Date.now();
    
    // Log cold start metrics on first invocation
    if (isFirstInvocation) {
        const coldStartDuration = handlerStartTime - containerStartTime;
        console.log(`❄️ COLD START DETECTED - Container init time: ${coldStartDuration}ms`);
        isFirstInvocation = false;
    } else {
        console.log('🔥 WARM START - Container reused');
    }
    
    console.log('🔄 Lambda invoked - Method:', event.httpMethod, 'Path:', event.path);
    
    // Handle warmup ping immediately
    if (event.warmup === true) {
        console.log('🔥 Warmup ping received - keeping container alive');
        return { 
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ warm: true }) 
        };
    }
    console.log('🔄 Lambda invoked - Method:', event.httpMethod, 'Path:', event.path);
    
    // CRITICAL: Handle OPTIONS immediately, before ANY other processing
    if (event.httpMethod === 'OPTIONS') {
        console.log('✅ Handling CORS preflight - returning 200 immediately');
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'CORS preflight successful' })
        };
    }

    // Only process non-OPTIONS requests beyond this point
    let body;
    let statusCode = 200;

    try {
        console.log('📋 Processing non-OPTIONS request...');

        let parsedBody = {};
        try {
        let raw = event.body || '';
        if (raw) {
            if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf-8');
            parsedBody = JSON.parse(raw);
        }
    } catch (error) {
        console.error('❌ Lambda error:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                error: error.message,
                stack: error.stack 
            })
        };
    }
        
        // Safer header extraction - prevent crashes from missing headers
        const headers = event.headers || {};
        const userInfo = {
            email: headers['x-user-email'] || headers['X-User-Email'] || 'anonymous@example.com',
            isAdmin: (headers['x-user-admin'] || headers['X-User-Admin'] || 'false').toLowerCase() === 'true',
            firstName: headers['x-user-firstname'] || headers['X-User-Firstname'] || 'Unknown',
            lastName: headers['x-user-lastname'] || headers['X-User-Lastname'] || 'User',
            companyName: headers['x-user-company'] || headers['X-User-Company'] || 'Unknown Company',
            domain: headers['x-user-domain'] || headers['X-User-Domain'] || 'unknown',
            userId: headers['x-user-id'] || headers['X-User-Id'] || 'unknown-id'
        };

        console.log('👤 User info extracted:', { email: userInfo.email, isAdmin: userInfo.isAdmin });

        const method = event.httpMethod;
        const path = event.path || '/projects';
        const queryStringParameters = event.queryStringParameters || {};

        console.log(`🔄 Processing: ${method} ${path}`);

        // Route handling

        if (path.startsWith('/email-templates')) {
            if (method === 'GET' && path === '/email-templates') {
                console.log('📧 Route: GET email templates');
                body = await getEmailTemplates(userInfo);
            } else if (method === 'POST' && path === '/email-templates') {
                console.log('📧 Route: POST create email template');
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const templateData = JSON.parse(bodyData);
                body = await createEmailTemplate(templateData, userInfo);
            } else if (method === 'DELETE' && path.match(/^\/email-templates\/[^/]+$/)) {
                console.log('📧 Route: DELETE email template');
                const pathParts = path.split('/');
                const templateId = pathParts[2];
                body = await deleteEmailTemplate(templateId, userInfo);
            }
        } 
        else if (path.startsWith('/projects')) {

             // POST /projects/{projectId}/image-upload-url
            if (path.includes('/image-upload-url') && method === 'POST') {
                const pathParts = path.split('/');
                const projectId = pathParts[2];

                // (Optional) verify access to the project using your existing fetch
                const projectArr = await getProjects(projectId, userInfo);
                if (!projectArr || projectArr.length === 0) throw new Error('Project not found or access denied');

                // decode/parse body (supports base64)
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const { filename, contentType } = JSON.parse(bodyData || '{}');
                if (!filename || !contentType) throw new Error('filename and contentType are required');

                // Sanitize and build S3 key under per-project folder
                const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
                const key = `users-equipment-images/${projectId}/${Date.now()}_${safeName}`;

                // Presign PUT for direct browser upload
                const putCmd = new PutObjectCommand({
                    Bucket: 'protection-sismique-equipment-images',
                    Key: key,
                    ContentType: contentType,
                    // Metadata: {
                    //     'uploaded-by': userInfo.email,
                    //     'project-id': projectId
                    // }
                });
                const uploadUrl = await getSignedUrl(s3Client, putCmd, { expiresIn: 900 }); // 15 min

                // Optional: short-lived GET URL for immediate preview after upload
                const getCmd = new GetObjectCommand({
                    Bucket: 'protection-sismique-equipment-images',
                    Key: key
                });
                const viewUrlSigned = await getSignedUrl(s3Client, getCmd, { expiresIn: 3600 }); // 1 hour

                body = {
                    success: true,
                    key,                       // s3 object key you can store on the equipment item
                    uploadUrl,                 // PUT this file directly from the browser
                    viewUrlSigned,             // temporary preview URL (works even if bucket/object not public)
                    publicUrlHint: `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/${key}`
                };

                // GET /projects/{projectId}/images/sign?key=...
            } else if (path.includes('/images/sign') && method === 'GET') {
                try {
                    const parts = path.split('/');
                    const projectId = parts[2];
                
                    const projectArr = await getProjects(projectId, userInfo);
                    if (!projectArr || projectArr.length === 0) {
                        throw new Error('Project not found or access denied');
                    }
                
                    const key = (queryStringParameters && queryStringParameters.key) || '';
                    if (!key || !key.startsWith('users-equipment-images/')) {
                        throw new Error('Valid image key required');
                    }
                
                    const getCmd = new GetObjectCommand({
                        Bucket: 'protection-sismique-equipment-images',
                        Key: key
                    });
                    const url = await getSignedUrl(s3Client, getCmd, { expiresIn: 3600 });
                
                    body = { success: true, url };
                } catch (error) {
                    console.error('Error generating signed URL:', error);
                    statusCode = 400;
                    body = { success: false, error: error.message };
                }

                } else if (path.includes('/templates/sign') && method === 'GET') {
                    const parts = path.split('/');
                    const projectId = parts[2];
                  
                    // verify access to the project first (re-use your helper)
                    const projectArr = await getProjects(projectId, userInfo);
                    if (!projectArr || projectArr.length === 0) throw new Error('Project not found or access denied');
                  
                    const key = (queryStringParameters && queryStringParameters.key) || '';
                    if (!key || !key.startsWith('report/')) {
                      throw new Error('Valid template key under report/ required');
                    }
                  
                    const getCmd = new GetObjectCommand({
                      Bucket: 'protection-sismique-equipment-images',
                      Key: key
                    });
                    const url = await getSignedUrl(s3Client, getCmd, { expiresIn: 3600 }); // 1 hour
                  
                    body = { success: true, url };    
                    
                // POST /projects/{projectId}/images/delete  { key }
                } else if (path.includes('/images/delete') && method === 'POST') {
                    const parts = path.split('/');
                    const projectId = parts[2];
                
                    // check project access
                    const projectArr = await getProjects(projectId, userInfo);
                    if (!projectArr || projectArr.length === 0) throw new Error('Project not found or access denied');
                
                    let bodyData = event.body || '{}';
                    if (event.isBase64Encoded) bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                    const { key } = JSON.parse(bodyData || '{}');
                    if (!key || !key.startsWith(`users-equipment-images/${projectId}/`)) {
                    throw new Error('Valid image key required');
                    }
                
                    // delete object
                    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
                    await s3Client.send(new DeleteObjectCommand({
                    Bucket: 'protection-sismique-equipment-images',
                    Key: key
                    }));
                
                    body = { success: true };

                    // POST /projects/{projectId}/file-upload-url
                } else if (path.includes('/file-upload-url') && method === 'POST') {
                    const pathParts = path.split('/');
                    const projectId = pathParts[2];

                    // Verify access to the project
                    const projectArr = await getProjects(projectId, userInfo);
                    if (!projectArr || projectArr.length === 0) throw new Error('Project not found or access denied');

                    let bodyData = event.body || '{}';
                    if (event.isBase64Encoded) {
                        bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                    }
                    const { filename, contentType } = JSON.parse(bodyData || '{}');
                    if (!filename || !contentType) throw new Error('filename and contentType are required');

                    // Sanitize filename and build S3 key
                    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
                    const key = `project-files/${projectId}/${Date.now()}_${safeName}`;

                    // Presign PUT for direct browser upload
                    const putCmd = new PutObjectCommand({
                        Bucket: 'protection-sismique-equipment-images',
                        Key: key,
                        ContentType: contentType
                    });
                    const uploadUrl = await getSignedUrl(s3Client, putCmd, { expiresIn: 900 }); // 15 min

                    body = {
                        success: true,
                        key,
                        uploadUrl
                    };

                // GET /projects/{projectId}/file-download-url?key=...
                } else if (path.includes('/file-download-url') && method === 'GET') {
                    const pathParts = path.split('/');
                    const projectId = pathParts[2];
                    const key = queryStringParameters.key;

                    if (!key) throw new Error('File key is required');

                    // Verify access to the project
                    const projectArr = await getProjects(projectId, userInfo);
                    if (!projectArr || projectArr.length === 0) throw new Error('Project not found or access denied');

                    // Verify key belongs to this project OR its linked limited project
                    const project = projectArr[0];
                    const linkedLimitedId = project.linkedLimitedProjectId;
                    const isValidKey = key.startsWith(`project-files/${projectId}/`) || 
                        (linkedLimitedId && key.startsWith(`project-files/${linkedLimitedId}/`));

                    if (!isValidKey) {
                        throw new Error('Invalid file key for this project');
                    }

                    // Generate signed download URL
                    const getCmd = new GetObjectCommand({
                        Bucket: 'protection-sismique-equipment-images',
                        Key: key
                    });
                    const url = await getSignedUrl(s3Client, getCmd, { expiresIn: 3600 }); // 1 hour

                    body = { success: true, url };

                // POST /projects/{projectId}/file-delete
                } else if (path.includes('/file-delete') && method === 'POST') {
                    const pathParts = path.split('/');
                    const projectId = pathParts[2];

                    // Verify access to the project
                    const projectArr = await getProjects(projectId, userInfo);
                    if (!projectArr || projectArr.length === 0) throw new Error('Project not found or access denied');

                    let bodyData = event.body || '{}';
                    if (event.isBase64Encoded) bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                    const { key } = JSON.parse(bodyData || '{}');
                    
                    if (!key || !key.startsWith(`project-files/${projectId}/`)) {
                        throw new Error('Valid file key required');
                    }

                    // Delete from S3
                    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: 'protection-sismique-equipment-images',
                        Key: key
                    }));

                    body = { success: true };

                    } else if (path.includes('/cfss-data')) {
                        const pathParts = path.split('/');
                        const projectId = pathParts[2];
                        
                        if (method === 'PUT') {
                            let bodyData = event.body || '{}';
                            if (event.isBase64Encoded) {
                                bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                            }
                            const requestBody = JSON.parse(bodyData);
                            const { cfssWindData } = requestBody;
                            body = await updateProjectCFSSData(projectId, cfssWindData, userInfo);
                        } else if (method === 'GET') {
                            body = await getProjectCFSSData(projectId, userInfo);
                        }
                    }
                
                else if (path.includes('/equipment')) {
                const pathParts = path.split('/');
                const projectId = pathParts[2];
                
                if (method === 'PUT') {
                    let bodyData = event.body || '{}';
                    if (event.isBase64Encoded) {
                        bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                    }
                    const requestBody = JSON.parse(bodyData); 
                    const { equipment } = requestBody;
                    body = await updateProjectEquipment(projectId, equipment, userInfo);
                } else if (method === 'GET') {
                    body = await getProjectEquipment(projectId, userInfo);
                }
            } else if (path.includes('/report')) {
                if (method === 'GET' || method === 'POST') {
                    const pathParts = path.split('/');
                    const projectId = pathParts[2];
                    
                    let enhancedProjectData = null;
                    if (method === 'POST' && event.body) {
                        try {
                            // Handle base64 encoded body
                            let bodyData = event.body;
                            if (event.isBase64Encoded) {
                                bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                            }
                            
                            console.log('📥 Raw request body received:', bodyData ? bodyData.substring(0, 200) + '...' : 'empty');
                            
                            const requestBody = JSON.parse(bodyData);
                            enhancedProjectData = requestBody.projectData;
                            
                            console.log('✅ Enhanced project data parsed, equipment count:', enhancedProjectData?.equipment?.length || 0);
                            
                        } catch (parseError) {
                            console.error('❌ Error parsing request body:', parseError);
                            console.log('Raw body sample:', event.body ? event.body.substring(0, 100) : 'empty');
                            // Continue without enhanced data - fallback to regular project fetch
                            enhancedProjectData = null;
                        }
                    }
                    
                    console.log('📄 Starting SEISMIC PDF report generation with template.');
                    const downloadUrl = await generateProjectReportWithTemplate(projectId, userInfo, enhancedProjectData);
                    
                    console.log('📄 PDF generated, returning download URL...');
                    
                    body = {
                        success: true,
                        downloadUrl: downloadUrl,
                        message: 'PDF generated successfully. Use the download URL to get your file.',
                        expiresIn: '1 hour'
                    };
                }
            } 

            else if (path.includes('/cfss-report')) {
                if (method === 'GET' || method === 'POST') {
                    const pathParts = path.split('/');
                    const projectId = pathParts[2];
                    
                    let enhancedProjectData = null;
                    if (method === 'POST' && event.body) {
                        try {
                            // Handle base64 encoded body
                            let bodyData = event.body;
                            if (event.isBase64Encoded) {
                                bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                            }
                            
                            console.log('📥 Raw CFSS request body received:', bodyData ? bodyData.substring(0, 200) + '...' : 'empty');
                            
                            const requestBody = JSON.parse(bodyData);
                            enhancedProjectData = requestBody.projectData;
                            
                            console.log('✅ Enhanced CFSS project data parsed:', {
                                wallsCount: enhancedProjectData?.walls?.length || 0,
                                windDataCount: enhancedProjectData?.cfssWindData?.length || 0,
                                hasRevisions: !!(enhancedProjectData?.wallRevisions?.length),
                                currentRevisionId: enhancedProjectData?.currentWallRevisionId
                            });
                            
                        } catch (parseError) {
                            console.error('❌ Error parsing CFSS request body:', parseError);
                            console.log('Raw body sample:', event.body ? event.body.substring(0, 100) : 'empty');
                            enhancedProjectData = null;
                        }
                    }
                    
                    console.log('📄 Starting CFSS PDF report generation...');
                    const downloadUrl = await generateCFSSProjectReportWithOptionsAndWindows(projectId, userInfo, enhancedProjectData);
                    
                    console.log('📄 CFSS PDF generated, returning download URL...');
                    
                    body = {
                        success: true,
                        downloadUrl: downloadUrl,
                        message: 'CFSS PDF generated successfully. Use the download URL to get your file.',
                        expiresIn: '1 hour'
                    };
                }
            }

            else if (path.includes('/wall-revisions')) {
                const pathParts = path.split('/');
                const projectId = pathParts[2];
                
                if (method === 'PUT') {
                    let bodyData = event.body || '{}';
                    if (event.isBase64Encoded) {
                        bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                    }
                    const requestBody = JSON.parse(bodyData);
                    const { wallRevisions, currentWallRevisionId } = requestBody;
                    body = await updateProjectWallRevisions(projectId, wallRevisions, currentWallRevisionId, userInfo);
                } else if (method === 'GET') {
                    body = await getProjectWallRevisions(projectId, userInfo);
                }
            }

            else if (path.includes('/reassign') && method === 'PUT') {
                const pathParts = path.split('/');
                const projectId = pathParts[2];

                if (!projectId) {
                    throw new Error('Project ID is required for reassignment');
                }

                console.log('🔄 Route: PUT reassign project', projectId);
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const reassignData = JSON.parse(bodyData);
                body = await reassignProject(projectId, reassignData, userInfo);
            }

            else if (path.includes('/duplicate')) {
                if (method === 'POST') {
                    const pathParts = path.split('/');
                    const projectId = pathParts[2];
                    
                    if (!projectId) {
                        throw new Error('Project ID is required for duplication');
                    }
                    
                    body = await duplicateProject(projectId, userInfo);
                }
            }
            
            else {
                // Regular project operations
                if (method === 'GET') {
                    // Extract ID from path (/projects/123) or query string (?id=123)
                    const pathParts = path.split('/');
                    const projectId = pathParts.length > 2 && pathParts[2] ? pathParts[2] : queryStringParameters.id;
                    body = await getProjects(projectId, userInfo);
                } else if (method === 'POST') {
                    let bodyData = event.body || '{}';
                    if (event.isBase64Encoded) {
                        bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                    }
                    const projectData = JSON.parse(bodyData);
                    body = await createProject(projectData, userInfo);
                } else if (method === 'PUT') {
                    let bodyData = event.body || '{}';
                    if (event.isBase64Encoded) {
                        bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                    }
                    const requestData = JSON.parse(bodyData);
                    const { id } = requestData;
                    if (!id) throw new Error('Project ID is required for updates');
                    body = await updateProject(id, requestData, userInfo);
                } else if (method === 'DELETE') {
                    let bodyData = event.body || '{}';
                    if (event.isBase64Encoded) {
                        bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                    }
                    const requestData = JSON.parse(bodyData);
                    const { id } = requestData;
                    if (!id) throw new Error('Project ID is required for deletion');
                    body = await deleteProject(id, requestData, userInfo);
                }
            }

        } else if (path.startsWith('/users')) {
            // Handle specific routes FIRST before general routes
            if (method === 'GET' && path.includes('/approve-user')) {
                const token = queryStringParameters.token;
                if (!token) {
                    throw new Error('Approval token required');
                }
                return await processEmailApproval(token);
                
            } else if (method === 'POST' && path.includes('/notify-admins')) {
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const { email, isExistingUser } = JSON.parse(bodyData);
                await sendApprovalEmail(email, false, isExistingUser || false);
                body = { success: true, message: 'Admin notification sent' };
        
            } else if (method === 'POST' && path.includes('/promote')) {
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const { email }  = JSON.parse(bodyData);
                body = await promoteUserToAdmin(email, userInfo);
                
            } else if (method === 'POST' && path.includes('/demote-to-limited')) {
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const { email } = JSON.parse(bodyData);
                body = await demoteUserToLimited(email, userInfo);

            } else if (method === 'POST' && path.includes('/promote-to-regular')) {
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const { email } = JSON.parse(bodyData);
                body = await promoteUserToRegular(email, userInfo);

            } else if (method === 'POST' && path.includes('/demote')) {
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const { email }  = JSON.parse(bodyData);
                body = await demoteUserFromAdmin(email, userInfo);
        
            } else if (method === 'POST' && path.includes('/approve')) {
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const { email } = JSON.parse(bodyData);
                body = await approveUser(email, userInfo);
        
            } else if (method === 'DELETE') {
                let bodyData = event.body || '{}';
                if (event.isBase64Encoded) {
                    bodyData = Buffer.from(bodyData, 'base64').toString('utf-8');
                }
                const { email }  = JSON.parse(bodyData);
                body = await deleteUser(email, userInfo);
                
            } else if (method === 'GET') {
                // General GET /users - requires admin access
                body = await getUsers(userInfo);
            }

        } else if (path.startsWith('/bulk-verify')) {
            if (method === 'POST' && path === '/bulk-verify/upload-url') {
                const { files } = parsedBody;
                const uploads = await createBulkVerifyUploadUrls({
                    files,
                    userInfo,
                    bucket: 'protection-sismique-equipment-images',
                    s3Client
                });
                body = { success: true, uploads };
            } else if (method === 'POST' && path === '/bulk-verify/verify') {
                const { files } = parsedBody;
                const bucket = 'protection-sismique-equipment-images';

            const result = await processBulkVerifyFiles({
            files,
            userInfo,
            bucket,
            s3Client,
            fetchSignatureBuffer: fetchSignatureFromS3,
            fetchObjectBuffer: (key) => fetchObjectBufferFromS3(key, { bucket, s3Client }),
            insertSignature: insertSignatureAndFlattenPdf
            });
                body = { success: true, ...result };
            } else if (method === 'GET' && path === '/bulk-verify/download') {
                const key = queryStringParameters.key;
                const url = await getBulkVerifyDownloadUrl({
                    key,
                    userInfo,
                    bucket: 'protection-sismique-equipment-images',
                    s3Client
                });
                body = { success: true, downloadUrl: url };
            }
        
        
        } else {
            // Default fallback
            body = await getProjects(null, userInfo);
        }

    } catch (err) {
        console.error('❌ Lambda processing error:', err);
        statusCode = err.message.includes('Access denied') ? 403 : 
                    err.message.includes('not found') ? 404 : 
                    err.message.includes('required') ? 400 : 500;
        body = { 
            error: err.message,
            timestamp: new Date().toISOString()
        };
    } finally {
        const totalDuration = Date.now() - handlerStartTime;
        console.log(`⏱️ Handler execution time: ${totalDuration}ms`);
    }

    // Always return CORS headers
    console.log('📤 Returning response with status:', statusCode);
    return {
        statusCode,
        headers: CORS_HEADERS,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        isBase64Encoded: false
    };
};

// Force-flatten any PDF by reprinting it with headless Chrome
async function forceFlattenWithChromium(pdfBuffer) {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
  
    try {
      const page = await browser.newPage();
      const base64 = Buffer.from(pdfBuffer).toString('base64');
      await page.goto(`data:application/pdf;base64,${base64}`, { waitUntil: 'load' });
  
      // A single print pass produces a fully flattened PDF
      const flattenedBytes = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
      });
  
      return Buffer.from(flattenedBytes);
    } finally {
      await browser.close();
    }
  }

// Flatten a PDF via the PDF4me cloud API
async function flattenWithPdf4me(pdfBuffer) {
  const apiKey = process.env.PDF4ME_API_KEY;
  if (!apiKey) throw new Error('PDF4ME_API_KEY environment variable is not configured');

  const response = await fetch('https://api.pdf4me.com/api/v2/FlattenPdf', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docContent: Buffer.from(pdfBuffer).toString('base64'),
      docName: 'document.pdf',
      IsAsync: true,
      flattenForms: true,
      flattenAnnotations: true,
      flattenLayers: true,
      flattenSignatures: true,
      flattenInteractive: true,
    }),
  });

  if (response.status === 202) {
    const locationUrl = response.headers.get('Location');
    if (!locationUrl) throw new Error('PDF4me returned 202 but no Location header for polling');
    return await pollPdf4meResult(locationUrl, apiKey);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`PDF4me flatten failed (HTTP ${response.status}): ${errText}`);
  }

  // Status 200 — read as arrayBuffer to avoid UTF-8 corruption of binary data
  const responseBuffer = Buffer.from(await response.arrayBuffer());
  // Try JSON first (base64 encoded result)
  try {
    const json = JSON.parse(responseBuffer.toString('utf-8'));
    const b64 = json.document?.docData || json.docData || json.docContent || json.data;
    if (b64) return Buffer.from(b64, 'base64');
  } catch (_) { /* not JSON */ }

  // Raw binary fallback
  if (responseBuffer.length > 4 && responseBuffer.toString('ascii', 0, 4) === '%PDF') {
    return responseBuffer;
  }

  throw new Error('PDF4me response did not contain a valid PDF');
}

async function pollPdf4meResult(locationUrl, apiKey, maxRetries = 20, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await new Promise(r => setTimeout(r, delayMs));
    const resp = await fetch(locationUrl, {
      headers: { 'Authorization': apiKey },
    });
    if (resp.status === 200) {
      const responseBuffer = Buffer.from(await resp.arrayBuffer());
      try {
        const json = JSON.parse(responseBuffer.toString('utf-8'));
        const b64 = json.document?.docData || json.docData || json.docContent || json.data;
        if (b64) return Buffer.from(b64, 'base64');
      } catch (_) { /* not JSON */ }
      // Raw binary fallback
      if (responseBuffer.length > 4 && responseBuffer.toString('ascii', 0, 4) === '%PDF') {
        return responseBuffer;
      }
      throw new Error('PDF4me polling returned 200 but no valid PDF data');
    }
    if (resp.status !== 202) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`PDF4me polling failed (HTTP ${resp.status}): ${errText}`);
    }
    console.log(`PDF4me still processing (attempt ${attempt}/${maxRetries})...`);
  }
  throw new Error('PDF4me flatten timed out after polling');
}

// Helper: check if a non-admin user can access a project
function canAccessProject(project, userEmail) {
    if (project.createdBy === userEmail) return true;
    if (Array.isArray(project.assignedTo) && project.assignedTo.includes(userEmail)) return true;
    return false;
}

// Function to update project wall revisions
async function updateProjectWallRevisions(projectId, wallRevisions, currentWallRevisionId, userInfo) {
    // Check project access first
    const getParams = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };
    const existingProject = await dynamodb.get(getParams);
    
    if (!existingProject.Item) {
        throw new Error('Project not found');
    }
    
    if (!userInfo.isAdmin && !canAccessProject(existingProject.Item, userInfo.email)) {
        throw new Error('Access denied: You can only update wall revisions for your own projects');
    }

    console.log(`🔄 Updating wall revisions for project ${projectId} by ${userInfo.email}`);
    console.log(`📝 Saving ${wallRevisions.length} revisions, current: ${currentWallRevisionId}`);
    
    // Validate revision data
    if (!Array.isArray(wallRevisions)) {
        throw new Error('Wall revisions must be an array');
    }
    
    // Validate each revision
    wallRevisions.forEach((revision, index) => {
        if (!revision.id || revision.number === undefined || revision.number === null || !revision.createdAt || !revision.createdBy) {
            throw new Error(`Invalid revision data at index ${index}: missing required fields`);
        }
        if (!Array.isArray(revision.walls)) {
            throw new Error(`Invalid revision data at index ${index}: walls must be an array`);
        }
        if (revision.description && revision.description.length > 100) {
            throw new Error(`Invalid revision data at index ${index}: description too long`);
        }
    });
    
    // Enforce max 5 revisions
    if (wallRevisions.length > 5) {
        throw new Error('Maximum of 5 wall revisions allowed');
    }
    
    const params = {
        TableName: TABLE_NAME,
        Key: { id: projectId },
        UpdateExpression: 'set wallRevisions = :wallRevisions, currentWallRevisionId = :currentWallRevisionId, #updatedAt = :updatedAt, #updatedBy = :updatedBy',
        ExpressionAttributeNames: {
            '#updatedAt': 'updatedAt',
            '#updatedBy': 'updatedBy'
        },
        ExpressionAttributeValues: {
            ':wallRevisions': wallRevisions,
            ':currentWallRevisionId': currentWallRevisionId,
            ':updatedAt': new Date().toISOString(),
            ':updatedBy': userInfo.email
        },
        ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.update(params);
    console.log('✅ Wall revisions updated successfully');
    return {
        success: true,
        wallRevisions: result.Attributes.wallRevisions,
        currentWallRevisionId: result.Attributes.currentWallRevisionId
    };
}

// Function to get project wall revisions
async function getProjectWallRevisions(projectId, userInfo) {
    // Check project access
    const params = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };
    
    const result = await dynamodb.get(params);
    
    if (!result.Item) {
        throw new Error('Project not found');
    }
    
    if (!userInfo.isAdmin && !canAccessProject(result.Item, userInfo.email)) {
        throw new Error('Access denied: You can only view wall revisions for your own projects');
    }
    
    const wallRevisions = result.Item?.wallRevisions || [];
    const currentWallRevisionId = result.Item?.currentWallRevisionId || null;
    
    console.log(`🔍 Wall revisions fetched for project ${projectId} by ${userInfo.email}: ${wallRevisions.length} revisions`);
    
    return {
        wallRevisions,
        currentWallRevisionId
    };
}

// UPDATE: Modify the existing generateCFSSProjectReport function to include revision data
// Replace the existing function with this enhanced version:

async function generateCFSSProjectReportWithRevisions(projectId, userInfo, enhancedProjectData = null) {
    console.log(`📄 Generating CFSS PDF report with revisions for project ${projectId}`);
    
    try {
        let project;
        
        if (enhancedProjectData) {
            project = enhancedProjectData;
        } else {
            const projectData = await getProjects(projectId, userInfo);
            if (!projectData || projectData.length === 0) {
                throw new Error('CFSS Project not found or access denied');
            }
            project = projectData[0];
        }
        
        console.log(`📊 CFSS Project walls count: ${project.walls?.length || project.equipment?.length || 0}`);
        
        // Extract revision data for PDF
        const revisionData = extractRevisionDataForPDF(project);
        console.log(`📋 Extracted ${revisionData.revisions.length} revisions for PDF`);
        
        // 1. Fetch CFSS cover template
        console.log('📥 Fetching CFSS cover template...');
        const cfssTemplateBuffer = await fetchCFSSTemplateFromS3();
        
        // 2. Fill cover template with revision data
        console.log('📝 Filling CFSS cover template with revisions...');
        const filledCoverPdf = await fillCFSSTemplateWithRevisions(cfssTemplateBuffer, project, userInfo, revisionData);
        
        // 3. Generate wall detail pages
        console.log('🏗️ Generating CFSS wall detail pages...');
        const wallDetailsPdf = await generateCFSSWallDetailPages(project, userInfo);
        
        // 4. Generate summary table page
        console.log('📋 Generating CFSS summary table...');
        const summaryTablePdf = await generateCFSSSummaryTable(project, userInfo);
        
        // 5. Merge all PDFs
        console.log('🔗 Merging CFSS PDFs...');
        const finalPdf = await mergeCFSSPDFsWithSummary(filledCoverPdf, wallDetailsPdf, summaryTablePdf);
        
        // 6. Apply watermark for non-admin users
        let processedPdf = finalPdf;
        if (!userInfo.isAdmin) {
            console.log('🏷️ Applying watermark...');
            processedPdf = await addWatermarkToPdf(finalPdf);
        }
        
        // 7. Upload to S3
        console.log('📤 Uploading CFSS PDF to S3...');
        const downloadUrl = await uploadPdfToS3AndGetUrl(processedPdf, project, userInfo, 'CFSS');
        
        return downloadUrl;
        
    } catch (error) {
        console.error('❌ Error generating CFSS report with revisions:', error);
        throw new Error(`Failed to generate CFSS PDF report: ${error.message}`);
    }
}

// Function to extract revision data for PDF
function extractRevisionDataForPDF(project) {
    const wallRevisions = project.wallRevisions || [];
    
    // Sort revisions by number to ensure proper order
    const sortedRevisions = [...wallRevisions].sort((a, b) => a.number - b.number);
    
    const revisionData = {
        revisions: sortedRevisions.map(rev => ({
            number: rev.number,
            description: rev.description || 'Pour construction', // Default if no description
            date: new Date(rev.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            })
        })),
        totalRevisions: sortedRevisions.length
    };
    
    console.log('📋 Revision data extracted:', revisionData);
    return revisionData;
}

// Enhanced fillCFSSTemplate function with revision data
async function fillCFSSTemplateWithRevisions(templateBuffer, project, userInfo, revisionData) {
    try {
        // Load the template PDF
        const pdfDoc = await PDFDocument.load(templateBuffer);
        const form = pdfDoc.getForm();
        
        // Build project address string
        const projectAddress = [
            project.addressLine1,
            project.addressLine2,
            project.city,
            project.province,
            project.country
        ].filter(Boolean).join(', ');
        
        // Get current date in MM/DD/YY format
        const today = new Date();
        const currentDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear().toString().slice(-2)}`;
        
        // Get specifications from CFSS wind data
        const specifications = project.cfssWindData?.specifications || {};
        const storeys = project.cfssWindData?.storeys || [];
        
        // Helper function to format numbers to max 5 decimal places
        const formatNumber = (value) => {
            if (value === null || value === undefined || value === '') return '';
            const numValue = parseFloat(value);
            if (isNaN(numValue) || !isFinite(numValue)) return '';
            return parseFloat(numValue.toFixed(5)).toString();
        };

        // Helper function to create concatenated wind data strings from storeys FOR COVER PAGE
        // Smart grouping: ≤5 floors = no grouping, 6-10 = group by 2, ≥11 = group by 4
        // function formatWindDataString(storeys, dataType) {
        //     if (!storeys || !Array.isArray(storeys) || storeys.length === 0) {
        //         return '';
        //     }
            
        //     const floorCount = storeys.length;
        //     let groupedStoreys = [];
            
        //     if (floorCount <= 5) {
        //         // No grouping needed - show all floors
        //         groupedStoreys = storeys.map(storey => ({
        //             label: storey.label,
        //             value: dataType === 'resistance' ? storey.uls : storey.sls
        //         }));
        //     } else if (floorCount >= 6 && floorCount <= 10) {
        //         // Group by 2, take max PSF value
        //         const groupSize = 2;
        //         for (let i = 0; i < storeys.length; i += groupSize) {
        //             const group = storeys.slice(i, i + groupSize);
        //             const values = group.map(s => dataType === 'resistance' ? s.uls : s.sls);
        //             const maxValue = Math.max(...values);
        //             const label = group.length > 1 
        //                 ? `${group[0].label} - ${group[group.length - 1].label}`
        //                 : group[0].label;
        //             groupedStoreys.push({ label, value: maxValue });
        //         }
        //     } else {
        //         // 11+ floors: Group by 4, take max PSF value
        //         const groupSize = 4;
        //         for (let i = 0; i < storeys.length; i += groupSize) {
        //             const group = storeys.slice(i, i + groupSize);
        //             const values = group.map(s => dataType === 'resistance' ? s.uls : s.sls);
        //             const maxValue = Math.max(...values);
        //             const label = group.length > 1 
        //                 ? `${group[0].label} - ${group[group.length - 1].label}`
        //                 : group[0].label;
        //             groupedStoreys.push({ label, value: maxValue });
        //         }
        //     }
            
        //     return groupedStoreys.map(item => {
        //         return `${item.label}: ${formatNumber(item.value)} psf`;
        //     }).join('               '); // Multiple spaces for better visual separation
        // }

        function formatWindDataString(storeys, dataType, floorGroups) {
            if (!storeys || !Array.isArray(storeys) || storeys.length === 0) {
                return '';
            }
            
            const displayFloors = [];
            const groupedIndices = new Set();
            
            // First, process groups if they exist
            if (floorGroups && Array.isArray(floorGroups) && floorGroups.length > 0) {
                floorGroups.forEach(group => {
                    const floorsInGroup = [];
                    for (let i = group.firstIndex; i <= group.lastIndex; i++) {
                        if (storeys[i]) {
                            floorsInGroup.push(storeys[i]);
                            groupedIndices.add(i);
                        }
                    }
                    
                    if (floorsInGroup.length > 0) {
                        // Find max value for this group
                        const values = floorsInGroup.map(f => dataType === 'resistance' ? f.uls : f.sls);
                        const maxValue = Math.max(...values);
                        
                        displayFloors.push({
                            label: `${floorsInGroup[0].label} - ${floorsInGroup[floorsInGroup.length - 1].label}`,
                            value: maxValue,
                            index: group.firstIndex
                        });
                    }
                });
            }
            
            // Then add ungrouped floors
            storeys.forEach((storey, index) => {
                if (!groupedIndices.has(index)) {
                    const value = dataType === 'resistance' ? storey.uls : storey.sls;
                    displayFloors.push({
                        label: storey.label,
                        value: value,
                        index: index
                    });
                }
            });
            
            // Sort by original index to maintain order
            displayFloors.sort((a, b) => a.index - b.index);
            
            return displayFloors.map(item => {
                return `${item.label}: ${formatNumber(item.value)} psf`;
            }).join('               '); // Multiple spaces for better visual separation
        }

        // Generate the formatted wind data strings
        const floorGroups = project.cfssWindData?.floorGroups || [];
        const windResistanceString = formatWindDataString(storeys, 'resistance', floorGroups);
        const windDeflectionString = formatWindDataString(storeys, 'deflection', floorGroups);

        // Base CFSS field mappings
        const cfssFieldMappings = {
            'clientName': sanitizeText(project.clientName) || '',
            'projectTitle': sanitizeText(project.name) || '',
            'projectTitle2': sanitizeText(project.name) || '',
            'projectAddress': sanitizeText(projectAddress),
            'contractNumber': sanitizeText(project.projectNumber) || '',
            'registerDate': currentDate,
            'preparedBy': sanitizeText(project.designedBy) || 'Dat Bui Tuan',
            'approvedBy': sanitizeText(project.approvedBy) || 'Minh Duc Hoang, ing',
            'revision': '',
            
            // Basic project information
            'projectDescription': sanitizeText(project.description) || '',
            'projectType': sanitizeText(project.type) || '',
            'projectStatus': sanitizeText(project.status) || '',
            
            // CFSS Wind Data - formatted as concatenated strings
            'windLoadResistance': windResistanceString,
            'windLoadDeflection': windDeflectionString,
            
            // CFSS Project Specifications
            'maxDeflection': sanitizeText(specifications.maxDeflection) || '',
            'maxSpacingBetweenBraces': sanitizeText(specifications.maxSpacing) || '',
            'framingAssembly': sanitizeText(specifications.framingAssembly) || '',
            'concreteAnchorage': sanitizeText(specifications.concreteAnchor) || '',
            'steelAnchorage': sanitizeText(specifications.steelAnchor) || '',
            'minMetalThicknessFraming': sanitizeText(specifications.minMetalThickness) || '',
            'lisseInferieure': sanitizeText(specifications.lisseInferieure) || '',
            'lisseSuperieure': sanitizeText(specifications.lisseSuperieure) || ''
        };
        
        // ADD REVISION DATA TO FIELD MAPPINGS
        // Add revision fields (revision1, revision2, description1, description2, Date1, Date2)
        for (let i = 0; i < revisionData.revisions.length; i++) {
            const revisionNum = i + 1;
            const revision = revisionData.revisions[i];
            
            cfssFieldMappings[`revision${revisionNum}`] = revision.number.toString().padStart(2, '0');
            cfssFieldMappings[`description${revisionNum}`] = revision.description; // Blank if no description
            cfssFieldMappings[`Date${revisionNum}`] = revision.date;
        }
        
        console.log(`📝 CFSS field mappings prepared with ${Object.keys(cfssFieldMappings).length} fields (including ${revisionData.revisions.length} revisions)`);
        
        // Fill form fields
        const fields = form.getFields();
        let filledFieldsCount = 0;

        fields.forEach(field => {
            const fieldName = field.getName();
            
            Object.entries(cfssFieldMappings).forEach(([suffix, value]) => {
                if (fieldName.endsWith(suffix)) {
                    try {
                        if (field.constructor.name === 'PDFTextField') {
                            field.setText(String(value));
                            console.log(`Filled CFSS field ${fieldName}: ${value}`);
                            filledFieldsCount++;
                        }
                    } catch (error) {
                        console.warn(`Could not fill CFSS field ${fieldName}: ${error.message}`);
                    }
                }
            });
        });


        console.log(`✅ Filled ${filledFieldsCount} CFSS form fields successfully (including revision data)`);

       // Apply Roboto Condensed to specific fields
       try {
        pdfDoc.registerFontkit(fontkit);
        const robotoCondensedPath = path.resolve('./fonts/RobotoCondensed-Regular.ttf');
        const robotoCondensedBuffer = await fs.promises.readFile(robotoCondensedPath);
        const robotoCondensedFont = await pdfDoc.embedFont(new Uint8Array(robotoCondensedBuffer));
        
        const condensedFields = ['projectTitle', 'projectAddress', 'clientName', 'contractNumber'];
        for (const fieldName of condensedFields) {
            try {
                const field = form.getTextField(fieldName);
                if (field) {
                    // For projectAddress, check if text would overflow and reduce font size if needed
                    if (fieldName === 'projectAddress') {
                        const text = field.getText() || '';
                        const widgets = field.acroField.getWidgets();
                        if (widgets.length > 0) {
                            const rect = widgets[0].getRectangle();
                            const fieldWidth = rect.width;
                            const defaultFontSize = 10;
                            const textWidth = robotoCondensedFont.widthOfTextAtSize(text, defaultFontSize);
                            
                            if (textWidth > fieldWidth) {
                                field.setFontSize(9);
                                console.log(`✅ projectAddress text overflows, set font size to 9`);
                            } else {
                                field.setFontSize(10);
                                console.log(`✅ projectAddress fits, set font size to 10`);
                            }
                        }
                    }
                    field.updateAppearances(robotoCondensedFont);
                    console.log(`✅ Applied Roboto Condensed to ${fieldName}`);
                }
            } catch (err) {
                console.warn(`Could not apply Roboto Condensed to ${fieldName}:`, err.message);
            }
        }
    } catch (error) {
        console.warn('Could not apply Roboto Condensed font:', error.message);
    }

        // Set projectTitle2 font size to 20pt (keeps default font)
        try {
            const projectTitle2Field = form.getTextField('projectTitle2');
            if (projectTitle2Field) {
                projectTitle2Field.setFontSize(20);
                projectTitle2Field.updateAppearances();
                console.log('✅ Set projectTitle2 font size to 20pt');
            }
        } catch (error) {
            console.warn('Could not set projectTitle2 font size:', error.message);
        }
        
        try {
            if (!userInfo.isAdmin || shouldForceFlattenForUser(userInfo, project)) {
              form.flatten();
              console.log('✅ CFSS cover form flattened at source');
            } else {
              console.log('⏭️ Skipping cover form flatten for admin (No Sign & Flatten).');
            }
          } catch (e) {
            console.warn('Could not flatten CFSS cover form at source:', e.message);
          }

        return await pdfDoc.save();
        
    } catch (error) {
        console.error('Error filling CFSS template fields with revisions:', error);
        throw new Error(`Failed to fill CFSS template form fields with revisions: ${error.message}`);
    }
}

async function applyProjectAddressCondensedStyle(pdfDoc) {
    try {
        const form = pdfDoc.getForm();
        
        // Fields that should use condensed font at 10pt
        const condensedFieldNames = ['projectAddress', 'projectTitle', 'clientName', 'contractNumber'];
        
        // Log all available fields in the form for debugging
        const allFields = form.getFields();
        console.log('🔤 [CONDENSE] All form fields available:', allFields.map(f => f.getName()));
        
        pdfDoc.registerFontkit(fontkit);

        const fontPath = path.resolve('./fonts/RobotoCondensed-Regular.ttf');
        console.log('🔤 [CONDENSE] Loading font from:', fontPath);

        const fontBuffer = await fs.promises.readFile(fontPath);
        const fontBytes = new Uint8Array(fontBuffer);
        const condensedFont = await pdfDoc.embedFont(fontBytes);

        let appliedCount = 0;
        for (const fieldName of condensedFieldNames) {
            try {
                const field = form.getTextField(fieldName);
                if (field) {
                    const currentText = field.getText() || '';
                    console.log(`🔍 [CONDENSE] Processing ${fieldName}, current value: "${currentText}"`);
                    
                    // For projectAddress, check if text would overflow and reduce font size if needed
                    if (fieldName === 'projectAddress') {
                        const widgets = field.acroField.getWidgets();
                        if (widgets.length > 0) {
                            const rect = widgets[0].getRectangle();
                            const fieldWidth = rect.width;
                            const textWidth = condensedFont.widthOfTextAtSize(currentText, 10);
                            
                            if (textWidth > fieldWidth) {
                                field.setFontSize(9);
                                console.log(`✅ [CONDENSE] projectAddress text overflows, set font size to 9`);
                            } else {
                                field.setFontSize(10);
                                console.log(`✅ [CONDENSE] projectAddress fits, set font size to 10`);
                            }
                        } else {
                            field.setFontSize(10);
                        }
                    } else {
                        field.setFontSize(10);
                    }
                    
                    field.updateAppearances(condensedFont);
                    appliedCount++;
                    console.log(`✅ [CONDENSE] Applied Roboto Condensed to ${fieldName}`);
                } else {
                    console.warn(`⚠️ [CONDENSE] Field ${fieldName} returned null`);
                }
            } catch (fieldErr) {
                console.error(`❌ [CONDENSE] Error applying font to ${fieldName}:`, fieldErr.message);
            }
        }

        console.log(`✅ [CONDENSE] Applied Roboto Condensed 10pt to ${appliedCount}/${condensedFieldNames.length} fields`);
    } catch (err) {
        console.error('❌ [CONDENSE] Error:', err);
    }
}


async function updateProjectCFSSData(projectId, cfssWindData, userInfo) {
    // Check project access first
    const getParams = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };
    const existingProject = await dynamodb.get(getParams);
    
    if (!existingProject.Item) {
        throw new Error('Project not found');
    }
    
    if (!userInfo.isAdmin && !canAccessProject(existingProject.Item, userInfo.email)) {
        throw new Error('Access denied: You can only update CFSS data for your own projects');
    }

    console.log(`🏗️ Updating CFSS wind data for project ${projectId} by ${userInfo.email}`);
    
    const params = {
        TableName: TABLE_NAME,
        Key: { id: projectId },
        UpdateExpression: 'set cfssWindData = :cfssWindData, #updatedAt = :updatedAt, #updatedBy = :updatedBy',
        ExpressionAttributeNames: {
            '#updatedAt': 'updatedAt',
            '#updatedBy': 'updatedBy'
        },
        ExpressionAttributeValues: {
            ':cfssWindData': cfssWindData || [],
            ':updatedAt': new Date().toISOString(),
            ':updatedBy': userInfo.email
        },
        ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.update(params);
    console.log('✅ CFSS wind data updated successfully');
    return result.Attributes;
}

async function getProjectCFSSData(projectId, userInfo) {
    // Check project access
    const params = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };
    
    const result = await dynamodb.get(params);
    
    if (!result.Item) {
        throw new Error('Project not found');
    }
    
    if (!userInfo.isAdmin && !canAccessProject(result.Item, userInfo.email)) {
        throw new Error('Access denied: You can only view CFSS data for your own projects');
    }
    
    const cfssWindData = result.Item?.cfssWindData || [];
    console.log(`🔍 CFSS wind data fetched for project ${projectId} by ${userInfo.email}`);
    return cfssWindData;
}

// NEW: PDF Template Processing Function
async function generateProjectReportWithTemplate(projectId, userInfo, enhancedProjectData = null) {
    console.log(`📄 Generating PDF report with template for project ${projectId}`);
    console.log(`👤 User type: ${userInfo.isAdmin ? 'Admin' : 'Regular User'}`);
    
    try {
        let project;
        
        if (enhancedProjectData) {
            console.log('✅ Using enhanced project data from frontend');
            project = enhancedProjectData;
        } else {
            console.log('📥 Fetching project data from database');
            const projectData = await getProjects(projectId, userInfo);
            if (!projectData || projectData.length === 0) {
                throw new Error('Project not found or access denied');
            }
            project = projectData[0];
        }
        
        console.log(`📊 Project equipment count: ${project.equipment?.length || 0}`);
        console.log(`🏗️ Project domain: ${project.domain}`);
        
        // Step 1: Fill and flatten cover page
        console.log('📥 Fetching cover page template PDF from S3...');
        const coverTemplateBuffer = await fetchTemplateFromS3('cover', project.domain);
        console.log('✅ Cover page template PDF fetched');
        
        const coverPdf = await PDFDocument.load(coverTemplateBuffer);
        const coverPageCount = coverPdf.getPageCount();
        console.log(`📊 Cover template has ${coverPageCount} pages`);

        console.log('📝 Filling cover page template...');
        const coverPagePdf = await fillCoverPageTemplate(coverTemplateBuffer, project, userInfo);
        console.log('✅ Cover page template filled (and flattened for non-admin)');

        // Step 2: Generate and flatten equipment pages
        console.log('🔧 Generating individual equipment detail pages...');
        const equipmentDetailPagesPdf = await generateIndividualEquipmentPages(project, userInfo, coverPageCount);
        console.log('✅ Equipment detail pages generated (and flattened for non-admin)');
        
        // Step 3: Merge the already-flattened PDFs
        console.log('🔗 Merging already-flattened PDFs...');
        const finalPdf = await mergeAllPDFs(coverPagePdf, null, equipmentDetailPagesPdf);
        console.log('✅ PDFs merged successfully');
        
        // Step 4: Apply watermark for non-admin (after merge, no additional flattening needed)
        let processedPdf = finalPdf;
        
        if (!userInfo.isAdmin) {
            console.log('🏷️ Applying watermark for non-admin user...');
            processedPdf = await addWatermarkToPdf(finalPdf);
            console.log('✅ Watermark applied successfully');
            console.log('ℹ️ Note: All form fields were already flattened before merge');
        } else {
            console.log('⏭️ Admin user - skipping watermark (forms were not flattened)');
        }
        
        // Step 5: Upload to S3
        console.log('📤 Uploading PDF to S3...');
        const downloadUrl = await uploadPdfToS3AndGetUrl(processedPdf, project, userInfo);
        console.log('✅ PDF uploaded, download URL generated');
        
        return downloadUrl;
        
    } catch (error) {
        console.error('❌ Error generating report with template:', error);
        throw new Error(`Failed to generate PDF report: ${error.message}`);
    }
}

// Function to add "To be approved" watermark to all pages
async function addWatermarkToPdf(pdfBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const text = 'To be approved';
  
    for (const [i, page] of pages.entries()) {
      const { width, height } = page.getSize();
  
      // Exact page diagonal angle
      const theta = Math.atan2(height, width);
      const angleDeg = (theta * 180) / Math.PI;
  
      // Use ~80% of diagonal length for full span
      const diagonal = Math.hypot(width, height);
      const targetWidth = diagonal * 0.8;
  
      // Pick font size so text width ≈ targetWidth
      const widthAtSize1 = font.widthOfTextAtSize(text, 1);
      const fontSize = targetWidth / widthAtSize1;
  
      // Actual text box dimensions
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);
  
      // Center of page
      const cx = width / 2;
      const cy = height / 2;
  
      // Solve for bottom-left (x,y) so rotated text stays centered
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = cx - (cosT * (textWidth / 2) - sinT * (textHeight / 2));
      const y = cy - (sinT * (textWidth / 2) + cosT * (textHeight / 2));
  
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.3,       // lighter, adjust as needed
        rotate: degrees(angleDeg),
      });
  
      console.log(`✅ Watermark applied to page ${i + 1}`);
    }
  
    return await pdfDoc.save();
  }

  // Function to fetch signature image from S3
async function fetchSignatureFromS3() {
    try {
        console.log('📥 Fetching signature from S3...');
        
        const getCommand = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: 'signatures/sign.png'
        });
        
        const response = await s3Client.send(getCommand);
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        const signatureBuffer = Buffer.concat(chunks);
        console.log('✅ Signature fetched from S3');
        return signatureBuffer;
        
    } catch (error) {
        console.error('❌ Error fetching signature from S3:', error);
        throw new Error(`Failed to fetch signature: ${error.message}`);
    }
}

// Read an object from S3 and return it as a Buffer
async function fetchObjectBufferFromS3(key, { bucket, s3Client }) {
    const res = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

// Function to insert signature into all Signature1 fields and flatten PDF
async function insertSignatureAndFlattenPdf(pdfBuffer, signatureBuffer) {
    try {
      console.log('🖊️ Starting signature insertion process...');
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const signatureImage = await pdfDoc.embedPng(signatureBuffer);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yy = String(now.getFullYear()).slice(-2);
      const formattedDate = `${mm}/${dd}/${yy}`;
      console.log(`📅 Current date: ${formattedDate}`);
  
      const pages = pdfDoc.getPages();
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pw = page.getWidth();
        const ph = page.getHeight();
  
        // Right & bottom margins
        const marginRight = Math.max(24, pw * 0.04);
        const marginBottom = Math.max(24, ph * 0.04);
  
        // Fit the stamp into a sane box
        const targetW = Math.min(pw * 0.18, 180);
        const targetH = Math.min(ph * 0.12, 110);
  
        // Preserve aspect ratio
        const imgAR = signatureImage.width / signatureImage.height;
        let drawW = targetW;
        let drawH = targetW / imgAR;
        if (drawH > targetH) {
          drawH = targetH;
          drawW = targetH * imgAR;
        }

        const x = pw - marginRight - drawW;
        const y = 120;
  
        page.drawImage(signatureImage, { x, y, width: drawW, height: drawH });
  
        // Date tucked just under-left of the stamp
        const dateSize = 10;
        const dateX = Math.max(marginRight, x - 35);
        const dateY = Math.max(12, y - 12);
        page.drawText(formattedDate, { x: dateX, y: dateY, size: dateSize, font, color: rgb(0,0,0) });
  
        console.log(`✅ Signature placed on page ${i + 1} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
      }
  
      console.log('✅ Signature and date insertion complete (flattening will happen later)');
      return await pdfDoc.save();
    } catch (error) {
      console.error('❌ Error inserting signature:', error);
      throw new Error(`Failed to insert signature: ${error.message}`);
    }
  }

// Upload PDF to S3 and return pre-signed download URL
async function uploadPdfToS3AndGetUrl(pdfBuffer, project, userInfo, reportType = 'Seismic') {
    try {
        // Generate unique filename with project details
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const projectNumber = (project.projectNumber || 'NONUM').replace(/[^a-zA-Z0-9]/g, '');
        const clientName = (project.clientName || 'NOCLIENT').replace(/[^a-zA-Z0-9]/g, '');
        const projectName = (project.name || 'NONAME').replace(/[^a-zA-Z0-9]/g, '');
        
        // Format: projectNumber-clientName-projectName-R{revision}
        let baseFilename;
        if (project.selectedRevisionNumber !== undefined && project.selectedRevisionNumber !== null) {
            baseFilename = `${projectNumber}-${clientName}-${projectName}-R${project.selectedRevisionNumber}`;
        } else {
            baseFilename = `${projectNumber}-${clientName}-${projectName}`;
        }
        
        const downloadFilename = `${baseFilename}.pdf`;
        const s3Filename = `reports/${baseFilename}_${timestamp}.pdf`;
        
        console.log('📁 Uploading to S3 with filename:', s3Filename);
        
        // Rest of the function remains the same...
        const uploadCommand = new PutObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: s3Filename,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
            ContentDisposition: `attachment; filename="${downloadFilename}"`,
            Metadata: {
                'generated-by': userInfo.email,
                'project-id': project.id,
                'report-type': reportType.toLowerCase(),
                'revision-number': project.selectedRevisionNumber ? project.selectedRevisionNumber.toString() : '',
                'generated-at': new Date().toISOString()
            }
        });
        
        await s3Client.send(uploadCommand);
        console.log('✅ PDF uploaded to S3 successfully');
        
        // Generate pre-signed URL for download (expires in 1 hour)
        const getCommand = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: s3Filename
        });
        
        const downloadUrl = await getSignedUrl(s3Client, getCommand, { 
            expiresIn: 3600 // 1 hour
        });
        
        console.log('✅ Pre-signed download URL generated');
        
        return downloadUrl;
        
    } catch (error) {
        console.error('❌ Error uploading PDF to S3:', error);
        throw new Error(`Failed to upload PDF to S3: ${error.message}`);
    }
}

async function generateCFSSWindowsSpecificationTable(project, userInfo) {
    try {
        console.log('📊 Generating CFSS windows specification table...');
        
        const windows = project.windows || [];
        
        // Only generate if windows exist
        if (windows.length === 0) {
            console.log('No windows found, skipping windows table generation');
            return null;
        }
        
        // Extract revision data for consistent formatting
        const revisionData = extractAndValidateRevisionData(project);
        
        // Fetch template
        const templateBuffer = await fetchCFSSSummaryTemplateFromS3(); // Reuse blank template
        const pdfDoc = await PDFDocument.load(templateBuffer);
        const pages = pdfDoc.getPages();
        const page = pages[0];
        
        // Fill form fields if they exist (same header as other pages)
        try {
            const form = pdfDoc.getForm();
            await fillCFSSWallsTemplateFields(form, project, userInfo, revisionData);
        } catch (formError) {
            console.log('No form fields found in windows template');
        }
        
// Draw the windows specification table
await drawCFSSWindowsSpecificationTable(pdfDoc, page, project);

// Apply condensed font to projectAddress field (always, regardless of admin status)
try {
    const form = pdfDoc.getForm();
    await updateFieldAppearancesWithUnicodeFont(pdfDoc, form);
    await applyProjectAddressCondensedStyle(pdfDoc);
    
    // 🔒 Flatten at the source (same rule as cover/walls)
    if (!userInfo.isAdmin || shouldForceFlattenForUser(userInfo, project)) {
        form.flatten();
    }
} catch (_) {
    // no form on this template — that's fine
}

return await pdfDoc.save();
        
    } catch (error) {
        console.error('❌ Error generating CFSS windows specification table:', error);
        throw new Error(`Failed to generate CFSS windows specification table: ${error.message}`);
    }
}

// HELPER FUNCTION: Add this before the window table drawing code
function getCompositionText(compositionData) {
    if (!compositionData) return '';
    
    // Handle array of compositions (new format)
    if (Array.isArray(compositionData.compositions) && compositionData.compositions.length > 0) {
        return compositionData.compositions.join('\n');
    }
    
    // Handle single composition (backward compatibility)
    if (compositionData.composition) {
        return compositionData.composition;
    }
    
    return '';
}

// HELPER FUNCTION: Calculate row height based on compositions
function calculateRowHeight(window, baseRowHeight = 15, lineHeight = 10) {
    // Get max number of composition lines across all three fields
    const jambageLines = window.jambage?.compositions?.length || 1;
    const linteauLines = window.linteau?.compositions?.length || 1;
    const seuilLines = window.seuil?.compositions?.length || 1;
    
    const maxLines = Math.max(jambageLines, linteauLines, seuilLines);
    
    // Return height: base + (extra lines * line height)
    return baseRowHeight + ((maxLines - 1) * lineHeight);
}

function formatWindowDimension(majorValue, unit, minorValue) {
    if (!majorValue) return '';
    
    // Handle m-mm: convert to mm
    if (unit === 'm-mm') {
        const meters = parseFloat(majorValue) || 0;
        const millimeters = parseFloat(minorValue) || 0;
        const totalMm = (meters * 1000) + millimeters;
        return `${totalMm}mm`;
    }
    
    // Handle ft-in: format as feet-inches
    if (unit === 'ft-in') {
        const feet = majorValue || '0';
        const inches = minorValue || '0';
        return `${feet}'-${inches}"`;
    }
    
    // For other units (mm, m, ft, in), keep as-is with unit label
    const numValue = parseFloat(majorValue);
    if (isNaN(numValue)) return '';
    
    switch(unit) {
        case 'mm':
            return `${numValue}mm`;
        case 'm':
            return `${numValue}m`;
        case 'ft':
            return `${numValue}'`;
        case 'in':
            return `${numValue}"`;
        default:
            return `${numValue}`;
    }
}

function parseFloorRange(floorStr) {
    if (!floorStr || floorStr.trim() === '') return null;
    
    // Normalize: remove all spaces, convert to lowercase
    const normalized = floorStr.trim().replace(/\s+/g, '').toLowerCase();
    
    // Check if it's a range (e.g., "nv2-nv5", "1-6", "rdc-nv3")
    if (normalized.includes('-')) {
        const parts = normalized.split('-');
        if (parts.length === 2) {
            const start = parseFloorLevel(parts[0]);
            const end = parseFloorLevel(parts[1]);
            if (start !== null && end !== null) {
                return { 
                    start: Math.min(start, end), 
                    end: Math.max(start, end), 
                    isRange: true,
                    original: floorStr.trim()
                };
            }
        }
    }
    
    // Single floor
    const singleFloor = parseFloorLevel(normalized);
    if (singleFloor !== null) {
        return { 
            start: singleFloor, 
            end: singleFloor, 
            isRange: false,
            original: floorStr.trim()
        };
    }
    
    return null;
}

// Helper to convert floor name to numeric level for sorting
function parseFloorLevel(floorStr) {
    if (!floorStr) return null;
    
    const normalized = floorStr.toLowerCase().replace(/\s+/g, '');
    
    // Handle special cases
    if (normalized === 'rdc') return 1;
    if (normalized === 'toit') return 9999;
    
    // Handle nv1, nv2, etc.
    if (normalized.startsWith('nv')) {
        const num = parseInt(normalized.substring(2));
        if (!isNaN(num)) return num;
    }
    
    // Handle pure numeric
    const num = parseInt(normalized);
    if (!isNaN(num)) return num;
    
    return null;
}

// Helper function to format floor for display
function formatFloorDisplay(floorRange) {
    if (!floorRange) return 'N/A';
    
    const startName = formatFloorName(floorRange.start);
    const endName = formatFloorName(floorRange.end);
    
    if (floorRange.isRange && floorRange.start !== floorRange.end) {
        return `*${startName} - ${endName}`;
    } else {
        return `*${startName}`;
    }
}

// Helper to convert numeric level back to proper floor name
function formatFloorName(level) {
    if (level === 1) return 'RDC';
    if (level === 9999) return 'Toit';
    return `NV${level}`;
}

// Helper function to check if one range contains another
function rangeContains(outer, inner) {
    return outer.start <= inner.start && outer.end >= inner.end;
}

// Helper function to group windows by floor
function groupWindowsByFloor(windows) {
    const groups = [];
    const noFloorWindows = [];
    
    windows.forEach((window, originalIndex) => {
        const floorRange = parseFloorRange(window.floor);
        
        if (!floorRange) {
            // No floor - add to separate list
            noFloorWindows.push({ window, originalIndex });
            return;
        }
        
        // Check if this window fits in any existing group
        let foundGroup = false;
        
        for (let group of groups) {
            // Check if current window's range is contained in this group
            if (rangeContains(group.floorRange, floorRange)) {
                group.windows.push({ window, originalIndex });
                foundGroup = true;
                break;
            }
            // Check if this group's range is contained in current window's range
            else if (rangeContains(floorRange, group.floorRange)) {
                // Expand the group range to include current window
                group.floorRange = floorRange;
                group.windows.push({ window, originalIndex });
                foundGroup = true;
                break;
            }
        }
        
        // If no existing group found, create new group
        if (!foundGroup) {
            groups.push({
                floorRange: floorRange,
                windows: [{ window, originalIndex }]
            });
        }
    });
    
    // Sort groups by floor start number
    groups.sort((a, b) => a.floorRange.start - b.floorRange.start);
    
    // Add N/A group at the end if there are windows without floor
    if (noFloorWindows.length > 0) {
        groups.push({
            floorRange: null,
            windows: noFloorWindows
        });
    }
    
    return groups;
}

// Function to draw the windows specification table
// COMPLETELY CORRECTED function to draw windows specification table with proper merged headers
async function drawCFSSWindowsSpecificationTable(pdfDoc, page, project) {
    try {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const { width, height } = page.getSize();
        
        // Table positioning - increased margins to avoid sidebar overlap
        const tableStartY = height - 100; 
        const tableX = 60; 
        const tableWidth = width - 300; 
        
        const windows = project.windows || [];
        
        console.log(`Drawing windows specification table for ${windows.length} windows`);
        
        // Table configuration
        const mainHeaderHeight = 25; // Height for main header row
        const subHeaderHeight = 25;  // Height for sub-header row
        const totalHeaderHeight = mainHeaderHeight + subHeaderHeight;
        const rowHeight = 20;
        const fontSize = 9;
        const headerFontSize = 9;
        
        // Column widths - adjusted to make TYPE columns wider
        const columnWidths = {
            no: tableWidth * 0.03,           // 3% - NO.
            type: tableWidth * 0.12,         // 13% - TYPE DE FENÊTRE
            largeur: tableWidth * 0.09,      // 8% - LARGEUR MAX
            hauteur: tableWidth * 0.09,      // 8% - HAUTEUR MAX
            l1: tableWidth * 0.06,           // 7% - L1
            l2: tableWidth * 0.06,           // 7% - L2
            jambageType: tableWidth * 0.09,  // 9% - JAMBAGE TYPE
            jambageComp: tableWidth * 0.1,  // 13% - JAMBAGE COMPOSITION
            linteauType: tableWidth * 0.08,  // 7% - LINTEAU TYPE
            linteauComp: tableWidth * 0.1,  // 13% - LINTEAU COMPOSITION
            seuilType: tableWidth * 0.08,    // 6% - SEUIL TYPE
            seuilComp: tableWidth * 0.1     // 6% - SEUIL COMPOSITION
        };
        
        // Calculate section widths for merged headers
        const jambageWidth = columnWidths.jambageType + columnWidths.jambageComp;
        const linteauWidth = columnWidths.linteauType + columnWidths.linteauComp;
        const seuilWidth = columnWidths.seuilType + columnWidths.seuilComp;
        
        // Draw table title
        page.drawText('SPÉCIFICATION DE FENÊTRE', {
            x: tableX + tableWidth / 2 - 100,
            y: tableStartY + 20,
            size: 12,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        
        // ========== DRAW COMPLETE HEADER BACKGROUND ==========
        page.drawRectangle({
            x: tableX,
            y: tableStartY - totalHeaderHeight,
            width: tableWidth,
            height: totalHeaderHeight,
            color: rgb(0.9, 0.9, 0.9),
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        // ========== MAIN HEADER ROW CONTENT ==========
        const mainHeaderY = tableStartY;
        let currentX = tableX;
        
        // Column 1: NO. (spans both rows)
        const noText = 'NO.';
        const noTextWidth = boldFont.widthOfTextAtSize(noText, headerFontSize);
        page.drawText(noText, {
            x: currentX + (columnWidths.no - noTextWidth) / 2,
            y: mainHeaderY - totalHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.no;
        
        // Column 2: TYPE DE FENÊTRE (spans both rows)
        const typeDeFenetreText = 'TYPE DE FENÊTRE';
        const typeDeFenetreWidth = boldFont.widthOfTextAtSize(typeDeFenetreText, headerFontSize);
        page.drawText(typeDeFenetreText, {
            x: currentX + (columnWidths.type - typeDeFenetreWidth) / 2,
            y: mainHeaderY - totalHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.type;
        
        // Column 3: LARGEUR MAX (spans both rows)
        const largeurMaxText = 'LARGEUR MAX';
        const largeurMaxWidth = boldFont.widthOfTextAtSize(largeurMaxText, headerFontSize);
        page.drawText(largeurMaxText, {
            x: currentX + (columnWidths.largeur - largeurMaxWidth) / 2,
            y: mainHeaderY - totalHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.largeur;

        // Column 4: HAUTEUR MAX (spans both rows)
        const hauteurMaxText = 'HAUTEUR MAX';
        const hauteurMaxWidth = boldFont.widthOfTextAtSize(hauteurMaxText, headerFontSize);
        page.drawText(hauteurMaxText, {
            x: currentX + (columnWidths.hauteur - hauteurMaxWidth) / 2,
            y: mainHeaderY - totalHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.hauteur;

        // Column 5: L1 (spans both rows)
        const l1Text = 'L1';
        const l1TextWidth = boldFont.widthOfTextAtSize(l1Text, headerFontSize);
        page.drawText(l1Text, {
            x: currentX + (columnWidths.l1 - l1TextWidth) / 2,
            y: mainHeaderY - totalHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.l1;

        // Column 6: L2 (spans both rows)
        const l2Text = 'L2';
        const l2TextWidth = boldFont.widthOfTextAtSize(l2Text, headerFontSize);
        page.drawText(l2Text, {
            x: currentX + (columnWidths.l2 - l2TextWidth) / 2,
            y: mainHeaderY - totalHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.l2;

        // MERGED SECTION: JAMBAGE
        const jambageText = 'JAMBAGE';
        const jambageTextWidth = boldFont.widthOfTextAtSize(jambageText, headerFontSize);
        page.drawText(jambageText, {
            x: currentX + (jambageWidth - jambageTextWidth) / 2,
            y: mainHeaderY - mainHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += jambageWidth;
        
        // MERGED SECTION: LINTEAU
        const linteauText = 'LINTEAU';
        const linteauTextWidth = boldFont.widthOfTextAtSize(linteauText, headerFontSize);
        page.drawText(linteauText, {
            x: currentX + (linteauWidth - linteauTextWidth) / 2,
            y: mainHeaderY - mainHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += linteauWidth;
        
        // MERGED SECTION: SEUIL
        const seuilText = 'SEUIL';
        const seuilTextWidth = boldFont.widthOfTextAtSize(seuilText, headerFontSize);
        page.drawText(seuilText, {
            x: currentX + (seuilWidth - seuilTextWidth) / 2,
            y: mainHeaderY - mainHeaderHeight / 2 - 2,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        
        // ========== SUB-HEADER ROW CONTENT ==========
        const subHeaderY = mainHeaderY - mainHeaderHeight;
        
        // Position tracking for sub-headers (start after the first 6 columns)
        currentX = tableX + columnWidths.no + columnWidths.type + columnWidths.largeur + columnWidths.hauteur + columnWidths.l1 + columnWidths.l2;
        
        // JAMBAGE sub-headers
        const jambageTypeText = 'JAMBAGE TYPE';
        const jambageTypeWidth = boldFont.widthOfTextAtSize(jambageTypeText, headerFontSize);
        page.drawText(jambageTypeText, {
            x: currentX + (columnWidths.jambageType - jambageTypeWidth) / 2,
            y: subHeaderY - subHeaderHeight / 2 - 1,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.jambageType;
        
        const jambageCompText = 'COMPOSITION';
        const jambageCompWidth = boldFont.widthOfTextAtSize(jambageCompText, headerFontSize);
        page.drawText(jambageCompText, {
            x: currentX + (columnWidths.jambageComp - jambageCompWidth) / 2,
            y: subHeaderY - subHeaderHeight / 2 - 1,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.jambageComp;
        
        // LINTEAU sub-headers
        const linteauTypeText = 'LINTEAU TYPE';
        const linteauTypeWidth = boldFont.widthOfTextAtSize(linteauTypeText, headerFontSize);
        page.drawText(linteauTypeText, {
            x: currentX + (columnWidths.linteauType - linteauTypeWidth) / 2,
            y: subHeaderY - subHeaderHeight / 2 - 1,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.linteauType;
        
        const linteauCompText = 'COMPOSITION';
        const linteauCompWidth = boldFont.widthOfTextAtSize(linteauCompText, headerFontSize);
        page.drawText(linteauCompText, {
            x: currentX + (columnWidths.linteauComp - linteauCompWidth) / 2,
            y: subHeaderY - subHeaderHeight / 2 - 1,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.linteauComp;
        
        // SEUIL sub-headers
        const seuilTypeText = 'SEUIL TYPE';
        const seuilTypeWidth = boldFont.widthOfTextAtSize(seuilTypeText, headerFontSize);
        page.drawText(seuilTypeText, {
            x: currentX + (columnWidths.seuilType - seuilTypeWidth) / 2,
            y: subHeaderY - subHeaderHeight / 2 - 1,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentX += columnWidths.seuilType;
        
        const seuilCompText = 'COMPOSITION';
        const seuilCompWidth = boldFont.widthOfTextAtSize(seuilCompText, headerFontSize);
        page.drawText(seuilCompText, {
            x: currentX + (columnWidths.seuilComp - seuilCompWidth) / 2,
            y: subHeaderY - subHeaderHeight / 2 - 1,
            size: headerFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        
        // ========== DRAW VERTICAL BORDERS CORRECTLY ==========
        const firstSixColumnsWidth = columnWidths.no + columnWidths.type + columnWidths.largeur + columnWidths.hauteur + columnWidths.l1 + columnWidths.l2;

        // Vertical lines for first 6 columns (full height through both header rows)
        currentX = tableX;
        [columnWidths.no, columnWidths.type, columnWidths.largeur, columnWidths.hauteur, columnWidths.l1].forEach((width) => {
            currentX += width;
            page.drawLine({
                start: { x: currentX, y: mainHeaderY },
                end: { x: currentX, y: subHeaderY - subHeaderHeight },
                thickness: 1,
                color: rgb(0, 0, 0)
            });
        });

        // Vertical line after L2 (before merged sections)
        currentX = tableX + firstSixColumnsWidth;
        page.drawLine({
            start: { x: currentX, y: mainHeaderY },
            end: { x: currentX, y: subHeaderY - subHeaderHeight },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        // Vertical lines for merged sections (only in main header row)
        const jambageLinteauBorder = currentX + jambageWidth;
        page.drawLine({
            start: { x: jambageLinteauBorder, y: mainHeaderY },
            end: { x: jambageLinteauBorder, y: mainHeaderY - mainHeaderHeight },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        const linteauSeuilBorder = jambageLinteauBorder + linteauWidth;
        page.drawLine({
            start: { x: linteauSeuilBorder, y: mainHeaderY },
            end: { x: linteauSeuilBorder, y: mainHeaderY - mainHeaderHeight },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        // Vertical lines for sub-columns (only in sub-header row)
        currentX = tableX + firstSixColumnsWidth;
        const subColumnWidths = [columnWidths.jambageType, columnWidths.jambageComp, columnWidths.linteauType, columnWidths.linteauComp, columnWidths.seuilType, columnWidths.seuilComp];
        
        subColumnWidths.forEach((width, index) => {
            currentX += width;
            if (index < subColumnWidths.length - 1) {
                page.drawLine({
                    start: { x: currentX, y: subHeaderY },
                    end: { x: currentX, y: subHeaderY - subHeaderHeight },
                    thickness: 1,
                    color: rgb(0, 0, 0)
                });
            }
        });
        
        // Horizontal line separating main and sub headers (only for merged sections)
        const mergedSectionsStartX = tableX + firstSixColumnsWidth;
        page.drawLine({
            start: { x: mergedSectionsStartX, y: subHeaderY },
            end: { x: tableX + tableWidth, y: subHeaderY },
            thickness: 1,  // Keep at 0.5
            color: rgb(0, 0, 0)
        });
        
// ========== DRAW DATA ROWS WITH FLOOR GROUPING ==========
let currentRowY = subHeaderY - subHeaderHeight;
const widthKeys = Object.keys(columnWidths);
const lineHeight = 10; // Spacing between composition lines

// Track the bottom of the table
let tableBottomY = currentRowY;

// Group windows by floor
const floorGroups = groupWindowsByFloor(windows);

let globalIndex = 0; // Track global window numbering

floorGroups.forEach((group, groupIndex) => {
    // Draw floor section header
    const sectionHeaderHeight = 25;
    
    // Draw section header background
    page.drawRectangle({
        x: tableX,
        y: currentRowY - sectionHeaderHeight,
        width: tableWidth,
        height: sectionHeaderHeight,
        color: rgb(1, 1, 1),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1
    });
    
    // Draw section header text
    const sectionLabel = formatFloorDisplay(group.floorRange);
    page.drawText(sectionLabel, {
        x: tableX + tableWidth / 2 - (sectionLabel.length * 3),
        y: currentRowY - sectionHeaderHeight + 10,
        size: 9,
        font: boldFont,
        color: rgb(0, 0, 0)
    });
    
    currentRowY -= sectionHeaderHeight;

    // Draw bottom border for section header
    page.drawLine({
        start: { x: tableX, y: currentRowY },
        end: { x: tableX + tableWidth, y: currentRowY },
        thickness: 1,
        color: rgb(0, 0, 0)
    });
    
    // Draw windows in this floor group
    group.windows.forEach((item, indexInGroup) => {
        const window = item.window;
        globalIndex++;
        
        // Calculate dynamic row height
        const rowHeight = calculateRowHeight(window);
        
        // Draw horizontal separator if not first window in group
        if (indexInGroup > 0) {
            page.drawLine({
                start: { x: tableX, y: currentRowY },
                end: { x: tableX + tableWidth, y: currentRowY },
                thickness: 1,
                color: rgb(0, 0, 0)
            });
        }
        
        currentRowY -= rowHeight;
        tableBottomY = currentRowY; // Track bottom
        let currentX = tableX;
        
        // Get composition arrays
        const jambageCompositions = window.jambage?.compositions || [];
        const linteauCompositions = window.linteau?.compositions || [];
        const seuilCompositions = window.seuil?.compositions || [];

        // Check if this window has multiple compositions
        const hasMultipleCompositions = 
            jambageCompositions.length > 1 || 
            linteauCompositions.length > 1 || 
            seuilCompositions.length > 1;

        // Special case: Seuil marked as N/A
        const isSeuilNA = window.seuil?.type === 'NA';

                // Display logic: if type is N/A, show "#" for type and composition
                const jambageTypeDisplay = window.jambage?.type === 'NA' ? '#' : (window.jambage?.type || '');
                const linteauTypeDisplay = window.linteau?.type === 'NA' ? '#' : (window.linteau?.type || '');
                const seuilTypeDisplay   = window.seuil?.type === 'NA' ? '#' : (window.seuil?.type || '');
        
                const jambageValues = window.jambage?.type === 'NA' ? ['#'] : jambageCompositions;
                const linteauValues = window.linteau?.type === 'NA' ? ['#'] : linteauCompositions;
                const seuilValues   = window.seuil?.type === 'NA' ? ['#'] : seuilCompositions;
        
                // Column data with composition arrays
                const cellData = [
                    { value: globalIndex.toString(), isNumeric: true },
                    { value: window.type || '', isNumeric: false },
                    { value: formatWindowDimension(window.largeurMax, window.largeurMaxUnit, window.largeurMaxMinor), isNumeric: true },
                    { value: formatWindowDimension(window.hauteurMax, window.hauteurMaxUnit, window.hauteurMaxMinor), isNumeric: true },
                    { value: window.l1 ? formatWindowDimension(window.l1, window.l1Unit, window.l1Minor) : 'N/A', isNumeric: true },
                    { value: window.l2 ? formatWindowDimension(window.l2, window.l2Unit, window.l2Minor) : 'N/A', isNumeric: true },
                    { value: jambageTypeDisplay, isNumeric: true },
                    { value: jambageValues, isComposition: true },
                    { value: linteauTypeDisplay, isNumeric: true },
                    { value: linteauValues, isComposition: true },
                    { value: seuilTypeDisplay, isNumeric: true },
                    { value: seuilValues, isComposition: true }
                ];
        
        // Draw each cell
        currentX = tableX;
        cellData.forEach((cell, cellIndex) => {
            const colWidth = columnWidths[widthKeys[cellIndex]];

            if (cell.isComposition && Array.isArray(cell.value) && cell.value.length > 0) {
                // Draw compositions vertically centered in the row
                const totalLines = cell.value.length;
                const rowMidY = currentRowY + rowHeight / 2;
                const firstLineY = rowMidY + ((totalLines - 1) * lineHeight) / 2 - 3;

                cell.value.forEach((composition, lineIndex) => {
                    // Use precise text width measurement for perfect centering
                    const textWidth = font.widthOfTextAtSize(composition, fontSize);
                    const textX = currentX + (colWidth - textWidth) / 2;
                    const textY = firstLineY - (lineIndex * lineHeight) - 1;
                
                    page.drawText(composition, {
                        x: textX,
                        y: textY,
                        size: fontSize,
                        font: font,
                        color: rgb(0, 0, 0)
                    });
                });
            } else {
                // Regular single-line cell – always vertically centered
                const textValue = String(cell.value);
                const isNumeric = cell.isNumeric;

                // Measure text width precisely so numeric columns (NO. LARGEUR MAX, HAUTEUR MAX, types) can be truly centered
                const textWidth = font.widthOfTextAtSize(textValue, fontSize);

                // Calculate text position
                const textX = isNumeric
                    ? currentX + (colWidth - textWidth) / 2   // perfect horizontal center
                    : currentX + 4;                           // left padding for non-numeric cells

                const textY = currentRowY + (rowHeight / 2) - 3;

                page.drawText(textValue, {
                    x: textX,
                    y: textY,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0)
                });
            }

            currentX += colWidth;
        });
        
        // Draw vertical borders for this row
        currentX = tableX;
        
        // Column 1-6 vertical lines
        [columnWidths.no, columnWidths.type, columnWidths.largeur, columnWidths.hauteur, columnWidths.l1, columnWidths.l2].forEach((width) => {
            currentX += width;
            page.drawLine({
                start: { x: currentX, y: currentRowY + rowHeight },
                end: { x: currentX, y: currentRowY },
                thickness: 1,
                color: rgb(0, 0, 0)
            });
        });
        
        // Jambage Type | Composition
        currentX += columnWidths.jambageType;
        page.drawLine({
            start: { x: currentX, y: currentRowY + rowHeight },
            end: { x: currentX, y: currentRowY },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        currentX += columnWidths.jambageComp;
        page.drawLine({
            start: { x: currentX, y: currentRowY + rowHeight },
            end: { x: currentX, y: currentRowY },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        // Linteau Type | Composition
        currentX += columnWidths.linteauType;
        page.drawLine({
            start: { x: currentX, y: currentRowY + rowHeight },
            end: { x: currentX, y: currentRowY },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        currentX += columnWidths.linteauComp;
        page.drawLine({
            start: { x: currentX, y: currentRowY + rowHeight },
            end: { x: currentX, y: currentRowY },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        // Seuil Type | Composition (before last column)
        currentX += columnWidths.seuilType;
        page.drawLine({
            start: { x: currentX, y: currentRowY + rowHeight },
            end: { x: currentX, y: currentRowY },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
    });
    
    // Draw bottom border for this section
    page.drawLine({
        start: { x: tableX, y: currentRowY },
        end: { x: tableX + tableWidth, y: currentRowY },
        thickness: 1,
        color: rgb(0, 0, 0)
    });
});
        
        // ========== DRAW FINAL TABLE BORDER ==========
page.drawRectangle({
    x: tableX,
    y: tableBottomY,
    width: tableWidth,
    height: tableStartY - tableBottomY,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1
});
        
        console.log(`✅ Windows specification table with properly merged headers drawn with ${windows.length} entries`);
        
    } catch (error) {
        console.error('❌ Error drawing CFSS windows specification table with merged headers:', error);
        throw error;
    }
}

// Update the merge function to include windows page
async function mergeCFSSPDFsWithOptionsAndWindows(
    coverPdfBytes,
    lisseTroueePdfBytes,
    doubleLissePdfBytes,
    lisseBassePdfBytes,
    wallDetailsPdfBytes,
    parapetOptionsPdfBytes,
    parapetDetailsPdfBytes,
    summaryTablePdfBytes,
    fenetrePdfBytes,
    jambagesLinteauxSeuilsPdfBytes,
    windowsTablePdfBytes,
    customPagesPdfBytes
  ) {
    try {
      const mergedPdf = await PDFDocument.create();
  
      // 1. Add cover page
      if (coverPdfBytes) {
        const coverPdf = await PDFDocument.load(coverPdfBytes);
        const coverPages = await mergedPdf.copyPages(coverPdf, coverPdf.getPageIndices());
        coverPages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Cover page added');
      }
  
      // 2. Lisse trouee page
    if (lisseTroueePdfBytes && lisseTroueePdfBytes.length > 0) {
        const lisseTroueePdf = await PDFDocument.load(lisseTroueePdfBytes);
        const lisseTroueePages = await mergedPdf.copyPages(lisseTroueePdf, lisseTroueePdf.getPageIndices());
        lisseTroueePages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Lisse trouee page added');
    }
    
    // 3. Double lisse page (must appear right after lisse trouee)
    if (doubleLissePdfBytes && doubleLissePdfBytes.length > 0) {
        const doubleLissePdf = await PDFDocument.load(doubleLissePdfBytes);
        const doubleLissePages = await mergedPdf.copyPages(doubleLissePdf, doubleLissePdf.getPageIndices());
        doubleLissePages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Double lisse page added');
    }
    
    // 4. Lisse basse page
    if (lisseBassePdfBytes && lisseBassePdfBytes.length > 0) {
        const lisseBassePdf = await PDFDocument.load(lisseBassePdfBytes);
        const lisseBasseePages = await mergedPdf.copyPages(lisseBassePdf, lisseBassePdf.getPageIndices());
        lisseBasseePages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Lisse basse page added');
    }
  
      // 4. Wall details
      if (wallDetailsPdfBytes && wallDetailsPdfBytes.length > 0) {
        const wallDetailsPdf = await PDFDocument.load(wallDetailsPdfBytes);
        const wallPages = await mergedPdf.copyPages(wallDetailsPdf, wallDetailsPdf.getPageIndices());
        wallPages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Wall detail pages added');
      }

      // 5. Parapet options page
      if (parapetOptionsPdfBytes && parapetOptionsPdfBytes.length > 0) {
        const parapetOptionsPdf = await PDFDocument.load(parapetOptionsPdfBytes);
        const parapetOptionsPages = await mergedPdf.copyPages(parapetOptionsPdf, parapetOptionsPdf.getPageIndices());
        parapetOptionsPages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Parapet options page added');
      }

      // 6. Parapet details
      if (parapetDetailsPdfBytes && parapetDetailsPdfBytes.length > 0) {
        const parapetDetailsPdf = await PDFDocument.load(parapetDetailsPdfBytes);
        const parapetPages = await mergedPdf.copyPages(parapetDetailsPdf, parapetDetailsPdf.getPageIndices());
        parapetPages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Parapet detail pages added');
      }
  
      // 7. Summary table
      if (summaryTablePdfBytes && summaryTablePdfBytes.length > 0) {
        const summaryTablePdf = await PDFDocument.load(summaryTablePdfBytes);
        const summaryPages = await mergedPdf.copyPages(summaryTablePdf, summaryTablePdf.getPageIndices());
        summaryPages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Summary table page added');
      }
  
      // 8. Detail fenetre option page
      if (fenetrePdfBytes && fenetrePdfBytes.length > 0) {
        const fenetrePdf = await PDFDocument.load(fenetrePdfBytes);
        const fenetrePages = await mergedPdf.copyPages(fenetrePdf, fenetrePdf.getPageIndices());
        fenetrePages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Detail fenetre option page added');
      }
  
      // 9. Jambage linteau seuil option pages
      if (jambagesLinteauxSeuilsPdfBytes && jambagesLinteauxSeuilsPdfBytes.length > 0) {
        const jlsPdf = await PDFDocument.load(jambagesLinteauxSeuilsPdfBytes);
        const jlsPages = await mergedPdf.copyPages(jlsPdf, jlsPdf.getPageIndices());
        jlsPages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Jambage linteau seuil option pages added');
      }
  
      // 10. Windows table
      if (windowsTablePdfBytes && windowsTablePdfBytes.length > 0) {
        const windowsTablePdf = await PDFDocument.load(windowsTablePdfBytes);
        const windowsPages = await mergedPdf.copyPages(windowsTablePdf, windowsTablePdf.getPageIndices());
        windowsPages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Windows specification table page added');
      }
  
      // 11. Custom pages (last)
      if (customPagesPdfBytes && customPagesPdfBytes.length > 0) {
        const customPdf = await PDFDocument.load(customPagesPdfBytes);
        const customPages = await mergedPdf.copyPages(customPdf, customPdf.getPageIndices());
        customPages.forEach(page => mergedPdf.addPage(page));
        console.log(`✅ ${customPages.length} custom page(s) added at the end`);
      }
  
      // 8. Draw sheet numbers directly on pages (all pages except cover)
      try {
        const totalPages = mergedPdf.getPageCount();
        const boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
        
        for (let i = 0; i < totalPages; i++) { // Start from 0 to include cover page
          const page = mergedPdf.getPage(i);
          const { width, height } = page.getSize();
          const pageNumber = i + 1;
          const sheetNumber = `S-${pageNumber}`; // S-1, S-2, S-3, etc.
          
          // Adjust x position based on single vs double digit page numbers
          const xPosition = pageNumber < 10 ? 1188 : 1185;
          
          // Draw text in bottom right
          page.drawText(sheetNumber, {
            x: xPosition,  // 1188 for single digit, 1185 for double digit
            y: 43,         // 35px from bottom
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          
          console.log(`✅ Drew ${sheetNumber} on page ${i} at x=${xPosition}`);
        }
        
        console.log('✅ Sheet numbers drawn on all pages');
      } catch (error) {
        console.warn('⚠️ Could not draw sheet numbers:', error.message);
        // Don't throw - sheet numbers are not critical
      }
  
      return await mergedPdf.save();
    } catch (error) {
      console.error('❌ Error merging CFSS PDFs with custom pages:', error);
      throw error;
    }
  }

// Update the main report generation function
async function generateCFSSProjectReportWithOptionsAndWindows(projectId, userInfo, enhancedProjectData = null) {
    console.log(`📄 Generating CFSS PDF report with options and windows for project ${projectId}`);
  
    try {
      let project;
      if (enhancedProjectData) {
        project = enhancedProjectData;
      } else {
        const projectData = await getProjects(projectId, userInfo);
        if (!projectData || projectData.length === 0) {
          throw new Error('CFSS Project not found or access denied');
        }
        project = projectData[0];
      }
  
      const selectedOptions = project.selectedOptions || [];
      const projectWindows  = project.windows || [];
  
      const revisionData = extractAndValidateRevisionData(project);
      
      console.log('⚡ Starting parallel PDF generation...');
        const parallelStart = Date.now();

        // Phase 1: Fetch all independent components in parallel
        const [
            cfssTemplateBuffer,
            wallDetailsPdf,
            parapetDetailsPdf,
            summaryTablePdf,
            customPagesPdfBytes
        ] = await Promise.all([
            fetchCFSSTemplateFromS3(),
            generateCFSSWallDetailPages(project, userInfo),
            generateCFSSParapetDetailPages(project, userInfo),
            generateCFSSSummaryTable(project, userInfo),
            generateCFSSCustomPages(project, userInfo)
        ]);

        console.log(`✅ Phase 1 completed in ${Date.now() - parallelStart}ms`);

        // Phase 2: Operations that depend on template or have conditions
        const phase2Start = Date.now();
        const [filledCoverPdf, optionsPdfs, windowsTablePdf] = await Promise.all([
            fillCFSSTemplateWithRevisions(cfssTemplateBuffer, project, userInfo, revisionData),
            selectedOptions.length > 0 
                ? generateCFSSOptionsPages(selectedOptions, project, userInfo)
                : Promise.resolve({ lisseTrouee: null, doubleLisse: null, lisseBasse: null, parapet: null, fenetre: null, jambagesLinteauxSeuils: null }),
            projectWindows.length > 0
                ? generateCFSSWindowsSpecificationTable(project, userInfo)
                : Promise.resolve(null)
        ]);
        
        console.log(`✅ Phase 2 completed in ${Date.now() - phase2Start}ms`);
        console.log(`✅ Total parallel generation: ${Date.now() - parallelStart}ms`);
        
        const finalPdfBytes = await mergeCFSSPDFsWithOptionsAndWindows(
            filledCoverPdf,
            optionsPdfs?.lisseTrouee,
            optionsPdfs?.doubleLisse,
            optionsPdfs?.lisseBasse,
            wallDetailsPdf,
            optionsPdfs?.parapet,
            parapetDetailsPdf,
            summaryTablePdf,
            optionsPdfs?.fenetre,
            optionsPdfs?.jambagesLinteauxSeuils,
            windowsTablePdf,
            customPagesPdfBytes
        );
  
      let processedPdf = finalPdfBytes;
      
      // Handle signature
      const signDocument = enhancedProjectData?.signDocument || false;
      if (signDocument) {
        console.log('🖊️ Signature requested, processing...');
        const signatureBuffer = await fetchSignatureFromS3();
        processedPdf = await insertSignatureAndFlattenPdf(processedPdf, signatureBuffer);
      }
      
      // Watermark for non-admin
      if (!userInfo.isAdmin) {
        console.log('🏷️ Applying watermark...');
        processedPdf = await addWatermarkToPdf(processedPdf);
      }
      
      // ============================================
      // CRITICAL: COMPREHENSIVE FLATTEN AT THE END
      // ============================================
      const signedYes =
      Boolean(project?.signDocument ?? project?.projectData?.signDocument);
    const forceFlatten =
      (!userInfo?.isAdmin) ||
      signedYes ||
      (typeof shouldForceFlattenForUser === 'function' &&
       shouldForceFlattenForUser(userInfo, project));
    
    if (forceFlatten) {
      console.log('📋 Final flatten enabled (policy matched).');
      try {
        const doc = await PDFDocument.load(processedPdf);
        try {
          const form = doc.getForm();
          const fields = form.getFields();
          console.log(`Found ${fields.length} form fields to flatten`);
          form.flatten();
          console.log('✅ Form flattened successfully');
        } catch (formError) {
          console.log('ℹ️ No form fields found or form already flat');
        }
        processedPdf = await doc.save();
        console.log('✅ Final PDF saved with forms flattened');
      } catch (flattenError) {
        console.error('⚠️ Error during final flattening:', flattenError.message);
      }
    } else {
      console.log('⏭️ Skipping final flatten (admin signed-in & selected No).');
    }
  
      console.log('📤 Uploading CFSS PDF to S3...');
      const downloadUrl = await uploadPdfToS3AndGetUrl(processedPdf, project, userInfo, 'CFSS');
      return downloadUrl;
  
    } catch (error) {
      console.error('❌ Error generating CFSS report:', error);
      throw new Error(`Failed to generate CFSS PDF report: ${error.message}`);
    }
}

async function generateCFSSOptionsPages(selectedOptions, project, userInfo) {
    const overallStart = Date.now();
    console.log(`🔧 [PERF] Starting options generation at T+0ms`);
    
    try {
        if (selectedOptions.length === 0) {
            return null;
        }
        
        // Image pre-fetching (keep this - it works great!)
        console.log(`⚡ [PERF] T+${Date.now() - overallStart}ms: Starting image pre-fetch`);
        const imageStartTime = Date.now();
        
        const allImageNames = new Set();
        selectedOptions.forEach(option => {
            allImageNames.add(option);
        });
        
        selectedOptions.forEach(option => {
            if (option.includes('detail-')) {
                allImageNames.add(`${option}-text`);
            }
        });
        
        allImageNames.add('identification');
        allImageNames.add('detail-lisse-basse-text');
        allImageNames.add('detail-lisse-trouee-text');
        allImageNames.add('detail-double-lisse-text');
        
        const imageNamesArray = Array.from(allImageNames);
        console.log(`📦 [PERF] T+${Date.now() - overallStart}ms: Fetching ${imageNamesArray.length} unique images`);
        
        const urlMap = await getCFSSOptionImageUrlsBatch(imageNamesArray);
        console.log(`✅ [PERF] T+${Date.now() - overallStart}ms: Got URL map`);
        
        console.log(`🔍 [DEBUG] Images requested from batch:`, JSON.stringify(imageNamesArray));
        console.log(`🔗 [DEBUG] URLs received for:`, JSON.stringify(Object.keys(urlMap)));
        const missingUrls = imageNamesArray.filter(name => !urlMap[name]);
        if (missingUrls.length > 0) {
            console.error(`❌ [DEBUG] No URLs generated for:`, JSON.stringify(missingUrls));
        }
        
        const fetchPromises = imageNamesArray.map(async (imageName) => {
            try {
                const imageUrl = urlMap[imageName];
                if (!imageUrl) return { imageName, bytes: null };
                const response = await fetch(imageUrl);
                const bytes = await response.arrayBuffer();
                return { imageName, bytes };
            } catch (error) {
                console.error(`Failed to fetch ${imageName}:`, error.message);
                return { imageName, bytes: null };
            }
        });
        
        const imageResults = await Promise.all(fetchPromises);
        
        const imageCache = {};
        imageResults.forEach(({ imageName, bytes }) => {
            if (bytes) imageCache[imageName] = bytes;
        });
        
        console.log(`✅ [PERF] T+${Date.now() - overallStart}ms: Image pre-fetch TOTAL: ${Date.now() - imageStartTime}ms (${Object.keys(imageCache).length} images)`);
        
        console.log(`📦 [DEBUG] Final imageCache keys:`, JSON.stringify(Object.keys(imageCache)));
        const missingFromCache = imageNamesArray.filter(name => !imageCache[name]);
        if (missingFromCache.length > 0) {
            console.error(`❌ [DEBUG] Missing from imageCache:`, JSON.stringify(missingFromCache));
        }
        
        // Categorize
        const categorized = categorizeSelectedOptions(selectedOptions);
        console.log(`✅ [PERF] T+${Date.now() - overallStart}ms: Categorized`);
        
        // Template fetch (shared)
        console.log(`📄 [PERF] T+${Date.now() - overallStart}ms: Fetching template ONCE`);
        const templateFetchStart = Date.now();
        const templateBuffer = await fetchBlankCFSSPageTemplateFromS3();
        console.log(`✅ [PERF] T+${Date.now() - overallStart}ms: Template fetched in ${Date.now() - templateFetchStart}ms`);
        
        // ⚡ KEY CHANGE: Process pages SEQUENTIALLY instead of in parallel
        console.log(`⚡ [PERF] T+${Date.now() - overallStart}ms: Starting SEQUENTIAL generation`);
        const sequentialStart = Date.now();
        const pages = [];
        
        if (categorized.lisseTrouee.length > 0) {
            const result = await createLisseTroueePage(categorized.lisseTrouee, project, userInfo, imageCache, templateBuffer);
            pages.push(result);
        }
        
        if (categorized.doubleLisse.length > 0) {
            const result = await createDoubleLissePage(categorized.doubleLisse, project, userInfo, imageCache, templateBuffer);
            pages.push(result);
        }
        
        if (categorized.lisseBasse.length > 0) {
            const result = await createLisseBassePage(categorized.lisseBasse, project, userInfo, imageCache, templateBuffer);
            pages.push(result);
        }
        
        if (categorized.parapet.length > 0) {
            const results = await createParapetPages(categorized.parapet, project, userInfo, imageCache, templateBuffer);
            pages.push(...results);
        }
        
        if (categorized.jambages.length > 0 || categorized.linteaux.length > 0 || categorized.seuils.length > 0) {
            const results = await createJambagesLinteauxSeuilsPages(
                categorized.jambages,
                categorized.linteaux,
                categorized.seuils,
                project,
                userInfo,
                imageCache,
                templateBuffer
            );
            pages.push(...results);
        }
        
        if (categorized.fenetre.length > 0) {
            const result = await createFenetrePage(project, userInfo, imageCache, templateBuffer);
            pages.push(result);
        }
        
        console.log(`✅ [PERF] T+${Date.now() - overallStart}ms: Sequential page generation completed in ${Date.now() - sequentialStart}ms`);
        
        // Return separate PDFs instead of merging
        console.log(`✅ [PERF] T+${Date.now() - overallStart}ms: Returning separate PDFs`);

        const optionsPdfs = {
            lisseTrouee: null,
            doubleLisse: null,
            lisseBasse: null,
            parapet: null,
            fenetre: null,
            jambagesLinteauxSeuils: null
        };

        let pageIndex = 0;

        if (categorized.lisseTrouee.length > 0) {
            optionsPdfs.lisseTrouee = pages[pageIndex++];
        }

        if (categorized.doubleLisse.length > 0) {
            optionsPdfs.doubleLisse = pages[pageIndex++];
        }

        if (categorized.lisseBasse.length > 0) {
            optionsPdfs.lisseBasse = pages[pageIndex++];
        }

        if (categorized.parapet.length > 0) {
            const parapetPageCount = Math.ceil(categorized.parapet.length / 9);
            const parapetPages = pages.slice(pageIndex, pageIndex + parapetPageCount);
            pageIndex += parapetPageCount;
            
            // Merge parapet pages into one PDF
            const parapetPdf = await PDFDocument.create();
            for (const pageBuffer of parapetPages) {
                const pagePdf = await PDFDocument.load(pageBuffer);
                try {
                    const f = pagePdf.getForm();
                    if (!userInfo.isAdmin || shouldForceFlattenForUser(userInfo, project)) {
                        await updateFieldAppearancesWithUnicodeFont(pagePdf, f);
                        f.flatten();
                    }
                } catch (e) { /* no form */ }
                const [copiedPage] = await parapetPdf.copyPages(pagePdf, [0]);
                parapetPdf.addPage(copiedPage);
            }
            optionsPdfs.parapet = await parapetPdf.save();
        }

        if (categorized.jambages.length > 0 || categorized.linteaux.length > 0 || categorized.seuils.length > 0) {
            const jlsPageCount = pages.length - pageIndex - (categorized.fenetre.length > 0 ? 1 : 0);
            const jlsPages = pages.slice(pageIndex, pageIndex + jlsPageCount);
            pageIndex += jlsPageCount;
            
            // Merge JLS pages into one PDF
            const jlsPdf = await PDFDocument.create();
            for (const pageBuffer of jlsPages) {
                const pagePdf = await PDFDocument.load(pageBuffer);
                try {
                    const f = pagePdf.getForm();
                    if (!userInfo.isAdmin || shouldForceFlattenForUser(userInfo, project)) {
                        await updateFieldAppearancesWithUnicodeFont(pagePdf, f);
                        f.flatten();
                    }
                } catch (e) { /* no form */ }
                const [copiedPage] = await jlsPdf.copyPages(pagePdf, [0]);
                jlsPdf.addPage(copiedPage);
            }
            optionsPdfs.jambagesLinteauxSeuils = await jlsPdf.save();
        }

        if (categorized.fenetre.length > 0) {
            optionsPdfs.fenetre = pages[pageIndex++];
        }

        console.log(`🎉 [PERF] TOTAL OPTIONS GENERATION TIME: ${Date.now() - overallStart}ms`);

        return optionsPdfs;
        
    } catch (error) {
        console.error('❌ Error generating CFSS options pages:', error);
        throw new Error(`Failed to generate CFSS options pages: ${error.message}`);
    }
}

/**
 * Categorize selected options into their respective categories
 */
function categorizeSelectedOptions(selectedOptions) {
    const categories = {
        lisseTrouee: [],
        doubleLisse: [],
        lisseBasse: [],
        parapet: [],
        jambages: [],
        linteaux: [],
        seuils: [],
        fenetre: []
    };
    
    selectedOptions.forEach(option => {
        if (option.includes('lisse-trouee') || option === 'identification') {
            categories.lisseTrouee.push(option);
        } else if (option.includes('double-lisse')) {
            categories.doubleLisse.push(option);
        } else if (option.includes('lisse-basse') || option.includes('entremise')) {
            categories.lisseBasse.push(option);
        } else if (option.startsWith('parapet-')) {
            categories.parapet.push(option);
        } else if (option.startsWith('jambage-')) {
            categories.jambages.push(option);
        } else if (option.startsWith('linteau-')) {
            categories.linteaux.push(option);
        } else if (option.startsWith('seuil-')) {
            categories.seuils.push(option);
        } else if (option === 'fenetre') {
            categories.fenetre.push(option);
        }
    });
    
    return categories;
}

/**
 * Create Lisse Trouée page
 * 
 * LAYOUT:
 * - Row 1: First 3 fixe options (300x300 each, 30px spacing)
 * - Row 2: 
 *   - If 4th fixe exists: 4th fixe (300x300) on left, -text (70px height) at SAME Y as no-4th-fixe case
 *   - If no 4th fixe: -text (70px height) spans full width, aligned to top
 * - Row 3: Detail images (300x300 square) - only if selected
 *   - If 4th fixe exists: positioned 200px HIGHER and 250px to the RIGHT
 *   - If no 4th fixe: standard positioning below text
 * 
 * DIMENSIONS:
 * - Fixe images: 300×300px (square)
 * - Text image: varies × 70px (height fixed, short)
 * - Detail images: 300×300px (square)
 * - Spacing: 30px
 * - Start position: x=30, y=height-330
 * 
 * SPACING LOGIC:
 * - Between rows 1-2: 10px (or 12px if no 4th fixe)
 * - Between rows 2-3: CONDITIONAL
 *   - If 4th fixe exists: 300 + 12 + 200 = 512px (moves row 3 up significantly)
 *   - If no 4th fixe: 70 + 12 = 82px (standard spacing)
 * 
 * ROW 3 HORIZONTAL POSITIONING:
 *   - If 4th fixe exists: startX + 250 (shifted right)
 *   - If no 4th fixe: startX (standard position)
 */
async function createLisseTroueePage(options, project, userInfo, imageCache = null, templateBuffer = null) {
    const pageStart = Date.now();
    console.log(`📄 [LISSE-TROUEE] Starting page creation at T+0ms`);
    
    console.log(`📥 [LISSE-TROUEE] T+${Date.now() - pageStart}ms: Loading template`);
    const loadStart = Date.now();
    const template = templateBuffer || await fetchBlankCFSSPageTemplateFromS3();
    const pdfDoc = await PDFDocument.load(template);
    console.log(`✅ [LISSE-TROUEE] T+${Date.now() - pageStart}ms: Template loaded in ${Date.now() - loadStart}ms`);
    
    // Separate fixe options from detail/text images
    const fixeOptions = options.filter(opt => 
        opt !== 'identification' && 
        opt !== 'detail-lisse-trouee' && 
        opt !== 'detail-lisse-trouee-text'
    );
    
    const hasDetailLisseTrouee = options.includes('detail-lisse-trouee');
    const hasIdentification = options.includes('identification');
    
    console.log(`📊 [LISSE-TROUEE] Fixe options: ${fixeOptions.length}, Detail: ${hasDetailLisseTrouee}, ID: ${hasIdentification}`);
    
    // Embedding images
    console.log(`🖼️ [LISSE-TROUEE] T+${Date.now() - pageStart}ms: Starting image embedding`);
    const embedStart = Date.now();
    let embeddedCache = {};
    
    if (imageCache) {
        // Embed fixe options
        for (const imageName of fixeOptions) {
            if (imageCache[imageName]) {
                const imgEmbedStart = Date.now();
                try {
                    const bytes = imageCache[imageName];
                    try {
                        embeddedCache[imageName] = await pdfDoc.embedPng(bytes);
                    } catch {
                        try {
                            embeddedCache[imageName] = await pdfDoc.embedJpg(bytes);
                        } catch (e) {
                            console.warn(`  ⚠️ [LISSE-TROUEE] Could not embed ${imageName}`);
                        }
                    }
                    console.log(`  🖼️ [LISSE-TROUEE] Embedded ${imageName} in ${Date.now() - imgEmbedStart}ms`);
                } catch (e) {
                    console.warn(`  ❌ [LISSE-TROUEE] Failed to embed ${imageName}:`, e.message);
                }
            }
        }
        
        // Always embed -text image
        if (imageCache['detail-lisse-trouee-text']) {
            try {
                const bytes = imageCache['detail-lisse-trouee-text'];
                try {
                    embeddedCache['detail-lisse-trouee-text'] = await pdfDoc.embedPng(bytes);
                } catch {
                    try {
                        embeddedCache['detail-lisse-trouee-text'] = await pdfDoc.embedJpg(bytes);
                    } catch (e) {
                        console.warn(`  ⚠️ [LISSE-TROUEE] Could not embed detail-lisse-trouee-text`);
                    }
                }
                console.log(`  🖼️ [LISSE-TROUEE] Embedded detail-lisse-trouee-text`);
            } catch (e) {
                console.warn(`  ❌ [LISSE-TROUEE] Failed to embed detail-lisse-trouee-text:`, e.message);
            }
        }
        
        // Embed detail images if selected
        if (hasDetailLisseTrouee && imageCache['detail-lisse-trouee']) {
            try {
                const bytes = imageCache['detail-lisse-trouee'];
                try {
                    embeddedCache['detail-lisse-trouee'] = await pdfDoc.embedPng(bytes);
                } catch {
                    try {
                        embeddedCache['detail-lisse-trouee'] = await pdfDoc.embedJpg(bytes);
                    } catch (e) {
                        console.warn(`  ⚠️ [LISSE-TROUEE] Could not embed detail-lisse-trouee`);
                    }
                }
                console.log(`  🖼️ [LISSE-TROUEE] Embedded detail-lisse-trouee`);
            } catch (e) {
                console.warn(`  ❌ [LISSE-TROUEE] Failed to embed detail-lisse-trouee:`, e.message);
            }
        }
        
        if (hasIdentification && imageCache['identification']) {
            try {
                const bytes = imageCache['identification'];
                try {
                    embeddedCache['identification'] = await pdfDoc.embedPng(bytes);
                } catch {
                    try {
                        embeddedCache['identification'] = await pdfDoc.embedJpg(bytes);
                    } catch (e) {
                        console.warn(`  ⚠️ [LISSE-TROUEE] Could not embed identification`);
                    }
                }
                console.log(`  🖼️ [LISSE-TROUEE] Embedded identification`);
            } catch (e) {
                console.warn(`  ❌ [LISSE-TROUEE] Failed to embed identification:`, e.message);
            }
        }
    }
    console.log(`✅ [LISSE-TROUEE] T+${Date.now() - pageStart}ms: All images embedded in ${Date.now() - embedStart}ms`);
    
    // Form filling
    console.log(`📝 [LISSE-TROUEE] T+${Date.now() - pageStart}ms: Filling form fields`);
    const formStart = Date.now();
    try {
        const form = pdfDoc.getForm();
        await fillOptionsTemplateFields(pdfDoc, form, project, userInfo, 0, 1);
    } catch (e) { /* no form */ }
    console.log(`✅ [LISSE-TROUEE] T+${Date.now() - pageStart}ms: Form filled in ${Date.now() - formStart}ms`);
    
    // Drawing
    console.log(`🎨 [LISSE-TROUEE] T+${Date.now() - pageStart}ms: Starting drawing operations`);
    const drawStart = Date.now();
    
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Optimized dimensions for better space usage
    const fixeImageWidth = 300;   // Square fixe images
    const fixeImageHeight = 300;
    const textImageHeight = 70;   // Short -text image (keep this size)
    const detailImageWidth = 300; // Square detail images
    const detailImageHeight = 300;
    const spacing = 30;           // Spacing between images
    const startX = 30;            // Left boundary of the 3-column fixe region
    const startY = height - 330;  // Balanced positioning for all rows

    // Center Row 1 horizontally if only 1 or 2 fixe options are selected (within 3-column region)
    const totalRowWidth = (fixeImageWidth * 3) + (spacing * 2);
    let row1StartX = startX;

    if (fixeOptions.length === 1) {
        row1StartX = startX + (totalRowWidth - fixeImageWidth) / 2;
    } else if (fixeOptions.length === 2) {
        const twoWidth = (fixeImageWidth * 2) + spacing;
        row1StartX = startX + (totalRowWidth - twoWidth) / 2;
    }

    let currentY = startY;
    
    // ROW 1: First 3 fixe options (LARGE)
    for (let i = 0; i < Math.min(fixeOptions.length, 3); i++) {
        const currentX = row1StartX + i * (fixeImageWidth + spacing);
        
        await drawImageCenteredOptimized(
            pdfDoc, page, fixeOptions[i], 
            currentX, currentY, 
            fixeImageWidth, fixeImageHeight, 
            embeddedCache, 
            imageCache
        );
    }
    
    // ROW 2: 4th fixe (if exists) + -text image (SHORT)
    const has4thFixe = fixeOptions.length >= 4;
    const textRowSpacing = has4thFixe ? 10 : 12; // Tight spacing
    currentY -= fixeImageHeight + textRowSpacing;
    
    if (has4thFixe) {
        // Draw 4th fixe option on the left
        await drawImageCenteredOptimized(
            pdfDoc, page, fixeOptions[3], 
            startX, currentY, 
            fixeImageWidth, fixeImageHeight, 
            embeddedCache, 
            imageCache
        );
        
        // -text image fills remaining space (2 columns worth) but SHORT
        const textStartX = startX + fixeImageWidth + spacing;
        const textWidth = (fixeImageWidth * 2) + spacing;
        
        // Use SAME Y position as when no 4th fixe (align to top, not centered)
        const textYPosition = currentY + (fixeImageHeight - textImageHeight);
        
        await drawImageCenteredOptimized(
            pdfDoc, page, 'detail-lisse-trouee-text',
            textStartX, textYPosition,
            textWidth, textImageHeight,
            embeddedCache,
            imageCache
        );
    } else {
        // -text image spans full width (3 columns) but SHORT
        // Position it higher when no 4th fixe (align to top of where 4th fixe would be)
        const textWidth = (fixeImageWidth * 3) + (spacing * 2);
        const textYPosition = currentY + (fixeImageHeight - textImageHeight); // Align to top
        
        await drawImageCenteredOptimized(
            pdfDoc, page, 'detail-lisse-trouee-text',
            startX, textYPosition,
            textWidth, textImageHeight,
            embeddedCache,
            imageCache
        );
    }
    
        // ROW 3: Detail images (bottom row) - only if selected
    const detailImages = [];
    if (hasDetailLisseTrouee) detailImages.push('detail-lisse-trouee');
    if (hasIdentification) detailImages.push('identification');
    
    if (detailImages.length > 0) {
        if (has4thFixe) {
            // When 4th fixe exists: align detail images to 2nd column, start at same Y as 4th fixe
            const detailStartX = startX + fixeImageWidth + spacing; // 2nd column position
            const detailStartY = currentY - 100; // 100px below the 4th fixe (row 2)
            
            // Draw detail images horizontally
            for (let i = 0; i < detailImages.length; i++) {
                const imageX = detailStartX + (i * (detailImageWidth + spacing));
                
                await drawImageCenteredOptimized(
                    pdfDoc, page, detailImages[i],
                    imageX, detailStartY,
                    detailImageWidth, detailImageHeight,
                    embeddedCache,
                    imageCache
                );
            }
        } else {
            // When no 4th fixe: use CENTERED layout (same as lisse-basse)
            const detailStartY = currentY - (textImageHeight + 12); // Below text
            
            if (detailImages.length === 1) {
                // Center single detail image (middle column)
                const centerX = startX + fixeImageWidth + spacing;
                
                await drawImageCenteredOptimized(
                    pdfDoc, page, detailImages[0],
                    centerX, detailStartY,
                    detailImageWidth, detailImageHeight,
                    embeddedCache,
                    imageCache
                );
            } else if (detailImages.length === 2) {
                // Center two detail images with calculated gaps
                const totalWidth = (fixeImageWidth * 3) + (spacing * 2);
                const gapBetween = (totalWidth - (detailImageWidth * 2)) / 3;
                
                const firstX = startX + gapBetween;
                await drawImageCenteredOptimized(
                    pdfDoc, page, detailImages[0],
                    firstX, detailStartY,
                    detailImageWidth, detailImageHeight,
                    embeddedCache,
                    imageCache
                );
                
                const secondX = firstX + detailImageWidth + gapBetween;
                await drawImageCenteredOptimized(
                    pdfDoc, page, detailImages[1],
                    secondX, detailStartY,
                    detailImageWidth, detailImageHeight,
                    embeddedCache,
                    imageCache
                );
            }
        }
    }
    
    console.log(`✅ [LISSE-TROUEE] T+${Date.now() - pageStart}ms: Drawing completed in ${Date.now() - drawStart}ms`);
    
    // Save
    console.log(`💾 [LISSE-TROUEE] T+${Date.now() - pageStart}ms: Starting PDF save`);
    const saveStart = Date.now();
    const result = await pdfDoc.save();
    console.log(`✅ [LISSE-TROUEE] T+${Date.now() - pageStart}ms: PDF saved in ${Date.now() - saveStart}ms (${result.length} bytes)`);
    console.log(`🎉 [LISSE-TROUEE] TOTAL PAGE TIME: ${Date.now() - pageStart}ms`);
    
    return result;
}

/**
 * Create Double Lisse page
 * Layout: 3 fixe options top, -text in middle, detail image bottom (centered)
 * - Row 1: Up to 3 fixe options (300x300 each, 30px spacing)
 * - Row 2: detail-double-lisse-text (70px height)
 * - Row 3: detail-double-lisse (centered, 300x300)
 */
async function createDoubleLissePage(options, project, userInfo, imageCache = null, templateBuffer = null) {
    const pageStart = Date.now();
    console.log(`📄 [DOUBLE-LISSE] Starting page creation at T+0ms`);
    
    console.log(`📥 [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: Loading template`);
    const loadStart = Date.now();
    const template = templateBuffer || await fetchBlankCFSSPageTemplateFromS3();
    const pdfDoc = await PDFDocument.load(template);
    console.log(`✅ [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: Template loaded in ${Date.now() - loadStart}ms`);
    
    // Separate fixe options from detail images
    const fixeOptions = options.filter(opt => 
        opt !== 'detail-double-lisse' &&
        opt !== 'detail-double-lisse-text'
    );
    
    const hasDetailDoubleLisse = options.includes('detail-double-lisse');
    
    console.log(`📊 [DOUBLE-LISSE] Fixe options: ${fixeOptions.length}, Detail: ${hasDetailDoubleLisse}`);
    
    // Embedding images
    console.log(`🖼️ [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: Starting image embedding`);
    const embedStart = Date.now();
    let embeddedCache = {};
    
    if (imageCache) {
        // Embed fixe options
        for (const imageName of fixeOptions) {
            if (imageCache[imageName]) {
                const imgEmbedStart = Date.now();
                try {
                    const bytes = imageCache[imageName];
                    try {
                        embeddedCache[imageName] = await pdfDoc.embedPng(bytes);
                    } catch {
                        try {
                            embeddedCache[imageName] = await pdfDoc.embedJpg(bytes);
                        } catch (e) {
                            console.warn(`  ⚠️ [DOUBLE-LISSE] Could not embed ${imageName}`);
                        }
                    }
                    console.log(`  🖼️ [DOUBLE-LISSE] Embedded ${imageName} in ${Date.now() - imgEmbedStart}ms`);
                } catch (e) {
                    console.warn(`  ❌ [DOUBLE-LISSE] Failed to embed ${imageName}:`, e.message);
                }
            }
        }
        
        // Embed -text image
        if (imageCache['detail-double-lisse-text']) {
            try {
                const bytes = imageCache['detail-double-lisse-text'];
                try {
                    embeddedCache['detail-double-lisse-text'] = await pdfDoc.embedPng(bytes);
                } catch {
                    try {
                        embeddedCache['detail-double-lisse-text'] = await pdfDoc.embedJpg(bytes);
                    } catch (e) {
                        console.warn(`  ⚠️ [DOUBLE-LISSE] Could not embed detail-double-lisse-text`);
                    }
                }
                console.log(`  🖼️ [DOUBLE-LISSE] Embedded detail-double-lisse-text`);
            } catch (e) {
                console.warn(`  ❌ [DOUBLE-LISSE] Failed to embed detail-double-lisse-text:`, e.message);
            }
        }
        
        // Embed detail image if selected
        if (hasDetailDoubleLisse && imageCache['detail-double-lisse']) {
            try {
                const bytes = imageCache['detail-double-lisse'];
                try {
                    embeddedCache['detail-double-lisse'] = await pdfDoc.embedPng(bytes);
                } catch {
                    try {
                        embeddedCache['detail-double-lisse'] = await pdfDoc.embedJpg(bytes);
                    } catch (e) {
                        console.warn(`  ⚠️ [DOUBLE-LISSE] Could not embed detail-double-lisse`);
                    }
                }
                console.log(`  🖼️ [DOUBLE-LISSE] Embedded detail-double-lisse`);
            } catch (e) {
                console.warn(`  ❌ [DOUBLE-LISSE] Failed to embed detail-double-lisse:`, e.message);
            }
        }
    }
    console.log(`✅ [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: All images embedded in ${Date.now() - embedStart}ms`);
    
    console.log(`📝 [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: Filling form fields`);
    const formStart = Date.now();
    try {
        const form = pdfDoc.getForm();
        await fillOptionsTemplateFields(pdfDoc, form, project, userInfo, 0, 1);
    } catch (e) { /* no form */ }
    console.log(`✅ [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: Form filled in ${Date.now() - formStart}ms`);
    
    console.log(`🎨 [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: Starting drawing operations`);
    const drawStart = Date.now();
    
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Layout dimensions (same as lisse trouee/lisse basse)
    const fixeImageWidth = 300;
    const fixeImageHeight = 300;
    const textImageHeight = 70;
    const detailImageWidth = 300;
    const detailImageHeight = 300;
    const spacing = 30;
    const startX = 30;
    const startY = height - 330;

    // Center fixe options horizontally when only 1 or 2 are selected (within 3-column region)
    const totalRowWidth = (fixeImageWidth * 3) + (spacing * 2);
    let row1StartX = startX;

    if (fixeOptions.length === 1) {
        row1StartX = startX + (totalRowWidth - fixeImageWidth) / 2;
    } else if (fixeOptions.length === 2) {
        const twoWidth = (fixeImageWidth * 2) + spacing;
        row1StartX = startX + (totalRowWidth - twoWidth) / 2;
    }

    let currentY = startY;
    
    // ROW 1: Up to 3 fixe options
    for (let i = 0; i < Math.min(fixeOptions.length, 3); i++) {
        const currentX = row1StartX + i * (fixeImageWidth + spacing);
        
        await drawImageCenteredOptimized(
            pdfDoc, page, fixeOptions[i], 
            currentX, currentY, 
            fixeImageWidth, fixeImageHeight, 
            embeddedCache, 
            imageCache
        );
    }
    
    // ROW 2: -text image (spans full width, 70px height)
    currentY -= fixeImageHeight + 12;
    const textWidth = (fixeImageWidth * 3) + (spacing * 2);
    const textYPosition = currentY + (fixeImageHeight - textImageHeight); // Align to top
    
    await drawImageCenteredOptimized(
        pdfDoc, page, 'detail-double-lisse-text',
        startX, textYPosition,
        textWidth, textImageHeight,
        embeddedCache,
        imageCache
    );
    
    // ROW 3: Detail image (centered)
    if (hasDetailDoubleLisse) {
        currentY -= textImageHeight + 12;
        
        // Center single detail image
        const centerX = startX + fixeImageWidth + spacing;
        
        await drawImageCenteredOptimized(
            pdfDoc, page, 'detail-double-lisse',
            centerX, currentY,
            detailImageWidth, detailImageHeight,
            embeddedCache,
            imageCache
        );
    }
    
    console.log(`✅ [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: Drawing completed in ${Date.now() - drawStart}ms`);
    
    console.log(`💾 [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: Starting PDF save`);
    const saveStart = Date.now();
    const result = await pdfDoc.save();
    console.log(`✅ [DOUBLE-LISSE] T+${Date.now() - pageStart}ms: PDF saved in ${Date.now() - saveStart}ms (${result.length} bytes)`);
    console.log(`🎉 [DOUBLE-LISSE] TOTAL PAGE TIME: ${Date.now() - pageStart}ms`);
    
    return result;
}

/**
 * Create Lisse Basse page
 * Layout: 3 fixe options top, -text in middle, detail images bottom
 * - Row 1: Up to 3 fixe options (300x300 each, 30px spacing)
 * - Row 2: detail-lisse-basse-text (70px height)
 * - Row 3: Detail images (entremise-1, entremise-2, detail-lisse-basse)
 */
async function createLisseBassePage(options, project, userInfo, imageCache = null, templateBuffer = null) {
    const pageStart = Date.now();
    console.log(`📄 [LISSE-BASSE] Starting page creation at T+0ms`);
    
    console.log(`📥 [LISSE-BASSE] T+${Date.now() - pageStart}ms: Loading template`);
    const loadStart = Date.now();
    const template = templateBuffer || await fetchBlankCFSSPageTemplateFromS3();
    const pdfDoc = await PDFDocument.load(template);
    console.log(`✅ [LISSE-BASSE] T+${Date.now() - pageStart}ms: Template loaded in ${Date.now() - loadStart}ms`);
    
    // Separate fixe options from detail images
    const fixeOptions = options.filter(opt => 
        opt !== 'detail-entremise' &&
        opt !== 'detail-entremise-1' && 
        opt !== 'detail-entremise-2' && 
        opt !== 'detail-lisse-basse' &&
        opt !== 'detail-lisse-basse-text'
    );
    
    // Collect detail images
    const detailImages = [];
    if (options.includes('detail-entremise-1')) detailImages.push('detail-entremise-1');
    if (options.includes('detail-entremise-2')) detailImages.push('detail-entremise-2');
    if (options.includes('detail-lisse-basse')) detailImages.push('detail-lisse-basse');
    
    console.log(`📊 [LISSE-BASSE] Fixe options: ${fixeOptions.length}, Detail images: ${detailImages.length}`);
    
    console.log(`🔍 [DEBUG LISSE-BASSE] Selected options:`, JSON.stringify(options));
    console.log(`🔍 [DEBUG LISSE-BASSE] Filtered fixeOptions:`, JSON.stringify(fixeOptions));
    console.log(`🔍 [DEBUG LISSE-BASSE] imageCache keys available:`, JSON.stringify(Object.keys(imageCache || {})));
    
    // Embedding images
    console.log(`🖼️ [LISSE-BASSE] T+${Date.now() - pageStart}ms: Starting image embedding`);
    const embedStart = Date.now();
    let embeddedCache = {};
    
    if (imageCache) {
        // Embed fixe options
        for (const imageName of fixeOptions) {
            console.log(`🔍 [DEBUG LISSE-BASSE] Checking ${imageName} in cache:`, !!imageCache[imageName]);
            if (imageCache[imageName]) {
                const imgEmbedStart = Date.now();
                try {
                    const bytes = imageCache[imageName];
                    try {
                        embeddedCache[imageName] = await pdfDoc.embedPng(bytes);
                    } catch {
                        try {
                            embeddedCache[imageName] = await pdfDoc.embedJpg(bytes);
                        } catch (e) {
                            console.warn(`  ⚠️ [LISSE-BASSE] Could not embed ${imageName}`);
                        }
                    }
                    console.log(`  🖼️ [LISSE-BASSE] Embedded ${imageName} in ${Date.now() - imgEmbedStart}ms`);
                } catch (e) {
                    console.warn(`  ❌ [LISSE-BASSE] Failed to embed ${imageName}:`, e.message);
                }
            } else {
                console.error(`❌ [DEBUG LISSE-BASSE] ${imageName} NOT FOUND in imageCache`);
            }
        }
        
        // Embed -text image
        if (imageCache['detail-lisse-basse-text']) {
            try {
                const bytes = imageCache['detail-lisse-basse-text'];
                try {
                    embeddedCache['detail-lisse-basse-text'] = await pdfDoc.embedPng(bytes);
                } catch {
                    try {
                        embeddedCache['detail-lisse-basse-text'] = await pdfDoc.embedJpg(bytes);
                    } catch (e) {
                        console.warn(`  ⚠️ [LISSE-BASSE] Could not embed detail-lisse-basse-text`);
                    }
                }
                console.log(`  🖼️ [LISSE-BASSE] Embedded detail-lisse-basse-text`);
            } catch (e) {
                console.warn(`  ❌ [LISSE-BASSE] Failed to embed detail-lisse-basse-text:`, e.message);
            }
        }
        
        // Embed detail images
        for (const imageName of detailImages) {
            if (imageCache[imageName]) {
                try {
                    const bytes = imageCache[imageName];
                    try {
                        embeddedCache[imageName] = await pdfDoc.embedPng(bytes);
                    } catch {
                        try {
                            embeddedCache[imageName] = await pdfDoc.embedJpg(bytes);
                        } catch (e) {
                            console.warn(`  ⚠️ [LISSE-BASSE] Could not embed ${imageName}`);
                        }
                    }
                    console.log(`  🖼️ [LISSE-BASSE] Embedded ${imageName}`);
                } catch (e) {
                    console.warn(`  ❌ [LISSE-BASSE] Failed to embed ${imageName}:`, e.message);
                }
            }
        }
    }
    console.log(`✅ [LISSE-BASSE] T+${Date.now() - pageStart}ms: All images embedded in ${Date.now() - embedStart}ms`);
    
    console.log(`📝 [LISSE-BASSE] T+${Date.now() - pageStart}ms: Filling form fields`);
    const formStart = Date.now();
    try {
        const form = pdfDoc.getForm();
        await fillOptionsTemplateFields(pdfDoc, form, project, userInfo, 0, 1);
    } catch (e) { /* no form */ }
    console.log(`✅ [LISSE-BASSE] T+${Date.now() - pageStart}ms: Form filled in ${Date.now() - formStart}ms`);
    
    console.log(`🎨 [LISSE-BASSE] T+${Date.now() - pageStart}ms: Starting drawing operations`);
    const drawStart = Date.now();
    
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Layout dimensions (same as lisse trouee)
    const fixeImageWidth = 300;
    const fixeImageHeight = 300;
    const textImageHeight = 70;
    const detailImageWidth = 300;
    const detailImageHeight = 300;
    const spacing = 30;
const startX = 30;
const startY = height - 330;

// Center fixe options horizontally when only 1 or 2 are selected (within 3-column region)
const totalRowWidth = (fixeImageWidth * 3) + (spacing * 2);
let row1StartX = startX;

if (fixeOptions.length === 1) {
    row1StartX = startX + (totalRowWidth - fixeImageWidth) / 2;
} else if (fixeOptions.length === 2) {
    const twoWidth = (fixeImageWidth * 2) + spacing;
    row1StartX = startX + (totalRowWidth - twoWidth) / 2;
}

let currentY = startY;
    
    // ROW 1: Up to 3 fixe options
    for (let i = 0; i < Math.min(fixeOptions.length, 3); i++) {
        const currentX = row1StartX + i * (fixeImageWidth + spacing);
        
        await drawImageCenteredOptimized(
            pdfDoc, page, fixeOptions[i], 
            currentX, currentY, 
            fixeImageWidth, fixeImageHeight, 
            embeddedCache, 
            imageCache
        );
    }
    
    // ROW 2: -text image (spans full width, 70px height)
    currentY -= fixeImageHeight + 12;
    const textWidth = (fixeImageWidth * 3) + (spacing * 2);
    const textYPosition = currentY + (fixeImageHeight - textImageHeight); // Align to top
    
    await drawImageCenteredOptimized(
        pdfDoc, page, 'detail-lisse-basse-text',
        startX, textYPosition,
        textWidth, textImageHeight,
        embeddedCache,
        imageCache
    );
    
    // ROW 3: Detail images (centered when fewer than 3)
    if (detailImages.length > 0) {
        currentY -= textImageHeight + 12;
        
        if (detailImages.length === 1) {
            // Center single detail image
            const centerX = startX + fixeImageWidth + spacing;
            
            await drawImageCenteredOptimized(
                pdfDoc, page, detailImages[0],
                centerX, currentY,
                detailImageWidth, detailImageHeight,
                embeddedCache,
                imageCache
            );
        } else if (detailImages.length === 2) {
            // Center two detail images
            const totalWidth = (fixeImageWidth * 3) + (spacing * 2);
            const gapBetween = (totalWidth - (detailImageWidth * 2)) / 3;
            
            const firstX = startX + gapBetween;
            await drawImageCenteredOptimized(
                pdfDoc, page, detailImages[0],
                firstX, currentY,
                detailImageWidth, detailImageHeight,
                embeddedCache,
                imageCache
            );
            
            const secondX = firstX + detailImageWidth + gapBetween;
            await drawImageCenteredOptimized(
                pdfDoc, page, detailImages[1],
                secondX, currentY,
                detailImageWidth, detailImageHeight,
                embeddedCache,
                imageCache
            );
        } else if (detailImages.length === 3) {
            // Three detail images across
            for (let i = 0; i < 3; i++) {
                const currentX = startX + i * (detailImageWidth + spacing);
                
                await drawImageCenteredOptimized(
                    pdfDoc, page, detailImages[i],
                    currentX, currentY,
                    detailImageWidth, detailImageHeight,
                    embeddedCache,
                    imageCache
                );
            }
        }
    }
    
    console.log(`✅ [LISSE-BASSE] T+${Date.now() - pageStart}ms: Drawing completed in ${Date.now() - drawStart}ms`);
    
    console.log(`💾 [LISSE-BASSE] T+${Date.now() - pageStart}ms: Starting PDF save`);
    const saveStart = Date.now();
    const result = await pdfDoc.save();
    console.log(`✅ [LISSE-BASSE] T+${Date.now() - pageStart}ms: PDF saved in ${Date.now() - saveStart}ms (${result.length} bytes)`);
    console.log(`🎉 [LISSE-BASSE] TOTAL PAGE TIME: ${Date.now() - pageStart}ms`);
    
    return result;
}

/**
 * Create Parapet pages (3x3 grid, 9 per page)
 */
async function createParapetPages(parapets, project, userInfo, imageCache = null, templateBuffer = null) {
    const overallStart = Date.now();
    console.log(`📄 [PARAPET] Starting pages creation at T+0ms (${parapets.length} parapets)`);
    
    const pages = [];
    let currentIdx = 0;
    
    while (currentIdx < parapets.length) {
        const pageStart = Date.now();
        const pageNum = Math.floor(currentIdx / 9) + 1;
        console.log(`📄 [PARAPET] Page ${pageNum}: Starting at T+${Date.now() - overallStart}ms`);
        
        console.log(`📥 [PARAPET] Page ${pageNum}: Loading template`);
        const loadStart = Date.now();
        const template = templateBuffer || await fetchBlankCFSSPageTemplateFromS3();
        const pdfDoc = await PDFDocument.load(template);
        console.log(`✅ [PARAPET] Page ${pageNum}: Template loaded in ${Date.now() - loadStart}ms`);
        
        const pageParapets = parapets.slice(currentIdx, currentIdx + 9);
        
        console.log(`🖼️ [PARAPET] Page ${pageNum}: Embedding ${pageParapets.length} images`);
        const embedStart = Date.now();
        let embeddedCache = {};
        
        if (imageCache) {
            for (const imageName of pageParapets) {
                if (imageCache[imageName]) {
                    const imgEmbedStart = Date.now();
                    try {
                        const bytes = imageCache[imageName];
                        try {
                            embeddedCache[imageName] = await pdfDoc.embedPng(bytes);
                        } catch {
                            try {
                                embeddedCache[imageName] = await pdfDoc.embedJpg(bytes);
                            } catch (e) {
                                console.warn(`  ⚠️ [PARAPET] Could not embed ${imageName}`);
                            }
                        }
                        console.log(`  🖼️ [PARAPET] Page ${pageNum}: Embedded ${imageName} in ${Date.now() - imgEmbedStart}ms`);
                    } catch (e) {
                        console.warn(`  ❌ [PARAPET] Failed to embed ${imageName}:`, e.message);
                    }
                }
            }
        }
        console.log(`✅ [PARAPET] Page ${pageNum}: All images embedded in ${Date.now() - embedStart}ms`);
        
        console.log(`📝 [PARAPET] Page ${pageNum}: Filling form fields`);
        const formStart = Date.now();
        try {
            const form = pdfDoc.getForm();
            await fillOptionsTemplateFields(pdfDoc, form, project, userInfo, 0, 1);
        } catch (e) { /* no form */ }
        console.log(`✅ [PARAPET] Page ${pageNum}: Form filled in ${Date.now() - formStart}ms`);
        
        console.log(`🎨 [PARAPET] Page ${pageNum}: Drawing`);
        const drawStart = Date.now();
        
        const page = pdfDoc.getPages()[0];
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        // Layout dimensions
        const imageWidth = 240;
        const imageHeight = 240;
        const horizontalSpacing = 75;
        const verticalSpacing = 17;
        const startX = 75;
        const startY = height - 260; // 315px from top
        
        let currentX = startX;
        let currentY = startY;
        
        for (let i = 0; i < pageParapets.length; i++) {
            // Move to next row after every 3 images
            if (i === 3 || i === 6) {
                currentX = startX;
                currentY -= imageHeight + verticalSpacing;
            }
            
            await drawImageCenteredOptimized(
                pdfDoc, page, pageParapets[i], 
                currentX, currentY, 
                imageWidth, imageHeight, 
                embeddedCache, 
                imageCache
            );
            
            currentX += imageWidth + horizontalSpacing;
        }
        console.log(`✅ [PARAPET] Page ${pageNum}: Drawing completed in ${Date.now() - drawStart}ms`);
        
        console.log(`💾 [PARAPET] Page ${pageNum}: Saving PDF`);
        const saveStart = Date.now();
        const result = await pdfDoc.save();
        console.log(`✅ [PARAPET] Page ${pageNum}: Saved in ${Date.now() - saveStart}ms (${result.length} bytes)`);
        console.log(`🎉 [PARAPET] Page ${pageNum}: TOTAL TIME: ${Date.now() - pageStart}ms`);
        
        pages.push(result);
        currentIdx += 9;
    }
    
    console.log(`🎉 [PARAPET] ALL PAGES COMPLETE: ${Date.now() - overallStart}ms (${pages.length} pages)`);
    return pages;
}

/**
 * Create Jambages/Linteaux/Seuils combined pages
 * 3 per row, with dividers between categories
 */
async function createJambagesLinteauxSeuilsPages(jambages, linteaux, seuils, project, userInfo, imageCache = null, templateBuffer = null) {
    const overallStart = Date.now();
    console.log(`📄 [JLS] Starting pages creation at T+0ms`);
    console.log(`📄 [JLS] Jambages: ${jambages.length}, Linteaux: ${linteaux.length}, Seuils: ${seuils.length}`);
    
    const pages = [];
    
    const allOptions = [
        ...jambages.map(j => ({ type: 'jambage', name: j })),
        ...linteaux.map(l => ({ type: 'linteau', name: l })),
        ...seuils.map(s => ({ type: 'seuil', name: s }))
    ];
    
    let currentIdx = 0;
    
    while (currentIdx < allOptions.length) {
        const pageStart = Date.now();
        const pageNum = Math.floor(currentIdx / 9) + 1;
        console.log(`📄 [JLS] Page ${pageNum}: Starting at T+${Date.now() - overallStart}ms`);
        
        console.log(`📥 [JLS] Page ${pageNum}: Loading template`);
        const loadStart = Date.now();
        const template = templateBuffer || await fetchBlankCFSSPageTemplateFromS3();
        const pdfDoc = await PDFDocument.load(template);
        console.log(`✅ [JLS] Page ${pageNum}: Template loaded in ${Date.now() - loadStart}ms`);
        
        // Determine how many items fit in 3 rows max
        let endIdx = currentIdx;
        let rowsUsed = 0;
        let currentRowCount = 0;
        let lastSeenType = null;
        
        while (endIdx < allOptions.length && rowsUsed < 3) {
            const option = allOptions[endIdx];
            
            // Check if switching categories (which takes space but doesn't count as full row)
            if (lastSeenType !== null && option.type !== lastSeenType) {
                // Category switch: finish current row and don't start new category if at 3 rows
                if (currentRowCount > 0) {
                    rowsUsed++; // Complete the current row
                    currentRowCount = 0;
                }
                
                // Don't start a new category if we're already at 3 rows
                if (rowsUsed >= 3) {
                    break;
                }
            }
            
            // Add this item
            endIdx++;
            currentRowCount++;
            lastSeenType = option.type;
            
            // Complete row after 3 items
            if (currentRowCount === 3) {
                rowsUsed++;
                currentRowCount = 0;
            }
        }
        
        const pageOptions = allOptions.slice(currentIdx, endIdx);
        const optionNames = pageOptions.map(o => o.name);
        
        console.log(`🖼️ [JLS] Page ${pageNum}: Embedding ${optionNames.length} images`);
        const embedStart = Date.now();
        let embeddedCache = {};
        
        if (imageCache) {
            for (const imageName of optionNames) {
                if (imageCache[imageName]) {
                    const imgEmbedStart = Date.now();
                    try {
                        const bytes = imageCache[imageName];
                        try {
                            embeddedCache[imageName] = await pdfDoc.embedPng(bytes);
                        } catch {
                            try {
                                embeddedCache[imageName] = await pdfDoc.embedJpg(bytes);
                            } catch (e) {
                                console.warn(`  ⚠️ [JLS] Could not embed ${imageName}`);
                            }
                        }
                        console.log(`  🖼️ [JLS] Page ${pageNum}: Embedded ${imageName} in ${Date.now() - imgEmbedStart}ms`);
                    } catch (e) {
                        console.warn(`  ❌ [JLS] Failed to embed ${imageName}:`, e.message);
                    }
                }
            }
        }
        console.log(`✅ [JLS] Page ${pageNum}: All images embedded in ${Date.now() - embedStart}ms`);
        
        console.log(`📝 [JLS] Page ${pageNum}: Filling form fields`);
        const formStart = Date.now();
        try {
            const form = pdfDoc.getForm();
            await fillOptionsTemplateFields(pdfDoc, form, project, userInfo, 0, 1);
        } catch (e) { /* no form */ }
        console.log(`✅ [JLS] Page ${pageNum}: Form filled in ${Date.now() - formStart}ms`);
        
        console.log(`🎨 [JLS] Page ${pageNum}: Drawing`);
        const drawStart = Date.now();
        
        const page = pdfDoc.getPages()[0];
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        // Layout dimensions
        const imageWidth = 230;
        const imageHeight = 230;
        const horizontalSpacing = 50;
        const verticalSpacing = 15;
        const labelStartX = 25; // Text position (50px left of original)
        const imageStartX = 175; // Image position (150px right of original)
        let currentY = height - 240; // Start position from top

        
        const typeLabels = {
            'jambage': 'JAMBAGES TYP.',
            'linteau': 'LINTEAU TYP.',
            'seuil': 'SEUIL TYP.'
        };
        
        let lastType = null;
        let currentX = imageStartX;
        let rowCount = 0;
        
        for (let i = 0; i < pageOptions.length; i++) {
            const option = pageOptions[i];
            
            // Check if we're switching to a new category
            if (option.type !== lastType) {
                // If not the first category, draw divider line and move down
                if (lastType !== null) {
                    // Draw the line just below current row of images
                    const lineY = currentY - 15; // Much less subtraction to get line higher up
                    page.drawLine({
                        start: { x: imageStartX, y: lineY },
                        end: { x: imageStartX + (imageWidth * 3) + (horizontalSpacing * 2), y: lineY },
                        thickness: 3,
                        color: rgb(0, 0, 0)
                    });
                    
                    // Now move currentY down for proper spacing of next category
                    currentY -= (imageHeight + verticalSpacing); // Full spacing (220px + 15px)
                }
                
                // Draw category label  
                currentY -= 10; // Space for label
                page.drawText(typeLabels[option.type], {
                    x: labelStartX + 5,
                    y: currentY + 110, // Move text up 110px
                    size: 14,
                    font: boldFont,
                    color: rgb(0, 0, 0),
                });
                
                // Reset to start of new row
                currentY -= 5; // Minimal gap after label
                currentX = imageStartX;
                rowCount = 0;
                lastType = option.type;
            }
            
            // Check if we need to move to next row (3 per row)
            if (rowCount > 0 && rowCount % 3 === 0) {
                currentX = imageStartX;
                currentY -= imageHeight + verticalSpacing;
                rowCount = 0;
            }
            
            // Draw image
            await drawImageCenteredOptimized(
                pdfDoc, page, option.name, 
                currentX, currentY, 
                imageWidth, imageHeight, 
                embeddedCache, 
                imageCache
            );
            
            currentX += imageWidth + horizontalSpacing;
            rowCount++;
        }
        console.log(`✅ [JLS] Page ${pageNum}: Drawing completed in ${Date.now() - drawStart}ms`);
        
        console.log(`💾 [JLS] Page ${pageNum}: Saving PDF`);
        const saveStart = Date.now();
        const result = await pdfDoc.save();
        console.log(`✅ [JLS] Page ${pageNum}: Saved in ${Date.now() - saveStart}ms (${result.length} bytes)`);
        console.log(`🎉 [JLS] Page ${pageNum}: TOTAL TIME: ${Date.now() - pageStart}ms`);
        
        pages.push(result);
        currentIdx = endIdx;
    }
    
    console.log(`🎉 [JLS] ALL PAGES COMPLETE: ${Date.now() - overallStart}ms (${pages.length} pages)`);
    return pages;
}

/**
 * Helper function to create a single Jambages/Linteaux/Seuils page
 */
async function createJLSPage(items, project, userInfo, pageNumber) {

    const imageNames = items.filter(item => item.type !== 'divider').map(item => item.name);
    const templateBuffer = await fetchBlankTemplateFromS3();
    const pdfDoc = await PDFDocument.load(templateBuffer);
    const { imageCache, embeddedCache } = await prefetchAndEmbedImages(pdfDoc, imageNames);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    
    try {
        const form = pdfDoc.getForm();
        await fillOptionsTemplateFields(pdfDoc, form, project, userInfo, 0, 1);
    } catch (e) { /* no form */ }
    
    const margin = 40;
    const usableWidth = width - (2 * margin);
    const spacing = 15;
    const imageWidth = (usableWidth - (2 * spacing)) / 3;
    const imageHeight = 180;
    const dividerHeight = 20;
    
    let currentRow = 0;
    let currentCol = 0;
    let currentY = height - margin - imageHeight;
    
    for (const item of items) {
        if (item.type === 'divider') {
            // Draw divider line
            currentRow++;
            currentCol = 0;
            currentY -= (imageHeight + dividerHeight);
            
            const helvetica = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            page.drawLine({
                start: { x: margin, y: currentY + imageHeight + 10 },
                end: { x: width - margin, y: currentY + imageHeight + 10 },
                thickness: 2,
                color: rgb(0.8, 0.8, 0.8)
            });
            
        } else {
            const x = margin + (currentCol * (imageWidth + spacing));
            await drawImageCenteredOptimized(pdfDoc, page, item.name, x, currentY, imageWidth, imageHeight, embeddedCache, imageCache);
            
            currentCol++;
            if (currentCol >= 3) {
                currentRow++;
                currentCol = 0;
                currentY -= (imageHeight + spacing);
            }
        }
    }
    
    return await pdfDoc.save();
}

/**
 * Create Fenetre page (full page, centered)
 */
async function createFenetrePage(project, userInfo, imageCache = null, templateBuffer = null) {
    const pageStart = Date.now();
    console.log(`📄 [FENETRE] Starting page creation at T+0ms`);
    
    console.log(`📥 [FENETRE] T+${Date.now() - pageStart}ms: Loading template`);
    const loadStart = Date.now();
    const template = templateBuffer || await fetchBlankCFSSPageTemplateFromS3();
    const pdfDoc = await PDFDocument.load(template);
    console.log(`✅ [FENETRE] T+${Date.now() - pageStart}ms: Template loaded in ${Date.now() - loadStart}ms`);
    
    console.log(`🖼️ [FENETRE] T+${Date.now() - pageStart}ms: Embedding fenetre image`);
    const embedStart = Date.now();
    let embeddedCache = {};
    
    if (imageCache && imageCache['fenetre']) {
        try {
            const bytes = imageCache['fenetre'];
            try {
                embeddedCache['fenetre'] = await pdfDoc.embedPng(bytes);
            } catch {
                try {
                    embeddedCache['fenetre'] = await pdfDoc.embedJpg(bytes);
                } catch (e) {
                    console.warn(`  ⚠️ [FENETRE] Could not embed fenetre`);
                }
            }
            console.log(`  🖼️ [FENETRE] Embedded fenetre in ${Date.now() - embedStart}ms`);
        } catch (e) {
            console.warn(`  ❌ [FENETRE] Failed to embed fenetre:`, e.message);
        }
    }
    console.log(`✅ [FENETRE] T+${Date.now() - pageStart}ms: Image embedded in ${Date.now() - embedStart}ms`);
    
    console.log(`📝 [FENETRE] T+${Date.now() - pageStart}ms: Filling form fields`);
    const formStart = Date.now();
    try {
        const form = pdfDoc.getForm();
        await fillOptionsTemplateFields(pdfDoc, form, project, userInfo, 0, 1);
        await updateFieldAppearancesWithUnicodeFont(pdfDoc, form);
        await applyProjectAddressCondensedStyle(pdfDoc);
    } catch (e) { /* no form */ }
    console.log(`✅ [FENETRE] T+${Date.now() - pageStart}ms: Form filled in ${Date.now() - formStart}ms`);
    
    console.log(`🎨 [FENETRE] T+${Date.now() - pageStart}ms: Drawing`);
    const drawStart = Date.now();
    
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
        // Calculate image dimensions maintaining aspect ratio
    const targetWidth = 700;
    let imageWidth = targetWidth;
    let imageHeight = targetWidth; // Default if we can't get dimensions
    
    // Get original image dimensions to maintain aspect ratio
    if (embeddedCache['fenetre']) {
        const img = embeddedCache['fenetre'];
        const originalWidth = img.width;
        const originalHeight = img.height;
        imageHeight = (targetWidth / originalWidth) * originalHeight;
    }
    
    // Center the image within the usable canvas width (excluding right sidebar)
    const usableWidth = 1035;
    const imageX = (usableWidth - imageWidth) / 2;
    const imageY = (height - imageHeight) / 2;
    
    await drawImageCenteredOptimized(
        pdfDoc, page, 'fenetre',
        imageX,
        imageY,
        imageWidth,
        imageHeight,
        embeddedCache,
        imageCache
    );

    console.log(`✅ [FENETRE] T+${Date.now() - pageStart}ms: Drawing completed in ${Date.now() - drawStart}ms`);
    
    console.log(`💾 [FENETRE] T+${Date.now() - pageStart}ms: Saving PDF`);
    const saveStart = Date.now();
    const result = await pdfDoc.save();
    console.log(`✅ [FENETRE] T+${Date.now() - pageStart}ms: PDF saved in ${Date.now() - saveStart}ms (${result.length} bytes)`);
    console.log(`🎉 [FENETRE] TOTAL PAGE TIME: ${Date.now() - pageStart}ms`);
    
    return result;
}

// Pre-fetch all images in parallel
async function prefetchAllImages(imageNames) {
    console.log(`🚀 Pre-fetching ${imageNames.length} images in parallel...`);
    const startTime = Date.now();
    
    const imagePromises = imageNames.map(async (imageName) => {
        try {
            const imageUrl = await getCFSSOptionImageUrl(imageName);
            if (!imageUrl) return { imageName, data: null };
            
            const response = await fetch(imageUrl);
            const imageBytes = await response.arrayBuffer();
            return { imageName, data: imageBytes };
        } catch (error) {
            console.error(`Failed to fetch ${imageName}:`, error);
            return { imageName, data: null };
        }
    });
    
    const results = await Promise.all(imagePromises);
    const imageCache = {};
    results.forEach(({ imageName, data }) => {
        if (data) imageCache[imageName] = data;
    });
    
    console.log(`✅ Pre-fetched ${Object.keys(imageCache).length} images in ${Date.now() - startTime}ms`);
    return imageCache;
}

/**
 * Helper function to draw an image centered in a given box
 */
async function drawImageCentered(pdfDoc, page, imageName, x, y, boxWidth, boxHeight, imageCache = null) {
    try {
        let imageBytes;
        
        if (imageCache && imageCache[imageName]) {
            // Use pre-fetched image
            imageBytes = imageCache[imageName];
        } else {
            // Fallback: fetch individually (old behavior)
            const imageUrl = await getCFSSOptionImageUrl(imageName);
            if (!imageUrl) {
                console.warn(`⚠️ Image not found: ${imageName}`);
                return;
            }
            const response = await fetch(imageUrl);
            imageBytes = await response.arrayBuffer();
        }
        
        let image;
        try {
            image = await pdfDoc.embedPng(imageBytes);
        } catch {
            try {
                image = await pdfDoc.embedJpg(imageBytes);
            } catch {
                console.warn(`⚠️ Failed to embed image: ${imageName}`);
                return;
            }
        }
        
        // Calculate dimensions maintaining aspect ratio
        const aspectRatio = image.width / image.height;
        let finalWidth = boxWidth;
        let finalHeight = boxWidth / aspectRatio;
        
        if (finalHeight > boxHeight) {
            finalHeight = boxHeight;
            finalWidth = boxHeight * aspectRatio;
        }
        
        // Center in box
        const finalX = x + (boxWidth - finalWidth) / 2;
        const finalY = y + (boxHeight - finalHeight) / 2;
        
        page.drawImage(image, {
            x: finalX,
            y: finalY,
            width: finalWidth,
            height: finalHeight
        });
        
    } catch (error) {
        console.error(`❌ Error drawing image ${imageName}:`, error);
    }
}

// Fetch AND embed all images at once (parallel)
async function prefetchAndEmbedImages(pdfDoc, imageNames) {
    console.log(`🚀 Pre-fetching and embedding ${imageNames.length} images...`);
    const startTime = Date.now();
    
    // Get all signed URLs in batch (MUCH faster!)
    const urlMap = await getCFSSOptionImageUrlsBatch(imageNames);
    
    // Fetch all images in parallel
    const imagePromises = imageNames.map(async (imageName) => {
        try {
            const imageUrl = urlMap[imageName];
            if (!imageUrl) return { imageName, bytes: null, embedded: null };
            const response = await fetch(imageUrl);
            const imageBytes = await response.arrayBuffer();
            return { imageName, bytes: imageBytes, embedded: null };
        } catch (error) {
            console.error(`Failed to fetch ${imageName}:`, error);
            return { imageName, bytes: null, embedded: null };
        }
    });
    
    const fetchResults = await Promise.all(imagePromises);
    
    // Embed all in parallel
    const embedPromises = fetchResults.map(async ({ imageName, bytes }) => {
        if (!bytes) return { imageName, bytes: null, embedded: null };
        try {
            let embedded;
            try {
                embedded = await pdfDoc.embedPng(bytes);
            } catch {
                try {
                    embedded = await pdfDoc.embedJpg(bytes);
                } catch {
                    return { imageName, bytes, embedded: null };
                }
            }
            return { imageName, bytes, embedded };
        } catch (error) {
            return { imageName, bytes, embedded: null };
        }
    });
    
    const embedResults = await Promise.all(embedPromises);
    
    const imageCache = {};
    const embeddedCache = {};
    embedResults.forEach(({ imageName, bytes, embedded }) => {
        if (bytes) imageCache[imageName] = bytes;
        if (embedded) embeddedCache[imageName] = embedded;
    });
    
    console.log(`✅ Pre-fetched and embedded ${Object.keys(embeddedCache).length} images in ${Date.now() - startTime}ms`);
    return { imageCache, embeddedCache };
}

// Draw using pre-embedded images (fast!)
async function drawImageCenteredOptimized(pdfDoc, page, imageName, x, y, boxWidth, boxHeight, embeddedCache = null, imageCache = null) {
    try {
        let image;
        
        if (embeddedCache && embeddedCache[imageName]) {
            image = embeddedCache[imageName];
        } else if (imageCache && imageCache[imageName]) {
            const imageBytes = imageCache[imageName];
            try {
                image = await pdfDoc.embedPng(imageBytes);
            } catch {
                image = await pdfDoc.embedJpg(imageBytes);
            }
        } else {
            const imageUrl = await getCFSSOptionImageUrl(imageName);
            if (!imageUrl) return;
            const response = await fetch(imageUrl);
            const imageBytes = await response.arrayBuffer();
            try {
                image = await pdfDoc.embedPng(imageBytes);
            } catch {
                image = await pdfDoc.embedJpg(imageBytes);
            }
        }
        
        const aspectRatio = image.width / image.height;
        let finalWidth = boxWidth;
        let finalHeight = boxWidth / aspectRatio;
        
        if (finalHeight > boxHeight) {
            finalHeight = boxHeight;
            finalWidth = boxHeight * aspectRatio;
        }
        
        const finalX = x + (boxWidth - finalWidth) / 2;
        const finalY = y + (boxHeight - finalHeight) / 2;
        
        page.drawImage(image, { x: finalX, y: finalY, width: finalWidth, height: finalHeight });
    } catch (error) {
        console.error(`❌ Error drawing image ${imageName}:`, error);
    }
}

async function duplicateProject(projectId, userInfo) {
    try {
        console.log(`📋 Duplicating project ${projectId} for user ${userInfo.email}`);
        
        // Fetch the original project
        const getParams = {
            TableName: TABLE_NAME,
            Key: { id: projectId }
        };
        const result = await dynamodb.get(getParams);
        
        if (!result.Item) {
            throw new Error('Project not found');
        }
        
        const originalProject = result.Item;
        console.log(`✅ Original project found: ${originalProject.name}`);
        
        // Generate a unique copy name
        const copyName = `${originalProject.name || 'Unnamed Project'} - Copy`;
        
        // Create new project with same data but new ID and ownership
        const duplicatedProject = {
            ...originalProject,
            id: Date.now().toString(), // New unique ID
            name: copyName, // Add "- Copy" to the name
            createdBy: userInfo.email, // New owner
            createdByUserId: userInfo.userId,
            createdByName: `${userInfo.firstName} ${userInfo.lastName}`,
            createdByCompany: userInfo.companyName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: userInfo.email
        };
        
        // Remove any undefined values
        Object.keys(duplicatedProject).forEach(key => {
            if (duplicatedProject[key] === undefined) {
                delete duplicatedProject[key];
            }
        });
        
        // Log what type of project is being duplicated
        if (originalProject.domain) {
            console.log(`📊 Duplicating seismic project with ${originalProject.equipment?.length || 0} equipment items`);
            console.log(`Domain: ${originalProject.domain}`);
            // Ensure all seismic-specific fields are preserved
            duplicatedProject.domain = originalProject.domain;
            duplicatedProject.latitude = originalProject.latitude;
            duplicatedProject.longitude = originalProject.longitude;
            duplicatedProject.riskCategory = originalProject.riskCategory;
            duplicatedProject.maxSa0_2 = originalProject.maxSa0_2;
            duplicatedProject.maxSa1_0 = originalProject.maxSa1_0;
            duplicatedProject.maxPGA = originalProject.maxPGA;
            duplicatedProject.PGAref = originalProject.PGAref;
            duplicatedProject.F10 = originalProject.F10;
            duplicatedProject.F02 = originalProject.F02;
            duplicatedProject.S_MS = originalProject.S_MS;
            duplicatedProject.S_DS = originalProject.S_DS;
            duplicatedProject.S_M1 = originalProject.S_M1;
            duplicatedProject.S_D1 = originalProject.S_D1;
            duplicatedProject.RiskS_DS = originalProject.RiskS_DS;
            duplicatedProject.RiskS_D1 = originalProject.RiskS_D1;
            duplicatedProject.FinalRiskCategory = originalProject.FinalRiskCategory;
        } else {
            console.log(`🏗️ Duplicating CFSS project with ${originalProject.walls?.length || 0} walls`);
            // Ensure CFSS-specific fields are preserved
            if (originalProject.walls) {
                duplicatedProject.walls = originalProject.walls;
            }
            if (originalProject.wallRevisions) {
                console.log(`📋 Also copying ${originalProject.wallRevisions.length} wall revisions`);
                duplicatedProject.wallRevisions = originalProject.wallRevisions;
            }
            if (originalProject.cfssWindData) {
                console.log(`🌬️ Also copying ${originalProject.cfssWindData.length} wind data entries`);
                duplicatedProject.cfssWindData = originalProject.cfssWindData;
            }
            // Make sure domain is NOT set for CFSS projects
            delete duplicatedProject.domain;
        }
        
        // Ensure all common fields are preserved
        duplicatedProject.type = originalProject.type || '';
        duplicatedProject.description = originalProject.description || '';
        duplicatedProject.status = originalProject.status || 'Planning';
        duplicatedProject.addressLine1 = originalProject.addressLine1 || '';
        duplicatedProject.addressLine2 = originalProject.addressLine2 || '';
        duplicatedProject.city = originalProject.city || '';
        duplicatedProject.province = originalProject.province || '';
        duplicatedProject.country = originalProject.country || 'Canada';
        duplicatedProject.equipment = originalProject.equipment || [];
        
        // Save the duplicated project
        const putParams = {
            TableName: TABLE_NAME,
            Item: duplicatedProject
        };
        
        await dynamodb.put(putParams);
        console.log(`✅ Project duplicated successfully with new ID: ${duplicatedProject.id}`);
        console.log(`✅ Duplicated project details:`, JSON.stringify(duplicatedProject, null, 2));
        
        return duplicatedProject;
        
    } catch (error) {
        console.error('❌ Error duplicating project:', error);
        throw new Error(`Failed to duplicate project: ${error.message}`);
    }
}

// Function to determine which detail images to include based on selected options
function determineDetailImages(selectedOptions) {
    const detailImages = [];
    
    // Check for categories that require detail images
    const categories = {
        'detail-lisse-trouee': selectedOptions.some(opt => opt.includes('lisse-trouee')),
        'detail-lisse-basse': selectedOptions.some(opt => opt.includes('lisse-basse')),
        'detail-double-lisse': selectedOptions.some(opt => opt.includes('double-lisse')),
        'detail-structure': selectedOptions.some(opt => opt.includes('structure'))
    };
    
    // Add detail images for categories that have selected options
    Object.entries(categories).forEach(([detailImage, shouldInclude]) => {
        if (shouldInclude && !selectedOptions.includes(detailImage)) {
            detailImages.push(detailImage);
            console.log(`📋 Adding detail image: ${detailImage}`);
        }
    });
    
    return detailImages;
}

// Function to create a single options page with 3x3 grid
async function createOptionsPageWith3x3Grid(imageOptions, project, userInfo, pageNumber, totalPages) {
    try {
        console.log(`📄 Creating 3x3 grid page ${pageNumber}/${totalPages} with ${imageOptions.length} images`);
        
        // Fetch blank template
        const templateBuffer = await fetchBlankTemplateFromS3();
        const pdfDoc = await PDFDocument.load(templateBuffer);
        const pages = pdfDoc.getPages();
        const page = pages[0];
        
        const { width, height } = page.getSize();
        
        // Fill form fields if they exist
        try {
            const form = pdfDoc.getForm();
            await fillOptionsTemplateFields(pdfDoc, form, project, userInfo, 0, 1);
        } catch (formError) {
            console.log('No form fields found in options template');
        }
        
        // Draw 3x3 grid with images
        await draw3x3GridOnPage(pdfDoc, page, imageOptions);
        
        return await pdfDoc.save();
        
    } catch (error) {
        console.error('❌ Error creating 3x3 grid page:', error);
        throw error;
    }
}

// Function to fetch blank template from S3
async function fetchBlankTemplateFromS3() {
    try {
        const templateKey = 'report/blank-cfss-page.pdf';
        console.log(`📥 Fetching blank template: ${templateKey}`);
        
        const command = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: templateKey
        });
        
        const response = await s3Client.send(command);
        const chunks = [];
        
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        console.log(`✅ Blank template fetched, size: ${buffer.length}`);
        
        return buffer;
        
    } catch (error) {
        console.error(`❌ Error fetching blank template:`, error);
        throw new Error(`Failed to fetch blank template`);
    }
}

// Function to fill options template fields
async function fillOptionsTemplateFields(pdfDoc, form, project, userInfo, pageNumber, totalPages) {
    try {
        console.log('📝 Filling options template form fields...');
        
        // Build project address string
        const projectAddress = [
            project.addressLine1,
            project.addressLine2,
            project.city,
            project.province,
            project.country
        ].filter(Boolean).join(', ');
        
        // Get current date in MM/DD/YY format
        const today = new Date();
        const currentDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear().toString().slice(-2)}`;
        
        // Options page field mappings
        const optionsFieldMappings = {
            'clientName': project.clientName || '',
            'projectTitle': project.name || '',
            'projectAddress': projectAddress,
            'contractNumber': sanitizeText(project.projectNumber) || '',
            'registerDate': currentDate,
            'preparedBy': sanitizeText(project.designedBy) || 'Dat Bui Tuan',
            'approvedBy': sanitizeText(project.approvedBy) || 'Minh Duc Hoang, ing',
            'pageNumber': pageNumber.toString()
        };
        
        // Include revision data if available
        const revisionData = extractAndValidateRevisionData(project);
        if (revisionData.hasRevisions) {
            revisionData.revisions.forEach((revision, index) => {
                const revisionNum = index + 1;
                optionsFieldMappings[`revision${revisionNum}`] = revision.number.toString().padStart(2, '0');
                optionsFieldMappings[`description${revisionNum}`] = revision.description;
                optionsFieldMappings[`Date${revisionNum}`] = revision.date;
            });
        }
        
        // Fill form fields
        const fields = form.getFields();
        let filledCount = 0;
        
        fields.forEach(field => {
            const fieldName = field.getName();
            
            Object.entries(optionsFieldMappings).forEach(([suffix, value]) => {
                if (fieldName.endsWith(suffix)) {
                    try {
                        if (field.constructor.name === 'PDFTextField') {
                            field.setText(String(value));
                            console.log(`Filled options field ${fieldName}: ${value}`);
                            filledCount++;
                        }
                    } catch (error) {
                        console.warn(`Could not fill options field ${fieldName}: ${error.message}`);
                    }
                }
            });
        });
        
        console.log(`✅ Filled ${filledCount} options form fields`);

        try {
            await updateFieldAppearancesWithUnicodeFont(pdfDoc, form);
            await applyProjectAddressCondensedStyle(pdfDoc);
        } catch (error) {
            console.warn('Could not update options form appearances:', error.message);
        }
        
    } catch (error) {
        console.error('Error filling options template fields:', error);
        throw error;
    }
}

async function draw3x3GridOnPage(pdfDoc, page, imageOptions) {
    try {
        console.log(`🎨 Drawing grid with ${imageOptions.length} images (variable widths)`);
        
        const { width, height } = page.getSize();
        
        // Grid configuration
        const gridMarginX = 50;
        const gridMarginY = 120;
        const gridBottomMargin = 80;
        
        const maxGridWidth = width - 320;
        const gridWidth = Math.min(maxGridWidth, width - gridMarginX - 270);
        const gridHeight = height - gridMarginY - gridBottomMargin;
        
        const cellWidth = gridWidth / 3;
        const cellHeight = gridHeight / 3;
        const cellPadding = 3;
        
        // Define image width categories
        const doubleWidthImages = [
            'detail-lisse-trouee',
            'detail-double-lisse'
        ];
        
        const fullRowImages = [
            'detail-entremise-1',
            'detail-entremise-2',
            'detail-structure'
        ];
        
        console.log(`📐 Grid dimensions: ${gridWidth}x${gridHeight}, Cell: ${cellWidth}x${cellHeight}`);
        
        // Track grid position
        let currentRow = 0;
        let currentCol = 0;
        let imageIndex = 0;
        
        // Process images with variable widths
        while (imageIndex < imageOptions.length && currentRow < 3) {
            const imageName = imageOptions[imageIndex];
            const isDoubleWidth = doubleWidthImages.includes(imageName);
            const isFullRow = fullRowImages.includes(imageName);
            
            // Handle full-row images (2.5 width, own row)
            if (isFullRow) {
                // If not at start of row, move to next row
                if (currentCol > 0) {
                    currentRow++;
                    currentCol = 0;
                    if (currentRow >= 3) break;
                }
                
                const cellX = gridMarginX + (currentCol * cellWidth);
                const cellY = height - gridMarginY - ((currentRow + 1) * cellHeight);
                
                // Full row width (2.5 cells)
                const actualCellWidth = cellWidth * 2.5;
                
                console.log(`🖼️ Drawing FULL-ROW (2.5x) image ${imageName} at row ${currentRow}`);
                
                // Draw the full-row image
                await drawSingleImage(pdfDoc, page, imageName, cellX, cellY, actualCellWidth, cellHeight, cellPadding, true);
                
                // Move to next row after full-row image
                currentRow++;
                currentCol = 0;
                
            } else if (isDoubleWidth) {
                // Handle double-width images (2x width)
                if (currentCol === 2) {
                    // Move to next row if double-width won't fit
                    currentRow++;
                    currentCol = 0;
                    if (currentRow >= 3) break;
                }
                
                const cellX = gridMarginX + (currentCol * cellWidth);
                const cellY = height - gridMarginY - ((currentRow + 1) * cellHeight);
                const actualCellWidth = cellWidth * 2;
                
                console.log(`🖼️ Drawing DOUBLE-WIDTH (2x) image ${imageName} at row ${currentRow}, col ${currentCol}`);
                
                await drawSingleImage(pdfDoc, page, imageName, cellX, cellY, actualCellWidth, cellHeight, cellPadding, false);
                
                currentCol += 2;
                
            } else {
                // Handle regular width images
                const cellX = gridMarginX + (currentCol * cellWidth);
                const cellY = height - gridMarginY - ((currentRow + 1) * cellHeight);
                
                console.log(`🖼️ Drawing regular image ${imageName} at row ${currentRow}, col ${currentCol}`);
                
                await drawSingleImage(pdfDoc, page, imageName, cellX, cellY, cellWidth, cellHeight, cellPadding, false);
                
                currentCol += 1;
            }
            
            // Move to next row if current row is full
            if (currentCol >= 3) {
                currentRow++;
                currentCol = 0;
            }
            
            imageIndex++;
        }
        
        console.log(`✅ Grid drawn successfully with ${imageIndex} images`);
        
    } catch (error) {
        console.error('❌ Error drawing grid with variable-width images:', error);
        throw error;
    }
}

// Helper function to draw a single image
async function drawSingleImage(pdfDoc, page, imageName, cellX, cellY, actualCellWidth, cellHeight, cellPadding, isFullRow) {
    let imageEmbedded = false;
    
    try {
        const imageUrl = await getCFSSOptionImageUrl(imageName);
        if (imageUrl) {
            console.log(`📥 Fetching image: ${imageName}`);
            
            const imageResponse = await fetch(imageUrl);
            if (imageResponse.ok) {
                const imageArrayBuffer = await imageResponse.arrayBuffer();
                
                let embeddedImage;
                if (imageUrl.toLowerCase().includes('.png')) {
                    embeddedImage = await pdfDoc.embedPng(imageArrayBuffer);
                } else {
                    embeddedImage = await pdfDoc.embedJpg(imageArrayBuffer);
                }
                
                // Calculate image size to fit in allocated space
                const maxImageWidth = actualCellWidth - cellPadding - 6;
                const maxImageHeight = cellHeight - cellPadding - 6;
                
                const originalDims = embeddedImage.size();
                const aspectRatio = originalDims.width / originalDims.height;
                
                let finalWidth = Math.min(maxImageWidth, originalDims.width);
                let finalHeight = finalWidth / aspectRatio;
                
                if (finalHeight > maxImageHeight) {
                    finalHeight = maxImageHeight;
                    finalWidth = finalHeight * aspectRatio;
                }
                
                // Center image in allocated space
                const imageX = cellX + (actualCellWidth - finalWidth) / 2;
                const imageY = cellY + (cellHeight - finalHeight) / 2;
                
                page.drawImage(embeddedImage, {
                    x: imageX,
                    y: imageY,
                    width: finalWidth,
                    height: finalHeight
                });
                
                imageEmbedded = true;
                console.log(`✅ Image ${imageName} embedded successfully`);
            }
        }
    } catch (imageError) {
        console.warn(`⚠️ Could not embed image ${imageName}:`, imageError.message);
    }
    
    // Draw placeholder if image couldn't be embedded
    if (!imageEmbedded) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        // Draw placeholder background
        page.drawRectangle({
            x: cellX + cellPadding + 2,
            y: cellY + cellPadding + 2,
            width: actualCellWidth - cellPadding - 4,
            height: cellHeight - cellPadding - 4,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.9, 0.9, 0.9),
            borderWidth: 1
        });
        
        // Draw option name as text
        const optionDisplayName = imageName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const fontSize = isFullRow ? 14 : 10;
        
        page.drawText(optionDisplayName, {
            x: cellX + actualCellWidth/2 - (optionDisplayName.length * fontSize * 0.3),
            y: cellY + cellHeight/2,
            size: fontSize,
            font: font,
            color: rgb(0.5, 0.5, 0.5)
        });
        
        page.drawText(isFullRow ? '(Detail not available)' : '(Image not available)', {
            x: cellX + actualCellWidth/2 - 40,
            y: cellY + cellHeight/2 - 15,
            size: 8,
            font: font,
            color: rgb(0.7, 0.7, 0.7)
        });
        
        console.log(`📝 Drew placeholder for ${imageName}`);
    }
}

// Global image cache for CFSS options
async function prefetchAllCFSSImages(selectedOptions) {
    console.log(`⚡ Pre-fetching images for ${selectedOptions.length} options...`);
    const startTime = Date.now();
    
    // Build complete list of images needed
    const imageNames = new Set();
    
    // Add all selected option images
    selectedOptions.forEach(option => {
        imageNames.add(option);
    });
    
    // Add text variants for detail options
    selectedOptions.forEach(option => {
        if (option.includes('detail-')) {
            imageNames.add(`${option}-text`);
        }
    });
    
    // Always add identification
    imageNames.add('identification');
    imageNames.add('detail-lisse-basse-text');
    imageNames.add('detail-lisse-trouee-text');
    imageNames.add('detail-double-lisse-text');
    
    const imageNamesArray = Array.from(imageNames);
    console.log(`📦 Need to fetch ${imageNamesArray.length} unique images`);
    
    // Get all signed URLs in one batch
    const urlMap = await getCFSSOptionImageUrlsBatch(imageNamesArray);
    
    // Fetch all images in parallel
    const fetchPromises = imageNamesArray.map(async (imageName) => {
        try {
            const imageUrl = urlMap[imageName];
            if (!imageUrl) {
                console.log(`⚠️ No URL for ${imageName}`);
                return { imageName, bytes: null };
            }
            
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const bytes = await response.arrayBuffer();
            console.log(`✅ Fetched ${imageName}: ${bytes.byteLength} bytes`);
            return { imageName, bytes };
        } catch (error) {
            console.error(`❌ Failed to fetch ${imageName}:`, error.message);
            return { imageName, bytes: null };
        }
    });
    
    const results = await Promise.all(fetchPromises);
    
    // Build cache object
    const cache = {};
    results.forEach(({ imageName, bytes }) => {
        if (bytes) cache[imageName] = bytes;
    });
    
    console.log(`✅ Pre-fetched ${Object.keys(cache).length}/${imageNamesArray.length} images in ${Date.now() - startTime}ms`);
    return cache;
}

async function getCFSSOptionImageUrlsBatch(optionNames) {
    console.log(`🔍 DEBUG: Batch checking ${optionNames.length} option images`);
    console.log(`🔍 [DEBUG] Requested images:`, JSON.stringify(optionNames));
    const startTime = Date.now();
    
    // Step 1: Check all files exist in parallel
    const headChecks = optionNames.map(async (optionName) => {
        const imageKey = `cfss-options/${optionName}.png`;
        try {
            const headCommand = new HeadObjectCommand({
                Bucket: 'protection-sismique-equipment-images',
                Key: imageKey
            });
            await s3Client.send(headCommand);
            console.log(`✅ DEBUG: PNG found for ${optionName}`);
            return { optionName, imageKey, exists: true };
        } catch (error) {
            console.error(`❌ DEBUG: Error for ${optionName}:`, error.name);
            return { optionName, imageKey, exists: false };
        }
    });
    
    const existenceResults = await Promise.all(headChecks);
    
    console.log(`📊 [DEBUG] Existence check results:`, JSON.stringify(existenceResults.map(r => ({ name: r.optionName, exists: r.exists }))));
    const missingFiles = existenceResults.filter(r => !r.exists).map(r => r.optionName);
    if (missingFiles.length > 0) {
        console.error(`❌ [DEBUG] Missing files in S3:`, JSON.stringify(missingFiles));
    }
    
    // Step 2: Generate signed URLs for existing files in parallel
    const urlPromises = existenceResults
        .filter(result => result.exists)
        .map(async ({ optionName, imageKey }) => {
            try {
                const getCmd = new GetObjectCommand({
                    Bucket: 'protection-sismique-equipment-images',
                    Key: imageKey
                });
                const signedUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 3600 });
                console.log(`✅ DEBUG: Signed URL generated for ${optionName}: ${signedUrl.substring(0, 100)}...`);
                return { optionName, url: signedUrl };
            } catch (error) {
                console.error(`❌ DEBUG: URL generation failed for ${optionName}:`, error.message);
                return { optionName, url: null };
            }
        });
    
        const urlResults = await Promise.all(urlPromises);
    
        console.log(`🔗 [DEBUG] URL generation results:`, JSON.stringify(urlResults.map(r => ({ name: r.optionName, hasUrl: !!r.url }))));
        
        // Create lookup map
        const urlMap = {};
    urlResults.forEach(({ optionName, url }) => {
        if (url) urlMap[optionName] = url;
    });
    
    console.log(`✅ DEBUG: Batch processed ${Object.keys(urlMap).length}/${optionNames.length} URLs in ${Date.now() - startTime}ms`);
    console.log(`📦 [DEBUG] Final urlMap keys:`, JSON.stringify(Object.keys(urlMap)));
    return urlMap;
}

// Keep legacy function for backward compatibility, but use batch internally
async function getCFSSOptionImageUrl(optionName) {
    const urlMap = await getCFSSOptionImageUrlsBatch([optionName]);
    return urlMap[optionName] || null;
}

// Updated merge function to include options pages
async function mergeCFSSPDFsWithOptions(coverPdfBytes, optionsPdfBytes, wallDetailsPdfBytes, summaryTablePdfBytes) {
    try {
        const mergedPdf = await PDFDocument.create();
        
        // 1. Add cover page
        const coverPdf = await PDFDocument.load(coverPdfBytes);
        const coverPages = await mergedPdf.copyPages(coverPdf, coverPdf.getPageIndices());
        coverPages.forEach(page => mergedPdf.addPage(page));
        console.log('✅ Cover page added');
        
        // 2. Add options pages if any exist
        if (optionsPdfBytes && optionsPdfBytes.length > 0) {
            const optionsPdf = await PDFDocument.load(optionsPdfBytes);
            const optionsPages = await mergedPdf.copyPages(optionsPdf, optionsPdf.getPageIndices());
            optionsPages.forEach(page => mergedPdf.addPage(page));
            console.log(`✅ ${optionsPages.length} options page(s) added`);
        }
        
        // 3. Add wall detail pages if any exist
        if (wallDetailsPdfBytes && wallDetailsPdfBytes.length > 0) {
            const wallDetailsPdf = await PDFDocument.load(wallDetailsPdfBytes);
            const wallPages = await mergedPdf.copyPages(wallDetailsPdf, wallDetailsPdf.getPageIndices());
            wallPages.forEach(page => mergedPdf.addPage(page));
            console.log('✅ Wall detail pages added');
        }
        
        // 4. Add summary table page
        if (summaryTablePdfBytes && summaryTablePdfBytes.length > 0) {
            const summaryTablePdf = await PDFDocument.load(summaryTablePdfBytes);
            const summaryPages = await mergedPdf.copyPages(summaryTablePdf, summaryTablePdf.getPageIndices());
            summaryPages.forEach(page => mergedPdf.addPage(page));
            console.log('✅ Summary table page added');
        }
        
        // 5. Fill sheet numbers for all pages except cover (page 0)
        try {
            const totalPages = mergedPdf.getPageCount();
            const boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
            
            for (let i = 0; i < totalPages; i++) { // Start from 0 to include cover page
              const page = mergedPdf.getPage(i);
              const { width, height } = page.getSize();
              const pageNumber = i + 1;
              const sheetNumber = `S-${pageNumber}`; // S-1, S-2, S-3, etc.
              
              // Adjust x position based on single vs double digit page numbers
              const xPosition = pageNumber < 10 ? 1188 : 1185;
              
              // Draw text in bottom right
              page.drawText(sheetNumber, {
                x: xPosition,  // 1188 for single digit, 1185 for double digit
                y: 43,         // 35px from bottom
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0),
              });
              
              console.log(`✅ Drew ${sheetNumber} on page ${i} at x=${xPosition}`);
            }
            
            console.log('✅ Sheet numbers drawn on all pages');
          } catch (error) {
            console.warn('⚠️ Could not draw sheet numbers:', error.message);
            // Don't throw - sheet numbers are not critical
          }
        
        return await mergedPdf.save();
        
    } catch (error) {
        console.error('❌ Error merging CFSS PDFs with options:', error);
        throw error;
    }
}

// Fetch template PDF from S3
async function fetchTemplateFromS3(templateType = 'cover', domain = 'electricity') {
    try {
        const templateKeys = {
            // Cover templates by domain
            'cover': {
                'electricity': 'report/electricity-cover.pdf',
                'plumbing': 'report/plumbing-cover.pdf', 
                'sprinkler': 'report/sprinkler-cover.pdf',
                'ventilation': 'report/ventilation-cover.pdf'
            },
            // Equipment page template (same for all domains)
            'equipment': 'report/blank-template.pdf'
        };
        
        let templateKey;
        
        if (templateType === 'cover') {
            // Get domain-specific cover template, fallback to electricity if domain not found
            templateKey = templateKeys.cover[domain.toLowerCase()] || templateKeys.cover['electricity'];
        } else if (templateType === 'equipment') {
            templateKey = templateKeys.equipment;
        } else {
            throw new Error(`Unknown template type: ${templateType}`);
        }
        
        console.log(`📥 Fetching ${templateType} template for ${domain} domain: ${templateKey}`);
        
        const command = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: templateKey
        });
        
        const response = await s3Client.send(command);
        const chunks = [];
        
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        console.log(`✅ ${templateType} template for ${domain} fetched, size: ${buffer.length}`);
        
        return buffer;
        
    } catch (error) {
        console.error(`❌ Error fetching ${templateType} template for ${domain}:`, error);
        throw new Error(`Failed to fetch ${templateType} PDF template for ${domain} domain`);
    }
}

// Updated sanitizeText function to handle number rounding (max 5 decimals)
function sanitizeText(text) {
    if (!text) return '';
    
    // Convert to string first
    const textStr = String(text);
    
    // Check if the ENTIRE text is ONLY a number (not just starts with a number)
    // This prevents addresses like "1768 Gage Crescent" from being treated as numbers
    const trimmedText = textStr.trim();
    const numValue = parseFloat(trimmedText);
    
    // Only treat as number if:
    // 1. It parses to a valid number
    // 2. The entire trimmed string equals the parsed number when converted back to string
    // 3. OR the trimmed string matches common number formats (decimals, negatives)
    const isOnlyNumber = !isNaN(numValue) && 
                        isFinite(numValue) && 
                        (trimmedText === numValue.toString() || 
                         trimmedText === numValue.toFixed(0) ||
                         /^-?\d+\.?\d*$/.test(trimmedText));
    
    if (isOnlyNumber) {
        // Only treat as number if the entire string is exactly a number
        return parseFloat(numValue.toFixed(5)).toString();
    }
    
    // For non-numeric text (including addresses), apply existing sanitization

    // return textStr
    //     .replace(/[^\x00-\x7F]/g, '?') // Replace non-ASCII with ?
    //     .substring(0, 200); // Increased limit for addresses

    return textStr
        .trim()
        .substring(0, 200);
}

// Updated fillCoverPageTemplate function with form flattening logic
async function fillCoverPageTemplate(templateBuffer, project, userInfo) {
    try {
        const pdfDoc = await PDFDocument.load(templateBuffer);
        const form = pdfDoc.getForm();
        
        // Build project address string
        const projectAddress = [
            project.addressLine1,
            project.addressLine2,
            project.city,
            project.province,
            project.country
        ].filter(Boolean).join(', ');
        
        // Get current date
        const today = new Date();
        const currentDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear().toString().slice(-2)}`;
        
        // Field mappings
        const fieldMappings = {
            'clientName': project.clientName || '',
            'projectTitle': project.name || '',
            'projectAddress': projectAddress,
            'contractNumber': sanitizeText(project.projectNumber) || '',
            'revision': '',
            'registerDate': currentDate,
            'preparedBy': sanitizeText(project.designedBy) || 'Dat Bui Tuan',
            'approvedBy': sanitizeText(project.approvedBy) || 'Minh Duc Hoang, ing',
            'projectRiskSD1': project.RiskS_D1 || '',
            'projectRiskSDS': project.RiskS_DS || '',
            'projectSD1': project.S_D1?.toFixed(5) || '',
            'projectSM1': project.S_M1?.toFixed(5) || '',
            'projectSDS': project.S_DS?.toFixed(5) || '',
            'projectSMS': project.S_MS?.toFixed(5) || '',
            'projectF10': project.F10?.toString() || '',
            'projectF02': project.F02?.toString() || '',
            'projectPGAref': project.PGAref?.toFixed(4) || '',
            'projectMaxPGA': project.maxPGA?.toFixed(3) || '',
            'projectMaxSa10': project.maxSa1_0?.toFixed(3) || '',
            'projectMaxSa02': project.maxSa0_2?.toFixed(3) || '',
            'projectFinalRiskCategory': project.FinalRiskCategory || '',
            'projectRiskCategory': project.riskCategory || '',
            'projectDomain': project.domain || '',
            'projectType': project.type || '',
            'projectStatus': project.status || ''
        };

        // Fill all field names that match
        const fields = form.getFields();
        fields.forEach(field => {
            const fieldName = field.getName();
            
            Object.entries(fieldMappings).forEach(([suffix, value]) => {
                if (fieldName.endsWith(suffix)) {
                    try {
                        if (field.constructor.name === 'PDFTextField') {
                            field.setText(String(value));
                            console.log(`Filled ${fieldName}: ${value}`);
                        }
                    } catch (error) {
                        console.warn(`Could not fill field ${fieldName}: ${error.message}`);
                    }
                }
            });
        });

        try {
            await updateFieldAppearancesWithUnicodeFont(pdfDoc, form);
            await applyProjectAddressCondensedStyle(pdfDoc);

        } catch (error) {
            console.warn('Could not update form appearances:', error.message);
        }

        // ✅ NEW: Flatten cover page for non-admin users BEFORE returning
        if (!userInfo.isAdmin) {
            console.log('🔒 Flattening cover page form fields for non-admin user...');
            try {
                form.flatten();
                console.log('✅ Cover page form fields flattened successfully');
            } catch (error) {
                console.warn('Could not flatten cover page form fields:', error.message);
            }
        }
        
        const filledPdfBytes = await pdfDoc.save();
        console.log('Template filled successfully, size:', filledPdfBytes.length);
        
        return filledPdfBytes;
        
    } catch (error) {
        console.error('Error filling template fields:', error);
        throw new Error(`Failed to fill template form fields: ${error.message}`);
    }
}

// Merge template and equipment report PDFs
async function mergeAllPDFs(coverPageBytes, equipmentInventoryBytes, equipmentDetailPagesBytes) {
    try {
        // Create new PDF document for final output
        const mergedPdf = await PDFDocument.create();
        
        // 1. Add cover page
        console.log('🔗 Adding cover page...');
        const coverPdf = await PDFDocument.load(coverPageBytes);
        const coverPages = await mergedPdf.copyPages(coverPdf, coverPdf.getPageIndices());
        coverPages.forEach(page => mergedPdf.addPage(page));
        
        // 2. Skip equipment inventory pages (commented out)
        // console.log('🔗 Adding equipment inventory pages...');
        // const inventoryPdf = await PDFDocument.load(equipmentInventoryBytes);
        // const inventoryPages = await mergedPdf.copyPages(inventoryPdf, inventoryPdf.getPageIndices());
        // inventoryPages.forEach(page => mergedPdf.addPage(page));
        
        // 3. Add equipment detail pages (if any)
        if (equipmentDetailPagesBytes && equipmentDetailPagesBytes.length > 0) {
            console.log('🔗 Adding equipment detail pages...');
            const detailPdf = await PDFDocument.load(equipmentDetailPagesBytes);
            const detailPages = await mergedPdf.copyPages(detailPdf, detailPdf.getPageIndices());
            detailPages.forEach(page => mergedPdf.addPage(page));
        }
        
        // Save final merged PDF
        const finalPdfBytes = await mergedPdf.save();
        console.log('✅ PDFs merged successfully, final size:', finalPdfBytes.length);
        
        return finalPdfBytes;
        
    } catch (error) {
        console.error('❌ Error merging PDFs:', error);
        throw new Error('Failed to merge PDF documents');
    }
}

// Table configuration system for equipment detail pages
const EQUIPMENT_TABLE_CONFIGURATIONS = {
    // Format: "installMethod_anchorType"
    "1_expansion": { // Fixed to Slab + Expansion
        installationText: "Fixed to concrete slab",
        sectionTitle: "1 - ANCHORING",
        fields: [
            { label: "Installation Method", dataPath: "installationMethod", isInstallationMethod: true },
            { label: "1 - ANCHORING", dataPath: "", isSectionHeader: true },
            { label: "Anchor type", dataPath: "anchorTypeDisplay" },
            { label: "Total number of anchors", dataPath: "numberOfAnchors" },
            { label: "Diameter (in)", dataPath: "anchorDiameter" },
            { label: "Min. embedment (in)", dataPath: "minEmbedment" },
            { label: "Min. spacing between anchors (in)", dataPath: "minSpacing" },
            { label: "Min. distance between anchor and slab edge", dataPath: "minEdgeDistance" },
            { label: "Min. slab thickness (in)", dataPath: "slabThickness" }
        ]
    },
    "2_expansion": { // Fixed to Wall + Expansion  
        installationText: "Fixed to concrete block wall",
        sectionTitle: "1 - ANCHORING",
        fields: [
            { label: "Installation Method", dataPath: "installationMethod", isInstallationMethod: true },
            { label: "1 - ANCHORING", dataPath: "", isSectionHeader: true },
            { label: "Anchor type", dataPath: "anchorTypeDisplay" },
            { label: "Total number of anchors", dataPath: "numberOfAnchors" },
            { label: "Diameter (in)", dataPath: "anchorDiameter" },
            { label: "Min. embedment (in)", dataPath: "minEmbedment" },
            { label: "Min. spacing between anchors (in)", dataPath: "minSpacing" },
            { label: "Min. distance between anchor and slab edge", dataPath: "minEdgeDistance" },
            { label: "Min. slab thickness (in)", dataPath: "slabThickness" }
        ]
    },
    "3_expansion": { // Fixed to Structure + Expansion
        installationText: "Fixed to structural steel",
        sectionTitle: "1 - ANCHORING", 
        fields: [
            { label: "Installation Method", dataPath: "installationMethod", isInstallationMethod: true },
            { label: "1 - ANCHORING", dataPath: "", isSectionHeader: true },
            { label: "Anchor type", dataPath: "anchorTypeDisplay" },
            { label: "Total number of anchors", dataPath: "numberOfAnchors" },
            { label: "Diameter (in)", dataPath: "anchorDiameter" },
            { label: "Min. embedment (in)", dataPath: "minEmbedment" },
            { label: "Min. spacing between anchors (in)", dataPath: "minSpacing" },
            { label: "Min. distance between anchor and slab edge", dataPath: "minEdgeDistance" }
        ]
    },
    "4_expansion": { // Fixed to Ceiling + Expansion
        installationText: "Fixed to concrete ceiling",
        sectionTitle: "1 - ANCHORING",
        fields: [
            { label: "Installation Method", dataPath: "installationMethod", isInstallationMethod: true },
            { label: "1 - ANCHORING", dataPath: "", isSectionHeader: true },
            { label: "Anchor type", dataPath: "anchorTypeDisplay" },
            { label: "Total number of anchors", dataPath: "numberOfAnchors" },
            { label: "Diameter (in)", dataPath: "anchorDiameter" },
            { label: "Min. embedment (in)", dataPath: "minEmbedment" },
            { label: "Min. spacing between anchors (in)", dataPath: "minSpacing" },
            { label: "Min. distance between anchor and slab edge", dataPath: "minEdgeDistance" },
            { label: "Min. slab thickness (in)", dataPath: "slabThickness" }
        ]
    },
    "5_screw": { // Fixed to Roof + Lag Bolts
        installationText: "Fixed to roof base", 
        sectionTitle: "1 - LAG BOLTS",
        fields: [
            { label: "Installation Method", dataPath: "installationMethod", isInstallationMethod: true },
            { label: "1 - LAG BOLTS", dataPath: "", isSectionHeader: true },
            { label: "Anchor type", dataPath: "anchorTypeDisplay" },
            { label: "Total number of anchors", dataPath: "numberOfAnchors" },
            { label: "Diameter (in)", dataPath: "anchorDiameter" },
            { label: "Min. embedment (in)", dataPath: "minEmbedment" },
            { label: "Min. spacing between anchors (in)", dataPath: "minSpacing" },
            { label: "Min. distance between anchor and slab edge", dataPath: "minEdgeDistance" },
            { label: "Min. slab thickness (in)", dataPath: "slabThickness" }
        ]
    },
    // Fallback configuration
    "default": {
        installationText: "Installation method details",
        sectionTitle: "1 - ANCHORING",
        fields: [
            { label: "Installation Method", dataPath: "installationMethod", isInstallationMethod: true },
            { label: "1 - ANCHORING", dataPath: "", isSectionHeader: true },
            { label: "Anchor type", dataPath: "anchorTypeDisplay" },
            { label: "Total number of anchors", dataPath: "numberOfAnchors" },
            { label: "Diameter (in)", dataPath: "anchorDiameter" },
            { label: "Min. embedment (in)", dataPath: "minEmbedment" }
        ]
    }
};

// Generate individual equipment detail pages
// Optimized equipment page generation with parallel processing
async function generateIndividualEquipmentPages(project, userInfo, coverPageCount) {
    try {
        const equipment = project.equipment || [];
        if (equipment.length === 0) {
            console.log('⚠️ No equipment found, skipping detail pages');
            const emptyPdf = await PDFDocument.create();
            return await emptyPdf.save();
        }
        
        console.log(`🔧 Creating ${equipment.length} equipment detail pages (optimized)...`);
        
        // OPTIMIZATION 1: Fetch template once and reuse
        console.log('📥 Fetching equipment page template...');
        const equipmentTemplateBuffer = await fetchTemplateFromS3('equipment');
        console.log('✅ Equipment template fetched, size:', equipmentTemplateBuffer.length);
        
        // OPTIMIZATION 2: Pre-calculate all equipment data
        console.log('📊 Pre-calculating equipment data...');
        const equipmentDataArray = equipment.map((equipmentItem, index) => ({
            ...equipmentItem,
            pageNumber: coverPageCount + index,
            tableConfig: getTableConfiguration(equipmentItem),
            tableData: getEquipmentTableData(equipmentItem, project)
        }));
        console.log('✅ Equipment data pre-calculated');
        
        // OPTIMIZATION 3: Process in parallel batches to balance speed vs memory
        const batchSize = 3; // Process 3 pages simultaneously
        const equipmentPdf = await PDFDocument.create();
        
        for (let i = 0; i < equipmentDataArray.length; i += batchSize) {
            const batch = equipmentDataArray.slice(i, i + batchSize);
            console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(equipmentDataArray.length/batchSize)} (${batch.length} pages)`);
            
            // Process batch in parallel
            const batchPromises = batch.map(equipmentData => 
                fillEquipmentTemplateOptimized(equipmentTemplateBuffer, equipmentData, project, userInfo)
            );
            
            const batchResults = await Promise.all(batchPromises);
            
            // Add all batch results to main PDF
            for (const filledPagePdf of batchResults) {
                const filledPdfDoc = await PDFDocument.load(filledPagePdf);
                const [copiedPage] = await equipmentPdf.copyPages(filledPdfDoc, [0]);
                equipmentPdf.addPage(copiedPage);
            }
            
            console.log(`✅ Batch ${Math.floor(i/batchSize) + 1} completed`);
        }
        
        const equipmentPagesBytes = await equipmentPdf.save();
        console.log('✅ Equipment detail pages created successfully, size:', equipmentPagesBytes.length);
        
        return equipmentPagesBytes;
        
    } catch (error) {
        console.error('❌ Error generating individual equipment pages:', error);
        throw new Error(`Failed to generate equipment detail pages: ${error.message}`);
    }
}

// Updated fillEquipmentTemplate function with flattening logic
async function fillEquipmentTemplateOptimized(templateBuffer, equipmentData, project, userInfo) {
    try {
        // Load fresh template for this equipment
        const pdfDoc = await PDFDocument.load(templateBuffer);
        const form = pdfDoc.getForm();
        
        // Build project address string (pre-calculated if needed)
        const projectAddress = [
            project.addressLine1,
            project.addressLine2,
            project.city,
            project.province,
            project.country
        ].filter(Boolean).join(', ');
        
        // Get current date in MM/DD/YY format
        const today = new Date();
        const currentDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear().toString().slice(-2)}`;
        
        // Format weight with units for header display
        let weightValueWithUnit = '';
        if (equipmentData.weight) {
            const weightValue = parseFloat(equipmentData.weight);
            const weightUnit = equipmentData.weightUnit || 'kg';
            
            if (weightUnit === 'lbs') {
                weightValueWithUnit = `${weightValue} lbs`;
            } else {
                const weightLbs = (weightValue * 2.20462).toFixed(1);
                weightValueWithUnit = `${weightLbs} lbs`;
            }
        }
        
        // Equipment-specific field mappings (same as before)
        const equipmentFieldMappings = {
            'clientName': project.clientName || '',
            'projectTitle': project.name || '',
            'preparedBy': 'Dat Bui Tuan',
            'revision': '',
            'projectAddress': projectAddress,
            'contractNumber': sanitizeText(project.projectNumber) || '',
            'registerDate': currentDate,
            'unitName': equipmentData.equipment || equipmentData.equipmentType || '',
            'modelName': sanitizeText(equipmentData.model) || '',
            'tagValue': sanitizeText(equipmentData.tag) || '',
            'weightValue': weightValueWithUnit,
            'pageNumber': equipmentData.pageNumber.toString()
        };

        // Fill form fields efficiently
        const fields = form.getFields();
        fields.forEach(field => {
            const fieldName = field.getName();
            
            Object.entries(equipmentFieldMappings).forEach(([suffix, value]) => {
                if (fieldName.endsWith(suffix)) {
                    try {
                        if (field.constructor.name === 'PDFTextField') {
                            field.setText(String(value));
                        }
                    } catch (error) {
                        console.warn(`⚠️ Could not fill equipment field ${fieldName}: ${error.message}`);
                    }
                }
            });
        });

        try {
            await updateFieldAppearancesWithUnicodeFont(pdfDoc, form);
            await applyProjectAddressCondensedStyle(pdfDoc);
        } catch (error) {
            console.warn('⚠️ Could not update form appearances:', error.message);
        }

        // NEW: Flatten form fields for non-admin users
        if (!userInfo.isAdmin) {
            console.log('🔒 Flattening equipment form fields for non-admin user...');
            try {
                form.flatten();
                console.log('✅ Equipment form fields flattened successfully');
            } catch (error) {
                console.warn('Could not flatten equipment form fields:', error.message);
                // Continue without flattening if it fails
            }
        }
        
        // Generate and embed the equipment page content
        await embedEquipmentPageContent(pdfDoc, equipmentData, project, equipmentData.tableConfig, equipmentData.tableData);
        
        // Save and return the filled PDF
        const filledPdfBytes = await pdfDoc.save();
        
        return filledPdfBytes;
        
    } catch (error) {
        console.error('❌ Error filling equipment template:', error);
        throw new Error(`Failed to fill equipment template: ${error.message}`);
    }
}

// Get table configuration based on equipment installation method and anchor type
function getTableConfiguration(equipment) {
    const installMethod = equipment.installMethod || '1';
    const anchorType = equipment.anchorType || 'expansion';
    
    const configKey = `${installMethod}_${anchorType}`;
    
    console.log(`🔍 Looking for table config: ${configKey}`);
    
    // Return specific configuration if found, otherwise use default
    const config = EQUIPMENT_TABLE_CONFIGURATIONS[configKey] || EQUIPMENT_TABLE_CONFIGURATIONS['default'];
    
    console.log(`📋 Using table config: ${config.sectionTitle}`);
    return config;
}

// Updated getEquipmentTableData function with number rounding
function getEquipmentTableData(equipment, project) {
    try {
        // Helper function to format numbers to 5 decimal places
        const formatNumber = (value) => {
            if (value === null || value === undefined || value === '') return '';
            const numValue = parseFloat(value);
            if (isNaN(numValue) || !isFinite(numValue)) return '';
            return parseFloat(numValue.toFixed(5)).toString();
        };
        
        // Get anchor type display text
        const anchorTypeMap = {
            'expansion': 'HILTI KWIK BOLT TZ',
            'screw': 'LAG BOLTS'
        };
        
        const anchorTypeDisplay = anchorTypeMap[equipment.anchorType] || equipment.anchorType || '';
        
        // Get installation method text
        const installMethodMap = {
            '1': 'Fixed to concrete slab',
            '2': 'Fixed to concrete block wall', 
            '3': 'Fixed to structural steel',
            '4': 'Fixed to concrete ceiling',
            '5': 'Fixed to roof base'
        };
        
        const installationMethod = installMethodMap[equipment.installMethod] || 'Unknown installation method';
        
        // Use minimum embedment - prioritize frontend calculation with 5 decimal precision
        let minEmbedment = '';
        if (!equipment.isPipe) {
            if (equipment.calculatedMinEmbedment && equipment.calculatedMinEmbedment !== 'N/A') {
                // If it's already a string with units, use as is, otherwise format the number
                if (typeof equipment.calculatedMinEmbedment === 'string' && equipment.calculatedMinEmbedment.includes('"')) {
                    minEmbedment = equipment.calculatedMinEmbedment;
                } else {
                    minEmbedment = formatNumber(equipment.calculatedMinEmbedment) + '"';
                }
            } else {
                minEmbedment = 'TBD'; // To Be Determined if no calculation available
            }
        }
        
        console.log(`Using embedment for ${equipment.equipment}: ${minEmbedment}`);
        console.log(`Equipment data received:`, JSON.stringify({
            calculatedMinEmbedment: equipment.calculatedMinEmbedment,
            anchorDiameter: equipment.anchorDiameter,
            anchorType: equipment.anchorType
        }));
        
        return {
            installationMethod,
            anchorTypeDisplay,
            numberOfAnchors: formatNumber(equipment.numberOfAnchors) || '',
            anchorDiameter: formatNumber(equipment.anchorDiameter) || '',
            minEmbedment,
            minSpacing: formatNumber(equipment.minSpacing) || '', 
            minEdgeDistance: formatNumber(equipment.minEdgeDistance) || '', 
            slabThickness: formatNumber(equipment.slabThickness) || ''
        };
        
    } catch (error) {
        console.error('Error getting equipment table data:', error);
        return {}; // Return empty object as fallback
    }
}


// Embed equipment page content (table without image for now) into PDF
async function embedEquipmentPageContent(pdfDoc, equipment, project, tableConfig, tableData) {
    try {
        // Define equipmentMappings locally
        const equipmentMappings = {
            'electricity': {
                domainCode: 'El',
                equipmentMap: {
                    'Generator': 'GE', 'Panel': 'PA', 'Transformer': 'TRA', 'UPS': 'UPS', 'Controller': 'CN', 'Battery': 'BA', 'Pipe': 'Pipe'
                } 
            },
            'ventilation': {
                domainCode: 'Ve',
                equipmentMap: {
                    'Fan_1': 'F1', 'Fan_2': 'F2', 'VU_1': 'VU1', 'VU_2': 'VU2', 'VU_3': 'VU3', 'AHU_1': 'AHU1', 'Pipe': 'Pipe'
                }
            },
            'plumbing': {
                domainCode: 'Pl',
                equipmentMap: {
                    'HUM_1': 'HUM1', 'RF_1': 'RF1', 'TE_1': 'TE1', 'CE_1': 'CE1', 'CE_2': 'CE2', 'P_1': 'P1', 'Pipe': 'Pipe'
                }
            }
        };

        // Get the first page
        const pages = pdfDoc.getPages();
        const page = pages[0];
        
        // Get page dimensions
        const { width, height } = page.getSize();
        
        // Define content area with static table positioning
        const contentStartY = height - 120; // Start position for image
        const leftMargin = 50;
        const rightMargin = width - 50;
        const contentWidth = rightMargin - leftMargin;
        const columnSeparator = leftMargin + contentWidth * 0.6;

        // Calculate static table position (20 points above footer)
        const footerMargin = 70; // Assume footer is 70 points from bottom
        const estimatedtableHeight = tableConfig.fields.length * 20; // 20 points per row
        const staticTableY = footerMargin + 40 + estimatedtableHeight; // 40 points above footer + table height

        // Calculate available space for image
        const imageAreaTop = contentStartY;
        const imageAreaBottom = staticTableY + 30; // 30 points padding above table
        const availableImageHeight = imageAreaTop - imageAreaBottom;
        
        let currentY = contentStartY;
        
        // 1. Embed equipment image with JPG/PNG fallback
        let imageHeight = 0;
        try {
            const imageUrl = await getWorkingImageUrl(equipment, project, equipmentMappings);
            if (imageUrl) {
                console.log(`Using image: ${imageUrl}`);
                const imageResponse = await fetch(imageUrl);
                if (imageResponse.ok) {
                    const imageArrayBuffer = await imageResponse.arrayBuffer();
                    
                    let embeddedImage;
                    if (imageUrl.toLowerCase().endsWith('.png')) {
                        embeddedImage = await pdfDoc.embedPng(imageArrayBuffer);
                    } else {
                        embeddedImage = await pdfDoc.embedJpg(imageArrayBuffer);
                    }
                    
                    // Calculate table height first to reserve space
                    const tableSpaceNeeded = tableConfig.fields.length * 20 + 40; // table + padding
                    const availableImageHeight = (contentStartY - 120 - tableSpaceNeeded); // reserve 120 for bottom margin
                    const maxImageWidth = contentWidth * 0.98;
                    const maxImageHeight = Math.max(130, availableImageHeight - 15); // Reserve 15 points padding
                    
                    
                    const originalDims = embeddedImage.size();
                    const aspectRatio = originalDims.width / originalDims.height;
                    
                    let finalWidth, finalHeight;
                    
                    // Scale to fit within available space while maintaining aspect ratio
                    if (originalDims.width > maxImageWidth) {
                        finalWidth = maxImageWidth;
                        finalHeight = finalWidth / aspectRatio;
                    } else {
                        finalWidth = originalDims.width;
                        finalHeight = originalDims.height;
                    }

                    if (finalHeight > maxImageHeight) {
                        finalHeight = maxImageHeight;
                        finalWidth = finalHeight * aspectRatio;
                    }
                    
                    // Ensure we don't go below minimum table space
                    const minTableSpace = 150;
                    if (currentY - finalHeight < minTableSpace) {
                        finalHeight = Math.max(130, currentY - minTableSpace); // Minimum 130px image
                        finalWidth = finalHeight * aspectRatio;
                    }
                    // Center the image in available space
                    const imageX = leftMargin + (contentWidth - finalWidth) / 2;
                    const imageY = imageAreaBottom + (availableImageHeight - finalHeight) / 2;
                    
                    page.drawImage(embeddedImage, {
                        x: imageX,
                        y: imageY,
                        width: finalWidth,
                        height: finalHeight
                    });
                    
                    imageHeight = finalHeight;
                    console.log('✅ Equipment image embedded successfully');
                } else {
                    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
                }
            } else {
                throw new Error('No image found in either JPG or PNG format');
            }
        } catch (imageError) {
            console.log('⚠️ Could not embed image:', imageError.message);
            page.drawText('[Image not available]', {
                x: leftMargin + (contentWidth - 100) / 2,
                y: currentY - 15,
                size: 10,
                color: rgb(0.5, 0.5, 0.5)
            });
            imageHeight = 20;
        }
        
        // Move currentY down by image height plus padding
        currentY -= (imageHeight + 50); // 30 points padding between image and table
        
        // 2. Draw the table starting from new currentY position
        const rowHeight = 20;
        let tableY = staticTableY;
        const actualTableHeight = tableConfig.fields.length * rowHeight;
        const tableTop = tableY;
        const tableBottom = tableY - actualTableHeight + 2;
        
        tableConfig.fields.forEach((field, index) => {
            const y = tableY - (index * rowHeight);
            
            if (field.isSectionHeader) {
                page.drawRectangle({
                    x: leftMargin,
                    y: y - rowHeight + 2,
                    width: contentWidth,
                    height: rowHeight - 2,
                    color: rgb(0.8, 0.8, 0.8)
                });
                
                page.drawText(field.label, {
                    x: leftMargin + contentWidth / 2 - (field.label.length * 3),
                    y: y - 15,
                    size: 10,
                    color: rgb(0, 0, 0)
                });
            } else {
                const isEvenRow = index % 2 === 0;
                if (isEvenRow && !field.isSectionHeader) {
                    page.drawRectangle({
                        x: leftMargin,
                        y: y - rowHeight + 2,
                        width: contentWidth,
                        height: rowHeight - 2,
                        color: rgb(0.98, 0.98, 0.98)
                    });
                }
                
                page.drawText(field.label, {
                    x: leftMargin + 5,
                    y: y - 15,
                    size: 9,
                    color: rgb(0, 0, 0)
                });
                
                const value = tableData[field.dataPath] || '';
                if (value) {
                    page.drawText(String(value), {
                        x: columnSeparator + 5,
                        y: y - 15,
                        size: 9,
                        color: rgb(0, 0, 0)
                    });
                }
            }
            
            page.drawLine({
                start: { x: leftMargin, y: y - rowHeight + 2 },
                end: { x: rightMargin, y: y - rowHeight + 2 },
                thickness: 0.5,
                color: rgb(0.7, 0.7, 0.7)
            });
        });
        
        // Draw table borders
        page.drawRectangle({
            x: leftMargin,
            y: tableBottom,
            width: contentWidth,
            height: actualTableHeight - 2,
            borderColor: rgb(0.5, 0.5, 0.5),
            borderWidth: 1
        });
        
        page.drawLine({
            start: { x: columnSeparator, y: tableTop },
            end: { x: columnSeparator, y: tableBottom },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7)
        });
        
        console.log('✅ Equipment page content embedded successfully');
        
    } catch (error) {
        console.error('❌ Error embedding equipment page content:', error);
    }
}

async function getProjects(id, userInfo) {
    console.log('📋 Getting projects for user:', userInfo.email, 'ID:', id);
    
    if (id) {
        const params = {
            TableName: TABLE_NAME,
            Key: { id }
        };
        const result = await dynamodb.get(params);
        
        if (!result.Item) {
            return [];
        }

        // Access control: non-admins can only access their own or assigned projects
        if (!userInfo.isAdmin && !canAccessProject(result.Item, userInfo.email)) {
            console.log(`🚫 Access denied: ${userInfo.email} tried to access project owned by ${result.Item.createdBy}`);
            return [];
        }

        // Access control: non-admins must never access admin copies (submitted-to-admin duplicates)
        if (!userInfo.isAdmin && (result.Item.isAdminCopy === true || result.Item.linkedLimitedProjectId)) {
            console.log(`🚫 Access denied: ${userInfo.email} tried to access admin copy project ${id}`);
            return [];
        }

        return [result.Item];
    } else {
        const params = { TableName: TABLE_NAME };
        const data = await dynamodb.scan(params);
        
        if (userInfo.isAdmin) {
            console.log(`🔑 Admin ${userInfo.email} accessing all ${data.Items?.length || 0} projects`);
            return data.Items || [];
        } else {
            // Non-admins: only their own or assigned projects, and never admin copies
            const userProjects = (data.Items || []).filter(project =>
                canAccessProject(project, userInfo.email) &&
                project.isAdminCopy !== true &&
                !project.linkedLimitedProjectId
            );
            console.log(`👤 User ${userInfo.email} accessing ${userProjects.length} of ${data.Items?.length || 0} projects`);
            return userProjects;
        }
    }
}

async function createProject(project, userInfo) {
    console.log('🚀 Starting project creation...');
    
    // Check if this is a CFSS project (no domain field)
    const isCFSSProject = !project.domain;
    
    if (isCFSSProject) {
        // CFSS Project - no seismic calculations needed
        console.log('📋 Creating CFSS project (no seismic calculations)...');
        
        const projectData = {
            id: Date.now().toString(),
            name: project.name,
            companyName: project.companyName || '',
            projectNumber: project.projectNumber,
            clientName: project.clientName || '',
            clientEmails: project.clientEmails,
            description: project.description,
            status: project.status || 'Planning',
            type: project.type,
            // No domain field for CFSS projects
            addressLine1: project.addressLine1,
            addressLine2: project.addressLine2 || '',
            city: project.city,
            province: project.province,
            country: project.country || 'Canada',
            deflectionMax: project.deflectionMax || '',
            thicknessMin: project.thicknessMin || '',

            // CFSS data payload (persist what the frontend sends)
            equipment: Array.isArray(project.equipment) ? project.equipment : [],
            windows: Array.isArray(project.windows) ? project.windows : [],
            parapets: Array.isArray(project.parapets) ? project.parapets : [],
            soffites: Array.isArray(project.soffites) ? project.soffites : [],
            rooms: Array.isArray(project.rooms) ? project.rooms : [],
            floors: Array.isArray(project.floors) ? project.floors : [],
            customPages: Array.isArray(project.customPages) ? project.customPages : [],
            files: Array.isArray(project.files) ? project.files : [],
            options: Array.isArray(project.options) ? project.options : [],
            selectedCFSSOptions: Array.isArray(project.selectedCFSSOptions) ? project.selectedCFSSOptions : [],

            // Duplication workflow metadata
            isLimitedProject: project.isLimitedProject === true,
            isAdminCopy: project.isAdminCopy === true,
            linkedLimitedProjectId: project.linkedLimitedProjectId || undefined,
            linkedRegularProjectId: project.linkedRegularProjectId || undefined,
            convertedAt: project.convertedAt || undefined,
            convertedFrom: project.convertedFrom || undefined,
            firstSubmittedAt: project.firstSubmittedAt || undefined,
            lastSubmittedAt: project.lastSubmittedAt || undefined,

            // User information from trusted frontend headers
            createdBy: userInfo.email,
            createdByUserId: userInfo.userId,
            createdByName: `${userInfo.firstName} ${userInfo.lastName}`,
            createdByCompany: userInfo.companyName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const params = {
            TableName: TABLE_NAME,
            Item: projectData,
        };
        
        await dynamodb.put(params);
        console.log(`✅ CFSS Project created successfully by ${userInfo.email}:`, projectData.id);
        return projectData;
    }
    
    // Seismic Project - perform earthquake calculations (existing code)
    console.log('🌍 Creating seismic project with earthquake calculations...');
    
    // Fetch earthquake data based on latitude and longitude using Puppeteer
    const earthquakeData = await fetchEarthquakeData(project.latitude, project.longitude);

    // Calculate PGAref
    const maxSa0_2 = earthquakeData.maxSa0_2;
    const maxPGA = earthquakeData.maxPGA;
    const PGAref = (maxSa0_2 / maxPGA) < 2.0 ? 0.8 * maxPGA : 1

    // Get F(1.0) and F(0.2) values for category E
    const { F10, F02 } = getFValues(PGAref);

    // Calculate S_MS, S_DS, S_M1, and S_D1
    const S_MS = F02 * maxSa0_2;
    const S_DS = (2 / 3) * S_MS;
    const S_M1 = F10 * earthquakeData.maxSa1_0;
    const S_D1 = (2 / 3) * S_M1;

    // Determine Risk Category based on other criteria (if applicable)
    const riskCategory = project.riskCategory;

    // Determine RiskS_DS and RiskS_D1 based on S_DS, S_D1, and risk category
    const RiskS_DS = determineRiskS_DS(S_DS, riskCategory);
    const RiskS_D1 = determineRiskS_D1(S_D1, riskCategory);

    // Determine FinalRiskCategory by taking the worse of RiskS_DS and RiskS_D1
    const FinalRiskCategory = getFinalRiskCategory(RiskS_DS, RiskS_D1);

    const projectData = {
        id: Date.now().toString(),
        name: project.name,
        projectNumber: project.projectNumber,
        clientName: project.clientName || '',
        clientEmails: project.clientEmails,
        description: project.description,
        status: project.status || 'Planning',
        type: project.type,
        domain: project.domain,
        riskCategory: project.riskCategory,
        RiskS_DS,
        RiskS_D1,
        FinalRiskCategory,
        addressLine1: project.addressLine1,
        addressLine2: project.addressLine2 || '',
        city: project.city,
        province: project.province,
        country: project.country || 'Canada',
        latitude: project.latitude,
        longitude: project.longitude,
        maxSa0_2,
        maxSa1_0: earthquakeData.maxSa1_0,
        maxPGA,
        PGAref,
        F10,
        F02,
        S_MS,
        S_DS,
        S_M1,
        S_D1,
        equipment: [],
        numberOfFloors: project.numberOfFloors || null,
        // User information from trusted frontend headers
        createdBy: userInfo.email,
        createdByUserId: userInfo.userId,
        createdByName: `${userInfo.firstName} ${userInfo.lastName}`,
        createdByCompany: userInfo.companyName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const params = {
        TableName: TABLE_NAME,
        Item: projectData,
    };
    
    await dynamodb.put(params);
    console.log(`✅ Seismic Project created successfully by ${userInfo.email}:`, projectData.id);
    return projectData;
}

async function updateProject(id, project, userInfo) {
    // Check if project exists and user has access
    const getParams = {
        TableName: TABLE_NAME,
        Key: { id }
    };
    const existingProject = await dynamodb.get(getParams);
    
    if (!existingProject.Item) {
        throw new Error('Project not found');
    }
    
    // Access control: admins can update any project, users only their own or assigned
    if (!userInfo.isAdmin && !canAccessProject(existingProject.Item, userInfo.email)) {
        throw new Error(`Access denied: You can only update your own projects`);
    }

    // Build update expression dynamically based on what fields are provided
    let updateExpression = 'set #updatedAt = :updatedAt, #updatedBy = :updatedBy';
    let expressionAttributeNames = {
        '#updatedAt': 'updatedAt',
        '#updatedBy': 'updatedBy'
    };
    let expressionAttributeValues = {
        ':updatedAt': new Date().toISOString(),
        ':updatedBy': userInfo.email
    };

    // FIXED: More explicit condition for status
    if (project.status !== undefined && project.status !== null && project.status !== '') {
        updateExpression += ', #status = :status';
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = project.status;
        console.log('Adding status update:', project.status);
    }

    // Update project name
if (project.name !== undefined && project.name !== null && project.name !== '') {
    updateExpression += ', #name = :name';
    expressionAttributeNames['#name'] = 'name';
    expressionAttributeValues[':name'] = project.name;
    console.log('Adding name update:', project.name);
}

// Update project number
if (project.projectNumber !== undefined && project.projectNumber !== null && project.projectNumber !== '') {
    updateExpression += ', projectNumber = :projectNumber';
    expressionAttributeValues[':projectNumber'] = project.projectNumber;
    console.log('Adding projectNumber update:', project.projectNumber);
}

// Update client name
if (project.clientName !== undefined) {
    updateExpression += ', clientName = :clientName';
    expressionAttributeValues[':clientName'] = project.clientName || '';
    console.log('Adding clientName update:', project.clientName);
}

// Update client emails
if (project.clientEmails !== undefined && project.clientEmails !== null && project.clientEmails !== '') {
    updateExpression += ', clientEmails = :clientEmails';
    expressionAttributeValues[':clientEmails'] = project.clientEmails;
    console.log('Adding clientEmails update:', project.clientEmails);
}

// Update description
if (project.description !== undefined && project.description !== null && project.description !== '') {
    updateExpression += ', description = :description';
    expressionAttributeValues[':description'] = project.description;
    console.log('Adding description update:', project.description);
}

// Update type
if (project.type !== undefined && project.type !== null && project.type !== '') {
    updateExpression += ', #type = :type';
    expressionAttributeNames['#type'] = 'type';
    expressionAttributeValues[':type'] = project.type;
    console.log('Adding type update:', project.type);
}

// Update address fields
if (project.addressLine1 !== undefined && project.addressLine1 !== null && project.addressLine1 !== '') {
    updateExpression += ', addressLine1 = :addressLine1';
    expressionAttributeValues[':addressLine1'] = project.addressLine1;
    console.log('Adding addressLine1 update:', project.addressLine1);
}

if (project.addressLine2 !== undefined) {
    updateExpression += ', addressLine2 = :addressLine2';
    expressionAttributeValues[':addressLine2'] = project.addressLine2 || '';
    console.log('Adding addressLine2 update:', project.addressLine2);
}

if (project.city !== undefined && project.city !== null && project.city !== '') {
    updateExpression += ', city = :city';
    expressionAttributeValues[':city'] = project.city;
    console.log('Adding city update:', project.city);
}

if (project.province !== undefined && project.province !== null && project.province !== '') {
    updateExpression += ', province = :province';
    expressionAttributeValues[':province'] = project.province;
    console.log('Adding province update:', project.province);
}

if (project.country !== undefined && project.country !== null && project.country !== '') {
    updateExpression += ', country = :country';
    expressionAttributeValues[':country'] = project.country;
    console.log('Adding country update:', project.country);
}

// Update numberOfFloors
if (project.numberOfFloors !== undefined) {
    updateExpression += ', numberOfFloors = :numberOfFloors';
    expressionAttributeValues[':numberOfFloors'] = project.numberOfFloors;
    console.log('Adding numberOfFloors update:', project.numberOfFloors);
}

// Update designedBy
if (project.designedBy !== undefined) {
    updateExpression += ', designedBy = :designedBy';
    expressionAttributeValues[':designedBy'] = project.designedBy || '';
    console.log('Adding designedBy update:', project.designedBy);
}

// Update approvedBy
if (project.approvedBy !== undefined) {
    updateExpression += ', approvedBy = :approvedBy';
    expressionAttributeValues[':approvedBy'] = project.approvedBy || '';
    console.log('Adding approvedBy update:', project.approvedBy);
}

    // FIXED: More explicit condition for selectedCFSSOptions
    if (project.selectedCFSSOptions !== undefined) {
        updateExpression += ', selectedCFSSOptions = :selectedCFSSOptions';
        expressionAttributeValues[':selectedCFSSOptions'] = project.selectedCFSSOptions;
        console.log('Adding selectedCFSSOptions update:', project.selectedCFSSOptions.length, 'options');
    }

    if (project.windows !== undefined) {
        updateExpression += ', windows = :windows';
        expressionAttributeValues[':windows'] = project.windows;
        console.log('Adding windows update:', Array.isArray(project.windows) ? project.windows.length : 'not-array');
    }

    if (project.parapets !== undefined) {
        updateExpression += ', parapets = :parapets';
        expressionAttributeValues[':parapets'] = project.parapets;
        console.log('Adding parapets update:', Array.isArray(project.parapets) ? project.parapets.length : 'not-array');
    }

    if (project.equipment !== undefined) {
        updateExpression += ', equipment = :equipment';
        expressionAttributeValues[':equipment'] = project.equipment;
        console.log('Adding equipment update:', Array.isArray(project.equipment) ? project.equipment.length : 'not-array');
    }
    
    if (project.soffites !== undefined) {
        updateExpression += ', soffites = :soffites';
        expressionAttributeValues[':soffites'] = project.soffites;
        console.log('Adding soffites update:', Array.isArray(project.soffites) ? project.soffites.length : 'not-array');
    }

    if (project.rooms !== undefined) {
        updateExpression += ', rooms = :rooms';
        expressionAttributeValues[':rooms'] = project.rooms;
        console.log('Adding rooms update:', Array.isArray(project.rooms) ? project.rooms.length : 'not-array');
    }

    if (project.floors !== undefined) {
        updateExpression += ', floors = :floors';
        expressionAttributeValues[':floors'] = project.floors;
        console.log('Adding floors update:', Array.isArray(project.floors) ? project.floors.length : 'not-array');
    }

    if (project.customPages !== undefined) {
        updateExpression += ', customPages = :customPages';
        expressionAttributeValues[':customPages'] = project.customPages;
        console.log('Adding customPages update:', Array.isArray(project.customPages) ? project.customPages.length : 'not-array');
    }

    if (project.soffitesCustomPage !== undefined) {
        updateExpression += ', soffitesCustomPage = :soffitesCustomPage';
        expressionAttributeValues[':soffitesCustomPage'] = project.soffitesCustomPage;
        console.log('Adding soffitesCustomPage update');
    }

    if (project.files !== undefined) {
        updateExpression += ', files = :files';
        expressionAttributeValues[':files'] = project.files;
        console.log('Adding files update:', Array.isArray(project.files) ? project.files.length : 'not-array');
    }

    // Duplication workflow metadata (used by Limited -> Admin submission)
    if (project.isLimitedProject !== undefined) {
        updateExpression += ', isLimitedProject = :isLimitedProject';
        expressionAttributeValues[':isLimitedProject'] = project.isLimitedProject === true;
        console.log('Adding isLimitedProject update:', expressionAttributeValues[':isLimitedProject']);
    }

    if (project.isAdminCopy !== undefined) {
        updateExpression += ', isAdminCopy = :isAdminCopy';
        expressionAttributeValues[':isAdminCopy'] = project.isAdminCopy === true;
        console.log('Adding isAdminCopy update:', expressionAttributeValues[':isAdminCopy']);
    }

    if (project.linkedLimitedProjectId !== undefined) {
        updateExpression += ', linkedLimitedProjectId = :linkedLimitedProjectId';
        expressionAttributeValues[':linkedLimitedProjectId'] = project.linkedLimitedProjectId || null;
        console.log('Adding linkedLimitedProjectId update:', project.linkedLimitedProjectId);
    }

    if (project.linkedRegularProjectId !== undefined) {
        updateExpression += ', linkedRegularProjectId = :linkedRegularProjectId';
        expressionAttributeValues[':linkedRegularProjectId'] = project.linkedRegularProjectId || null;
        console.log('Adding linkedRegularProjectId update:', project.linkedRegularProjectId);
    }

    if (project.firstSubmittedAt !== undefined) {
        updateExpression += ', firstSubmittedAt = :firstSubmittedAt';
        expressionAttributeValues[':firstSubmittedAt'] = project.firstSubmittedAt || null;
        console.log('Adding firstSubmittedAt update:', project.firstSubmittedAt);
    }

    if (project.lastSubmittedAt !== undefined) {
        updateExpression += ', lastSubmittedAt = :lastSubmittedAt';
        expressionAttributeValues[':lastSubmittedAt'] = project.lastSubmittedAt || null;
        console.log('Adding lastSubmittedAt update:', project.lastSubmittedAt);
    }

    if (project.convertedAt !== undefined) {
        updateExpression += ', convertedAt = :convertedAt';
        expressionAttributeValues[':convertedAt'] = project.convertedAt || null;
        console.log('Adding convertedAt update:', project.convertedAt);
    }

    if (project.convertedFrom !== undefined) {
        updateExpression += ', convertedFrom = :convertedFrom';
        expressionAttributeValues[':convertedFrom'] = project.convertedFrom || null;
        console.log('Adding convertedFrom update:', project.convertedFrom);
    }

    // DEBUG: Log the final expressions before sending to DynamoDB
    console.log('Final UpdateExpression:', updateExpression);
    console.log('Final ExpressionAttributeNames:', expressionAttributeNames);
    console.log('Final ExpressionAttributeValues keys:', Object.keys(expressionAttributeValues));

    const params = {
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
    };

    const data = await dynamodb.update(params);
    console.log(`✅ Project updated by ${userInfo.email}:`, id);
    return data.Attributes;
}

async function reassignProject(projectId, reassignData, userInfo) {
    if (!userInfo.isAdmin) {
        throw new Error('Access denied: Only admins can reassign projects');
    }

    const { assignedUsers } = reassignData;

    if (!Array.isArray(assignedUsers) || assignedUsers.length === 0) {
        throw new Error('At least one user is required for assignment');
    }

    const getParams = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };
    const existingProject = await dynamodb.get(getParams);

    if (!existingProject.Item) {
        throw new Error('Project not found');
    }

    const projectName = existingProject.Item.name || 'Untitled Project';
    const assignedToEmails = assignedUsers.map(u => u.email);
    const assignedToDetails = assignedUsers.map(u => ({
        email: u.email,
        userId: u.userId || 'unknown',
        name: u.name || 'Unknown User',
        company: u.company || 'Unknown Company'
    }));

    const updateParams = {
        TableName: TABLE_NAME,
        Key: { id: projectId },
        UpdateExpression: 'set assignedTo = :assignedTo, assignedToDetails = :assignedToDetails, #updatedAt = :updatedAt, #updatedBy = :updatedBy, assignedAt = :assignedAt, assignedBy = :assignedBy',
        ExpressionAttributeNames: {
            '#updatedAt': 'updatedAt',
            '#updatedBy': 'updatedBy'
        },
        ExpressionAttributeValues: {
            ':assignedTo': assignedToEmails,
            ':assignedToDetails': assignedToDetails,
            ':updatedAt': new Date().toISOString(),
            ':updatedBy': userInfo.email,
            ':assignedAt': new Date().toISOString(),
            ':assignedBy': userInfo.email
        },
        ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(updateParams);
    console.log(`✅ Assigned project ${projectId} to [${assignedToEmails.join(', ')}] by admin ${userInfo.email}`);

    // Send email notification to all assigned users (non-blocking)
    const emailPromises = assignedUsers.map(user =>
        sendReassignmentEmail(user.email, projectName, projectId, userInfo.email)
            .catch(err => console.error(`⚠️ Failed to send email to ${user.email}:`, err))
    );
    await Promise.allSettled(emailPromises);

    return {
        success: true,
        message: `Project assigned to ${assignedToEmails.join(', ')}`,
        project: result.Attributes
    };
}

async function deleteProject(projectId, requestData, userInfo) {
    // Just verify project exists
    const getParams = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };
    const existingProject = await dynamodb.get(getParams);

    if (!existingProject.Item) {
        throw new Error('Project not found');
    }

    console.log(`🗑️ Deleting project ${projectId} by ${userInfo.email}`);

    const deleteParams = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };

    await dynamodb.delete(deleteParams);

    return { success: true, message: `Project ${projectId} deleted` };
}


// Equipment-related functions with user authorization
async function updateProjectEquipment(projectId, equipment, userInfo) {
    // Check project access first
    const getParams = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };
    const existingProject = await dynamodb.get(getParams);
    
    if (!existingProject.Item) {
        throw new Error('Project not found');
    }
    
    if (!userInfo.isAdmin && !canAccessProject(existingProject.Item, userInfo.email)) {
        throw new Error('Access denied: You can only update equipment for your own projects');
    }

    console.log(`🔧 Updating equipment for project ${projectId} by ${userInfo.email}`);
    
    const params = {
        TableName: TABLE_NAME,
        Key: { id: projectId },
        UpdateExpression: 'set equipment = :equipment, #updatedAt = :updatedAt, #updatedBy = :updatedBy',
        ExpressionAttributeNames: {
            '#updatedAt': 'updatedAt',
            '#updatedBy': 'updatedBy'
        },
        ExpressionAttributeValues: {
            ':equipment': equipment || [],
            ':updatedAt': new Date().toISOString(),
            ':updatedBy': userInfo.email
        },
        ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.update(params);
    console.log('✅ Equipment updated successfully');
    return result.Attributes;
}

async function getProjectEquipment(projectId, userInfo) {
    // Check project access
    const params = {
        TableName: TABLE_NAME,
        Key: { id: projectId }
    };
    
    const result = await dynamodb.get(params);
    
    if (!result.Item) {
        throw new Error('Project not found');
    }
    
    if (!userInfo.isAdmin && !canAccessProject(result.Item, userInfo.email)) {
        throw new Error('Access denied: You can only view equipment for your own projects');
    }
    
    const equipment = result.Item?.equipment || [];
    console.log(`🔍 Equipment fetched for project ${projectId} by ${userInfo.email}`);
    return equipment;
}

// Puppeteer function to fetch earthquake data
async function fetchEarthquakeData(latitude, longitude) {
    let browser = null;
    try {
        console.log('🌍 Launching Puppeteer for earthquake data...');
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        console.log('🔄 Navigating to earthquake data page...');
        await page.goto('https://www.earthquakescanada.nrcan.gc.ca/hazard-alea/interpolat/calc-en.php', { waitUntil: 'networkidle2' });

        console.log('📝 Filling in coordinates...');
        await page.waitForSelector('#formLatitude');
        await page.type('#formLatitude', latitude.toString());
        await page.type('#formLongitude', longitude.toString());
        await page.click('.btn.btn-primary.btn-block');

        console.log('⏳ Waiting for results...');
        await page.waitForSelector('table.table', { timeout: 60000 });

        console.log('📊 Extracting earthquake data...');
        const results = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table.table tbody tr'));
            let maxSa0_2 = 0;
            let maxSa1_0 = 0;
            let maxPGA = 0;

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                const sa0_2 = parseFloat(cells[4].innerText);
                const sa1_0 = parseFloat(cells[7].innerText);
                const PGA = parseFloat(cells[11].innerText);

                if (sa0_2 > maxSa0_2) maxSa0_2 = sa0_2;
                if (sa1_0 > maxSa1_0) maxSa1_0 = sa1_0;
                if (PGA > maxPGA) maxPGA = PGA;
            });

            return { maxSa0_2, maxSa1_0, maxPGA };
        });

        await browser.close();
        console.log('✅ Earthquake data fetched successfully:', results);
        return results;

    } catch (error) {
        if (browser) await browser.close();
        console.error('❌ Error fetching earthquake data:', error);
        throw new Error('Failed to fetch earthquake data');
    }
}

// Utility functions for seismic calculations
function getFValues(PGAref) {
    const F10ValuesForE = { 0.1: 2.81, 0.2: 2.00, 0.3: 1.74, 0.4: 1.51, 0.5: 1.39 };
    const F02ValuesForE = { 0.1: 1.21, 0.2: 1.13, 0.3: 1.06, 0.4: 1.04, 0.5: 1.00 };

    const closestPGAref = [0.1, 0.2, 0.3, 0.4, 0.5].reduce((prev, curr) => {
        return Math.abs(curr - PGAref) < Math.abs(prev - PGAref) ? curr : prev;
    });

    const F10Value = F10ValuesForE[closestPGAref];
    const F02Value = F02ValuesForE[closestPGAref];

    return { F10: F10Value, F02: F02Value };
}

function determineRiskS_DS(S_DS, riskCategory) {
    if (riskCategory === 'Protection') {
        if (S_DS < 0.167) {
            return 'A';
        } else if (S_DS < 0.33) {
            return 'C';
        } else {
            return 'D';
        }
    } else {
        if (S_DS < 0.167) {
            return 'A';
        } else if (S_DS < 0.33) {
            return 'B';
        } else if (S_DS < 0.5) {
            return 'C';
        } else {
            return 'D';
        }
    }
}

function determineRiskS_D1(S_D1, riskCategory) {
    if (riskCategory === 'Protection') {
        if (S_D1 < 0.067) {
            return 'A';
        } else if (S_D1 < 0.133) {
            return 'C';
        } else {
            return 'D';
        }
    } else {
        if (S_D1 < 0.067) {
            return 'A';
        } else if (S_D1 < 0.133) {
            return 'B';
        } else if (S_D1 < 0.2) {
            return 'C';
        } else {
            return 'D';
        }
    }
}

function getFinalRiskCategory(RiskS_DS, RiskS_D1) {
    const riskLevels = ['A', 'B', 'C', 'D'];
    return riskLevels[Math.max(riskLevels.indexOf(RiskS_DS), riskLevels.indexOf(RiskS_D1))];
}

async function getUsers(userInfo) {
    if (!userInfo.isAdmin) {
        throw new Error('Access denied: Only admins can list users');
    }

    const command = new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
    });

    const response = await cognitoClient.send(command);

    return response.Users.map(user => {
        // Helper function to get attribute value
        const getAttribute = (attrName) => {
            const attr = user.Attributes.find(attr => attr.Name === attrName);
            return attr ? attr.Value : '';
        };

        // Determine user role (backward compatible)
        let userRole = getAttribute('custom:user_role');
        if (!userRole) {
            userRole = getAttribute('custom:is_admin') === 'true' ? 'admin' : 'regular';
        }

        return {
            username: user.Username,
            email: getAttribute('email'),
            firstName: getAttribute('given_name'),
            lastName: getAttribute('family_name'),
            companyName: getAttribute('custom:company_name'),
            domain: getAttribute('custom:domain'),
            isAdmin: getAttribute('custom:is_admin') === 'true',
            userRole: userRole,
            approvalStatus: getAttribute('custom:approval_status'),
            enabled: user.Enabled,
            status: user.UserStatus,
            created: user.UserCreateDate,
            lastModified: user.UserLastModifiedDate
        };
    });
}

async function promoteUserToAdmin(email, userInfo) {
    if (!userInfo.isAdmin) {
        throw new Error('Access denied: Only admins can promote users');
    }

    console.log(`🔧 Promoting user ${email} to admin by ${userInfo.email}`);

    const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            {
                Name: 'custom:is_admin',
                Value: 'true'
            },
            {
                Name: 'custom:user_role',
                Value: 'admin'
            }
        ]
    });

    try {
        await cognitoClient.send(command);
        console.log(`✅ User ${email} promoted to admin successfully`);
        return { success: true, message: `User ${email} promoted to admin successfully` };
    } catch (error) {
        console.error(`❌ Error promoting user ${email}:`, error);
        throw new Error(`Failed to promote user: ${error.message}`);
    }
}

async function demoteUserFromAdmin(email, userInfo) {
    if (!userInfo.isAdmin) {
        throw new Error('Access denied: Only admins can demote users');
    }

    if (email === userInfo.email) {
        throw new Error('You cannot demote yourself');
    }

    console.log(`🔧 Demoting user ${email} from admin by ${userInfo.email}`);

    const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            {
                Name: 'custom:is_admin',
                Value: 'false'
            },
            {
                Name: 'custom:user_role',
                Value: 'regular'
            }
        ]
    });

    try {
        await cognitoClient.send(command);
        console.log(`✅ User ${email} demoted from admin successfully`);
        return { success: true, message: `User ${email} demoted from admin successfully` };
    } catch (error) {
        console.error(`❌ Error demoting user ${email}:`, error);
        throw new Error(`Failed to demote user: ${error.message}`);
    }
}

async function demoteUserToLimited(email, userInfo) {
    if (!userInfo.isAdmin) {
        throw new Error('Access denied: Only admins can demote users');
    }

    if (email === userInfo.email) {
        throw new Error('You cannot demote yourself');
    }

    console.log(`🔧 Demoting user ${email} to limited by ${userInfo.email}`);

    const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            {
                Name: 'custom:is_admin',
                Value: 'false'
            },
            {
                Name: 'custom:user_role',
                Value: 'limited'
            }
        ]
    });

    try {
        await cognitoClient.send(command);
        console.log(`✅ User ${email} demoted to limited successfully`);
        return { success: true, message: `User ${email} demoted to limited successfully` };
    } catch (error) {
        console.error(`❌ Error demoting user ${email} to limited:`, error);
        throw new Error(`Failed to demote user to limited: ${error.message}`);
    }
}

async function promoteUserToRegular(email, userInfo) {
    if (!userInfo.isAdmin) {
        throw new Error('Access denied: Only admins can promote users');
    }

    console.log(`🔧 Promoting user ${email} to regular by ${userInfo.email}`);

    const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            {
                Name: 'custom:is_admin',
                Value: 'false'
            },
            {
                Name: 'custom:user_role',
                Value: 'regular'
            }
        ]
    });

    try {
        await cognitoClient.send(command);
        console.log(`✅ User ${email} promoted to regular successfully`);
        return { success: true, message: `User ${email} promoted to regular successfully` };
    } catch (error) {
        console.error(`❌ Error promoting user ${email} to regular:`, error);
        throw new Error(`Failed to promote user to regular: ${error.message}`);
    }
}

async function deleteUser(email, userInfo) {
    if (!userInfo.isAdmin) {
        throw new Error('Access denied: Only admins can delete users');
    }

    if (email === userInfo.email) {
        throw new Error('You cannot delete yourself');
    }

    console.log(`🗑️ Deleting user ${email} by admin ${userInfo.email}`);

    const command = new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email
    });

    try {
        await cognitoClient.send(command);
        console.log(`✅ User ${email} deleted successfully`);
        return { success: true, message: `User ${email} has been permanently deleted` };
    } catch (error) {
        console.error(`❌ Error deleting user ${email}:`, error);
        throw new Error(`Failed to delete user: ${error.message}`);
    }
}

async function approveUser(email, userInfo) {
    if (!userInfo.isAdmin) {
        throw new Error('Access denied: Only admins can approve users');
    }

    console.log(`✅ Approving user ${email} by admin ${userInfo.email}`);

    try {
        // Fetch user to check domain for auto-role assignment
        const getUserCmd = new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: email
        });
        const userResponse = await cognitoClient.send(getUserCmd);
        const userDomain = userResponse.UserAttributes.find(a => a.Name === 'custom:domain')?.Value || '';

        const attributesToUpdate = [
            { Name: 'custom:approval_status', Value: 'approved' }
        ];

        // Auto-assign limited role for interior-system domain
        if (userDomain === 'interior-system') {
            attributesToUpdate.push({ Name: 'custom:user_role', Value: 'limited' });
            console.log(`🔒 Auto-assigning limited role for interior-system user ${email}`);
        }

        const command = new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            UserAttributes: attributesToUpdate
        });

        await cognitoClient.send(command);

        // Send approval email to user
        await sendApprovalEmail(email, true);

        console.log(`✅ User ${email} approved successfully`);
        return { success: true, message: `User ${email} approved successfully` };
    } catch (error) {
        console.error(`❌ Error approving user ${email}:`, error);
        throw new Error(`Failed to approve user: ${error.message}`);
    }
}

async function processEmailApproval(token) {
    try {
        // Decode the approval token
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [email, timestamp, signature] = decoded.split('|');
        
        // Verify token is not expired (24 hours)
        const tokenTime = parseInt(timestamp);
        const now = Date.now();
        if (now - tokenTime > 24 * 60 * 60 * 1000) {
            throw new Error('Approval token has expired');
        }
        
        // Verify signature (basic security)
        const expectedSignature = crypto.createHash('sha256')
            .update(`${email}|${timestamp}|approval-secret-key`)
            .digest('hex');
        
        if (signature !== expectedSignature) {
            throw new Error('Invalid approval token');
        }
        
        // Check if user is already approved
        const getUserCommand = new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: email
        });
        
        try {
            const userResponse = await cognitoClient.send(getUserCommand);
            const currentApprovalStatus = userResponse.UserAttributes.find(
                attr => attr.Name === 'custom:approval_status'
            )?.Value;
            
            if (currentApprovalStatus === 'approved') {
                console.log(`User ${email} is already approved`);
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'text/html'
                    },
                    body: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>User Already Approved</title>
                            <style>
                                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                                .info { color: #17a2b8; font-size: 24px; margin-bottom: 20px; }
                            </style>
                        </head>
                        <body>
                            <div class="info">User Already Approved</div>
                            <p><strong>${email}</strong> has already been approved by another admin.</p>
                            <p>No further action needed.</p>
                        </body>
                        </html>
                    `
                };
            }
        } catch (getUserError) {
            console.error('Error checking user status:', getUserError);
            // Continue with approval if we can't check status
        }
        
        // Check user domain for auto-role assignment
        let userDomain = '';
        try {
            const domainAttr = userResponse.UserAttributes.find(a => a.Name === 'custom:domain');
            userDomain = domainAttr?.Value || '';
        } catch (_) { /* userResponse may not be available if getUserCommand failed above */ }

        const attributesToUpdate = [
            { Name: 'custom:approval_status', Value: 'approved' }
        ];

        // Auto-assign limited role for interior-system domain
        if (userDomain === 'interior-system') {
            attributesToUpdate.push({ Name: 'custom:user_role', Value: 'limited' });
            console.log(`🔒 Auto-assigning limited role for interior-system user ${email}`);
        }

        // Approve the user DIRECTLY - no admin check needed
        const command = new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            UserAttributes: attributesToUpdate
        });

        await cognitoClient.send(command);

        // Send approval email to user
        await sendApprovalEmail(email, true);

        console.log(`User ${email} approved via email token`);
        
        // Return HTML success page
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html'
            },
            body: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>User Approved</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div class="success">User Approved</div>
                    <p><strong>${email}</strong> has been approved and can now log in.</p>
                    <p>The user has been notified via email.</p>
                </body>
                </html>
            `
        };
        
    } catch (error) {
        console.error('Email approval error:', error);
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'text/html'
            },
            body: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Approval Error</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div class="error">❌ Approval Failed</div>
                    <p>${error.message}</p>
                </body>
                </html>
            `
        };
    }
}

function generateApprovalToken(email) {
    const timestamp = Date.now().toString();
    const signature = crypto.createHash('sha256')
        .update(`${email}|${timestamp}|approval-secret-key`)
        .digest('hex');
    
    const tokenData = `${email}|${timestamp}|${signature}`;
    return Buffer.from(tokenData).toString('base64');
}

async function sendApprovalEmail(userEmail, isApproved, isExistingUser = false) {
    const allAdminEmails = ['bennguyenn@outlook.com', 'protectionsismique2000@gmail.com'];
    const subject = isApproved ? 'Account Approved - Protection Sismique' : 'New User Registration - Approval Required';
    
    let htmlBody, textBody, destinationEmails;
    
    if (isApproved) {
        // Send approval confirmation to the user
        htmlBody = `
            <h2>Account Approved</h2>
            <p>Your Protection Sismique account has been approved!</p>
            <p>You can now log in at: <a href="https://staging.d39k5f7r37q4xk.amplifyapp.com/auth.html">Protection Sismique</a></p>
        `;
        textBody = `Your Protection Sismique account has been approved! You can now log in.`;
        destinationEmails = [userEmail];
    } else {
        // Fetch user details from Cognito for admin notification
        let firstName = 'Unknown';
        let lastName = 'User';
        let companyName = 'Unknown Company';
        
        try {
            const getUserCommand = new AdminGetUserCommand({
                UserPoolId: USER_POOL_ID,
                Username: userEmail
            });
            
            const userResponse = await cognitoClient.send(getUserCommand);
            
            // Extract user attributes
            const getAttribute = (attrName) => {
                const attr = userResponse.UserAttributes.find(attr => attr.Name === attrName);
                return attr ? attr.Value : '';
            };
            
            firstName = getAttribute('given_name') || 'Unknown';
            lastName = getAttribute('family_name') || 'User';
            companyName = getAttribute('custom:company_name') || 'Unknown Company';
            
            console.log(`📧 Fetched user details: ${firstName} ${lastName} from ${companyName}`);
            
        } catch (error) {
            console.error('Error fetching user details for email:', error);
            // Continue with default values if fetch fails
        }
        
        // Generate approval token
        const approvalToken = generateApprovalToken(userEmail);
        const approvalUrl = `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/users/approve-user?token=${approvalToken}`;
        
        // Set content based on user type
        if (isExistingUser) {
            htmlBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Existing User Login Attempt - Approval Required</h2>
                    
                    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                        <p><strong>Email:</strong> ${userEmail}</p>
                        <p><strong>Company:</strong> ${companyName}</p>
                        <p><strong>Status:</strong> Existing user attempted login, needs approval</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${approvalUrl}" 
                           style="background: #28a745; 
                                  color: white; 
                                  padding: 15px 30px; 
                                  text-decoration: none; 
                                  border-radius: 5px; 
                                  font-weight: bold;
                                  display: inline-block;">
                            APPROVE EXISTING USER
                        </a>
                    </div>
                </div>
            `;
        } else {
            htmlBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">New User Registration - Approval Required</h2>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                        <p><strong>Email:</strong> ${userEmail}</p>
                        <p><strong>Company:</strong> ${companyName}</p>
                        <p><strong>Status:</strong> Email verified, pending approval</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${approvalUrl}" 
                           style="background: #28a745; 
                                  color: white; 
                                  padding: 15px 30px; 
                                  text-decoration: none; 
                                  border-radius: 5px; 
                                  font-weight: bold;
                                  display: inline-block;">
                            APPROVE USER
                        </a>
                    </div>
                </div>
            `;
        }
        
        destinationEmails = allAdminEmails;
    }

    // Try sending to all admins first
    const params = {
        Source: 'info@protectionsismique2000.com',
        Destination: {
            ToAddresses: destinationEmails
        },
        Message: {
            Subject: { Data: subject },
            Body: {
                Html: { Data: htmlBody },
                Text: { Data: textBody }
            }
        }
    };

    try {
        console.log(`📧 Attempting to send email to: ${destinationEmails.join(', ')}`);
        
        const result = await sesClient.send(new SendEmailCommand(params));
        console.log(`✅ Email sent successfully to all admins. MessageId: ${result.MessageId}`);
        
        return { success: true, messageId: result.MessageId };
        
    } catch (error) {
        console.error('❌ Error sending to all admins:', error);
        
        // If sending to all failed, try individual sends to identify which emails work
        if (!isApproved && destinationEmails.length > 1) {
            console.log('🔄 Trying individual admin emails...');
            
            const successfulSends = [];
            const failedSends = [];
            
            for (const adminEmail of destinationEmails) {
                try {
                    const individualParams = {
                        ...params,
                        Destination: {
                            ToAddresses: [adminEmail]
                        }
                    };
                    
                    const individualResult = await sesClient.send(new SendEmailCommand(individualParams));
                    successfulSends.push(adminEmail);
                    console.log(`✅ Email sent to ${adminEmail}`);
                    
                } catch (individualError) {
                    failedSends.push(adminEmail);
                    console.log(`❌ Failed to send to ${adminEmail}: ${individualError.message}`);
                }
            }
            
            if (successfulSends.length > 0) {
                console.log(`📧 Successfully sent to: ${successfulSends.join(', ')}`);
                console.log(`⚠️ Failed to send to: ${failedSends.join(', ')} (likely unverified in SES)`);
                return { 
                    success: true, 
                    partialSuccess: true,
                    successfulRecipients: successfulSends,
                    failedRecipients: failedSends
                };
            }
        }
        
        // If all individual sends failed or this was a user notification
        console.error('❌ Email sending completely failed:', error);
        return { success: false, error: error.message };
    }
}

async function sendReassignmentEmail(newOwnerEmail, projectName, projectId, adminEmail) {
    const subject = `Project Assigned to You: ${projectName}`;

    const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #007bff, #0056b3); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 20px;">Protection Sismique</h1>
            </div>
            <div style="padding: 30px; background: #ffffff; border: 1px solid #e2e8f0;">
                <h2 style="color: #0f172a; margin-top: 0;">Project Assigned to You</h2>
                <p style="color: #475569;">An admin has assigned the following project to you:</p>
                <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <p style="margin: 4px 0;"><strong>Project:</strong> ${projectName}</p>
                    <p style="margin: 4px 0;"><strong>Assigned by:</strong> ${adminEmail}</p>
                </div>
                <p style="color: #475569;">You can now view and manage this project from your dashboard.</p>
            </div>
        </div>
    `;

    const textBody = `Project Assigned to You\n\nProject: ${projectName}\nAssigned by: ${adminEmail}\n\nYou can now view and manage this project from your dashboard.`;

    const params = {
        Source: 'info@protectionsismique2000.com',
        Destination: { ToAddresses: [newOwnerEmail] },
        Message: {
            Subject: { Data: subject },
            Body: {
                Html: { Data: htmlBody },
                Text: { Data: textBody }
            }
        }
    };

    const result = await sesClient.send(new SendEmailCommand(params));
    console.log(`📧 Reassignment email sent to ${newOwnerEmail}. MessageId: ${result.MessageId}`);
    return result;
}

async function notifyAdminsOfNewUser(userEmail, userData) {
    try {
        // Send notification email to admins
        await sendApprovalEmail(userEmail, false);
        
        console.log(`Admin notification sent for new user: ${userEmail}`);
    } catch (error) {
        console.error('Error sending admin notification:', error);
    }
}

// Updated getEquipmentImageUrl function with PNG fallback option
function getEquipmentImageUrl(equipmentItem, project, equipmentMappings, preferPng = false) {
    const s3BaseUrl = 'https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/';
    const domain = project.domain?.toLowerCase() || 'electricity';
    const domainMapping = equipmentMappings[domain];
    
    if (!domainMapping) return null;

    const extension = preferPng ? 'png' : 'jpg';
    
    if (equipmentItem.isPipe) {
        const pipeTypeMap = {
            'Steel_Pipe': 'Steel',
            'Copper_Pipe': 'Copper', 
            'PVC_Pipe': 'PVC',
            'No_Hub_Pipe': 'NoHub'
        };
        const mappedPipeType = pipeTypeMap[equipmentItem.pipeType] || equipmentItem.pipeType;
        return `${s3BaseUrl}piping/Pipe_${mappedPipeType}.${extension}`;
    } else {
        const equipmentCode = domainMapping.equipmentMap[equipmentItem.equipmentType || equipmentItem.equipment];
        if (!equipmentCode) return null;
        
        if (domain === 'electricity') {
            return `${s3BaseUrl}electricity/${domainMapping.domainCode}_${equipmentCode}_${equipmentItem.installMethod}.${extension}`;
        } else {
            return `${s3BaseUrl}${domainMapping.domainCode}_${equipmentCode}_${equipmentItem.installMethod}.${extension}`;
        }
    }
}

// Helper function to try both JPG and PNG formats
async function getWorkingImageUrl(equipmentItem, project, equipmentMappings) {
    // Try JPG first
    const jpgUrl = getEquipmentImageUrl(equipmentItem, project, equipmentMappings, false);
    if (jpgUrl) {
        try {
            const jpgResponse = await fetch(jpgUrl, { method: 'HEAD' }); // Use HEAD to check existence without downloading
            if (jpgResponse.ok) {
                return jpgUrl;
            }
        } catch (error) {
            console.log('JPG not found, trying PNG...');
        }
    }
    
    // Try PNG as fallback
    const pngUrl = getEquipmentImageUrl(equipmentItem, project, equipmentMappings, true);
    if (pngUrl) {
        try {
            const pngResponse = await fetch(pngUrl, { method: 'HEAD' });
            if (pngResponse.ok) {
                return pngUrl;
            }
        } catch (error) {
            console.log('PNG also not found');
        }
    }
    
    return null; // Neither format found
}

// Helper function for install method text
function getInstallMethodText(value) {
    const methods = {
        '1': 'Fixed to Slab',
        '2': 'Fixed to Wall',
        '3': 'Fixed to Structure',
        '4': 'Fixed to Ceiling',
        '5': 'Fixed to Roof'
    };
    return methods[value] || 'Unknown';
}

async function generateCFSSWallDetailPages(project, userInfo) {
    try {
        const walls = project.walls || project.equipment || [];
        if (walls.length === 0) {
            console.log('⚠️ No walls found for CFSS project, skipping detail pages');
            const emptyPdf = await PDFDocument.create();
            return await emptyPdf.save();
        }
        
        console.log(`🏗️ Creating CFSS wall detail pages for ${walls.length} walls...`);
        
        // STEP 1: Group ALL walls by name FIRST
        console.log('=== WALL GROUPING DEBUG ===');
        walls.forEach((wall, index) => {
            console.log(`Wall ${index}:`, {
                equipment: wall.equipment,
                floor: wall.floor,
                allKeys: Object.keys(wall)
            });
        });
        console.log('=== END DEBUG ===');
        
        const wallGroups = groupWallsByName(walls);
        console.log(`📊 Grouped ${walls.length} walls into ${wallGroups.length} groups`);
        
        // Log each group for debugging
        wallGroups.forEach((group, index) => {
            console.log(`Group ${index}: "${group.name}" with ${group.walls.length} walls`);
        });
        
        // STEP 2: Pre-fetch ALL wall images in parallel
        const imageCache = new Map();
        const uniqueKeys = new Set();
        for (const group of wallGroups) {
            const firstWall = group.walls[0];
            const images = (firstWall && firstWall.images) ? firstWall.images.slice(0, 2) : [];
            for (const img of images) {
                if (img && img.key) uniqueKeys.add(img.key);
            }
        }
        
        console.log(`🖼️ Pre-fetching ${uniqueKeys.size} unique wall images in parallel...`);
        const fetchStart = Date.now();
        
        await Promise.all([...uniqueKeys].map(async (key) => {
            try {
                const buffer = await fetchImageBufferByKey(key);
                const format = key.toLowerCase().includes('.png') ? 'png' : 'jpg';
                imageCache.set(key, { buffer, format });
                console.log(`  ✅ Cached: ${key} (${buffer.length} bytes, ${format})`);
            } catch (err) {
                console.warn(`  ⚠️ Failed to cache: ${key} — ${err.message}`);
            }
        }));
        
        console.log(`🖼️ Image pre-fetch complete in ${Date.now() - fetchStart}ms (${imageCache.size}/${uniqueKeys.size} cached)`);
        
        // STEP 3: Fetch template once
        const templateBuffer = await fetchCFSSWallsTemplateFromS3();
        
        // STEP 4: Create PDF and process ALL groups with proper pagination
        const wallsPdf = await PDFDocument.create();
        
        let processedGroups = 0;
        let pageNumber = 1;
        
        // Continue until all groups are processed
        while (processedGroups < wallGroups.length) {
            console.log(`🔄 Processing page ${pageNumber}...`);
            
            // Get remaining groups
            const remainingGroups = wallGroups.slice(processedGroups);
            console.log(`Remaining groups to process: ${remainingGroups.length}`);
            
            // Create a page with as many groups as will fit
            const { pageBuffer, groupsProcessed } = await createCFSSWallPageWithPagination(
                templateBuffer, 
                remainingGroups, 
                project, 
                userInfo, 
                processedGroups,
                imageCache
            );
            
            // Add to main PDF
            const pagePdf = await PDFDocument.load(pageBuffer);
            const [copiedPage] = await wallsPdf.copyPages(pagePdf, [0]);
            wallsPdf.addPage(copiedPage);
            
            // Update counters
            processedGroups += groupsProcessed;
            pageNumber++;
            
            console.log(`✅ Page ${pageNumber - 1} completed. Processed ${groupsProcessed} groups. Total processed: ${processedGroups}/${wallGroups.length}`);
            
            // Safety check to prevent infinite loop
            if (groupsProcessed === 0) {
                console.error(`⚠️ No groups were processed on page ${pageNumber - 1}. This might indicate a space calculation issue.`);
                break;
            }
        }
        
        const wallDetailBytes = await wallsPdf.save();
        console.log(`✅ CFSS wall detail pages created successfully with ${pageNumber - 1} pages covering all ${wallGroups.length} groups`);
        
        return wallDetailBytes;
        
    } catch (error) {
        console.error('❌ Error generating CFSS wall detail pages:', error);
        throw new Error(`Failed to generate CFSS wall detail pages: ${error.message}`);
    }
}

// New function to create pages with proper pagination tracking
async function createCFSSWallPageWithPagination(templateBuffer, wallGroups, project, userInfo, startIndex, imageCache) {
    try {
        const pdfDoc = await PDFDocument.load(templateBuffer);
        const pages = pdfDoc.getPages();
        const page = pages[0];
        
        const { width, height } = page.getSize();
        console.log(`Template page dimensions: ${width} x ${height}`);
        
        // ADDED: Extract revision data
        const revisionData = extractAndValidateRevisionData(project);
        
        // Try to fill form fields if they exist
        try {
            const form = pdfDoc.getForm();
            // CHANGED: Pass revision data to the walls template fields function
            await fillCFSSWallsTemplateFields(form, project, userInfo, revisionData);
        } catch (formError) {
            console.log('No form fields found in walls template, will draw content directly');
        }
        
        // Draw wall groups and get count of how many were actually drawn
        const groupsProcessed = await drawWallGroupsOnTemplateWithCount(pdfDoc, page, wallGroups, project, startIndex, imageCache);
        
        // Apply condensed font to projectAddress field
        try {
            const form = pdfDoc.getForm();
            await updateFieldAppearancesWithUnicodeFont(pdfDoc, form);
            await applyProjectAddressCondensedStyle(pdfDoc);
        } catch (error) {
            console.warn('Could not update wall form appearances or apply condensed style:', error.message);
        }

// Flatten for non-admins, OR for specific emails when they chose "Sign & Flatten"
if (!userInfo.isAdmin || shouldForceFlattenForUser(userInfo, project)) {
    console.log('Flattening CFSS walls template (policy matched).');
    try {
      const form = pdfDoc.getForm();
      form.flatten();
    } catch (error) {
      console.log('No form to flatten or flattening failed');
    }
  }
        
        const pageBuffer = await pdfDoc.save();
        
        return { pageBuffer, groupsProcessed };
        
    } catch (error) {
        console.error('Error creating CFSS wall page with pagination:', error);
        throw error;
    }
}

// Updated function that returns count of groups actually drawn
async function drawWallGroupsOnTemplateWithCount(pdfDoc, page, wallGroups, project, startIndex, imageCache) {
    try {
        console.log(`Drawing up to ${wallGroups.length} wall groups on template...`);
        
        const { width, height } = page.getSize();
        
        // Content area
        const contentAreaX = 50;
        const contentAreaWidth = width - 280;
        const contentAreaTop = height - 80;
        const contentAreaBottom = 60;
        
        let currentY = contentAreaTop;
        let groupsDrawnOnPage = 0;
        
        for (let groupIndex = 0; groupIndex < wallGroups.length; groupIndex++) {
            const wallGroup = wallGroups[groupIndex];
            
            // Calculate required height for this group
            const requiredHeight = calculateGroupHeight(wallGroup.walls);
            const remainingHeight = currentY - contentAreaBottom;
            const spacing = 15;
            
            // Check if this group fits on the current page
            if (remainingHeight < requiredHeight + spacing) {
                console.log(`❌ Not enough space for wall group ${wallGroup.name} (need ${requiredHeight}px, have ${remainingHeight}px) - will be on next page`);
                break; // Stop here, this group will be on next page
            }
            
            console.log(`✅ Drawing group "${wallGroup.name}" with ${wallGroup.walls.length} walls at Y=${currentY}, height=${requiredHeight}px`);
            
            // Draw the dynamic wall container
            const usedHeight = await drawDynamicWallContainer(
                pdfDoc, 
                page, 
                wallGroup, 
                project, 
                contentAreaX, 
                currentY, 
                contentAreaWidth,
                requiredHeight,
                startIndex + groupIndex,
                imageCache
            );
            
            // Move down for next group
            currentY = currentY - usedHeight - spacing;
            groupsDrawnOnPage++;
        }
        
        console.log(`✅ Drew ${groupsDrawnOnPage} wall groups on template successfully`);
        return groupsDrawnOnPage; // Return count of groups actually drawn
        
    } catch (error) {
        console.error('Error drawing wall groups on template:', error);
        throw error;
    }
}

function formatHauteurForDisplay(wall) {
    try {
        const majorValue = parseFloat(wall.hauteurMax) || 0;
        const majorUnit = wall.hauteurMaxUnit || '';
        const minorValue = parseFloat(wall.hauteurMaxMinor || wall.hauteurMinor) || 0;
        const minorUnit = wall.hauteurMaxMinorUnit || wall.hauteurMinorUnit || '';
        
        if (majorValue === 0 && minorValue === 0) {
            return 'N/A';
        }
        
        if (majorUnit === 'ft' || majorUnit === 'in') {
            // Input is imperial - use SAME logic as summary table
            let totalInches = 0;
            if (majorUnit === 'ft') {
                totalInches += majorValue * 12;
            }
            if (majorUnit === 'in') {
                totalInches += majorValue;
            }
            if (minorUnit === 'in') {
                totalInches += minorValue;
            }
            
            // Format imperial like "2'-11''" (SAME as summary table)
            const feet = Math.floor(totalInches / 12);
            const inches = totalInches % 12;
            if (feet > 0 && inches > 0) {
                return `${feet}'-${inches.toFixed(0)}"`;
            } else if (feet > 0) {
                return `${feet}'-0"`;
            } else {
                return `${inches.toFixed(0)}"`;
            }
            
        } else if (majorUnit === 'm' || majorUnit === 'mm') {
            // Input is metric - use SAME logic as summary table
            let totalMm = 0;
            if (majorUnit === 'm') {
                totalMm += majorValue * 1000;
            }
            if (majorUnit === 'mm') {
                totalMm += majorValue;
            }
            if (minorUnit === 'mm') {
                totalMm += minorValue;
            }
            
            // Format metric as just the mm number (like summary table)
            return Math.round(totalMm).toString() + 'mm';
        }
        
        return 'N/A';
        
    } catch (error) {
        console.error('Error formatting hauteur for display:', error);
        return 'N/A';
    }
}

// Updated drawDynamicWallContainer function with equal image widths
async function drawDynamicWallContainer(pdfDoc, page, wallGroup, project, x, y, maxWidth, containerHeight, groupIndex, imageCache) {
    try {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const walls = wallGroup.walls;
        const firstWall = walls[0];
        const images = (firstWall && firstWall.images) ? firstWall.images.slice(0, 2) : [];
        
        const containerTop = y;
        const containerBottom = containerTop - containerHeight;
        
        console.log(`📦 Container for "${wallGroup.name}": ${maxWidth}px wide × ${containerHeight}px tall`);
        
        // Draw main container border
        page.drawRectangle({
            x: x,
            y: containerBottom,
            width: maxWidth,
            height: containerHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        if (images.length === 2) {
            // THREE-COLUMN LAYOUT: [First Image] [Specifications] [Second Image]
            // FIXED: Make both images the same width
            const imageWidth = 250; // Same width for both images
            const spacing = 4; // Total spacing between sections
            const tableWidth = maxWidth - (imageWidth * 2) - spacing;
            
            // Calculate where values should start (same as 1-image layout)
            const valueStartX = x + imageWidth + ((maxWidth - imageWidth - 2) * 0.25);
            
            // Draw first image (left) - same width as second image now
            await drawSingleImageSection(pdfDoc, page, images[0], project, x, containerTop, imageWidth, containerHeight, font, boldFont, imageCache);
            
            // Draw specifications (center) with consistent value position
            await drawDynamicSpecsTable(pdfDoc, page, walls, project, x + imageWidth + 1, containerTop, tableWidth, containerHeight, font, boldFont, valueStartX);
            
            // Draw second image (right) - same width as first image now
            await drawSingleImageSection(pdfDoc, page, images[1], project, x + imageWidth + tableWidth + 3, containerTop, imageWidth, containerHeight, font, boldFont, imageCache);
            
            // Draw wall label spanning full width
            await drawFullWidthLabel(pdfDoc, page, wallGroup.name, x, containerBottom, maxWidth, font, boldFont);
            
        } else {
            // ORIGINAL TWO-COLUMN LAYOUT: [Image Section] [Specifications]
            const imageWidth = 250;
            const tableWidth = maxWidth - imageWidth - 2;
            
            // Draw image section with dynamic label handling
            await drawCompactImageSectionWithDynamicLabel(pdfDoc, page, wallGroup, project, x, containerTop, imageWidth, containerHeight, font, boldFont, maxWidth, imageCache);
            
            // Draw dynamic specifications table (no valueStartX needed - will use relative positioning)
            await drawDynamicSpecsTable(pdfDoc, page, walls, project, x + imageWidth, containerTop, tableWidth, containerHeight, font, boldFont);
        }
        
        console.log(`✅ Drew dynamic wall container for ${wallGroup.name} with ${walls.length} instances`);
        
        return containerHeight;
        
    } catch (error) {
        console.error('Error drawing dynamic wall container:', error);
        throw error;
    }
}

// Helper function to draw a single image without label
async function drawSingleImageSection(pdfDoc, page, imageData, project, x, y, width, height, font, boldFont, imageCache) {
    const topPadding = 12;
    const bottomPadding = 9;
    const imageHeight = height - topPadding - bottomPadding;
    
    await drawSingleWallImage(pdfDoc, page, imageData, project, x + 1, y - imageHeight - 1, width - 1, imageHeight, font, imageCache);
}

// Helper function to draw full-width label at bottom
async function drawFullWidthLabel(pdfDoc, page, wallName, x, y, width, font, boldFont) {
    const labelHeight = 20;
    
    page.drawRectangle({
        x: x + 1,
        y: y,
        width: width - 2,
        height: labelHeight,
        color: rgb(0.9, 0.9, 0.9),
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5
    });
    
    const textWidth = String(wallName).length * 4;
    page.drawText(String(wallName), {
        x: x + (width - textWidth) / 2,
        y: y + (labelHeight / 2) - 4,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0)
    });
}

// Fix 4: Updated specs table that adapts to container height
async function drawDynamicSpecsTable(pdfDoc, page, walls, project, x, y, width, height, font, boldFont, valueStartX = null) {
    try {
        // Draw table background
        page.drawRectangle({
            x: x + 1,
            y: y - height + 1,
            width: width - 2,
            height: height - 2,
            color: rgb(1, 1, 1)
        });
        
        // Draw vertical border between image and table
        page.drawLine({
            start: { x: x, y: y },
            end: { x: x, y: y - height },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        const headerRowHeight = 18;
        const specRowHeight = 14;
        const separatorHeight = 8;
        let currentY = y - 8; // Start with top margin
        const valuesX = valueStartX || (x + width * 0.25); // Calculate if not provided
        
        console.log(`📋 Drawing specs table: ${width}px wide × ${height}px tall for ${walls.length} walls`);
        
        // For each wall instance, create a specs block
        walls.forEach((wall, wallIndex) => {
            if (wallIndex > 0) {
                // Add separator between walls
                currentY -= separatorHeight;
                page.drawLine({
                    start: { x: x + 5, y: currentY + 4 },
                    end: { x: x + width - 5, y: currentY + 4 },
                    thickness: 1.5,
                    color: rgb(0.4, 0.4, 0.4)
                });
            }
            
            // Wall header with floor info
            const floorValue = String(wall.floor || 'N/A');
            const hauteurValue = formatHauteurForDisplay(wall);
            
            const floorText = `${floorValue}    HAUTEUR MAX : ${hauteurValue}`;
            
            // Header background
            page.drawRectangle({
                x: x + 2,
                y: currentY - headerRowHeight,
                width: width - 4,
                height: headerRowHeight,
                color: rgb(0.92, 0.92, 0.92)
            });
            
            // Header text with proper font size based on content length
            const fontSize = 12;
            page.drawText(floorText, {
                x: x + 5,
                y: currentY - headerRowHeight + 6,
                size: fontSize,
                font: boldFont,
                color: rgb(0, 0, 0)
            });
            
            currentY -= headerRowHeight;
            
            // Check if wall has Set 2 data
            const hasSet2 = wall.montantMetallique2 && wall.montantMetallique2.trim() !== '';
            
            // Specifications - Set 1
            const specsSet1 = [
                { 
                    label: '• DÉFLEXION MAX :', 
                    value: String(wall.deflexionMax || 'N/A')
                },
                { 
                    label: '• MONTANT MÉTALLIQUE :', 
                    value: String(wall.montantMetallique || 'N/A') + (wall.dosADos ? ' dos-à-dos' : '') + (wall.espacement ? ` @${wall.espacement}` : '')
                },
                { 
                    label: '• LISSE SUPÉRIEURE :', 
                    value: String(wall.lisseSuperieure || 'N/A')
                },
                { 
                    label: '• LISSE INFÉRIEURE :', 
                    value: String(wall.lisseInferieure || 'N/A')
                },
                { 
                    label: '• ENTREMISE :', 
                    value: String(wall.entremise || 'N/A')
                }
            ];
            
            // Specifications - Set 2 (if exists)
            const specsSet2 = hasSet2 ? [
                { 
                    label: '• DÉFLEXION MAX :', 
                    value: String(wall.deflexionMax2 || 'N/A')
                },
                { 
                    label: '• MONTANT MÉTALLIQUE :', 
                    value: String(wall.montantMetallique2 || 'N/A') + (wall.dosADos2 ? ' dos-à-dos' : '') + (wall.espacement2 ? ` @${wall.espacement2}` : '')
                },
                { 
                    label: '• LISSE SUPÉRIEURE :', 
                    value: String(wall.lisseSuperieure2 || 'N/A')
                },
                { 
                    label: '• LISSE INFÉRIEURE :', 
                    value: String(wall.lisseInferieure2 || 'N/A')
                },
                { 
                    label: '• ENTREMISE :', 
                    value: String(wall.entremise2 || 'N/A')
                }
            ] : [];
            
            // Draw Set 1 specs
            specsSet1.forEach((spec, specIndex) => {
                const specY = currentY - (specIndex * specRowHeight);
                
                // Alternate row background
                if (specIndex % 2 === 0) {
                    page.drawRectangle({
                        x: x + 2,
                        y: specY - specRowHeight,
                        width: width - 4,
                        height: specRowHeight,
                        color: rgb(0.98, 0.98, 0.98)
                    });
                }
                
                // Specification label
                page.drawText(spec.label, {
                    x: x + 3,
                    y: specY - 10,
                    size: 10,
                    font: boldFont,
                    color: rgb(0.3, 0.3, 0.3)
                });
                
                // Specification value
                page.drawText(String(spec.value), {
                    x: valuesX,
                    y: specY - 10,
                    size: 10,
                    font: font,
                    color: rgb(0, 0, 0)
                });
            });
            
            currentY -= (specsSet1.length * specRowHeight);
            
            // If Set 2 exists, draw separator and Set 2 specs
            if (hasSet2 && specsSet2.length > 0) {
                // Draw separator line (same thickness as container border)
                currentY -= 4;
                page.drawLine({
                    start: { x: x + 5, y: currentY },
                    end: { x: x + width - 5, y: currentY },
                    thickness: 1.0,
                    color: rgb(0.8, 0.8, 0.8)
                });
                currentY -= 4;
                
                // Draw Set 2 specs
                specsSet2.forEach((spec, specIndex) => {
                    const specY = currentY - (specIndex * specRowHeight);
                    
                    // Alternate row background
                    if (specIndex % 2 === 0) {
                        page.drawRectangle({
                            x: x + 2,
                            y: specY - specRowHeight,
                            width: width - 4,
                            height: specRowHeight,
                            color: rgb(0.98, 0.98, 0.98)
                        });
                    }
                    
                    // Specification label
                    page.drawText(spec.label, {
                        x: x + 3,
                        y: specY - 10,
                        size: 10,
                        font: boldFont,
                        color: rgb(0.3, 0.3, 0.3)
                    });
                    
                    // Specification value
                    page.drawText(String(spec.value), {
                        x: valuesX,
                        y: specY - 10,
                        size: 10,
                        font: font,
                        color: rgb(0, 0, 0)
                    });
                });
                
                currentY -= (specsSet2.length * specRowHeight);
            }
        });
        
        console.log(`✅ Specs table drawn successfully, final Y position: ${currentY}`);
        
    } catch (error) {
        console.error('Error drawing dynamic specs table:', error);
        throw error;
    }
}

async function sendReportToMakeWebhook(downloadUrl) {
    const webhookUrl = 'https://hook.us1.make.com/eto1idfk8idlmtk7ncamulepeefcmh84';
    
    
    try {
        console.log('📤 Sending report URL to Make.com webhook...');
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                downloadUrl: downloadUrl
            })
        });

        if (response.ok) {
            console.log('✅ Report URL sent to Google Drive successfully');
            return true;
        } else {
            console.error('❌ Failed to send to webhook:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ Error sending to webhook:', error);
        return false;
    }
}

async function fetchCFSSWallsTemplateFromS3() {
    try {
        const templateKey = 'report/walls-template.pdf';
        console.log(`�� Fetching CFSS walls template: ${templateKey}`);
        
        const command = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: templateKey
        });
        
        const response = await s3Client.send(command);
        const chunks = [];
        
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        console.log(`✅ CFSS walls template fetched, size: ${buffer.length}`);
        
        return buffer;
        
    } catch (error) {
        console.error(`❌ Error fetching CFSS walls template:`, error);
        throw new Error(`Failed to fetch CFSS walls template`);
    }
}

async function fetchCFSSParapetTemplateFromS3() {
    try {
        const templateKey = 'report/parapet-template.pdf';
        console.log(`📥 Fetching CFSS parapet template: ${templateKey}`);
        
        const command = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: templateKey
        });
        
        const response = await s3Client.send(command);
        const chunks = [];
        
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        console.log(`✅ CFSS parapet template fetched, size: ${buffer.length}`);
        
        return buffer;
        
    } catch (error) {
        console.error(`❌ Error fetching CFSS parapet template:`, error);
        throw new Error(`Failed to fetch CFSS parapet template`);
    }
}

async function generateCFSSParapetDetailPages(project, userInfo) {
    try {
        const parapets = project.parapets || [];
        if (parapets.length === 0) {
            console.log('⚠️ No parapets found for CFSS project, skipping detail pages');
            return null;
        }
        
        console.log(`🏗️ Creating CFSS parapet detail pages for ${parapets.length} parapets...`);
        
        // Fetch template once
        const templateBuffer = await fetchCFSSParapetTemplateFromS3();
        
        // Create PDF and process parapets with pagination
        const parapetsPdf = await PDFDocument.create();
        
        let processedParapets = 0;
        let pageNumber = 1;
        
        // Continue until all parapets are processed
        while (processedParapets < parapets.length) {
            console.log(`🔄 Processing parapet page ${pageNumber}...`);
            
            // Get remaining parapets
            const remainingParapets = parapets.slice(processedParapets);
            console.log(`Remaining parapets to process: ${remainingParapets.length}`);
            
            // Create a page with as many parapets as will fit
            const { pageBuffer, parapetsProcessed } = await createCFSSParapetPageWithPagination(
                templateBuffer, 
                remainingParapets, 
                project, 
                userInfo, 
                processedParapets
            );
            
            // Add to main PDF
            const pagePdf = await PDFDocument.load(pageBuffer);
            const [copiedPage] = await parapetsPdf.copyPages(pagePdf, [0]);
            parapetsPdf.addPage(copiedPage);
            
            // Update counters
            processedParapets += parapetsProcessed;
            pageNumber++;
            
            console.log(`✅ Page ${pageNumber - 1} completed. Processed ${parapetsProcessed} parapets. Total processed: ${processedParapets}/${parapets.length}`);
            
            // Safety check to prevent infinite loop
            if (parapetsProcessed === 0) {
                console.error(`⚠️ No parapets were processed on page ${pageNumber - 1}.`);
                break;
            }
        }
        
        const parapetDetailBytes = await parapetsPdf.save();
        console.log(`✅ CFSS parapet detail pages created successfully with ${pageNumber - 1} pages covering ${parapets.length} parapets`);
        
        return parapetDetailBytes;
        
    } catch (error) {
        console.error('❌ Error generating CFSS parapet detail pages:', error);
        throw new Error(`Failed to generate CFSS parapet detail pages: ${error.message}`);
    }
}

async function createCFSSParapetPageWithPagination(templateBuffer, parapets, project, userInfo, startIndex) {
    try {
        const pdfDoc = await PDFDocument.load(templateBuffer);
        const pages = pdfDoc.getPages();
        const page = pages[0];
        
        const { width, height } = page.getSize();
        console.log(`Parapet template page dimensions: ${width} x ${height}`);
        
        // Extract revision data
        const revisionData = extractAndValidateRevisionData(project);
        
        // Try to fill form fields if they exist
        try {
            const form = pdfDoc.getForm();
            await fillCFSSWallsTemplateFields(form, project, userInfo, revisionData);
        } catch (formError) {
            console.log('No form fields found in parapet template, will draw content directly');
        }
        
        // Draw parapets and get count of how many were actually drawn
        const parapetsProcessed = await drawParapetsOnTemplate(pdfDoc, page, parapets, project, startIndex);
        
        // Apply condensed font to projectAddress field
        try {
            const form = pdfDoc.getForm();
            await updateFieldAppearancesWithUnicodeFont(pdfDoc, form);
            await applyProjectAddressCondensedStyle(pdfDoc);
        } catch (error) {
            console.warn('Could not update parapet form appearances or apply condensed style:', error.message);
        }

        // Flatten for non-admins
        if (!userInfo.isAdmin || shouldForceFlattenForUser(userInfo, project)) {
            console.log('Flattening CFSS parapet template (policy matched).');
            try {
                const form = pdfDoc.getForm();
                form.flatten();
            } catch (error) {
                console.log('No form to flatten or flattening failed');
            }
        }
        
        const pageBuffer = await pdfDoc.save();
        
        return { pageBuffer, parapetsProcessed };
        
    } catch (error) {
        console.error('Error creating CFSS parapet page with pagination:', error);
        throw error;
    }
}

async function drawParapetsOnTemplate(pdfDoc, page, parapets, project, startIndex) {
    try {
        console.log(`Drawing up to ${parapets.length} parapets on template...`);
        
        const { width, height } = page.getSize();
        
        // Content area (same as walls)
        const contentAreaX = 50;
        const contentAreaWidth = width - 280;
        const contentAreaTop = height - 80;
        const contentAreaBottom = 60;
        
        let currentY = contentAreaTop;
        let parapetsDrawnOnPage = 0;
        
        for (let parapetIndex = 0; parapetIndex < parapets.length; parapetIndex++) {
            const parapet = parapets[parapetIndex];
            
            // Calculate required height for this parapet (fixed height per parapet)
            const containerHeight = 180; // Taller container
            const spacing = 15;
            const remainingHeight = currentY - contentAreaBottom;
            
            // Check if this parapet fits on the current page
            if (remainingHeight < containerHeight + spacing) {
                console.log(`❌ Not enough space for parapet ${parapet.parapetName} (need ${containerHeight}px, have ${remainingHeight}px) - will be on next page`);
                break; // Stop here, this parapet will be on next page
            }
            
            console.log(`✅ Drawing parapet "${parapet.parapetName}" at Y=${currentY}, height=${containerHeight}px`);
            
            // Draw the parapet container
            await drawParapetContainer(
                pdfDoc, 
                page, 
                parapet, 
                contentAreaX, 
                currentY, 
                contentAreaWidth,
                containerHeight
            );
            
            currentY -= (containerHeight + spacing);
            parapetsDrawnOnPage++;
        }
        
        console.log(`✅ Drew ${parapetsDrawnOnPage} parapets on this page`);
        
        return parapetsDrawnOnPage;
        
    } catch (error) {
        console.error('Error drawing parapets on template:', error);
        throw error;
    }
}

async function drawParapetContainer(pdfDoc, page, parapet, x, y, maxWidth, containerHeight) {
    try {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const containerTop = y;
        const containerBottom = containerTop - containerHeight;
        
        console.log(`📦 Container for parapet "${parapet.parapetName}": ${maxWidth}px wide × ${containerHeight}px tall`);
        
        // Draw main container border
        page.drawRectangle({
            x: x,
            y: containerBottom,
            width: maxWidth,
            height: containerHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        // TWO-COLUMN LAYOUT: [Image Section with label] [Specifications]
        const imageWidth = 250;
        const tableWidth = maxWidth - imageWidth - 2;
        
        // Draw image section with label
        await drawParapetImageSectionWithLabel(pdfDoc, page, parapet, x, containerTop, imageWidth, containerHeight, font, boldFont);
        
        // Draw specifications section
        await drawParapetSpecsTable(pdfDoc, page, parapet, x + imageWidth, containerTop, tableWidth, containerHeight, font, boldFont);
        
        console.log(`✅ Drew parapet container for ${parapet.parapetName}`);
        
        return containerHeight;
        
    } catch (error) {
        console.error('Error drawing parapet container:', error);
        throw error;
    }
}

async function drawParapetImageSectionWithLabel(pdfDoc, page, parapet, x, y, width, height, font, boldFont) {
    try {
        const labelHeight = 20;
        const topPadding = 0;
        const bottomPadding = 0;
        const imageHeight = height - topPadding - bottomPadding - labelHeight;

        // Make image section square - fill completely
        const imageSize = Math.min(width - 2, imageHeight);
        
        // Check if user uploaded an image, otherwise use type image
        let imageKey;
        let isUserImage = false;
        
        if (parapet.images && parapet.images.length > 0 && parapet.images[0].key) {
            // Use user-uploaded image
            imageKey = parapet.images[0].key;
            isUserImage = true;
            console.log(`📸 Fetching user-uploaded parapet image: ${imageKey}`);
        } else {
            // Fall back to type image
            const typeMatch = parapet.parapetType?.match(/\d+/);
            const typeNumber = typeMatch ? typeMatch[0] : '1';
            imageKey = `cfss-options/parapet-${typeNumber}.png`;
            console.log(`📸 Fetching parapet type image: ${imageKey}`);
        }
        
        try {
            const command = new GetObjectCommand({
                Bucket: 'protection-sismique-equipment-images',
                Key: imageKey
            });
            
            const response = await s3Client.send(command);
            const chunks = [];
            
            for await (const chunk of response.Body) {
                chunks.push(chunk);
            }
            
            const imageBuffer = Buffer.concat(chunks);
            
            // Embed image in PDF
            let image;
            const contentType = response.ContentType || 'image/png';
            
            if (contentType.includes('png')) {
                image = await pdfDoc.embedPng(imageBuffer);
            } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
                image = await pdfDoc.embedJpg(imageBuffer);
            } else {
                throw new Error(`Unsupported image type: ${contentType}`);
            }
            
            // Calculate image dimensions to fit in square
            const imgDims = image.scale(1);
            const scale = Math.min(
                imageSize / imgDims.width,
                imageSize / imgDims.height
            );
            
            const scaledWidth = imgDims.width * scale;
            const scaledHeight = imgDims.height * scale;
            
            // Center image in available space
            const imageX = x + (width - scaledWidth) / 2;
            const imageY = y - topPadding - (imageHeight - scaledHeight) / 2 - scaledHeight;
            
            page.drawImage(image, {
                x: imageX,
                y: imageY,
                width: scaledWidth,
                height: scaledHeight
            });
            
            if (isUserImage) {
                console.log(`✅ Drew user-uploaded parapet image: ${imageKey}`);
            } else {
                console.log(`✅ Drew parapet type image: ${imageKey}`);
            }
            
        } catch (imageError) {
            console.warn(`⚠️ Could not load parapet image ${imageKey}:`, imageError.message);
            
            // Draw placeholder if image not found
            const placeholderY = y - topPadding - imageHeight / 2;
            page.drawRectangle({
                x: x + (width - imageSize) / 2,
                y: placeholderY - imageSize / 2,
                width: imageSize,
                height: imageSize,
                borderColor: rgb(0.8, 0.8, 0.8),
                borderWidth: 1
            });
            
            page.drawText('No Image', {
                x: x + width / 2 - 20,
                y: placeholderY,
                size: 10,
                font: font,
                color: rgb(0.5, 0.5, 0.5)
            });
        }
        
        // Draw label at bottom of image section
        const labelY = y - height + labelHeight + 1;
        
        page.drawRectangle({
            x: x + 1,
            y: labelY - labelHeight,
            width: width - 2,
            height: labelHeight,
            color: rgb(0.9, 0.9, 0.9),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5
        });
        
        const labelText = `${parapet.parapetName} - ${parapet.parapetType}`;
        const textWidth = labelText.length * 4;
        page.drawText(labelText, {
            x: x + (width - textWidth) / 2,
            y: labelY - labelHeight / 2 - 4,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        
    } catch (error) {
        console.error('Error drawing parapet image section:', error);
        throw error;
    }
}

async function drawParapetSpecsTable(pdfDoc, page, parapet, x, y, width, height, font, boldFont) {
    try {
        // Draw table background
        page.drawRectangle({
            x: x + 1,
            y: y - height + 1,
            width: width - 2,
            height: height - 2,
            color: rgb(1, 1, 1)
        });
        
        // Draw vertical border between image and table
        page.drawLine({
            start: { x: x, y: y },
            end: { x: x, y: y - height },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        const headerRowHeight = 18;
        const specRowHeight = 14;
        let currentY = y - 8; // Start with top margin
        const labelX = x + 5;
        const valueX = x + (width * 0.4);
        
        console.log(`📋 Drawing parapet specs table: ${width}px wide × ${height}px tall`);
        
        // Format height display
        let hauteurValue = '';

        if (parapet.hauteurMaxUnit === 'mm') {
            // mm → single number with mm suffix
            hauteurValue = `${parapet.hauteurMax}mm`;
        } else {
            // ft-in → X'-Y"
            const major = parapet.hauteurMax || '0';
            const minor = parapet.hauteurMaxMinor || '0';
            hauteurValue = `${major}'-${minor}"`;
        }
        
        // Header with floor and hauteur (NO DEFLEXION)
        const floorValue = String(parapet.floor || 'N/A');
        const headerText = `${floorValue}    HAUTEUR MAX : ${hauteurValue}`;
        
        // Header background
        page.drawRectangle({
            x: x + 2,
            y: currentY - headerRowHeight,
            width: width - 4,
            height: headerRowHeight,
            color: rgb(0.92, 0.92, 0.92)
        });
        
        // Header text
        page.drawText(headerText, {
            x: labelX,
            y: currentY - headerRowHeight + 6,
            size: 12,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        
        currentY -= headerRowHeight;

        // Check if parapet has Set 2
        const hasSet2 = parapet.montantMetallique2 && parapet.montantMetallique2.trim() !== '';

        // Row counter for alternating colors
        let rowCounter = 0;

        // MONTANT MÉTALLIQUE with Espacement
        currentY -= specRowHeight;
        // Draw background
        page.drawRectangle({
            x: x + 2,
            y: currentY - 2,
            width: width - 4,
            height: specRowHeight,
            color: rowCounter % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.97)
        });
        rowCounter++;

        page.drawText('· MONTANT MÉTALLIQUE :', {
            x: labelX,
            y: currentY,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0)
        });

        // Combine montant and espacement
        const montantValue = String(parapet.montantMetallique || 'N/A');
        const espacementValue = String(parapet.espacement || '');
        const combinedValue = espacementValue ? `${montantValue} @${espacementValue}` : montantValue;

        page.drawText(combinedValue, {
            x: valueX,
            y: currentY,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
        });

        // LISSE SUPÉRIEURE
        currentY -= specRowHeight;
        // Draw background
        page.drawRectangle({
            x: x + 2,
            y: currentY - 2,
            width: width - 4,
            height: specRowHeight,
            color: rowCounter % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.97)
        });
        rowCounter++;

        page.drawText('· LISSE SUPÉRIEURE :', {
            x: labelX,
            y: currentY,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        page.drawText(String(parapet.lisseSuperieure || 'N/A'), {
            x: valueX,
            y: currentY,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
        });

        // LISSE INFÉRIEURE
        currentY -= specRowHeight;
        // Draw background
        page.drawRectangle({
            x: x + 2,
            y: currentY - 2,
            width: width - 4,
            height: specRowHeight,
            color: rowCounter % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.97)
        });
        rowCounter++;

        page.drawText('· LISSE INFÉRIEURE :', {
            x: labelX,
            y: currentY,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        page.drawText(String(parapet.lisseInferieure || 'N/A'), {
            x: valueX,
            y: currentY,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
        });

        // ENTREMISE
        currentY -= specRowHeight;
        // Draw background
        page.drawRectangle({
            x: x + 2,
            y: currentY - 2,
            width: width - 4,
            height: specRowHeight,
            color: rowCounter % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.97)
        });
        rowCounter++;

        page.drawText('· ENTREMISE :', {
            x: labelX,
            y: currentY,
            size: 10,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        page.drawText(String(parapet.entremise || 'N/A'), {
            x: valueX,
            y: currentY,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
        });

        // If Set 2 exists, draw separator line and Set 2 specifications
        if (hasSet2) {
            // Draw horizontal separator line between Set 1 and Set 2
            currentY -= 7;
            page.drawLine({
                start: { x: x + 2, y: currentY },
                end: { x: x + width - 2, y: currentY },
                thickness: 1,
                color: rgb(0, 0, 0)
            });
            currentY -= 7;
            // MONTANT MÉTALLIQUE 2 with Espacement 2
            currentY -= specRowHeight;
            page.drawRectangle({
                x: x + 2,
                y: currentY - 2,
                width: width - 4,
                height: specRowHeight,
                color: rowCounter % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.97)
            });
            rowCounter++;

            page.drawText('· MONTANT MÉTALLIQUE :', {
                x: labelX,
                y: currentY,
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0)
            });

            const montantValue2 = String(parapet.montantMetallique2 || 'N/A');
            const espacementValue2 = String(parapet.espacement2 || '');
            const combinedValue2 = espacementValue2 ? `${montantValue2} @${espacementValue2}` : montantValue2;

            page.drawText(combinedValue2, {
                x: valueX,
                y: currentY,
                size: 10,
                font: font,
                color: rgb(0, 0, 0)
            });

            // LISSE SUPÉRIEURE 2
            currentY -= specRowHeight;
            page.drawRectangle({
                x: x + 2,
                y: currentY - 2,
                width: width - 4,
                height: specRowHeight,
                color: rowCounter % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.97)
            });
            rowCounter++;

            page.drawText('· LISSE SUPÉRIEURE :', {
                x: labelX,
                y: currentY,
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0)
            });
            page.drawText(String(parapet.lisseSuperieure2 || 'N/A'), {
                x: valueX,
                y: currentY,
                size: 10,
                font: font,
                color: rgb(0, 0, 0)
            });

            // LISSE INFÉRIEURE 2
            currentY -= specRowHeight;
            page.drawRectangle({
                x: x + 2,
                y: currentY - 2,
                width: width - 4,
                height: specRowHeight,
                color: rowCounter % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.97)
            });
            rowCounter++;

            page.drawText('· LISSE INFÉRIEURE :', {
                x: labelX,
                y: currentY,
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0)
            });
            page.drawText(String(parapet.lisseInferieure2 || 'N/A'), {
                x: valueX,
                y: currentY,
                size: 10,
                font: font,
                color: rgb(0, 0, 0)
            });

            // ENTREMISE 2
            currentY -= specRowHeight;
            page.drawRectangle({
                x: x + 2,
                y: currentY - 2,
                width: width - 4,
                height: specRowHeight,
                color: rowCounter % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.97)
            });
            rowCounter++;

            page.drawText('· ENTREMISE :', {
                x: labelX,
                y: currentY,
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0)
            });
            page.drawText(String(parapet.entremise2 || 'N/A'), {
                x: valueX,
                y: currentY,
                size: 10,
                font: font,
                color: rgb(0, 0, 0)
            });
        }

        console.log(`✅ Parapet specs table drawn successfully`);
        
    } catch (error) {
        console.error('Error drawing parapet specs table:', error);
        throw error;
    }
}

async function fillCFSSWallsTemplateFields(form, project, userInfo, revisionData = null) {
    try {
        console.log('Filling walls/summary template form fields with revisions...');
        
        // Build project address string
        const projectAddress = [
            project.addressLine1,
            project.addressLine2,
            project.city,
            project.province,
            project.country
        ].filter(Boolean).join(', ');
        
        // Get current date in MM/DD/YY format
        const today = new Date();
        const currentDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear().toString().slice(-2)}`;
        
        // Project detail field mappings for sidebar
        const wallsTemplateFieldMappings = {
            'clientName': project.clientName || '',
            'projectTitle': project.name || '',
            'projectAddress': projectAddress,
            'contractNumber': sanitizeText(project.projectNumber) || '',
            'registerDate': currentDate,
            'preparedBy': project.designedBy || 'Dat Bui Tuan',
            'approvedBy': project.approvedBy || 'Duc Hoang Minh',
            'revision': ''
        };
        
        // ADDED: Include revision data in walls/summary templates with new format
        if (revisionData && revisionData.hasRevisions) {
            console.log(`📝 Adding ${revisionData.revisions.length} revisions to WALLS/SUMMARY template`);
            
            revisionData.revisions.forEach((revision, index) => {
                const revisionNum = index + 1;
                
                // CHANGED: Format revision as "01", "02", "03", etc.
                wallsTemplateFieldMappings[`revision${revisionNum}`] = revision.number.toString().padStart(2, '0');
                wallsTemplateFieldMappings[`description${revisionNum}`] = revision.description; // Blank if no description
                wallsTemplateFieldMappings[`Date${revisionNum}`] = revision.date;
                
                console.log(`Added to WALLS/SUMMARY revision ${revisionNum}: ${revision.number.toString().padStart(2, '0')} - ${revision.description || '(no description)'} - ${revision.date}`);
            });
        }
        
        // Fill template fields
        const fields = form.getFields();
        let filledCount = 0;
        
        fields.forEach(field => {
            const fieldName = field.getName();
            
            Object.entries(wallsTemplateFieldMappings).forEach(([suffix, value]) => {
                if (fieldName.endsWith(suffix)) {
                    try {
                        if (field.constructor.name === 'PDFTextField') {
                            field.setText(String(value));
                            console.log(`Filled WALLS/SUMMARY template field ${fieldName}: ${value}`);
                            filledCount++;
                        }
                    } catch (error) {
                        console.warn(`Could not fill WALLS/SUMMARY template field ${fieldName}: ${error.message}`);
                    }
                }
            });
        });
        
        console.log(`Filled ${filledCount} fields in WALLS/SUMMARY template (including ${revisionData?.revisions?.length || 0} revisions)`);
        
    } catch (error) {
        console.error('Error filling WALLS/SUMMARY template fields:', error);
        throw error;
    }
}

async function drawCompactImageSectionWithDynamicLabel(pdfDoc, page, wallGroup, project, x, y, width, height, font, boldFont, containerMaxWidth, imageCache) {
    try {
        const labelHeight = 20;
        const imageHeight = height - labelHeight;
        
        const topPadding = 1;
        const bottomPadding = 1;
        
        const imageTopY = y - topPadding;
        const imageBottomY = y - imageHeight + bottomPadding;
        const actualImageHeight = imageHeight - topPadding - bottomPadding;
        
        // Get first wall's images (limit to 2)
        const firstWall = wallGroup.walls[0];
        const images = (firstWall && firstWall.images) ? firstWall.images.slice(0, 2) : [];
        
        // Draw images section
        if (images.length === 0) {
            // Single placeholder
            page.drawRectangle({
                x: x + 1,
                y: imageBottomY,
                width: width - 2,
                height: actualImageHeight,
                color: rgb(0.96, 0.96, 0.96),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 0.5
            });
            
            page.drawText('No Images', {
                x: x + (width - 60) / 2,
                y: imageBottomY + (actualImageHeight / 2) - 5,
                size: 10,
                font: font,
                color: rgb(0.5, 0.5, 0.5)
            });
        } else if (images.length === 1) {
            // Single image
            await drawSingleWallImage(pdfDoc, page, images[0], project, x + 1, imageBottomY, width - 2, actualImageHeight, font, imageCache);
        } else {
            // Two images symmetrical layout
            const imageWidth = (width - 4) / 2;
            const spacing = 2;
            
            await drawSingleWallImage(pdfDoc, page, images[0], project, x + 1, imageBottomY, imageWidth, actualImageHeight, font, imageCache);
            await drawSingleWallImage(pdfDoc, page, images[1], project, x + 1 + imageWidth + spacing, imageBottomY, imageWidth, actualImageHeight, font, imageCache);
        }
        
        // Draw wall label with dynamic width
        const labelY = y - height + 1;
        const wallName = String(wallGroup.name || 'Wall');
        
        if (images.length <= 1) {
            // Single or no image: label width = image section width
            page.drawRectangle({
                x: x + 1,
                y: labelY,
                width: width - 2,
                height: labelHeight,
                color: rgb(0.9, 0.9, 0.9),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 0.5
            });
            
            const textWidth = wallName.length * 4;
            page.drawText(wallName, {
                x: x + (width - textWidth) / 2,
                y: labelY + (labelHeight / 2) - 4,
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0)
            });
        } else {
            // Two images: label width = full container width
            // Calculate full width (need to account for container margins)
            const fullLabelWidth = containerMaxWidth - 2;
            
            page.drawRectangle({
                x: x - 1, // Extend back to container edge
                y: labelY,
                width: fullLabelWidth,
                height: labelHeight,
                color: rgb(0.9, 0.9, 0.9),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 0.5
            });
            
            const textWidth = wallName.length * 4;
            page.drawText(wallName, {
                x: x + (containerMaxWidth - textWidth) / 2 - 1, // Center across full width
                y: labelY + (labelHeight / 2) - 4,
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0)
            });
        }
        
        console.log(`✅ Compact image section with dynamic label drawn for ${wallGroup.name} with ${images.length} image(s)`);
        
    } catch (error) {
        console.error('Error drawing compact image section with dynamic label:', error);
        throw error;
    }
}

async function drawSingleWallImage(pdfDoc, page, imageData, project, x, y, width, height, font, imageCache) {
    try {
        const imageKey = imageData?.key || imageData?.filename || '';
        const cached = imageCache?.get(imageKey);
        
        if (cached?.buffer) {
            let embeddedImage;
            
            if (cached.format === 'png') {
                embeddedImage = await pdfDoc.embedPng(cached.buffer);
            } else {
                embeddedImage = await pdfDoc.embedJpg(cached.buffer);
            }
            
            // Calculate aspect ratio and fit image within bounds
            const imgDims = embeddedImage.scale(1);
            const imgAspectRatio = imgDims.width / imgDims.height;
            const containerAspectRatio = width / height;
            
            let finalWidth, finalHeight;
            
            if (imgAspectRatio > containerAspectRatio) {
                finalWidth = width;
                finalHeight = width / imgAspectRatio;
            } else {
                finalHeight = height;
                finalWidth = height * imgAspectRatio;
            }
            
            // Center the image
            const imageX = x + (width - finalWidth) / 2;
            const imageY = y + (height - finalHeight) / 2;
            
            // Draw background rectangle
            page.drawRectangle({
                x: x,
                y: y,
                width: width,
                height: height,
                color: rgb(0.96, 0.96, 0.96),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 0.5
            });
            
            // Draw the image
            page.drawImage(embeddedImage, {
                x: imageX,
                y: imageY,
                width: finalWidth,
                height: finalHeight
            });
            
            return true;
        }
    } catch (error) {
        console.warn('Could not embed wall image:', error.message);
    }
    
    // Draw placeholder if image failed to load or not in cache
    page.drawRectangle({
        x: x,
        y: y,
        width: width,
        height: height,
        color: rgb(0.96, 0.96, 0.96),
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5
    });
    
    page.drawText('Image Error', {
        x: x + (width - 60) / 2,
        y: y + (height / 2) - 5,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5)
    });
    
    return false;
}

// Updated groupWallsByName with better debugging
function groupWallsByName(walls) {
    const groups = {};
    
    console.log('�� Starting enhanced wall grouping process...');
    
    walls.forEach((wall, index) => {
        // Use the equipment field as the primary grouping key
        let equipmentName = wall.equipment || wall.wallName || wall.name;
        
        // Handle empty/undefined names more gracefully
        if (!equipmentName || String(equipmentName).trim() === '') {
            equipmentName = `Unnamed Wall ${index + 1}`; // Give it a unique name
            console.log(`⚠️ Wall ${index} has no name, assigning: "${equipmentName}"`);
        } else {
            equipmentName = String(equipmentName).trim();
        }
        
        console.log(`📝 Wall ${index}: equipment="${wall.equipment}", floor="${wall.floor}" -> Group: "${equipmentName}"`);
        
        if (!groups[equipmentName]) {
            groups[equipmentName] = {
                name: equipmentName,
                walls: []
            };
            console.log(`➕ Created new group: "${equipmentName}"`);
        }
        groups[equipmentName].walls.push(wall);
    });
    
    // Debug: Log the final groups
    console.log('📊 Final grouping results:');
    Object.keys(groups).forEach(groupName => {
        const group = groups[groupName];
        console.log(`  Group "${groupName}": ${group.walls.length} walls`);
        group.walls.forEach((wall, idx) => {
            console.log(`    Wall ${idx}: floor="${wall.floor}"`);
        });
    });
    
    return Object.values(groups);
}

// Updated calculateGroupHeight to account for reduced padding and Set 2 specs
function calculateGroupHeight(walls) {
    const headerHeight = 18; // Height for each wall header (floor info)
    const specRowHeight = 14; // Height for each specification row
    const specsPerWallSet1 = 5; // 5 specification rows per wall (Set 1)
    const specsPerWallSet2 = 5; // 5 specification rows for Set 2
    const set2SeparatorHeight = 8; // Separator between Set 1 and Set 2
    const imageHeight = 150; // Fixed image height
    const labelHeight = 25; // Wall name label height
    const separatorHeight = 10; // Separator between walls
    
    // Check if multiple floors - affects spacing
    const uniqueFloors = [...new Set(walls.map(wall => wall.floor))];
    const hasMultipleFloors = uniqueFloors.length >= 2;
    
    // CHANGE 2: Reduce padding for multi-floor layouts
    const padding = hasMultipleFloors ? 10 : 20; // Reduced padding for multi-floor
    
    // Calculate total table height needed, accounting for Set 2 specs
    let totalSpecsHeight = 0;
    walls.forEach(wall => {
        // Set 1 specs (always present)
        totalSpecsHeight += specsPerWallSet1 * specRowHeight;
        
        // Check if wall has Set 2 data
        const hasSet2 = wall.montantMetallique2 && wall.montantMetallique2.trim() !== '';
        if (hasSet2) {
            totalSpecsHeight += set2SeparatorHeight + (specsPerWallSet2 * specRowHeight);
        }
    });
    
    const totalWallHeaders = walls.length * headerHeight;
    const totalSeparators = Math.max(0, walls.length - 1) * separatorHeight;
    const totalTableHeight = totalWallHeaders + totalSpecsHeight + totalSeparators + padding;
    
    // Total image section height (reduced padding)
    const imagePadding = hasMultipleFloors ? 5 : 15; // Less padding for multi-floor
    const totalImageSectionHeight = imageHeight + labelHeight + imagePadding;
    
    // Use the larger of table height or image height, with minimums only (no max caps)
    let calculatedHeight = Math.max(totalTableHeight, totalImageSectionHeight);
    
    // Set minimum bounds based on number of walls and floor count (removed max caps to allow auto-height)
    if (walls.length === 1) {
        calculatedHeight = Math.max(calculatedHeight, hasMultipleFloors ? 120 : 140);
    } else if (walls.length === 2) {
        calculatedHeight = Math.max(calculatedHeight, hasMultipleFloors ? 180 : 200);
    } else {
        calculatedHeight = Math.max(calculatedHeight, hasMultipleFloors ? 240 : 260);
    }
    
    console.log(`📏 Group with ${walls.length} walls (${hasMultipleFloors ? 'multi-floor' : 'single-floor'}): calculated height = ${calculatedHeight}px`);
    
    return calculatedHeight;
}

async function fetchImageBufferByKey(key) {
    const getCmd = new GetObjectCommand({
        Bucket: 'protection-sismique-equipment-images',
        Key: key
    });
    const resp = await s3Client.send(getCmd);
    const chunks = [];
    for await (const chunk of resp.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
}

// Helper function to get CFSS wall image URL
async function getCFSSWallImageUrl(imageData, project) {
    try {
        if (!imageData || !imageData.key) return null;
        
        const getCmd = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: imageData.key
        });
        
        return await getSignedUrl(s3Client, getCmd, { expiresIn: 3600 });
        
    } catch (error) {
        console.error('Error getting CFSS wall image URL:', error);
        return null;
    }
}

async function generateCFSSCustomPages(project, userInfo) {
    try {
      console.log('🧩 Starting CFSS custom pages generation...');
      
      // Build pages array with soffitesCustomPage first
      let pages = [];
      
      // Add soffites custom page first if it exists
      if (project.soffitesCustomPage && project.soffitesCustomPage.elements && project.soffitesCustomPage.elements.length > 0) {
        pages.push(project.soffitesCustomPage);
        console.log('Added soffites custom page as first page');
      }
      
      // Then add regular custom pages
      if (Array.isArray(project.customPages)) {
        pages = pages.concat(project.customPages);
      }
      
      if (pages.length === 0) {
        console.log('No custom pages present, skipping custom pages PDF generation');
        return null;
      }
  
      // Extract revision data for form filling
      const revisionData = extractAndValidateRevisionData(project);
  
      // 1) Load the blank page template from S3 once
      const templateBuffer = await fetchBlankCFSSPageTemplateFromS3();
      
      // 2) FILL THE TEMPLATE BEFORE COPYING
const filledTemplateBuffer = await fillCustomPageTemplate(templateBuffer, project, userInfo, revisionData);
const templateDoc = await PDFDocument.load(filledTemplateBuffer);

// 🔒 Flatten the filled template once (applies to every copied custom page)
try {
const tForm = templateDoc.getForm();
if (!userInfo.isAdmin || shouldForceFlattenForUser(userInfo, project)) {
await updateFieldAppearancesWithUnicodeFont(templateDoc, tForm);
await applyProjectAddressCondensedStyle(pdfDoc);
tForm.flatten();
}
} catch (_) {
// template might have no form — okay
}
  
      // 3) Create our output PDF
      const outDoc = await PDFDocument.create();
  
      // Embed all font variants we might need
      const fonts = {
        helvetica: await outDoc.embedFont(StandardFonts.Helvetica),
        helveticaBold: await outDoc.embedFont(StandardFonts.HelveticaBold),
        helveticaOblique: await outDoc.embedFont(StandardFonts.HelveticaOblique),
        helveticaBoldOblique: await outDoc.embedFont(StandardFonts.HelveticaBoldOblique),
        times: await outDoc.embedFont(StandardFonts.TimesRoman),
        timesBold: await outDoc.embedFont(StandardFonts.TimesRomanBold),
        timesItalic: await outDoc.embedFont(StandardFonts.TimesRomanItalic),
        timesBoldItalic: await outDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
        courier: await outDoc.embedFont(StandardFonts.Courier),
        courierBold: await outDoc.embedFont(StandardFonts.CourierBold),
        courierOblique: await outDoc.embedFont(StandardFonts.CourierOblique),
        courierBoldOblique: await outDoc.embedFont(StandardFonts.CourierBoldOblique)
      };
  
      // We'll copy the first page of the filled template for each custom page
      const templateIndices = templateDoc.getPageIndices();
  
      for (const p of pages) {
        // Copy the filled template's first page into the output
        const [tplPage] = await outDoc.copyPages(templateDoc, [templateIndices[0]]);
        outDoc.addPage(tplPage);
        const page = tplPage;
  
        // Get size from the template page
        const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = page.getSize();
  
        // Scale from the saved canvas size to the PDF template size
        const cw = Math.max(1, Number(p.canvasWidth || 800));
        const ch = Math.max(1, Number(p.canvasHeight || 1120));
        const scaleX = PAGE_WIDTH / cw;
        const scaleY = PAGE_HEIGHT / ch;
  
        if (!Array.isArray(p.elements)) continue;
  
        for (const el of p.elements) {
          const x = (el?.position?.x || 0) * scaleX;
          const yCanvasTop = (el?.position?.y || 0);
          const w = (el?.size?.width || 0) * scaleX;
          const h = (el?.size?.height || 0) * scaleY;
  
          // Convert top-down canvas Y to PDF bottom-up Y
          const y = PAGE_HEIGHT - (yCanvasTop * scaleY) - h;
  
          if (el.type === 'heading' || el.type === 'text') {
            const px = parseFloat(String(el.fontSize || '16').replace('px', '')) || 16;
            const fontSize = px * ((scaleX + scaleY) / 2);
            const align = (el.textAlign || 'left');
            const text = String(el.content || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')         // Convert &nbsp; to regular space
            .replace(/&lt;/g, '<')           // Decode < 
            .replace(/&gt;/g, '>')           // Decode >
            .replace(/&amp;/g, '&')          // Decode &
            .replace(/&quot;/g, '"')         // Decode "
            .replace(/&#39;/g, "'");         // Decode '
  
            const lines = text.split('\n');
            let cursorY = y + h - fontSize;
            
            // Parse color (hex to RGB)
            const color = hexToRgb(el.color || '#000000');
            
            // Determine font based on fontFamily, fontWeight, and fontStyle
            const drawFont = selectFont(fonts, el.fontFamily, el.fontWeight, el.fontStyle);
            const isUnderlined = (el.textDecoration === 'underline');
  
            for (const line of lines) {
              const t = line.trim();
              if (!t) {
                cursorY -= fontSize * 1.2;
                continue;
              }
  
              const textWidth = drawFont.widthOfTextAtSize(t, fontSize);
  
              let drawX = x;
              if (align === 'center') {
                drawX = x + (w - textWidth) / 2;
              } else if (align === 'right') {
                drawX = x + w - textWidth;
              }
  
              page.drawText(t, {
                x: drawX,
                y: cursorY,
                size: fontSize,
                font: drawFont,
                color: rgb(color.r, color.g, color.b)
              });
              
              // Draw underline if needed
              if (isUnderlined) {
                const underlineY = cursorY - 2;
                page.drawLine({
                  start: { x: drawX, y: underlineY },
                  end: { x: drawX + textWidth, y: underlineY },
                  thickness: Math.max(1, fontSize * 0.05),
                  color: rgb(color.r, color.g, color.b)
                });
              }
              
              cursorY -= fontSize * 1.2;
            }
        } else if (el.type === 'image') {
            try {
              let bytes = null;
              let isPng = false;
          
              if (el.imageData && typeof el.imageData === 'string') {
                // data URL path (legacy)
                const base64Data = el.imageData.split(',')[1] || el.imageData;
                bytes = Buffer.from(base64Data, 'base64');
                const lower = el.imageData.toLowerCase();
                isPng = lower.includes('png');
              } else if (el.imageKey) {
                // preferred: fetch by stable S3 key
                bytes = await fetchImageBufferByKey(el.imageKey);
                const lowerKey = String(el.imageKey).toLowerCase();
                isPng = lowerKey.endsWith('.png');
              } else if (el.imageUrl && el.imageUrl.startsWith('data:image/')) {
                // safety: if the canvas ever stores a data URL in imageUrl
                const base64Data = el.imageUrl.split(',')[1];
                bytes = Buffer.from(base64Data, 'base64');
                const lower = el.imageUrl.toLowerCase();
                isPng = lower.includes('png');
              }
          
              if (bytes) {
                const img = isPng ?
                  await outDoc.embedPng(bytes) : await outDoc.embedJpg(bytes);
                page.drawImage(img, { x, y, width: w, height: h });
              } else {
                console.warn('Custom page image missing bytes for element:', el);
              }
            } catch (imgErr) {
              console.warn('Failed to embed custom page image:', imgErr);
            }
          }
        }
      }
  
      return await outDoc.save();
    } catch (error) {
      console.error('❌ Error generating CFSS custom pages from template:', error);
      throw new Error(`Failed to generate CFSS custom pages: ${error.message}`);
    }
}

// Helper function to convert hex or rgb color to RGB values
function hexToRgb(colorString) {
    // Default to black if no color provided
    if (!colorString) return { r: 0, g: 0, b: 0 };
    
    const color = String(colorString).trim();
    
    // Handle rgb() or rgba() format
    if (color.startsWith('rgb')) {
      const matches = color.match(/\d+/g);
      if (matches && matches.length >= 3) {
        return {
          r: parseInt(matches[0]) / 255,
          g: parseInt(matches[1]) / 255,
          b: parseInt(matches[2]) / 255
        };
      }
    }
    
    // Handle hex format
    let hex = color.replace('#', '');
    
    // Handle shorthand hex (e.g., #fff)
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    
    // Validate hex
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
      console.warn('Invalid color format:', colorString, '- defaulting to black');
      return { r: 0, g: 0, b: 0 };
    }
    
    // Parse hex values
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    
    return { r, g, b };
  }
  
  // Helper function to select the appropriate font based on family and style
  function selectFont(fonts, fontFamily, fontWeight, fontStyle) {
    // Clean up font family string - remove quotes and get first font in the stack
    const cleanFamily = (fontFamily || 'Arial, sans-serif')
      .toLowerCase()
      .replace(/['"]/g, '')  // Remove all quotes
      .split(',')[0]         // Get first font in stack
      .trim();
    
    const isBold = (fontWeight === 'bold');
    const isItalic = (fontStyle === 'italic');
    
    console.log('Font selection:', { cleanFamily, isBold, isItalic });
    
    // Map font families to PDF standard fonts
    if (cleanFamily.includes('times')) {
      if (isBold && isItalic) return fonts.timesBoldItalic;
      if (isBold) return fonts.timesBold;
      if (isItalic) return fonts.timesItalic;
      return fonts.times;
    } else if (cleanFamily.includes('courier')) {
      if (isBold && isItalic) return fonts.courierBoldOblique;
      if (isBold) return fonts.courierBold;
      if (isItalic) return fonts.courierOblique;
      return fonts.courier;
    } else {
      // Default to Helvetica for Arial, Verdana, Trebuchet, Impact, Comic Sans, Georgia, etc.
      if (isBold && isItalic) return fonts.helveticaBoldOblique;
      if (isBold) return fonts.helveticaBold;
      if (isItalic) return fonts.helveticaOblique;
      return fonts.helvetica;
    }
  }
  
  // NEW HELPER FUNCTION: Fill the template once before copying
  async function fillCustomPageTemplate(templateBuffer, project, userInfo, revisionData) {
    try {
      const pdfDoc = await PDFDocument.load(templateBuffer);
      const form = pdfDoc.getForm();
      
      // Build project address string
      const projectAddress = [
        project.addressLine1,
        project.addressLine2,
        project.city,
        project.province,
        project.country
      ].filter(Boolean).join(', ');
      
      // Get current date in MM/DD/YY format
      const today = new Date();
      const currentDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear().toString().slice(-2)}`;
      
      // Project detail field mappings for sidebar
      const customPageFieldMappings = {
        'clientName': project.clientName || '',
        'projectTitle': project.name || '',
        'projectAddress': projectAddress,
        'contractNumber': sanitizeText(project.projectNumber) || '',
        'registerDate': currentDate,
        'preparedBy': sanitizeText(project.designedBy) || 'Dat Bui Tuan',
        'approvedBy': sanitizeText(project.approvedBy) || 'Minh Duc Hoang, ing',
        'revision': '',
      };
      
      // Add revision data to field mappings
      if (revisionData && revisionData.hasRevisions) {
        console.log(`📋 Adding ${revisionData.revisions.length} revisions to custom page template`);
        
        revisionData.revisions.forEach((revision, index) => {
          const revisionNum = index + 1;
          customPageFieldMappings[`revision${revisionNum}`] = revision.number.toString().padStart(2, '0');
          customPageFieldMappings[`description${revisionNum}`] = revision.description;
          customPageFieldMappings[`Date${revisionNum}`] = revision.date;
        });
      }
      
      // Fill form fields
      const fields = form.getFields();
      let filledCount = 0;
      
      fields.forEach(field => {
        const fieldName = field.getName();
        
        Object.entries(customPageFieldMappings).forEach(([suffix, value]) => {
          if (fieldName.endsWith(suffix)) {
            try {
              if (field.constructor.name === 'PDFTextField') {
                field.setText(String(value));
                console.log(`Filled custom page field ${fieldName}: ${value}`);
                filledCount++;
              }
            } catch (error) {
              console.warn(`Could not fill custom page field ${fieldName}: ${error.message}`);
            }
          }
        });
      });
      
      console.log(`✅ Filled ${filledCount} custom page form fields in template`);
      
      try {
        await updateFieldAppearancesWithUnicodeFont(pdfDoc, form);
        await applyProjectAddressCondensedStyle(pdfDoc);
      } catch (error) {
        console.warn('Could not update custom page form appearances:', error.message);
      }
      
      return await pdfDoc.save();
      
    } catch (error) {
      console.error('Error filling custom page template:', error);
      throw error;
    }
  }

function extractAndValidateRevisionData(project) {
    const wallRevisions = project.wallRevisions || [];
    
    if (wallRevisions.length === 0) {
        console.log('📋 No wall revisions found');
        return {
            revisions: [],
            totalRevisions: 0,
            hasRevisions: false
        };
    }
    
    // Sort revisions by number to ensure proper order
    const sortedRevisions = [...wallRevisions].sort((a, b) => a.number - b.number);
    
    const revisionData = {
        revisions: sortedRevisions.map(rev => ({
            number: rev.number,
            description: rev.description || 'Pour construction', // Default if no description
            date: new Date(rev.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }),
            createdBy: rev.createdBy || 'Unknown',
            wallsCount: rev.walls?.length || 0
        })),
        totalRevisions: sortedRevisions.length,
        hasRevisions: true,
        currentRevisionId: project.currentWallRevisionId
    };
    
    console.log('📋 Revision data extracted:', {
        totalRevisions: revisionData.totalRevisions,
        hasRevisions: revisionData.hasRevisions,
        currentRevisionId: revisionData.currentRevisionId,
        revisionNumbers: revisionData.revisions.map(r => r.number)
    });
    
    return revisionData;
}

// Updated merge function to include summary table
async function mergeCFSSPDFsWithSummary(coverPdfBytes, wallDetailsPdfBytes, summaryTablePdfBytes) {
    try {
        const mergedPdf = await PDFDocument.create();
        
        // 1. Add cover page
        const coverPdf = await PDFDocument.load(coverPdfBytes);
        const coverPages = await mergedPdf.copyPages(coverPdf, coverPdf.getPageIndices());
        coverPages.forEach(page => mergedPdf.addPage(page));
        
        // 2. Add wall detail pages if any exist
        if (wallDetailsPdfBytes && wallDetailsPdfBytes.length > 0) {
            const wallDetailsPdf = await PDFDocument.load(wallDetailsPdfBytes);
            const wallPages = await mergedPdf.copyPages(wallDetailsPdf, wallDetailsPdf.getPageIndices());
            wallPages.forEach(page => mergedPdf.addPage(page));
        }
        
        // 3. Add summary table page
        if (summaryTablePdfBytes && summaryTablePdfBytes.length > 0) {
            const summaryTablePdf = await PDFDocument.load(summaryTablePdfBytes);
            const summaryPages = await mergedPdf.copyPages(summaryTablePdf, summaryTablePdf.getPageIndices());
            summaryPages.forEach(page => mergedPdf.addPage(page));
            console.log('✅ Summary table page added to final PDF');
        }
        
        // 4. Fill sheet numbers for all pages except cover (page 0)
        try {
            const totalPages = mergedPdf.getPageCount();
            const boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
            
            for (let i = 0; i < totalPages; i++) { // Start from 0 to include cover page
              const page = mergedPdf.getPage(i);
              const { width, height } = page.getSize();
              const pageNumber = i + 1;
              const sheetNumber = `S-${pageNumber}`; // S-1, S-2, S-3, etc.
              
              // Adjust x position based on single vs double digit page numbers
              const xPosition = pageNumber < 10 ? 1188 : 1185;
              
              // Draw text in bottom right
              page.drawText(sheetNumber, {
                x: xPosition,  // 1188 for single digit, 1185 for double digit
                y: 43,         // 35px from bottom
                size: 10,
                font: boldFont,
                color: rgb(0, 0, 0),
              });
              
              console.log(`✅ Drew ${sheetNumber} on page ${i} at x=${xPosition}`);
            }
            
            console.log('✅ Sheet numbers drawn on all pages');
          } catch (error) {
            console.warn('⚠️ Could not draw sheet numbers:', error.message);
            // Don't throw - sheet numbers are not critical
          }
        
        return await mergedPdf.save();
        
    } catch (error) {
        console.error('❌ Error merging CFSS PDFs with summary:', error);
        throw error;
    }
}

// Fetch the blank CFSS page template from S3: report/blank-cfss-page.pdf
async function fetchBlankCFSSPageTemplateFromS3() {
    const key = 'report/blank-cfss-page.pdf';
    const cmd = new GetObjectCommand({
      Bucket: 'protection-sismique-equipment-images',
      Key: key,
    });
    const resp = await s3Client.send(cmd);
    const chunks = [];
    for await (const c of resp.Body) chunks.push(c);
    return Buffer.concat(chunks);
  }

// Fetch CFSS Template from S3
async function fetchCFSSTemplateFromS3() {
    try {
        const templateKey = 'report/CFSS-cover.pdf';
        console.log(`📥 Fetching CFSS template: ${templateKey}`);
        
        const command = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: templateKey
        });
        
        const response = await s3Client.send(command);
        const chunks = [];
        
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        console.log(`✅ CFSS template fetched, size: ${buffer.length}`);
        
        return buffer;
        
    } catch (error) {
        console.error(`❌ Error fetching CFSS template:`, error);
        throw new Error(`Failed to fetch CFSS PDF template`);
    }
} 

async function generateCFSSSummaryTable(project, userInfo) {
    try {
        console.log('📊 Generating CFSS summary table with revisions...');
        
        const walls = project.walls || project.equipment || [];
        
        // ADDED: Extract revision data
        const revisionData = extractAndValidateRevisionData(project);
        
        // Calculate if we need multiple pages
        const maxRowsPerPage = 15; // Conservative estimate based on template space
        const totalPages = Math.ceil(walls.length / maxRowsPerPage);
        
        console.log(`Need ${totalPages} page(s) for ${walls.length} walls`);
        
        if (totalPages <= 1) {
            // Single page - use existing logic
            const templateBuffer = await fetchCFSSSummaryTemplateFromS3();
            const pdfDoc = await PDFDocument.load(templateBuffer);
            const pages = pdfDoc.getPages();
            const page = pages[0];
            
            // Fill form fields if they exist
            try {
                const form = pdfDoc.getForm();
                // CHANGED: Pass revision data to summary template
                await fillCFSSWallsTemplateFields(form, project, userInfo, revisionData);

                // Use Unicode-capable font for updateFieldAppearances to support Vietnamese characters (e.g. "đ")
                pdfDoc.registerFontkit(fontkit);
                const summaryFontPath = path.resolve('./fonts/RobotoCondensed-Regular.ttf');
                const summaryFontBuffer = await fs.promises.readFile(summaryFontPath);
                const summaryUnicodeFont = await pdfDoc.embedFont(new Uint8Array(summaryFontBuffer));
                form.updateFieldAppearances(summaryUnicodeFont);

                await applyProjectAddressCondensedStyle(pdfDoc);
                if (!userInfo.isAdmin || shouldForceFlattenForUser(userInfo, project)) {
                    form.flatten(); // flatten form fields (allowed cases)
                  } else {
                    console.log('⏭️ Skipping summary table flatten for admin (No Sign & Flatten).');
                  }
            } catch (formError) {
                console.log('No form fields found in summary template');
            }
            
            await drawCFSSSummaryTable(pdfDoc, page, project);
            
            return await pdfDoc.save();
        } else {
            // Multiple pages needed - for now, just show first page with truncation
            console.log('⚠️ Table requires multiple pages - showing first page only');
            
            const templateBuffer = await fetchCFSSSummaryTemplateFromS3();
            const pdfDoc = await PDFDocument.load(templateBuffer);
            const pages = pdfDoc.getPages();
            const page = pages[0];
            
            try {
                const form = pdfDoc.getForm();
                // CHANGED: Pass revision data to summary template
                await fillCFSSWallsTemplateFields(form, project, userInfo, revisionData);

                // Use Unicode-capable font for updateFieldAppearances to support Vietnamese characters (e.g. "đ")
                pdfDoc.registerFontkit(fontkit);
                const summaryFontPath2 = path.resolve('./fonts/RobotoCondensed-Regular.ttf');
                const summaryFontBuffer2 = await fs.promises.readFile(summaryFontPath2);
                const summaryUnicodeFont2 = await pdfDoc.embedFont(new Uint8Array(summaryFontBuffer2));
                form.updateFieldAppearances(summaryUnicodeFont2);

                await applyProjectAddressCondensedStyle(pdfDoc);
                form.flatten();
            } catch (formError) {
                console.log('No form fields found in summary template');
            }
            
            await drawCFSSSummaryTable(pdfDoc, page, project);
 
            return await pdfDoc.save();
        }
        
    } catch (error) {
        console.error('❌ Error generating CFSS summary table with revisions:', error);
        throw new Error(`Failed to generate CFSS summary table: ${error.message}`);
    }
}

// Function to fetch the summary template from S3
async function fetchCFSSSummaryTemplateFromS3() {
    try {
        const templateKey = 'report/blank-cfss-page.pdf';
        console.log(`📥 Fetching CFSS summary template: ${templateKey}`);
        
        const command = new GetObjectCommand({
            Bucket: 'protection-sismique-equipment-images',
            Key: templateKey
        });
        
        const response = await s3Client.send(command);
        const chunks = [];
        
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        console.log(`✅ CFSS summary template fetched, size: ${buffer.length}`);
        
        return buffer;
        
    } catch (error) {
        console.error(`❌ Error fetching CFSS summary template:`, error);
        throw new Error(`Failed to fetch CFSS summary template`);
    }
}

// Function to draw the summary table on the PDF page with NOTE column - FIXED HEADERS
async function drawCFSSSummaryTable(pdfDoc, page, project) {
    try {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const { width, height } = page.getSize();
        
        // FIXED: Significantly increased margins to avoid sidebar overlap
        const tableStartY = height - 100; // Start from top with margin
        const tableX = 60; // Increased left margin from 50 to 60
        const tableWidth = width - 300; // Increased total margin from 120 to 300 to leave space for sidebar
        const maxTableHeight = height - 300; // Reserve space for template content at bottom
        
        const walls = project.walls || project.equipment || [];
        
        // DEBUG: Log wall data to identify missing instances
        console.log('=== CFSS SUMMARY TABLE DEBUG ===');
        console.log(`Total walls received: ${walls.length}`);
        walls.forEach((wall, index) => {
            console.log(`Wall ${index + 1}:`, {
                equipment: wall.equipment,
                floor: wall.floor,
                id: wall.id,
                note: wall.note
            });
        });
        console.log('=== END DEBUG ===');
        
        if (walls.length === 0) {
            // Draw "No walls" message
            page.drawText('Aucun mur trouvé', {
                x: tableX + tableWidth / 2 - 50,
                y: tableStartY - 50,
                size: 14,
                font: font,
                color: rgb(0.5, 0.5, 0.5)
            });
            return;
        }
        
        // Table configuration - reduced sizes
        const headerHeight = 26; 
        const rowHeight = 16; 
        const fontSize = 9; 
        const headerFontSize = 9; 
        
        // Calculate how many rows can fit
        const availableHeight = maxTableHeight - headerHeight;
        const maxRows = Math.floor(availableHeight / rowHeight);
        
        console.log(`Table space: ${maxTableHeight}px, can fit ${maxRows} rows, have ${walls.length} walls`);
        
        // Adjusted column widths with NOTE column added
        const columnWidths = {
            typeDeMur: tableWidth * 0.09,        // 10%
            floor: tableWidth * 0.07,            // 5%
            montant: tableWidth * 0.14,          // 15%
            espacement: tableWidth * 0.08,       // 7%
            lisseSuperieure: tableWidth * 0.13,  // Reduced from 16% to 12%
            lisseInferieure: tableWidth * 0.10,  // Reduced from 16% to 12%
            entremise: tableWidth * 0.12,        // Reduced from 10% to 8%
            hauteurImperial: tableWidth * 0.09,  // 9%
            hauteurMetrique: tableWidth * 0.09,  // 9%
            note: tableWidth * 0.09              // NEW: 10% for NOTE column
        };
        // Total: 100% - optimized with NOTE column
        
        const getMaxChars = (colWidth) => Math.floor(colWidth / (fontSize * 0.6)) - 2;

        // Draw table title
        page.drawText('SPÉCIFICATION OSSATURE', {
            x: tableX + tableWidth / 2 - 70,
            y: tableStartY + 20,
            size: 11,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        
        // Draw table headers
        let currentX = tableX;
        const headerY = tableStartY;
        
        // Added NOTE column to headers
        const headers = [
            'TYPE DE MUR',
            'NIVEAU', 
            'MONTANT MÉTALLIQUE',
            'ESPACEMENT',
            'LISSE SUPÉRIEURE',
            'LISSE INFÉRIEURE', 
            'ENTREMISE',
            'HAUTEUR MAX\n(impérial)',
            'HAUTEUR MAX\n(métrique)',
            'NOTE'
        ];
        
        const widthKeys = Object.keys(columnWidths); // Now includes note column
        
        // Draw header background
        page.drawRectangle({
            x: tableX,
            y: headerY - headerHeight,
            width: tableWidth,
            height: headerHeight,
            color: rgb(0.9, 0.9, 0.9),
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        // FIXED: Draw header text and vertical borders with corrected positioning
        headers.forEach((header, index) => {
            const colWidth = columnWidths[widthKeys[index]];
            
            // Handle multi-line headers with CORRECTED positioning
            const headerLines = header.split('\n');
            const isSingleLine = headerLines.length === 1;
            
            headerLines.forEach((line, lineIndex) => {
                // FIXED: Use actual text width for proper centering
                const textWidth = boldFont.widthOfTextAtSize(line, headerFontSize);
                const textX = currentX + (colWidth - textWidth) / 2;
                
                // FIXED: Different positioning logic for single vs multi-line headers
                let textY;
                if (isSingleLine) {
                    // Single line headers: position -2px up from bottom baseline
                    textY = (headerY - headerHeight) + headerFontSize -1;
                } else {
                    // Multi-line headers: stack from bottom up -5px
                    const lineFromBottom = headerLines.length - 1 - lineIndex;
                    textY = (headerY - headerHeight) - 4 + headerFontSize + (lineFromBottom * (headerFontSize + 1));
                }
                
                page.drawText(line, {
                    x: textX,
                    y: textY,
                    size: headerFontSize,
                    font: boldFont,
                    color: rgb(0, 0, 0)
                });
            });
            
            // Draw vertical border (except for last column)
            if (index < headers.length - 1) {
                page.drawLine({
                    start: { x: currentX + colWidth, y: headerY },
                    end: { x: currentX + colWidth, y: headerY - headerHeight },
                    thickness: 1,
                    color: rgb(0, 0, 0)
                });
            }
            
            currentX += colWidth;
        });
        
        // Draw horizontal line under header row
        page.drawLine({
            start: { x: tableX, y: headerY - headerHeight },
            end: { x: tableX + tableWidth, y: headerY - headerHeight },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        // Determine which walls to show (limit to what fits)
        const wallsToShow = walls.slice(0, maxRows);
        const hasMoreWalls = walls.length > maxRows;
        
        if (hasMoreWalls) {
            console.log(`⚠️ Table truncated: showing ${maxRows} of ${walls.length} walls`);
        }
        
        // Draw data rows with dynamic row height for notes
        let currentRowY = headerY - headerHeight;
        
        wallsToShow.forEach((wall, wallIndex) => {
            const hasSet2 = wall.montantMetallique2 && wall.montantMetallique2.trim() !== '';
            const rowsForThisWall = hasSet2 ? 2 : 1;
            
            console.log(`Drawing wall "${wall.equipment}" with ${rowsForThisWall} row(s) at Y=${currentRowY}`);
            
            // Calculate row height for this wall
            const noteText = wall.note || '';
            const noteColumnWidth = columnWidths.note;
            const baseRowHeight = rowHeight;
            
            // Calculate lines needed for note text
            const charsPerLine = Math.floor(noteColumnWidth / (fontSize * 0.5));
            const noteLines = noteText.length > 0 ? Math.ceil(noteText.length / charsPerLine) : 1;
            const minLines = 1;
            const actualRowHeight = Math.max(baseRowHeight, minLines * (fontSize + 2) + 6);
            const finalRowHeight = Math.max(actualRowHeight, noteLines * (fontSize + 1) + 4);
            
            // Total height for this wall (1 or 2 rows)
            const totalWallHeight = finalRowHeight * rowsForThisWall;
            
            // Move Y position BEFORE drawing the row(s)
            currentRowY -= totalWallHeight;
            
            // Convert height values
            const { imperial, metric } = convertHeightValues(wall);
            
            // Function to draw a single row (Set 1 or Set 2)
            const drawRow = (setNumber, rowY) => {
                let currentX = tableX;
                const widthKeys = Object.keys(columnWidths);
                
                // Prepare row data based on set number
                let rowData;
                if (setNumber === 1) {
                    rowData = [
                        truncateText(wall.equipment || '', getMaxChars(columnWidths.typeDeMur)),
                        truncateText(wall.floor || '', getMaxChars(columnWidths.floor)),
                        truncateText((wall.montantMetallique || '') + (wall.dosADos ? ' dos-à-dos' : ''), getMaxChars(columnWidths.montant)),
                        truncateText(wall.espacement || '', getMaxChars(columnWidths.espacement)),
                        truncateText(wall.lisseSuperieure || '', getMaxChars(columnWidths.lisseSuperieure)),
                        truncateText(wall.lisseInferieure || '', getMaxChars(columnWidths.lisseInferieure)),
                        truncateText(wall.entremise || '', getMaxChars(columnWidths.entremise)),
                        truncateText(imperial, getMaxChars(columnWidths.hauteurImperial)),
                        truncateText(metric, getMaxChars(columnWidths.hauteurMetrique)),
                        noteText
                    ];
                } else {
                    // Set 2 row - only fill montant/espacement/lisse/entremise columns
                    rowData = [
                        '', // typeDeMur - empty (rowspan)
                        '', // floor - empty (rowspan)
                        truncateText((wall.montantMetallique2 || '') + (wall.dosADos2 ? ' dos-à-dos' : ''), getMaxChars(columnWidths.montant)),
                        truncateText(wall.espacement2 || '', getMaxChars(columnWidths.espacement)),
                        truncateText(wall.lisseSuperieure2 || '', getMaxChars(columnWidths.lisseSuperieure)),
                        truncateText(wall.lisseInferieure2 || '', getMaxChars(columnWidths.lisseInferieure)),
                        truncateText(wall.entremise2 || '', getMaxChars(columnWidths.entremise)),
                        '', // hauteurImperial - empty (rowspan)
                        '', // hauteurMetrique - empty (rowspan)
                        ''  // note - empty (rowspan)
                    ];
                }
                
                // Draw each cell
                rowData.forEach((cellData, cellIndex) => {
                    const colWidth = columnWidths[widthKeys[cellIndex]];
                    
                    // Skip drawing empty cells (they're part of rowspan)
                    if (cellData === '') {
                        currentX += colWidth;
                        return;
                    }
                    
                    // Special handling for NOTE column (last column) - allow text wrapping
                    if (cellIndex === rowData.length - 1 && noteText.length > 0) {
                        // Only draw note on first row
                        if (setNumber === 1) {
                            const words = String(cellData).split(' ');
                            let currentLine = '';
                            let lineY = hasSet2 
                            ? currentRowY + (totalWallHeight / 2) - 4
                            : rowY + (finalRowHeight / 2) - 4;
                            let linesDrawn = 0;
                            const maxLines = Math.floor((finalRowHeight - 6) / (fontSize + 1));
                            
                            for (let word of words) {
                                const testLine = currentLine ? `${currentLine} ${word}` : word;
                                const testWidth = testLine.length * (fontSize * 0.5);
                                
                                if (testWidth <= colWidth - 6 && linesDrawn < maxLines) {
                                    currentLine = testLine;
                                } else {
                                    if (currentLine && linesDrawn < maxLines) {
                                        page.drawText(currentLine, {
                                            x: currentX + colWidth / 2 - (currentLine.length * fontSize * 0.3),
                                            y: lineY - (linesDrawn * (fontSize + 1)),
                                            size: fontSize,
                                            font: font,
                                            color: rgb(0, 0, 0)
                                        });
                                        linesDrawn++;
                                    }
                                    currentLine = word;
                                }
                            }
                            
                            if (currentLine && linesDrawn < maxLines) {
                                page.drawText(currentLine, {
                                    x: currentX + colWidth / 2 - (currentLine.length * fontSize * 0.3),
                                    y: lineY - (linesDrawn * (fontSize + 1)),
                                    size: fontSize,
                                    font: font,
                                    color: rgb(0, 0, 0)
                                });
                            }
                        }
                    } else {
                        // Regular cell drawing
                        const textValue = String(cellData);
                        const textWidth = font.widthOfTextAtSize(textValue, fontSize);
                        
                        // For merged cells (type, floor, hauteur imperial, hauteur metric), center vertically across total height
                        const isMergedCell = hasSet2 && setNumber === 1 && 
                            (cellIndex === 0 || cellIndex === 1 || cellIndex === 7 || cellIndex === 8);
                        const verticalY = isMergedCell 
                            ? currentRowY + (totalWallHeight / 2) - 4 
                            : rowY + (finalRowHeight / 2) - 4;
                        
                        page.drawText(textValue, {
                            x: currentX + (colWidth - textWidth) / 2,
                            y: verticalY,
                            size: fontSize,
                            font: font,
                            color: rgb(0, 0, 0)
                        });
                    }
                    
                    // Draw vertical border (except for last column)
                    if (cellIndex < rowData.length - 1) {
                        // For rowspan cells, draw full height border
                        const borderHeight = (cellData === '' && hasSet2) ? totalWallHeight : finalRowHeight;
                        const borderStartY = (cellData === '' && hasSet2) ? currentRowY + totalWallHeight : rowY + finalRowHeight;
                        
                        page.drawLine({
                            start: { x: currentX + colWidth, y: borderStartY },
                            end: { x: currentX + colWidth, y: currentRowY },
                            thickness: 1,
                            color: rgb(0, 0, 0)
                        });
                    }
                    
                    currentX += colWidth;
                });
                
                // Draw horizontal border for this row (only between Set 1 and Set 2)
                if (setNumber === 1 && hasSet2) {
                    // Draw partial line only for the columns that have data in Set 2
                    // Start from montant column (skip typeDeMur and floor)
                    const montantStartX = tableX + columnWidths.typeDeMur + columnWidths.floor;
                    const lineEndX = montantStartX + columnWidths.montant + columnWidths.espacement + 
                                    columnWidths.lisseSuperieure + columnWidths.lisseInferieure + columnWidths.entremise;
                    
                    page.drawLine({
                        start: { x: montantStartX, y: rowY },
                        end: { x: lineEndX, y: rowY },
                        thickness: 1,
                        color: rgb(0, 0, 0)
                    });
                }
            };
            
            // Draw Set 1
            drawRow(1, currentRowY + totalWallHeight - finalRowHeight);
            
            // Draw Set 2 if it exists
            if (hasSet2) {
                drawRow(2, currentRowY);
            }
            
            // Draw bottom border of wall section
            page.drawLine({
                start: { x: tableX, y: currentRowY },
                end: { x: tableX + tableWidth, y: currentRowY },
                thickness: 1,
                color: rgb(0, 0, 0)
            });
        });

// ========== ADD PARAPETS TO TABLE ==========
// Get parapets from project
const parapets = project.parapets || [];

console.log(`Adding ${parapets.length} parapets to table below walls`);

// Process each parapet
parapets.forEach((parapet, parapetIndex) => {
    // Check if we have space for this row
    if (wallsToShow.length + parapetIndex >= maxRows) {
        hasMoreWalls = true;
        return;
    }
    
    // Calculate row height for parapet
    const noteText = parapet.note || '';
    const noteColumnWidth = columnWidths.note;
    const charsPerLine = Math.floor(noteColumnWidth / (fontSize * 0.5));
    const noteLines = noteText.length > 0 ? Math.ceil(noteText.length / charsPerLine) : 1;
    const minLines = 1;
    const actualRowHeight = Math.max(rowHeight, minLines * (fontSize + 2) + 6);
    const finalRowHeight = Math.max(actualRowHeight, noteLines * (fontSize + 1) + 4);
    
    currentRowY -= finalRowHeight;
    
    // Convert parapet height to imperial and metric
    const major = parapet.hauteurMax || '0';
    const majorUnit = parapet.hauteurMaxUnit || 'ft';
    const minor = parapet.hauteurMaxMinor || '0';
    const minorUnit = parapet.hauteurMaxMinorUnit || 'in';
    
    let imperial = '';
    let metric = '';
    
    // Convert to imperial (ft-in)
    if (majorUnit === 'ft') {
        const feet = major;
        const inches = minorUnit === 'in' ? minor : '0';
        imperial = `${feet}'-${inches}"`;
    } else if (majorUnit === 'm') {
        // Convert meters to feet and inches
        const totalMeters = parseFloat(major) + (minorUnit === 'cm' ? parseFloat(minor) / 100 : 0);
        const totalInches = totalMeters * 39.3701;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        imperial = `${feet}'-${inches}"`;
    }
    
    // Convert to metric (mm)
    if (majorUnit === 'm') {
        let minorMeters = 0;
        if (minorUnit === 'mm') {
            minorMeters = parseFloat(minor) / 1000;
        } else if (minorUnit === 'cm') {
            minorMeters = parseFloat(minor) / 100;
        }
        const totalMeters = parseFloat(major) + minorMeters;
        metric = Math.round(totalMeters * 1000).toString();
    } else if (majorUnit === 'ft') {
        // Convert ft-in to mm
        const feet = parseFloat(major);
        const inches = minorUnit === 'in' ? parseFloat(minor) : 0;
        const totalInches = (feet * 12) + inches;
        const mm = Math.round(totalInches * 25.4);
        metric = mm.toString();
    }
    
    // Prepare parapet row data
    const parapetRowData = [
        `${parapet.parapetName || ''} - ${parapet.parapetType || ''}`, // Don't truncate yet
        '__MERGED__', // Marker for merged cell
        truncateText(parapet.montantMetallique || '', getMaxChars(columnWidths.montant)),
        truncateText(parapet.espacement || '', getMaxChars(columnWidths.espacement)),
        truncateText(parapet.lisseSuperieure || '', getMaxChars(columnWidths.lisseSuperieure)),
        truncateText(parapet.lisseInferieure || '', getMaxChars(columnWidths.lisseInferieure)),
        truncateText(parapet.entremise || '', getMaxChars(columnWidths.entremise)),
        truncateText(imperial, getMaxChars(columnWidths.hauteurImperial)),
        truncateText(metric, getMaxChars(columnWidths.hauteurMetrique)),
        noteText
    ];
    
    // Draw parapet row
    let currentX = tableX;
    const rowY = currentRowY;
    
    parapetRowData.forEach((cellData, cellIndex) => {
        const colWidth = columnWidths[widthKeys[cellIndex]];
        
        // Handle merged TYPE DE MUR + NIVEAU cell (first two columns)
        if (cellIndex === 0) {
            // Merge first two columns (TYPE DE MUR + NIVEAU)
            const mergedWidth = columnWidths.typeDeMur + columnWidths.floor;
            const textValue = truncateText(String(cellData), getMaxChars(mergedWidth));
            const textWidth = font.widthOfTextAtSize(textValue, fontSize);
            const textX = currentX + (mergedWidth - textWidth) / 2; // Center in merged cell
            const textY = rowY + (finalRowHeight / 2) - 4;
            
            page.drawText(textValue, {
                x: textX,
                y: textY,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            
            currentX += mergedWidth; // Skip both columns
            return;
        }
        
        // Skip the merged NIVEAU cell
        if (cellIndex === 1) {
            return; // Already handled in cellIndex 0
        }
        
        // Special handling for NOTE column (last column) - allow text wrapping, centered
if (cellIndex === parapetRowData.length - 1 && noteText.length > 0) {
    const words = String(cellData).split(' ');
    let currentLine = '';
    let lineY = rowY + (finalRowHeight / 2) - 4;
    let linesDrawn = 0;
    const maxLines = Math.floor((finalRowHeight - 6) / (fontSize + 1));
    
    for (let word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = testLine.length * fontSize * 0.5;
        
        if (testWidth > colWidth - 8 && currentLine) {
            page.drawText(currentLine, {
                x: currentX + colWidth / 2 - (currentLine.length * fontSize * 0.3),
                y: lineY,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
            currentLine = word;
            lineY -= (fontSize + 1);
            linesDrawn++;
            if (linesDrawn >= maxLines) break;
        } else {
            currentLine = testLine;
        }
    }
    
    if (currentLine && linesDrawn < maxLines) {
        page.drawText(currentLine, {
            x: currentX + colWidth / 2 - (currentLine.length * fontSize * 0.3),
            y: lineY,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
    }
            } else {
        // Regular cell with text - center all columns
        const textValue = String(cellData);
        const textWidth = font.widthOfTextAtSize(textValue, fontSize);
        const textX = currentX + (colWidth - textWidth) / 2;
        const textY = rowY + (finalRowHeight / 2) - 4;

        page.drawText(textValue, {
            x: textX,
            y: textY,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });
        }
        
        currentX += colWidth;
    });
    
    // Draw vertical borders for parapet row (skip border between TYPE DE MUR and NIVEAU)
    currentX = tableX;
    widthKeys.forEach((key, index) => {
        currentX += columnWidths[key];
        // Skip border between column 0 (TYPE DE MUR) and column 1 (NIVEAU) for parapets
        if (index < widthKeys.length - 1 && index !== 0) {
            page.drawLine({
                start: { x: currentX, y: rowY + finalRowHeight },
                end: { x: currentX, y: currentRowY },
                thickness: 1,
                color: rgb(0, 0, 0)
            });
        }
    });
    
    // Draw bottom border of parapet row
    page.drawLine({
        start: { x: tableX, y: currentRowY },
        end: { x: tableX + tableWidth, y: currentRowY },
        thickness: 1,
        color: rgb(0, 0, 0)
    });
});

// ========== END PARAPET ADDITION ==========
        
        // Draw table border - Calculate total height including dynamic row heights
        let totalRowsHeight = 0;
        wallsToShow.forEach((wall) => {
            const hasSet2 = wall.montantMetallique2 && wall.montantMetallique2.trim() !== '';
            const rowsForThisWall = hasSet2 ? 2 : 1;
            
            const noteText = wall.note || '';
            const noteColumnWidth = columnWidths.note;
            const baseRowHeight = rowHeight;
            
            // Calculate lines needed for note text wrapping
            const charsPerLine = Math.floor(noteColumnWidth / (fontSize * 0.5));
            const noteLines = noteText.length > 0 ? Math.ceil(noteText.length / charsPerLine) : 1;
            const minLines = 1;
            const actualRowHeight = Math.max(baseRowHeight, minLines * (fontSize + 2) + 6);
            const finalRowHeight = Math.max(actualRowHeight, noteLines * (fontSize + 1) + 4);
            
            // Add height for all rows (1 or 2)
            totalRowsHeight += finalRowHeight * rowsForThisWall;
        });
        
                // Add parapet heights
                parapets.forEach((parapet) => {
                    const noteText = parapet.note || '';
                    const noteColumnWidth = columnWidths.note;
                    const baseRowHeight = rowHeight;
                    
                    const charsPerLine = Math.floor(noteColumnWidth / (fontSize * 0.5));
                    const noteLines = noteText.length > 0 ? Math.ceil(noteText.length / charsPerLine) : 1;
                    const minLines = 1;
                    const actualRowHeight = Math.max(baseRowHeight, minLines * (fontSize + 2) + 6);
                    const finalRowHeight = Math.max(actualRowHeight, noteLines * (fontSize + 1) + 4);
                    
                    totalRowsHeight += finalRowHeight;
                });

        const finalTableHeight = headerHeight + totalRowsHeight;
        const tableBottomY = headerY - finalTableHeight;
        
        page.drawRectangle({
            x: tableX,
            y: tableBottomY,
            width: tableWidth,
            height: finalTableHeight, 
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        // Add note about truncated content if needed
        if (hasMoreWalls) {
            page.drawText(`Note: ${walls.length - maxRows} murs supplémentaires non affichés par manque d'espace`, {
                x: tableX,
                y: currentRowY - rowHeight - 15,
                size: 8,
                font: font,
                color: rgb(0.6, 0, 0)
            });
        }
        
        console.log(`✅ Summary table drawn with ${wallsToShow.length} of ${walls.length} wall entries`);
        
    } catch (error) {
        console.error('❌ Error drawing CFSS summary table:', error);
        throw error;
    }
}

function truncateText(text, maxLength) {
    if (!text) return '';
    const str = String(text);
    if (str.length <= maxLength) return str;
    if (maxLength <= 3) return str.substring(0, maxLength); // No room for ellipsis
    return str.substring(0, maxLength - 3) + '...';
}

// Function to convert height values between imperial and metric - FIXED FORMAT
function convertHeightValues(wall) {
    try {
        const majorValue = parseFloat(wall.hauteurMax) || 0;
        const majorUnit = wall.hauteurMaxUnit || '';
        const minorValue = parseFloat(wall.hauteurMaxMinor || wall.hauteurMinor) || 0;
        const minorUnit = wall.hauteurMaxMinorUnit || wall.hauteurMinorUnit || '';
        
        let imperial = '';
        let metric = '';
        
        if (majorValue > 0 || minorValue > 0) {
            if (majorUnit === 'ft' || majorUnit === 'in') {
                // Input is imperial, calculate both
                let totalInches = 0;
                if (majorUnit === 'ft') {
                    totalInches += majorValue * 12;
                }
                if (majorUnit === 'in') {
                    totalInches += majorValue;
                }
                if (minorUnit === 'in') {
                    totalInches += minorValue;
                }
                
                // Format imperial (same as before - this was correct)
                const feet = Math.floor(totalInches / 12);
                const inches = totalInches % 12;
                if (feet > 0 && inches > 0) {
                    imperial = `${feet}'-${inches.toFixed(0)}"`;
                } else if (feet > 0) {
                    imperial = `${feet}'-0"`;
                } else {
                    imperial = `${inches.toFixed(0)}"`;
                }
                
                // FIXED: Convert to metric - show only millimeter number without units
                const totalMm = Math.round(totalInches * 25.4);
                metric = totalMm.toString(); // Just the number, no "mm" or "m" units
                
            } else if (majorUnit === 'm' || majorUnit === 'mm') {
                // Input is metric, calculate both
                let totalMm = 0;
                if (majorUnit === 'm') {
                    totalMm += majorValue * 1000;
                }
                if (majorUnit === 'mm') {
                    totalMm += majorValue;
                }
                if (minorUnit === 'mm') {
                    totalMm += minorValue;
                }
                
                // FIXED: Format metric - show only millimeter number without units
                metric = Math.round(totalMm).toString(); // Just the number, no units
                
                // Convert to imperial (same as before - this was correct)
                const totalInches = totalMm / 25.4;
                const feet = Math.floor(totalInches / 12);
                const inches = totalInches % 12;
                if (feet > 0 && inches > 0) {
                    imperial = `${feet}'-${inches.toFixed(0)}"`;
                } else if (feet > 0) {
                    imperial = `${feet}'-0"`;
                } else {
                    imperial = `${inches.toFixed(0)}"`;
                }
            }
        }
        
        return { imperial, metric };
        
    } catch (error) {
        console.error('Error converting height values:', error);
        return { imperial: 'N/A', metric: 'N/A' };
    }
}

async function getEmailTemplates(userInfo) {
    try {
        console.log(`📧 Fetching email templates for user: ${userInfo.email}`);
        
        const params = {
            TableName: EMAIL_TEMPLATES_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userInfo.email
            },
            ScanIndexForward: false // newest first
        };
        
        const result = await dynamodb.query(params);
        
        console.log(`✅ Found ${result.Items?.length || 0} email templates`);
        
        return {
            success: true,
            templates: result.Items || []
        };
        
    } catch (error) {
        console.error('❌ Error fetching email templates:', error);
        throw new Error(`Failed to fetch email templates: ${error.message}`);
    }
}

async function createEmailTemplate(templateData, userInfo) {
    try {
        console.log(`📧 Creating email template for user: ${userInfo.email}`);
        
        // Validate input
        if (!templateData.name || !templateData.content) {
            throw new Error('Template name and content are required');
        }
        
        // Limit template name length
        if (templateData.name.length > 100) {
            throw new Error('Template name must be 100 characters or less');
        }
        
        // Limit content length (e.g., 10,000 characters)
        if (templateData.content.length > 10000) {
            throw new Error('Template content must be 10,000 characters or less');
        }
        
        const template = {
            userId: userInfo.email,
            id: `tmpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: templateData.name.trim(),
            content: templateData.content.trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const params = {
            TableName: EMAIL_TEMPLATES_TABLE,
            Item: template
        };
        
        await dynamodb.put(params);
        
        console.log(`✅ Email template created: ${template.id}`);
        
        return {
            success: true,
            template: template
        };
        
    } catch (error) {
        console.error('❌ Error creating email template:', error);
        throw new Error(`Failed to create email template: ${error.message}`);
    }
}

async function deleteEmailTemplate(templateId, userInfo) {
    try {
        console.log(`📧 Deleting email template: ${templateId} for user: ${userInfo.email}`);
        
        // Verify ownership before deleting
        const getParams = {
            TableName: EMAIL_TEMPLATES_TABLE,
            Key: {
                userId: userInfo.email,
                id: templateId
            }
        };
        
        const existing = await dynamodb.get(getParams);
        
        if (!existing.Item) {
            throw new Error('Template not found or access denied');
        }
        
        // Delete the template
        const deleteParams = {
            TableName: EMAIL_TEMPLATES_TABLE,
            Key: {
                userId: userInfo.email,
                id: templateId
            }
        };
        
        await dynamodb.delete(deleteParams);
        
        console.log(`✅ Email template deleted: ${templateId}`);
        
        return {
            success: true,
            message: 'Template deleted successfully'
        };
        
    } catch (error) {
        console.error('❌ Error deleting email template:', error);
        throw new Error(`Failed to delete email template: ${error.message}`);
    }
}

const BULK_VERIFY_ALLOWED_EMAILS = new Set([
    'hoangminhduc.ite@gmail.com',
    'anhquan1212004@gmail.com',
  ]);
  
  function sanitizeFileName(filename = '') {
    const trimmed = String(filename).trim() || 'document.pdf';
    const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
    return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
  }
  
  function isBulkVerifyReviewer(userInfo) {
    return BULK_VERIFY_ALLOWED_EMAILS.has((userInfo?.email || '').toLowerCase());
  }
  
  async function flattenPdfForms(pdfBuffer) {
    try {
      const doc = await PDFDocument.load(pdfBuffer);
      try {
        const form = doc.getForm();
        const fields = form.getFields();
        if (fields.length) {
          form.flatten();
        }
      } catch {
        // no form data, continue silently
      }
      return await doc.save();
    } catch (error) {
      console.warn('Bulk verify flatten skipped:', error.message);
      return pdfBuffer;
    }
  }
  
  async function createBulkVerifyUploadUrls({
    files = [],
    userInfo,
    bucket,
    s3Client,
  }) {
    if (!isBulkVerifyReviewer(userInfo)) {
      throw new Error('Access denied: bulk verification is restricted to reviewers.');
    }
  
    if (!Array.isArray(files) || !files.length) {
      throw new Error('At least one file is required.');
    }
  
    const uploads = [];
    const timestamp = Date.now();
  
    for (const file of files) {
      const safeName = sanitizeFileName(file.filename);
      const key = `bulk-verify/uploads/${timestamp}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
  
      const putCmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: file.contentType || 'application/pdf',
        Metadata: {
          'uploaded-by': userInfo.email || 'unknown',
        },
      });
  
      const uploadUrl = await getSignedUrl(s3Client, putCmd, { expiresIn: 900 });
  
      uploads.push({
        clientId: file.clientId,
        key,
        uploadUrl,
      });
    }
  
    return uploads;
  }
  
  async function processBulkVerifyFiles({
    files = [],
    userInfo,
    bucket,
    s3Client,
    fetchSignatureBuffer,
    fetchObjectBuffer,
    insertSignature,
  }) {
    if (!isBulkVerifyReviewer(userInfo)) {
      throw new Error('Access denied: bulk verification is restricted to reviewers.');
    }
  
    if (!Array.isArray(files) || !files.length) {
      throw new Error('At least one file is required.');
    }
  
    const signatureBuffer = await fetchSignatureBuffer();
    const processed = [];
    const errors = [];
    const CONCURRENCY = 3;

    // Process files in parallel batches
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const { key, clientId, originalName } = file;
          if (!key || !key.startsWith('bulk-verify/uploads/')) {
            throw Object.assign(new Error('Invalid upload key provided.'), { clientId, key });
          }

          const sourcePdf = await fetchObjectBuffer(key);
          if (!sourcePdf || !sourcePdf.length) {
            throw Object.assign(new Error('Uploaded file is empty.'), { clientId, key });
          }

          const signedPdf = await insertSignature(sourcePdf, signatureBuffer);
          console.log(`[PDF4me DEBUG] About to flatten PDF (${signedPdf.length} bytes). API key present: ${!!process.env.PDF4ME_API_KEY}, key length: ${(process.env.PDF4ME_API_KEY || '').length}`);
          let finalPdf;
          try {
            finalPdf = await flattenWithPdf4me(signedPdf);
            console.log(`[PDF4me DEBUG] Flatten succeeded, output size: ${finalPdf.length} bytes`);
          } catch (e) {
            console.error('[PDF4me DEBUG] Flatten FAILED:', e?.message, e?.stack);
            throw Object.assign(new Error(`PDF flatten failed: ${e?.message}`), { clientId, key });
          }

          const processedKey = key.replace('bulk-verify/uploads/', 'bulk-verify/processed/');

          await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: processedKey,
            Body: finalPdf,
            ContentType: 'application/pdf',
            Metadata: {
              'processed-by': userInfo.email || 'unknown',
              'source-key': key,
            },
          }));

          const downloadCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: processedKey,
          });
          const downloadUrl = await getSignedUrl(s3Client, downloadCommand, { expiresIn: 3600 });

          return { clientId, originalKey: key, processedKey, downloadUrl, originalName };
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          processed.push(result.value);
        } else {
          const err = result.reason;
          errors.push({
            clientId: err.clientId,
            key: err.key,
            message: err.message || 'Failed to process file.',
          });
        }
      }
    }

    return { processed, errors };
  }
  
  async function getBulkVerifyDownloadUrl({ key, userInfo, bucket, s3Client }) {
    if (!isBulkVerifyReviewer(userInfo)) {
      throw new Error('Access denied: bulk verification is restricted to reviewers.');
    }
  
    // Accept both processed AND uploaded keys (for flattened files)
    if (!key || !key.startsWith('bulk-verify/')) {
      throw new Error('Invalid bulk-verify file key.');
    }
  
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
  
    return getSignedUrl(s3Client, cmd, { expiresIn: 3600 });
  }
  
  export {
    BULK_VERIFY_ALLOWED_EMAILS,
    isBulkVerifyReviewer,
    createBulkVerifyUploadUrls,
    processBulkVerifyFiles,
    getBulkVerifyDownloadUrl,
  };