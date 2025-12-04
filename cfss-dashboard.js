// CFSS Dashboard Page JavaScript
// API Gateway base URL
const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

// Initialize authHelper for dashboard
let authHelper;

// Initialize CFSS dashboard
window.addEventListener('load', async function() {
    console.log('📄 CFSS Dashboard page loaded');
    await initializeCFSSDashboard();
});

async function initializeCFSSDashboard() {
    console.log('🚀 Initializing CFSS dashboard...');
    document.getElementById('loadingOverlay').classList.add('show');

    try {
        // Wait for AWS libraries to be available
        let retries = 0;
        while ((typeof AWS === 'undefined' || typeof AmazonCognitoIdentity === 'undefined') && retries < 10) {
            console.log('Waiting for AWS libraries...');
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }
        
        if (typeof AWS === 'undefined' || typeof AmazonCognitoIdentity === 'undefined') {
            throw new Error('AWS libraries failed to load');
        }
        
        // Initialize authHelper
        authHelper = new AuthHelper();
        console.log('✅ AuthHelper initialized');
        
        // Check authentication
        const userData = await authHelper.checkAuthentication();
        
        if (!userData) {
            console.log('❌ No user authenticated, redirecting to auth page');
            window.location.href = 'auth.html';
            return;
        }

        console.log('👤 User authenticated:', userData.email);

        // Redirect limited users to limited CFSS dashboard
        if (authHelper.isLimited()) {
            console.log('🚀 Limited user detected, redirecting to limited CFSS dashboard');
            window.location.href = 'limited-cfss-dashboard.html';
            return;
        }

        // Update UI with user info
        authHelper.updateUserInterface();
        authHelper.showAdminElements();
        
        // Load CFSS projects and stats
        await Promise.all([
            fetchCFSSProjects(),
            loadCFSSDashboardStats()
        ]);

        // Setup event listeners
        setupCFSSEventListeners();

        document.getElementById('loadingOverlay').classList.remove('show');
        console.log('✅ CFSS Dashboard initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing CFSS dashboard:', error);
        document.getElementById('loadingOverlay').classList.remove('show');
        alert('Error initializing CFSS dashboard: ' + error.message);
        window.location.href = 'auth.html';
    }
}

function setupCFSSEventListeners() {
    // Create CFSS project button
    document.getElementById('createProjectButton').addEventListener('click', () => {
        console.log('🎯 Create CFSS project button clicked');
        window.location.href = 'cfss-create-project.html';
    });

    // Filter projects
    document.getElementById('projectFilter').addEventListener('change', handleCFSSProjectFilter);

    // Search projects
    document.getElementById('projectSearch').addEventListener('input', handleCFSSProjectSearch);
}

async function loadCFSSDashboardStats() {
    try {
        console.log('📊 Loading CFSS dashboard stats...');
        
        // Get and validate auth headers
        const authHeaders = authHelper.getAuthHeaders();
        console.log('📋 Auth headers for stats:', Object.keys(authHeaders));
        
        // Validate required headers
        const requiredHeaders = ['x-user-email', 'x-user-admin', 'x-user-id'];
        const missingHeaders = requiredHeaders.filter(header => !authHeaders[header]);
        
        if (missingHeaders.length > 0) {
            console.error('❌ Missing required headers for stats:', missingHeaders);
            console.error('❌ Available headers:', Object.keys(authHeaders));
            throw new Error(`Missing authentication headers: ${missingHeaders.join(', ')}`);
        }

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            }
        });

        console.log('📡 Stats response status:', response.status);
        console.log('📡 Stats response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Failed to fetch projects for stats:', response.status, errorText);
            console.error('❌ Request headers sent:', authHeaders);
            
            // Show user-friendly error message
            document.getElementById('statsGrid').innerHTML = `
                <div style="color: red; text-align: center; padding: 20px;">
                    Error loading stats: HTTP ${response.status}<br>
                    <small>Check console for details</small>
                </div>
            `;
            return;
        }

        const allProjects = await response.json();
        // Filter for CFSS projects (projects without domain field)
        const projects = allProjects.filter(p => !p.domain);
        console.log('📊 CFSS Projects loaded for stats:', projects.length);

        updateCFSSStats(projects);
        
    } catch (error) {
        console.error('❌ Error loading CFSS dashboard stats:', error);
        document.getElementById('statsGrid').innerHTML = `
            <div style="color: red; text-align: center; padding: 20px;">
                Stats unavailable<br>
                <small>${error.message}</small>
            </div>
        `;
    }
}

