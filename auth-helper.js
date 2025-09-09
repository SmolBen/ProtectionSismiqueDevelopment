// auth-helper.js - Centralized authentication without JWT
class AuthHelper {
    constructor() {
        this.cognitoConfig = {
            region: 'us-east-1',
            userPoolId: 'us-east-1_EamgXZwav',
            clientId: 'm1q1cbgvbsg60dn1jp4q170c5',
        };
        
        AWS.config.region = this.cognitoConfig.region;
        this.userPool = new AmazonCognitoIdentity.CognitoUserPool({
            UserPoolId: this.cognitoConfig.userPoolId,
            ClientId: this.cognitoConfig.clientId
        });
        
        this.currentUserData = null;
    }

    // Check if user is authenticated and get user data
    async checkAuthentication() {
        return new Promise((resolve, reject) => {
            const cognitoUser = this.userPool.getCurrentUser();
            if (!cognitoUser) {
                resolve(null);
                return;
            }

            cognitoUser.getSession((err, session) => {
                if (err || !session.isValid()) {
                    console.error('Invalid session:', err);
                    resolve(null);
                    return;
                }

                // Get user attributes
                cognitoUser.getUserAttributes((err, attributes) => {
                    if (err) {
                        console.error('Error getting user attributes:', err);
                        reject(err);
                        return;
                    }

                    // Parse user data
                    const userData = {};
                    attributes.forEach(attr => {
                        userData[attr.getName()] = attr.getValue();
                    });

                    // Check approval status
                    const approvalStatus = userData['custom:approval_status'];
                    if (approvalStatus === 'pending') {
                        console.log('User pending approval');
                        resolve({ pendingApproval: true, email: userData.email });
                        return;
                    }

                    this.currentUserData = {
                        userId: userData.sub,
                        email: userData.email,
                        firstName: userData.given_name || '',
                        lastName: userData.family_name || '',
                        companyName: userData['custom:company_name'] || '',
                        domain: userData['custom:domain'] || '',
                        isAdmin: userData['custom:is_admin'] === 'true',
                        approvalStatus: approvalStatus || 'approved'
                    };

                    console.log('✅ User authenticated:', this.currentUserData.email);
                    resolve(this.currentUserData);
                });
            });
        });
    }

    // Get authentication headers for API requests - IMPROVED VERSION
    getAuthHeaders() {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            return { 'Content-Type': 'application/json' };
        }
        
        // Create clean headers without extra spaces or undefined values
        const headers = {
            'Content-Type': 'application/json'
        };

        // Only add headers if values exist and are not empty
        if (currentUser.email) {
            headers['x-user-email'] = currentUser.email.trim();
        }
        
        headers['x-user-admin'] = currentUser.isAdmin ? 'true' : 'false';
        
        if (currentUser.firstName) {
            headers['x-user-firstname'] = currentUser.firstName.trim();
        }
        
        if (currentUser.lastName) {
            headers['x-user-lastname'] = currentUser.lastName.trim();
        }
        
        if (currentUser.companyName) {
            headers['x-user-company'] = currentUser.companyName.trim();
        }
        
        if (currentUser.domain) {
            headers['x-user-domain'] = currentUser.domain.trim();
        }
        
        if (currentUser.userId) {
            headers['x-user-id'] = currentUser.userId.trim();
        }
        
        return headers;
    }

    // Check if current user is admin
    isAdmin() {
        return this.currentUserData?.isAdmin || false;
    }

    // Get current user data
    getCurrentUser() {
        return this.currentUserData;
    }

    // Logout user
    logout() {
        const cognitoUser = this.userPool.getCurrentUser();
        if (cognitoUser) {
            cognitoUser.signOut();
        }
        this.currentUserData = null;
        
        // Clear any stored data
        localStorage.clear();
        sessionStorage.clear();
    }

    // Redirect to auth page if not authenticated
    requireAuth() {
        if (!this.currentUserData) {
            window.location.href = 'auth.html';
            return false;
        }
        return true;
    }

    // Check if user can modify a project
    canModifyProject(project) {
        return this.isAdmin() || (project && project.createdBy === this.currentUserData.email);
    }

    // Update user interface with current user info
    updateUserInterface() {
        const userInfo = document.getElementById('userInfo');
        if (!userInfo || !this.currentUserData) return;

        const initials = (this.currentUserData.firstName.charAt(0) + this.currentUserData.lastName.charAt(0)).toUpperCase();
        
        userInfo.innerHTML = `
            <div class="user-avatar ${this.isAdmin() ? 'admin' : ''}">${initials}</div>
            <div class="user-details">
                <div class="user-name">
                    ${this.currentUserData.firstName} ${this.currentUserData.lastName}
                    ${this.isAdmin() ? '<span class="admin-badge">ADMIN</span>' : ''}
                </div>
                <div class="user-role">${this.currentUserData.companyName} - ${this.currentUserData.domain}</div>
            </div>
            <button class="logout-btn" onclick="authHelper.logout(); window.location.href='auth.html';">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        `;
    }

    // Show admin panel if user is admin
    showAdminElements() {
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel && this.isAdmin()) {
            adminPanel.classList.add('show');
        }
    }

    // Test API connectivity - NEW METHOD
    async testApiConnectivity() {
        try {
            console.log('🧪 Testing API connectivity...');
            const headers = this.getAuthHeaders();
            
            const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
                method: 'GET',
                headers: headers,
                mode: 'cors'
            });

            console.log('🧪 API test response:', response.status, response.statusText);
            return {
                success: response.ok,
                status: response.status,
                statusText: response.statusText
            };
        } catch (error) {
            console.error('🧪 API test failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}