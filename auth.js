// Authentication Page JavaScript
// Global error handlers
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showMessage('System Error: ' + e.message, 'error');
});

// Enhanced CDN loader with multiple fallbacks
class CDNLoader {
    constructor() {
        this.awsUrls = [
            'https://cdn.jsdelivr.net/npm/aws-sdk@2.1692.0/dist/aws-sdk.min.js',
            'https://unpkg.com/aws-sdk@2.1692.0/dist/aws-sdk.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/aws-sdk/2.1692.0/aws-sdk.min.js'
        ];

        this.cognitoUrls = [
            // Primary working URLs
            'https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.15/dist/amazon-cognito-identity.min.js',
            'https://unpkg.com/amazon-cognito-identity-js@6.3.15/dist/amazon-cognito-identity.min.js',
            
            // Alternative versions
            'https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.12/dist/amazon-cognito-identity.min.js',
            'https://unpkg.com/amazon-cognito-identity-js@6.3.12/dist/amazon-cognito-identity.min.js',
            
            // Latest version fallback
            'https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js/dist/amazon-cognito-identity.min.js',
            'https://unpkg.com/amazon-cognito-identity-js/dist/amazon-cognito-identity.min.js'
        ];
    }

    async loadScript(urls, checkFunction, name) {
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`🔄 Attempting to load ${name} from: ${url}`);
            updateDebugInfo(`Trying ${name} from ${url.split('/')[2]}...`);
            
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = url;
                    script.crossOrigin = 'anonymous';
                    
                    script.onload = () => {
                        console.log(`✅ ${name} loaded successfully from: ${url}`);
                        resolve();
                    };
                    
                    script.onerror = () => {
                        console.warn(`❌ Failed to load ${name} from: ${url}`);
                        reject(new Error(`Failed to load from ${url}`));
                    };
                    
                    document.head.appendChild(script);
                });

                // Wait for library to initialize
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Check if the library is actually available
                if (checkFunction()) {
                    console.log(`✅ ${name} is available and working`);
                    updateDebugInfo(`✅ ${name} loaded successfully`);
                    return true;
                } else {
                    console.warn(`⚠️ ${name} loaded but not available`);
                    updateDebugInfo(`⚠️ ${name} loaded but not working`);
                }
                
            } catch (error) {
                console.warn(`❌ Error loading ${name} from ${url}:`, error.message);
                updateDebugInfo(`❌ Failed: ${url.split('/')[2]}`);
                continue;
            }
        }
        
        throw new Error(`Failed to load ${name} from all CDN sources`);
    }

    async loadAWS() {
        return this.loadScript(
            this.awsUrls,
            () => typeof AWS !== 'undefined',
            'AWS SDK'
        );
    }

    async loadCognito() {
        return this.loadScript(
            this.cognitoUrls,
            () => typeof AmazonCognitoIdentity !== 'undefined',
            'Amazon Cognito Identity JS'
        );
    }

    async loadAll() {
        console.log('🚀 Starting to load AWS libraries...');
        updateDebugInfo('Loading AWS libraries...');
        
        try {
            // Load AWS SDK first
            if (typeof AWS === 'undefined') {
                await this.loadAWS();
            } else {
                console.log('✅ AWS SDK already loaded');
                updateDebugInfo('✅ AWS SDK already available');
            }
            
            // Then load Cognito SDK
            if (typeof AmazonCognitoIdentity === 'undefined') {
                await this.loadCognito();
            } else {
                console.log('✅ Cognito SDK already loaded');
                updateDebugInfo('✅ Cognito SDK already available');
            }
            
            console.log('✅ All AWS libraries loaded successfully');
            updateDebugInfo('✅ All libraries loaded successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to load AWS libraries:', error);
            updateDebugInfo('❌ Library loading failed: ' + error.message);
            throw error;
        }
    }
}

