// User Management Page JavaScript
let allUsers = [];
let filteredUsers = [];
let debugMode = false;

let authHelper;

window.addEventListener('load', async () => {
    // Wait for authHelper to be available or create it
    if (window.authHelper) {
        authHelper = window.authHelper;
    } else {
        // Create authHelper if not available (direct navigation to page)
        authHelper = new AuthHelper();
    }
    
    console.log('📄 User management page loaded');
    await initializeUserManagement();
});

// Debug function
function toggleDebug() {
    debugMode = !debugMode;
    const debugDiv = document.getElementById('debugInfo');
    debugDiv.style.display = debugMode ? 'block' : 'none';
}

function addDebugInfo(message) {
    const debugDetails = document.getElementById('debugDetails');
    const timestamp = new Date().toLocaleTimeString();
    debugDetails.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    console.log(`[DEBUG] ${message}`);
}

function showError(error, details = '') {
    const errorDiv = document.getElementById('errorDetails');
    const errorMessage = document.getElementById('errorMessage');
    errorDiv.style.display = 'block';
    errorMessage.innerHTML = `<strong>Error:</strong> ${error}<br><small>${details}</small>`;
    console.error('Error:', error, details);
}

async function initializeUserManagement() {
    console.log('🚀 Initializing user management...');
    addDebugInfo('Starting user management initialization');
    document.getElementById('loadingOverlay').classList.add('show');
    
    try {
        addDebugInfo('Checking authentication...');
        
        // Check authentication using simplified approach
        const userData = await authHelper.checkAuthentication();
        
        if (!userData) {
            addDebugInfo('No user authenticated');
            console.log('❌ No user authenticated, redirecting to auth page');
            window.location.href = 'auth.html';
            return;
        }

        addDebugInfo(`User authenticated: ${userData.email}, isAdmin: ${userData.isAdmin}`);

        // Check if user is admin
        if (!authHelper.isAdmin()) {
            addDebugInfo('User is not admin');
            alert('Access denied. Admin privileges required.');
            window.location.href = 'dashboard.html';
            return;
        }

        console.log('✅ Admin user authenticated:', userData.email);

        // Update UI with user info
        authHelper.updateUserInterface();
        
        // Load all users
        await loadAllUsers();
        
        // Setup event listeners
        setupEventListeners();

        document.getElementById('loadingOverlay').classList.remove('show');
        console.log('🎉 User management initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing user management:', error);
        addDebugInfo(`Initialization error: ${error.message}`);
        showError('Failed to initialize user management', error.message);
        document.getElementById('loadingOverlay').classList.remove('show');
        
        // Try to load sample data as fallback
        addDebugInfo('Loading sample data as fallback');
        allUsers = getSampleUsers();
        filteredUsers = [...allUsers];
        renderUsers();
        updateStats();
    }
}

function setupEventListeners() {
    // Search and filter functionality
    document.getElementById('searchInput').addEventListener('input', filterUsers);
    document.getElementById('roleFilter').addEventListener('change', filterUsers);
    document.getElementById('domainFilter').addEventListener('change', filterUsers);
}

