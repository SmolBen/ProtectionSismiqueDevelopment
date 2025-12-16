// Limited CFSS Dashboard Page JavaScript
// API Gateway base URL
const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

// Initialize authHelper for dashboard
let authHelper;

// Initialize Limited CFSS dashboard
window.addEventListener('load', async function() {
    console.log('📄 Limited CFSS Dashboard page loaded');
    await initializeLimitedCFSSDashboard();
});

async function initializeLimitedCFSSDashboard() {
    console.log('🚀 Initializing Limited CFSS dashboard...');
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

        // Verify user is limited - redirect others
        if (!authHelper.isLimited()) {
            console.log('🚀 Non-limited user detected, redirecting to appropriate dashboard');
            if (authHelper.isAdmin()) {
                window.location.href = 'dashboard.html';
            } else {
                window.location.href = 'cfss-dashboard.html';
            }
            return;
        }

        // Update UI with user info
        authHelper.updateUserInterface();
        
        // Load CFSS projects and stats
        await Promise.all([
            fetchCFSSProjects(),
            loadCFSSDashboardStats()
        ]);

        // Setup event listeners
        setupCFSSEventListeners();

        document.getElementById('loadingOverlay').classList.remove('show');
        console.log('✅ Limited CFSS Dashboard initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing Limited CFSS dashboard:', error);
        document.getElementById('loadingOverlay').classList.remove('show');
        alert('Error initializing dashboard: ' + error.message);
        window.location.href = 'auth.html';
    }
}

function setupCFSSEventListeners() {
    // Create CFSS project button
    document.getElementById('createProjectButton').addEventListener('click', () => {
        console.log('🎯 Create CFSS project button clicked');
        window.location.href = 'limited-cfss-create-project.html';
    });

    // Filter projects
    document.getElementById('projectFilter').addEventListener('change', handleCFSSProjectFilter);

    // Search projects
    document.getElementById('projectSearch').addEventListener('input', handleCFSSProjectSearch);
}

async function loadCFSSDashboardStats() {
    try {
        console.log('📊 Loading CFSS dashboard stats...');
        
        const authHeaders = authHelper.getAuthHeaders();
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('❌ Failed to fetch projects for stats:', response.status);
            return;
        }

        const allProjects = await response.json();
        // Filter for CFSS projects (projects without domain field) that belong to this user
        const currentUser = authHelper.getCurrentUser();
        const projects = allProjects.filter(p =>
    !p.domain &&
    p.createdBy === currentUser.email &&
    p.isAdminCopy !== true &&
    !p.linkedLimitedProjectId &&
    (p.isLimitedProject === true || p.isLimitedProject === undefined)
);
        console.log('📊 CFSS Projects loaded for stats:', projects.length);

        updateCFSSStats(projects);
        
    } catch (error) {
        console.error('❌ Error loading CFSS dashboard stats:', error);
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

// Fetch CFSS projects from AWS
async function fetchCFSSProjects() {
    try {
        console.log('📄 Fetching CFSS projects...');
        
        const authHeaders = authHelper.getAuthHeaders();
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const allProjects = await response.json();
        // Filter for CFSS projects that belong to this user
        const currentUser = authHelper.getCurrentUser();
        const projects = allProjects.filter(p =>
    !p.domain &&
    p.createdBy === currentUser.email &&
    p.isAdminCopy !== true &&
    !p.linkedLimitedProjectId &&
    (p.isLimitedProject === true || p.isLimitedProject === undefined)
);

        // Sort by newest first
        projects.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        
        console.log('✅ CFSS Projects fetched:', projects.length);
        renderCFSSProjects(projects);
    } catch (error) {
        console.error('❌ Error fetching CFSS projects:', error);
        document.getElementById('projectList').innerHTML = 
            `<p style="color: red;">Error loading CFSS projects: ${error.message}</p>`;
    }
}

// Render CFSS projects using the same card layout as the regular CFSS dashboard
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
        const formattedAddress = `${project.addressLine1 || ''}${
            project.city ? ', ' + project.city : ''
        }${project.province ? ', ' + project.province : ''}${
            project.country ? ', ' + project.country : ''
        }`;
        
        const formattedDate = project.createdAt
            ? new Date(project.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
              })
            : 'N/A';
        
        // Get status dot class (planning / in-progress / completed)
        const statusClass = project.status
            ? project.status.toLowerCase().replace(' ', '-')
            : 'planning';
        
        const projectCard = document.createElement('div');
        projectCard.className = 'project-card';
        projectCard.innerHTML = `
            <div class="project-main">
                <div class="project-info">
                    <h2>${project.name}</h2>
                    <div class="project-meta">
                        <span>${project.type || 'CFSS Project'}</span>
                        <span class="meta-separator">•</span>
                        <span>${formattedAddress || 'No address'}</span>
                        <span class="meta-separator">•</span>
                        <span>${formattedDate}</span>
                    </div>
                    <p>${project.description || ''}</p>
                </div>
                <div class="project-status">
                    <div class="status-dot ${statusClass}"></div>
                    <span class="status-text">${project.status || 'Planning'}</span>
                </div>
                <div class="project-actions">
                    <button class="view-details" title="View Details">
                        <i class="fas fa-eye"></i>
                        View
                    </button>
                    <button class="delete-project" data-id="${project.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                        Delete
                    </button>
                </div>
            </div>
            ${
                project.createdBy
                    ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                           Created by: ${project.createdBy}
                       </div>`
                    : ''
            }
        `;

        projectList.appendChild(projectCard);

        // Click anywhere on the card to open details
        projectCard.addEventListener('click', () => {
            window.location.href = `limited-cfss-project-details.html?id=${project.id}`;
        });

        // View button
        const viewButton = projectCard.querySelector('.view-details');
        if (viewButton) {
            viewButton.addEventListener('click', (e) => {
                e.stopPropagation();
                window.location.href = `limited-cfss-project-details.html?id=${project.id}`;
            });
        }

        // Delete button
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
        const currentUser = authHelper.getCurrentUser();
        const projects = allProjects.filter(p =>
    !p.domain &&
    p.createdBy === currentUser.email &&
    p.isAdminCopy !== true &&
    !p.linkedLimitedProjectId &&
    (p.isLimitedProject === true || p.isLimitedProject === undefined)
);
        
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
        const currentUser = authHelper.getCurrentUser();
        const projects = allProjects.filter(p =>
    !p.domain &&
    p.createdBy === currentUser.email &&
    p.isAdminCopy !== true &&
    !p.linkedLimitedProjectId &&
    (p.isLimitedProject === true || p.isLimitedProject === undefined)
);
        
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

// Delete CFSS project function
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