function updateCFSSStats(projects) {
    const totalProjects = projects.length;
    const planningProjects = projects.filter(p => p.status === 'Planning').length;
    const inProgressProjects = projects.filter(p => p.status === 'In Progress').length;
    const completedProjects = projects.filter(p => p.status === 'Completed').length;

    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = `
        <div class="stats-compact">
            <div class="stat-item">
                <span class="stat-value">${totalProjects}</span>
                <span>Total CFSS</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${planningProjects}</span>
                <span>Planning</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${inProgressProjects}</span>
                <span>Active</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${completedProjects}</span>
                <span>Done</span>
            </div>
        </div>
    `;
}

// Fetch CFSS projects from AWS with enhanced error handling
async function fetchCFSSProjects() {
    try {
        console.log('📄 Fetching CFSS projects...');
        
        // Get and validate auth headers
        const authHeaders = authHelper.getAuthHeaders();
        console.log('📋 Auth headers being sent:', Object.keys(authHeaders));
        
        // Debug: Print actual header values (be careful in production)
        console.log('📋 Header values check:', {
            'x-user-email': authHeaders['x-user-email'] ? 'present' : 'missing',
            'x-user-admin': authHeaders['x-user-admin'] ? authHeaders['x-user-admin'] : 'missing',
            'x-user-id': authHeaders['x-user-id'] ? 'present' : 'missing'
        });
        
        // Validate required headers
        const requiredHeaders = ['x-user-email', 'x-user-admin', 'x-user-id'];
        const missingHeaders = requiredHeaders.filter(header => !authHeaders[header]);
        
        if (missingHeaders.length > 0) {
            console.error('❌ Missing required headers:', missingHeaders);
            console.error('❌ Available headers:', Object.keys(authHeaders));
            throw new Error(`Missing authentication headers: ${missingHeaders.join(', ')}`);
        }

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            }
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Failed to fetch projects:', response.status, response.statusText);
            console.error('❌ Error response body:', errorText);
            console.error('❌ Request headers sent:', authHeaders);
            console.error('❌ Request URL:', apiUrl);
            
            // Try to parse error response
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorJson.message || errorMessage;
            } catch (parseError) {
                console.log('Error response is not JSON:', errorText);
            }
            
            throw new Error(errorMessage);
        }

        const allProjects = await response.json();
        console.log('📦 All projects received:', allProjects.length);
        
        // Filter for CFSS projects (projects without domain field)
        const projects = allProjects.filter(p => !p.domain);
        console.log('🏗️ CFSS projects found:', projects.length);

        // Sort by newest first
        projects.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        
        console.log('✅ CFSS Projects fetched successfully:', projects.length);
        renderCFSSProjects(projects);
        
    } catch (error) {
        console.error('❌ Error fetching CFSS projects:', error);
        console.error('❌ Error stack:', error.stack);
        
        // Show user-friendly error message
        document.getElementById('projectList').innerHTML = `
            <div style="color: red; padding: 20px; text-align: center; border: 1px solid #ffcdd2; border-radius: 4px; background: #ffebee;">
                <h3>Error Loading CFSS Projects</h3>
                <p><strong>Error:</strong> ${error.message}</p>
                <p><small>Check the browser console for detailed logs.</small></p>
                <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Retry
                </button>
            </div>
        `;
    }
}