// Initialize authentication with enhanced loading
async function initializeAuth() {
    try {
        showLoading(true);
        updateDebugInfo('Initializing authentication...');
        
        // Load SDKs with enhanced system
        const loader = new CDNLoader();
        await loader.loadAll();
        
        // Configure Cognito
        const COGNITO_CONFIG = {
            region: 'us-east-1',
            userPoolId: 'us-east-1_EamgXZwav',
            clientId: 'm1q1cbgvbsg60dn1jp4q170c5',
        };

        AWS.config.region = COGNITO_CONFIG.region;
        
        window.userPool = new AmazonCognitoIdentity.CognitoUserPool({
            UserPoolId: COGNITO_CONFIG.userPoolId,
            ClientId: COGNITO_CONFIG.clientId
        });

        // NOW initialize authHelper after libraries are loaded
        window.authHelper = new AuthHelper();

        // Also create the global reference for backward compatibility
        window.authHelper = window.authHelper;

        // Test that everything is working
        if (!window.userPool) {
            throw new Error('Failed to create user pool');
        }

        // Check if already logged in
        const cognitoUser = window.userPool.getCurrentUser();
        if (cognitoUser) {
            cognitoUser.getSession((err, session) => {
                if (!err && session.isValid()) {
                    console.log('✅ User already logged in, redirecting...');
                    updateDebugInfo('✅ User already authenticated');
                    showMessage('You are already logged in. Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1000);
                    return;
                }
            });
        }

        updateDebugInfo('✅ Authentication system ready');
        showLoading(false);
        showMessage('Authentication system loaded successfully', 'success');
        
        // Auto-hide success message
        setTimeout(() => {
            document.getElementById('messageContainer').innerHTML = '';
        }, 3000);
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        updateDebugInfo('❌ Initialization failed: ' + error.message);
        showMessage('Failed to initialize authentication. Please refresh the page. Error: ' + error.message, 'error');
        showLoading(false);
    }
}

// Utility functions
function updateDebugInfo(info) {
    const debugDiv = document.getElementById('debugInfo');
    if (debugDiv) {
        const timestamp = new Date().toLocaleTimeString();
        debugDiv.innerHTML = `[${timestamp}] ${info}`;
    }
}

function showMessage(message, type = 'info') {
    const container = document.getElementById('messageContainer');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = type;
    div.textContent = message;
    container.innerHTML = '';
    container.appendChild(div);
    
    // Auto-hide after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            if (container.contains(div)) {
                container.removeChild(div);
            }
        }, 5000);
    }
}

function showLoading(show) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? 'block' : 'none';
    }
    
    const buttons = document.querySelectorAll('button[type="submit"]');
    buttons.forEach(btn => btn.disabled = show);
}

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const targetTab = document.getElementById(tabName + 'Tab');
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Only activate button if event exists (from button click)
    if (typeof event !== 'undefined' && event && event.target) {
        event.target.classList.add('active');
    }
    
    // Clear messages
    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
        messageContainer.innerHTML = '';
    }
}