async function loadAllUsers() {
    try {
        console.log('👥 Loading all users...');
        addDebugInfo('Starting to load users from API');
        
        // Get the current user's credentials
        const currentUser = authHelper.getCurrentUser();
        if (!currentUser || !currentUser.isAdmin) {
            throw new Error('Admin privileges required');
        }
        
        addDebugInfo(`Current user: ${currentUser.email}`);
        
        // Create clean headers without extra spaces
        const cleanHeaders = {
            'Content-Type': 'application/json',
            'x-user-email': (currentUser.email || '').trim(),
            'x-user-admin': currentUser.isAdmin ? 'true' : 'false',
            'x-user-firstname': (currentUser.firstName || '').trim(),
            'x-user-lastname': (currentUser.lastName || '').trim(),
            'x-user-company': (currentUser.companyName || '').trim(),
            'x-user-domain': (currentUser.domain || '').trim(),
            'x-user-id': (currentUser.userId || '').trim()
        };
        
        addDebugInfo(`Clean headers prepared: ${JSON.stringify(cleanHeaders, null, 2)}`);
        
        // Try the API call with better error handling
        const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/users';
        addDebugInfo(`Making API call to: ${apiUrl}`);
        
        try {
            // Use fetch with timeout and proper error handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                addDebugInfo('Request timed out after 15 seconds');
            }, 15000); // 15 second timeout
            
            addDebugInfo('Sending fetch request...');
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: cleanHeaders,
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            addDebugInfo(`API response received - Status: ${response.status}, StatusText: ${response.statusText}`);
            addDebugInfo(`Response headers: ${JSON.stringify([...response.headers.entries()])}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                addDebugInfo(`API error response body: ${errorText}`);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            addDebugInfo(`API response parsed successfully. User count: ${result.length}`);
            addDebugInfo(`First user sample: ${JSON.stringify(result[0] || {}, null, 2)}`);
            
            if (Array.isArray(result)) {
                // Convert API response format to expected frontend format
                allUsers = result.map(user => ({
                    Username: user.username || user.email,
                    Attributes: [
                        { Name: 'email', Value: user.email || '' },
                        { Name: 'given_name', Value: user.firstName || extractName(user.email, 'first') },
                        { Name: 'family_name', Value: user.lastName || extractName(user.email, 'last') },
                        { Name: 'custom:company_name', Value: user.companyName || 'Unknown Company' },
                        { Name: 'custom:domain', Value: user.domain || 'unknown' },
                        { Name: 'custom:is_admin', Value: user.isAdmin ? 'true' : 'false' }
                    ],
                    UserStatus: user.enabled ? 'CONFIRMED' : 'DISABLED',
                    UserCreateDate: new Date(user.created || Date.now())
                }));
                
                // Mark current user as admin if they are
                const currentUserIndex = allUsers.findIndex(user => 
                    getUserAttribute(user, 'email') === currentUser.email
                );
                if (currentUserIndex !== -1) {
                    const adminAttrIndex = allUsers[currentUserIndex].Attributes.findIndex(
                        attr => attr.Name === 'custom:is_admin'
                    );
                    if (adminAttrIndex !== -1) {
                        allUsers[currentUserIndex].Attributes[adminAttrIndex].Value = 'true';
                    }
                }
                
                addDebugInfo(`Users successfully converted: ${allUsers.length}`);
                console.log('✅ Users loaded from API:', allUsers.length);
            } else {
                throw new Error('Invalid response format - expected array');
            }
        } catch (apiError) {
            console.warn('⚠️ API error:', apiError);
            addDebugInfo(`API call failed: ${apiError.message}`);
            
            if (apiError.name === 'AbortError') {
                throw new Error('Request timed out - API may be slow');
            } else if (apiError.message.includes('Failed to fetch')) {
                throw new Error('Network error - check your internet connection');
            } else {
                throw apiError; // Re-throw other errors
            }
        }
        
        filteredUsers = [...allUsers];
        renderUsers();
        updateStats();
        
        console.log('✅ Users loaded successfully:', allUsers.length);
        document.getElementById('loadingOverlay').classList.remove('show');
        
    } catch (error) {
        console.error('❌ Error loading users:', error);
        addDebugInfo(`Final error: ${error.message}`);
        showError('Failed to load users from API', error.message);
        document.getElementById('loadingOverlay').classList.remove('show');
        
        // Fall back to sample data on error
        addDebugInfo('Loading sample data as fallback');
        allUsers = getSampleUsers();
        filteredUsers = [...allUsers];
        renderUsers();
        updateStats();
        
        // Show a notification that we're using sample data
        setTimeout(() => {
            alert('⚠️ Could not load real users from API. Showing sample data instead.\n\nThis is normal in demo mode. Click "Toggle Debug" to see technical details.');
        }, 1000);
    }
}

// Helper function to extract names from email
function extractName(email, part) {
    if (!email) return 'Unknown';
    const localPart = email.split('@')[0];
    const parts = localPart.split(/[._-]/);
    
    if (part === 'first') {
        return parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'User';
    } else if (part === 'last') {
        return parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : 'Name';
    }
    return 'Unknown';
}

// Function to provide sample data as fallback
function getSampleUsers() {
    return [
        {
            Username: 'hoangminhduc.ite@gmail.com',
            Attributes: [
                { Name: 'email', Value: 'hoangminhduc.ite@gmail.com' },
                { Name: 'given_name', Value: 'Hoang' },
                { Name: 'family_name', Value: 'Duc' },
                { Name: 'custom:company_name', Value: 'Tech Corp' },
                { Name: 'custom:domain', Value: 'electricity' },
                { Name: 'custom:is_admin', Value: 'false' }
            ],
            UserStatus: 'CONFIRMED',
            UserCreateDate: new Date('2025-06-04T20:06:44.787Z')
        },
        {
            Username: 'bennguyenn@outlook.com',
            Attributes: [
                { Name: 'email', Value: 'bennguyenn@outlook.com' },
                { Name: 'given_name', Value: 'Ben' },
                { Name: 'family_name', Value: 'Nguyen' },
                { Name: 'custom:company_name', Value: 'PS' },
                { Name: 'custom:domain', Value: 'plumbing' },
                { Name: 'custom:is_admin', Value: 'true' }
            ],
            UserStatus: 'CONFIRMED',
            UserCreateDate: new Date('2025-06-04T19:48:21.705Z')
        },
        {
            Username: 'anhquan1212004@gmail.com',
            Attributes: [
                { Name: 'email', Value: 'anhquan1212004@gmail.com' },
                { Name: 'given_name', Value: 'Anh' },
                { Name: 'family_name', Value: 'Quan' },
                { Name: 'custom:company_name', Value: 'Engineering Solutions' },
                { Name: 'custom:domain', Value: 'ventilation' },
                { Name: 'custom:is_admin', Value: 'false' }
            ],
            UserStatus: 'CONFIRMED',
            UserCreateDate: new Date('2025-06-05T18:28:12.061Z')
        }
    ];
}

function getUserAttribute(user, attributeName) {
    const attr = user.Attributes.find(a => a.Name === attributeName);
    return attr ? attr.Value : '';
}

function renderUsers() {
    const usersGrid = document.getElementById('usersGrid');
    usersGrid.innerHTML = '';

    if (filteredUsers.length === 0) {
        usersGrid.innerHTML = '<p>No users found matching your criteria.</p>';
        return;
    }

    filteredUsers.forEach(user => {
        const email = getUserAttribute(user, 'email');
        const firstName = getUserAttribute(user, 'given_name');
        const lastName = getUserAttribute(user, 'family_name');
        const companyName = getUserAttribute(user, 'custom:company_name');
        const domain = getUserAttribute(user, 'custom:domain');
        const isAdmin = getUserAttribute(user, 'custom:is_admin') === 'true';
        const initials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
        const isEnabled = user.UserStatus === 'CONFIRMED';
        const currentUser = authHelper.getCurrentUser();

        const userCard = document.createElement('div');
        userCard.className = `user-card ${isAdmin ? 'admin' : ''}`;
        
        userCard.innerHTML = `
            <div class="user-header">
                <div class="user-avatar ${isAdmin ? 'admin' : ''}">${initials}</div>
                <div class="user-info">
                    <h3>
                        ${firstName} ${lastName}
                        ${isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}
                    </h3>
                    <p>${email}</p>
                </div>
            </div>
            
            <div class="user-details">
                <p><strong>Company:</strong> ${companyName}</p>
                <p><strong>Domain:</strong> ${domain}</p>
                <p><strong>Status:</strong> 
                    <span class="user-status ${isEnabled ? 'active' : 'disabled'}">
                        ${isEnabled ? 'Active' : 'Disabled'}
                    </span>
                </p>
                <p><strong>Joined:</strong> ${user.UserCreateDate.toLocaleDateString()}</p>
            </div>
            
            <div class="user-actions">
                ${email !== currentUser.email ? `
                    ${user.approvalStatus === 'pending' ? `
                        <button class="action-btn promote-btn" onclick="approveUserAccount('${email}')">
                            <i class="fas fa-check"></i>
                            Approve
                        </button>
                    ` : ''}
                    
                    ${!isAdmin ? `
                        <button class="action-btn promote-btn" onclick="promoteUser('${email}')">
                            <i class="fas fa-user-shield"></i>
                            Promote
                        </button>
                    ` : `
                        <button class="action-btn demote-btn" onclick="demoteUser('${email}')">
                            <i class="fas fa-user-minus"></i>
                            Demote
                        </button>
                    `}
                    
                    <button class="action-btn delete-btn" onclick="deleteUser('${email}')">
                        <i class="fas fa-user-times"></i>
                        Delete User
                    </button>
                ` : `
                    <p style="text-align: center; color: #666; font-style: italic;">This is you</p>
                `}
            </div>
        `;

        usersGrid.appendChild(userCard);
    });
}

function updateStats() {
    const totalUsers = allUsers.length;
    const adminUsers = allUsers.filter(user => 
        getUserAttribute(user, 'custom:is_admin') === 'true'
    ).length;
    const activeUsers = allUsers.filter(user => 
        user.UserStatus === 'CONFIRMED'
    ).length;
    const regularUsers = totalUsers - adminUsers;

    const statsBar = document.getElementById('statsBar');
    statsBar.innerHTML = `
        <div class="stat-item">
            <div class="stat-number">${totalUsers}</div>
            <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${adminUsers}</div>
            <div class="stat-label">Admins</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${regularUsers}</div>
            <div class="stat-label">Regular Users</div>
        </div>
        <div class="stat-item">
            <div class="stat-number">${activeUsers}</div>
            <div class="stat-label">Active Users</div>
        </div>
    `;
}

function filterUsers() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const roleFilter = document.getElementById('roleFilter').value;
    const domainFilter = document.getElementById('domainFilter').value;

    filteredUsers = allUsers.filter(user => {
        const email = getUserAttribute(user, 'email').toLowerCase();
        const firstName = getUserAttribute(user, 'given_name').toLowerCase();
        const lastName = getUserAttribute(user, 'family_name').toLowerCase();
        const fullName = `${firstName} ${lastName}`;
        const domain = getUserAttribute(user, 'custom:domain');
        const isAdmin = getUserAttribute(user, 'custom:is_admin') === 'true';

        // Search filter
        const matchesSearch = email.includes(searchTerm) || 
                            fullName.includes(searchTerm);

        // Role filter
        const matchesRole = roleFilter === 'all' || 
                          (roleFilter === 'admin' && isAdmin) ||
                          (roleFilter === 'user' && !isAdmin);

        // Domain filter
        const matchesDomain = domainFilter === 'all' || domain === domainFilter;

        return matchesSearch && matchesRole && matchesDomain;
    });

    renderUsers();
}

async function promoteUser(email) {
    if (!confirm(`Are you sure you want to promote ${email} to admin?`)) {
        return;
    }

    try {
        console.log(`🔧 Promoting user: ${email}`);
        addDebugInfo(`Attempting to promote user: ${email}`);
        document.getElementById('loadingOverlay').classList.add('show');
        
        const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/users/promote';
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: authHelper.getAuthHeaders(),
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to promote user');
        }
        
        const result = await response.json();
        console.log('✅ Promotion response:', result);
        
        document.getElementById('loadingOverlay').classList.remove('show');
        addDebugInfo(`User ${email} promoted successfully`);
        alert(`${email} has been promoted to admin successfully!\n\nThe user will need to log out and log back in to see admin features.`);
        
        // Refresh user list to show updated status
        await loadAllUsers();
        
    } catch (error) {
        console.error('❌ Error promoting user:', error);
        addDebugInfo(`Error promoting user: ${error.message}`);
        document.getElementById('loadingOverlay').classList.remove('show');
        alert('Error promoting user: ' + error.message);
    }
}

async function demoteUser(email) {
    const currentUser = authHelper.getCurrentUser();
    
    if (email === currentUser.email) {
        alert('You cannot demote yourself!');
        return;
    }

    if (!confirm(`Are you sure you want to remove admin privileges from ${email}?`)) {
        return;
    }

    try {
        console.log(`🔧 Demoting user: ${email}`);
        addDebugInfo(`Attempting to demote user: ${email}`);
        document.getElementById('loadingOverlay').classList.add('show');
        
        const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/users/demote';
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: authHelper.getAuthHeaders(),
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to demote user');
        }
        
        const result = await response.json();
        console.log('✅ Demotion response:', result);
        
        document.getElementById('loadingOverlay').classList.remove('show');
        addDebugInfo(`User ${email} demoted successfully`);
        alert(`${email} has been demoted from admin successfully!\n\nThe user will need to log out and log back in for changes to take effect.`);
        
        // Refresh user list to show updated status
        await loadAllUsers();
        
    } catch (error) {
        console.error('❌ Error demoting user:', error);
        addDebugInfo(`Error demoting user: ${error.message}`);
        document.getElementById('loadingOverlay').classList.remove('show');
        alert('Error demoting user: ' + error.message);
    }
}

async function deleteUser(email) {
    const currentUser = authHelper.getCurrentUser();
    
    if (email === currentUser.email) {
        alert('You cannot delete yourself!');
        return;
    }

    // Check if target user is admin
    const targetUser = allUsers.find(user => getUserAttribute(user, 'email') === email);
    const isTargetAdmin = getUserAttribute(targetUser, 'custom:is_admin') === 'true';
    
    if (isTargetAdmin) {
        const confirmDelete = confirm(`⚠️ ${email} is an ADMIN user.\n\nTo safely delete an admin:\n1. First demote them to regular user\n2. Then delete them\nWould you like to demote them first?`);
        
        if (confirmDelete) {
            // Call demote function instead
            await demoteUser(email);
            return;
        } else {
            return; // User canceled
        }
    }

    if (!confirm(`Are you sure you want to permanently delete ${email}?\n\nThis action cannot be undone.`)) {
        return;
    }

    try {
        console.log(`🗑️ Deleting user: ${email}`);
        addDebugInfo(`Attempting to delete user: ${email}`);
        document.getElementById('loadingOverlay').classList.add('show');
        
        const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/users';
        
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            headers: authHelper.getAuthHeaders(),
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete user');
        }
        
        const result = await response.json();
        console.log('✅ Deletion response:', result);
        
        document.getElementById('loadingOverlay').classList.remove('show');
        addDebugInfo(`User ${email} deleted successfully`);
        alert(`${email} has been permanently deleted!`);
        
        // Refresh user list to show updated data
        await loadAllUsers();
        
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        addDebugInfo(`Error deleting user: ${error.message}`);
        document.getElementById('loadingOverlay').classList.remove('show');
        
        // Show specific error message for admin deletion
        if (error.message.includes('Cannot delete admin user')) {
            alert(`🚫 ${error.message}1. Click "Demote" to remove admin privileges\n2. Then click "Delete User"`);
        } else {
            alert('Error deleting user: ' + error.message);
        }
    }
}

async function approveUserAccount(email) {
    if (!confirm(`Approve account for ${email}?`)) {
        return;
    }

    try {
        console.log(`✅ Approving account: ${email}`);
        document.getElementById('loadingOverlay').classList.add('show');
        
        const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/users/approve';
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: authHelper.getAuthHeaders(),
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to approve user');
        }
        
        const result = await response.json();
        console.log('✅ Approval response:', result);
        
        document.getElementById('loadingOverlay').classList.remove('show');
        alert(`${email} has been approved and can now log in!`);
        
        await loadAllUsers();
        
    } catch (error) {
        console.error('❌ Error approving user:', error);
        document.getElementById('loadingOverlay').classList.remove('show');
        alert('Error approving user: ' + error.message);
    }
}

// Make functions available globally
window.promoteUser = promoteUser;
window.demoteUser = demoteUser;
window.deleteUser = deleteUser;
window.toggleDebug = toggleDebug;
window.approveUserAccount = approveUserAccount;