// Add a debug function to test the API directly
async function debugAPIConnection() {
    try {
        console.log('🔧 Debug: Testing API connection...');
        
        const authHeaders = authHelper.getAuthHeaders();
        console.log('🔧 Debug: Auth headers:', authHeaders);
        
        // Test with a simple GET request
        const response = await fetch(apiUrl + '/debug', {
            method: 'GET',
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('🔧 Debug: Response status:', response.status);
        const responseText = await response.text();
        console.log('🔧 Debug: Response body:', responseText);
        
        if (response.ok) {
            console.log('✅ Debug: API connection successful');
        } else {
            console.error('❌ Debug: API connection failed');
        }
        
    } catch (error) {
        console.error('❌ Debug: API test failed:', error);
    }
}

// Add debug button to help troubleshoot (you can remove this later)
window.debugAPIConnection = debugAPIConnection;

// Render CFSS projects in compact list format
function renderCFSSProjects(filteredProjects) {
    const projectList = document.getElementById('projectList');
    projectList.innerHTML = '';
    
    if (filteredProjects.length === 0) {
        projectList.innerHTML = `
            <div class="list-header">CFSS Projects (0)</div>
            <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
                No CFSS projects found. Create your first CFSS project to get started!
            </div>
        `;
        return;
    }
    
    // Add list header
    const listHeader = document.createElement('div');
    listHeader.className = 'list-header';
    listHeader.textContent = `CFSS Projects (${filteredProjects.length})`;
    projectList.appendChild(listHeader);
    
    filteredProjects.forEach((project) => {
        const formattedAddress = `${project.addressLine1}, ${project.city}, ${project.province}, ${project.country}`;
        const formattedDate = project.createdAt ? new Date(project.createdAt).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        }) : 'N/A';
        
        // Get status dot class
        const statusClass = project.status.toLowerCase().replace(' ', '-');
        
        const projectCard = document.createElement('div');
        projectCard.className = 'project-card';
        projectCard.innerHTML = `
            <div class="project-main">
                <div class="project-info">
                    <h2>${project.name}</h2>
                    <div class="project-meta">
                        <span>${project.type}</span>
                        <span class="meta-separator">•</span>
                        <span>${formattedAddress}</span>
                        <span class="meta-separator">•</span>
                        <span>${formattedDate}</span>
                    </div>
                    <p>${project.description}</p>
                </div>
                <div class="project-status">
                    <div class="status-dot ${statusClass}"></div>
                    <span class="status-text">${project.status}</span>
                </div>
                <div class="project-actions">
                    <button class="view-details" title="View Details">
                        <i class="fas fa-eye"></i>
                        View
                    </button>
                    <button class="duplicate-project" data-id="${project.id}" title="Duplicate">
                        <i class="fas fa-copy"></i>
                        Copy
                    </button>
                    ${authHelper.canModifyProject(project) ? `
                        <button class="delete-project" data-id="${project.id}" title="Delete">
                            <i class="fas fa-trash"></i>
                            Delete
                        </button>
                    ` : ''}
                </div>
            </div>
            ${project.createdBy && authHelper.isAdmin() ? `
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                    Created by: ${project.createdBy}
                </div>
            ` : ''}
        `;

        projectList.appendChild(projectCard);

        // Add click event to entire card for navigation
        projectCard.addEventListener('click', () => {
            window.location.href = `cfss-project-details.html?id=${project.id}`;
        });

        // Add event listeners
        projectCard.querySelector('.view-details').addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `cfss-project-details.html?id=${project.id}`;
        });

        const duplicateButton = projectCard.querySelector('.duplicate-project');
        if (duplicateButton) {
            duplicateButton.addEventListener('click', (e) => {
                e.stopPropagation();
                duplicateCFSSProject(project.id);
            });
        }

        const deleteButton = projectCard.querySelector('.delete-project');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCFSSProject(project.id);
            });
        }
    });
}

// Filter CFSS projects
async function handleCFSSProjectFilter(e) {
    const filter = e.target.value.toLowerCase();
    const searchTerm = document.getElementById('projectSearch').value.toLowerCase();
    
    try {
        const authHeaders = authHelper.getAuthHeaders();
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const allProjects = await response.json();
        const projects = allProjects.filter(p => !p.domain); // Filter for CFSS projects
        
        // Apply both search and filter
        const filteredProjects = projects.filter(project => {
            const matchesSearch = searchTerm === '' || 
                project.name.toLowerCase().includes(searchTerm);
            const matchesFilter = filter === 'all' || 
                project.status.toLowerCase() === filter;
            
            return matchesSearch && matchesFilter;
        });
        
        renderCFSSProjects(filteredProjects);
    } catch (error) {
        console.error('Error filtering CFSS projects:', error);
    }
}