// Login handler
function setupLoginHandler() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            showMessage('Please fill in all fields', 'error');
            return;
        }

        // Check if libraries are loaded
        if (typeof AmazonCognitoIdentity === 'undefined') {
            showMessage('Authentication system not ready. Please wait or refresh the page.', 'error');
            return;
        }

        try {
            showLoading(true);
            updateDebugInfo('Attempting login...');
            
            const authData = {
                Username: email,
                Password: password,
            };

            const authDetails = new AmazonCognitoIdentity.AuthenticationDetails(authData);
            const userData = {
                Username: email,
                Pool: window.userPool
            };

            const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

            cognitoUser.authenticateUser(authDetails, {
                onSuccess: function(session) {
                    console.log('Login successful');
                    updateDebugInfo('Login successful - checking approval status...');
                    
                    // Use the SAME authenticated cognitoUser object
                    cognitoUser.getUserAttributes((err, attributes) => {
                        if (err) {
                            console.error('Error getting user attributes:', err);
                            showMessage('Login error: Could not verify account status', 'error');
                            showLoading(false);
                            return;
                        }
                        
                        // Check approval status
                        const approvalStatusAttr = attributes.find(attr => attr.getName() === 'custom:approval_status');
                        const approvalStatus = approvalStatusAttr ? approvalStatusAttr.getValue() : null;
                        
                        console.log('User approval status:', approvalStatus);
                        updateDebugInfo('Approval status: ' + (approvalStatus || 'not set'));
                        
                        // Handle existing users with null approval status
                        if (approvalStatus === null) {
                            // Send admin notification for existing user
                            fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/users/notify-admins', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email: email, isExistingUser: true })
                            }).then(response => {
                                if (response.ok) {
                                    console.log('Admin notified about existing user login attempt');
                                } else {
                                    console.error('Failed to notify admin about existing user');
                                }
                            }).catch(error => {
                                console.error('Error notifying admin:', error);
                            });
                            
                            cognitoUser.signOut();
                            showMessage('Your account needs admin approval. Admins have been notified and will review your account.', 'error');
                            updateDebugInfo('Login blocked - existing user needs approval');
                            showLoading(false);
                            return;
                        }
                        
                        // Block login if status is pending
                        if (approvalStatus === 'pending') {
                            cognitoUser.signOut();
                            showMessage('Your account is pending admin approval. Please wait for confirmation email.', 'error');
                            updateDebugInfo('Login blocked - pending approval');
                            showLoading(false);
                            return;
                        }
                        
                        // Only allow login if explicitly approved
                        if (approvalStatus !== 'approved') {
                            cognitoUser.signOut();
                            showMessage('Your account is not approved. Please contact admin.', 'error');
                            updateDebugInfo('Login blocked - not approved');
                            showLoading(false);
                            return;
                        }
                        
                        // Proceed with login
                        showMessage('Login successful! Redirecting...', 'success');
                        updateDebugInfo('Login approved - redirecting');
                        setTimeout(() => {
                            window.location.href = 'dashboard.html';
                        }, 1000);
                        showLoading(false);
                    });
                },
                onFailure: function(err) {
                    console.error('❌ Login failed:', err);
                    updateDebugInfo('❌ Login failed: ' + err.code);
                    let errorMessage = 'Login failed';
                    
                    if (err.code === 'NotAuthorizedException') {
                        errorMessage = 'Invalid email or password';
                    } else if (err.code === 'UserNotConfirmedException') {
                        errorMessage = 'Please verify your email first';
                    } else if (err.code === 'UserNotFoundException') {
                        errorMessage = 'User not found';
                    } else {
                        errorMessage = err.message || 'Login failed';
                    }
                    
                    showMessage(errorMessage, 'error');
                    showLoading(false);
                }
            });

        } catch (error) {
            console.error('❌ Login error:', error);
            updateDebugInfo('❌ Login error: ' + error.message);
            showMessage('Login error: ' + error.message, 'error');
            showLoading(false);
        }
    });
}

// Signup handler
function setupSignupHandler() {
    const signupForm = document.getElementById('signupForm');
    if (!signupForm) return;
    
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;
        const companyName = document.getElementById('companyName').value;
        const domain = document.getElementById('domain').value;

        // Validation
        if (!email || !password || !firstName || !lastName || !companyName || !domain) {
            showMessage('Please fill in all fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showMessage('Passwords do not match', 'error');
            return;
        }

        if (password.length < 8) {
            showMessage('Password must be at least 8 characters', 'error');
            return;
        }

        // Check if libraries are loaded
        if (typeof AmazonCognitoIdentity === 'undefined') {
            showMessage('Authentication system not ready. Please wait or refresh the page.', 'error');
            return;
        }

        try {
            showLoading(true);
            updateDebugInfo('Attempting signup...');

            const attributeList = [
                new AmazonCognitoIdentity.CognitoUserAttribute({Name: 'email', Value: email}),
                new AmazonCognitoIdentity.CognitoUserAttribute({Name: 'given_name', Value: firstName}),
                new AmazonCognitoIdentity.CognitoUserAttribute({Name: 'family_name', Value: lastName}),
                new AmazonCognitoIdentity.CognitoUserAttribute({Name: 'custom:company_name', Value: companyName}),
                new AmazonCognitoIdentity.CognitoUserAttribute({Name: 'custom:domain', Value: domain}),
                new AmazonCognitoIdentity.CognitoUserAttribute({Name: 'custom:is_admin', Value: 'false'})
            ];

            window.userPool.signUp(email, password, attributeList, null, function(err, result) {
                if (err) {
                    console.error('❌ Signup error:', err);
                    updateDebugInfo('❌ Signup error: ' + err.code);
                    let errorMessage = 'Signup failed';
                    
                    if (err.code === 'UsernameExistsException') {
                        errorMessage = 'An account with this email already exists';
                    } else if (err.code === 'InvalidPasswordException') {
                        errorMessage = 'Password must contain uppercase, lowercase, numbers and special characters';
                    } else {
                        errorMessage = err.message || 'Signup failed';
                    }
                    
                    showMessage(errorMessage, 'error');
                    showLoading(false);
                    return;
                }

                window.currentUser = result.user;
                updateDebugInfo('✅ Signup successful');
                showMessage('Account created! Please check your email for verification code.', 'success');
                switchTab('verification');
                showLoading(false);
            });

        } catch (error) {
            console.error('❌ Signup error:', error);
            updateDebugInfo('❌ Signup error: ' + error.message);
            showMessage('Signup error: ' + error.message, 'error');
            showLoading(false);
        }
    });
}

// Verification functions
function verifyEmail() {
    const code = document.getElementById('verificationCode').value;
    
    if (!code) {
        showMessage('Please enter verification code', 'error');
        return;
    }

    if (!window.currentUser) {
        showMessage('No user to verify', 'error');
        return;
    }

    showLoading(true);
    updateDebugInfo('Verifying email...');

    window.currentUser.confirmRegistration(code, true, function(err, result) {
        if (err) {
            console.error('Verification error:', err);
            updateDebugInfo('Verification error: ' + err.code);
            showMessage('Verification failed: ' + err.message, 'error');
            showLoading(false);
            return;
        }

        console.log('Email verified successfully');
        updateDebugInfo('Email verified - setting pending status...');
        
        // CRITICAL: Set approval status to pending immediately after verification
        const userData = {
            Username: window.currentUser.getUsername(),
            Pool: window.userPool
        };
        
        const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
        
        const attributeList = [
            new AmazonCognitoIdentity.CognitoUserAttribute({
                Name: 'custom:approval_status', 
                Value: 'pending'
            })
        ];

        cognitoUser.updateAttributes(attributeList, async function(err, result) {
            if (err) {
                console.error('Error setting approval status:', err);
                updateDebugInfo('Failed to set pending status: ' + err.message);
            } else {
                console.log('Approval status set to pending');
                updateDebugInfo('Approval status set to pending');
            }
            
            // Notify admins regardless of attribute update success
            try {
                const userEmail = window.currentUser.getUsername();
                const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/users/notify-admins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail })
                });
                
                if (response.ok) {
                    console.log('Admins notified successfully');
                    updateDebugInfo('Admins notified via email');
                } else {
                    console.error('Failed to notify admins:', response.statusText);
                    updateDebugInfo('Admin notification failed');
                }
            } catch (error) {
                console.error('Failed to notify admins:', error);
                updateDebugInfo('Admin notification error: ' + error.message);
            }
            
            showLoading(false);
            alert('Email verified! Waiting for admins to authorize your account. You will receive an email once approved.');
            switchTab('login');
        });
    });
}

// Password toggle function
function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
        icon.setAttribute('aria-label', 'Hide password');
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
        icon.setAttribute('aria-label', 'Show password');
    }
}


function resendVerificationCode() {
    if (!window.currentUser) {
        showMessage('No user to resend code to', 'error');
        return;
    }

    showLoading(true);
    updateDebugInfo('Resending verification code...');

    window.currentUser.resendConfirmationCode(function(err, result) {
        if (err) {
            console.error('❌ Resend error:', err);
            updateDebugInfo('❌ Resend error: ' + err.code);
            showMessage('Failed to resend code', 'error');
            showLoading(false);
            return;
        }

        updateDebugInfo('✅ Code resent');
        showMessage('Verification code sent! Check your email.', 'success');
        showLoading(false);
    });
}

// Initialize when page loads
window.addEventListener('load', function() {
    initializeAuth();
    setupLoginHandler();
    setupSignupHandler();
});

// Make functions globally available
window.togglePassword = togglePassword;
window.switchTab = switchTab;
window.verifyEmail = verifyEmail;
window.resendVerificationCode = resendVerificationCode;