// Combined search and filter function for CFSS
async function handleCFSSProjectSearch() {
    const searchTerm = document.getElementById('projectSearch').value.toLowerCase();
    const filterValue = document.getElementById('projectFilter').value.toLowerCase();
    
    try {
        const authHeaders = authHelper.getAuthHeaders();
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const allProjects = await response.json();
        const projects = allProjects.filter(p => !p.domain); // Filter for CFSS projects
        
        // Apply both search and filter
        const filteredProjects = projects.filter(project => {
            const matchesSearch = searchTerm === '' || 
                project.name.toLowerCase().includes(searchTerm);
            const matchesFilter = filterValue === 'all' || 
                project.status.toLowerCase() === filterValue;
            
            return matchesSearch && matchesFilter;
        });
        
        renderCFSSProjects(filteredProjects);
    } catch (error) {
        console.error('Error searching CFSS projects:', error);
    }
}

// Simplified delete CFSS project function
async function deleteCFSSProject(id) {
    if (!confirm('Are you sure you want to delete this CFSS project?')) {
        return;
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            headers: {
                ...authHelper.getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete project: ${errorText || response.statusText}`);
        }

        // Refresh the dashboard
        await Promise.all([
            fetchCFSSProjects(),
            loadCFSSDashboardStats()
        ]);
        
        alert('CFSS Project deleted successfully!');
        
    } catch (error) {
        console.error('Error deleting CFSS project:', error);
        alert('Error deleting CFSS project: ' + error.message);
    }
}

async function duplicateCFSSProject(id) {
    try {
        console.log('📋 Duplicating CFSS project:', id);
        
        const response = await fetch(`${apiUrl}/${id}/duplicate`, {
            method: 'POST',
            headers: {
                ...authHelper.getAuthHeaders(),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to duplicate CFSS project: ${errorText || response.statusText}`);
        }

        const duplicatedProject = await response.json();
        console.log('✅ CFSS Project duplicated successfully:', duplicatedProject.id);

        // Refresh the dashboard - use the correct function names for CFSS
        await Promise.all([
            fetchCFSSProjects(),  // Changed from fetchProjects()
            loadCFSSDashboardStats()  // This one was already correct
        ]);
        
        alert('CFSS Project duplicated successfully!');
        
    } catch (error) {
        console.error('Error duplicating CFSS project:', error);
        alert('Error duplicating CFSS project: ' + error.message);
    }
}

// Switch to Seismic dashboard
function switchToSeismic() {
    if (!authHelper.isAdmin()) {
        alert('Admin access required');
        return;
    }
    window.location.href = 'dashboard.html';
}

// Admin functions
function openUserManagement() {
    if (!authHelper.isAdmin()) {
        alert('Admin access required');
        return;
    }
    window.location.href = 'user-management.html';
}

function viewAllProjects() {
    if (!authHelper.isAdmin()) {
        alert('Admin access required');
        return;
    }
    fetchCFSSProjects();
    alert('Showing all CFSS projects in the system');
}

function openVerifyBulkProjects() {
    const allowedEmails = (typeof BULK_VERIFY_ALLOWED_EMAILS !== 'undefined')
        ? BULK_VERIFY_ALLOWED_EMAILS
        : ['anhquan1212004@gmail.com', 'hoangminhduc.ite@gmail.com'];
    const currentUser = authHelper?.getCurrentUser ? authHelper.getCurrentUser() : null;
    const userEmail = (currentUser?.email || '').toLowerCase();

    if (!allowedEmails.includes(userEmail)) {
        alert('Access restricted');
        return;
    }

    window.location.href = 'cfss-verify-bulk-projects.html';
}

// Make functions available globally
window.switchToSeismic = switchToSeismic;
window.openUserManagement = openUserManagement;
window.viewAllProjects = viewAllProjects;
window.openVerifyBulkProjects = openVerifyBulkProjects;
