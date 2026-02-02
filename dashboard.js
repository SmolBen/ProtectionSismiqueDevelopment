// Dashboard Page JavaScript
// Your API Gateway base URL
const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

// Initialize authHelper for dashboard
let authHelper;

// Initialize dashboard
window.addEventListener('load', async function() {
    console.log('🔄 Dashboard page loaded');
    await initializeDashboard();
});

async function initializeDashboard() {
    console.log('🚀 Initializing dashboard...');
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
        
        // Check authentication using simplified approach
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
        
        // Load projects and stats
        await Promise.all([
            fetchProjects(),
            loadDashboardStats()
        ]);

        // Setup event listeners
        setupEventListeners();

        document.getElementById('loadingOverlay').classList.remove('show');
        console.log('✅ Dashboard initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing dashboard:', error);
        document.getElementById('loadingOverlay').classList.remove('show');
        alert('Error initializing dashboard: ' + error.message);
        // If there's an authentication error, redirect to auth page
        window.location.href = 'auth.html';
    }
}

function setupEventListeners() {
    // Create project button
    document.getElementById('createProjectButton').addEventListener('click', () => {
        console.log('🎯 Create project button clicked');
        window.location.href = 'create-project.html';
    });

    // Filter projects
    document.getElementById('projectFilter').addEventListener('change', handleProjectFilter);

    // Search projects
    document.getElementById('projectSearch').addEventListener('input', handleProjectSearch);
}

async function loadDashboardStats() {
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: authHelper.getAuthHeaders()
        });

        if (!response.ok) {
            console.error('Failed to fetch projects for stats:', response.status);
            return;
        }

        const allProjects = await response.json();
        // Filter for seismic projects (projects with domain field)
        const projects = allProjects.filter(p => p.domain);
        console.log('📊 Seismic Projects loaded for stats:', projects.length);

        const totalProjects = projects.length;
        const planningProjects = projects.filter(p => p.status === 'Planning').length;
        const inProgressProjects = projects.filter(p => p.status === 'In Progress').length;
        const completedProjects = projects.filter(p => p.status === 'Completed').length;

        const statsGrid = document.getElementById('statsGrid');
        statsGrid.innerHTML = `
            <div class="stats-compact">
                <div class="stat-item">
                    <span class="stat-value">${totalProjects}</span>
                    <span>Total</span>
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
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// Fetch projects from AWS
async function fetchProjects() {
    try {
        console.log('📄 Fetching seismic projects...');
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: authHelper.getAuthHeaders()
        });

        if (!response.ok) {
            console.error('Failed to fetch projects:', response.status, response.statusText);
            throw new Error(`HTTP ${response.status}`);
        }

        const allProjects = await response.json();
        // Filter for seismic projects (projects with domain field)
        const projects = allProjects.filter(p => p.domain);

        // Sort by newest first
        projects.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        
        console.log('✅ Seismic Projects fetched:', projects.length);
        renderProjects(projects);
    } catch (error) {
        console.error('❌ Error fetching seismic projects:', error);
        document.getElementById('projectList').innerHTML = 
            `<p style="color: red;">Error loading seismic projects: ${error.message}</p>`;
    }
}

// Helper function to get domain-specific CSS classes, display name, and icon
function getDomainInfo(domain) {
    const domainLower = (domain || '').toLowerCase();
    
    const domainMap = {
        'electricity': {
            badgeClass: 'electricity',
            displayName: 'Electricity',
            icon: 'fas fa-bolt'
        },
        'ventilation': {
            badgeClass: 'ventilation',
            displayName: 'Ventilation',
            icon: 'fas fa-wind'
        },
        'plumbing': {
            badgeClass: 'plumbing',
            displayName: 'Plumbing',
            icon: 'fas fa-faucet'
        },
        'sprinkler': {
            badgeClass: 'sprinkler',
            displayName: 'Sprinkler',
            icon: 'fas fa-fire-extinguisher'
        },
        'interior system': {
            badgeClass: 'interior-system',
            displayName: 'Interior System',
            icon: 'fas fa-home'
        },
        'interior_system': {
            badgeClass: 'interior-system',
            displayName: 'Interior System',
            icon: 'fas fa-home'
        }
    };

    return domainMap[domainLower] || {
        badgeClass: 'default',
        displayName: domain || 'Unknown',
        icon: 'fas fa-question-circle'
    };
}

// Render projects in compact list format
function renderProjects(filteredProjects) {
    const projectList = document.getElementById('projectList');
    projectList.innerHTML = '';
    
    if (filteredProjects.length === 0) {
        projectList.innerHTML = `
            <div class="list-header">Projects (0)</div>
            <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
                No seismic projects found. Create your first seismic project to get started!
            </div>
        `;
        return;
    }
    
    // Add list header
    const listHeader = document.createElement('div');
    listHeader.className = 'list-header';
    listHeader.textContent = `Projects (${filteredProjects.length})`;
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
        
        // Get domain information for styling and display
        const domainInfo = getDomainInfo(project.domain);
        
        const projectCard = document.createElement('div');
        projectCard.className = 'project-card';
        projectCard.innerHTML = `
            <div class="project-main">
                <div class="project-info">
                    <h2>
                        ${project.name}
                        <span class="domain-badge ${domainInfo.badgeClass}">
                            <i class="${domainInfo.icon}"></i>
                            ${domainInfo.displayName}
                        </span>
                    </h2>
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
        projectCard.addEventListener('click', (e) => {
            // Don't navigate if clicking on buttons or other interactive elements
            if (e.target.closest('button')) {
                return;
            }
            window.location.href = `project-details.html?id=${project.id}`;
        });

        // Add event listeners
        projectCard.querySelector('.view-details').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            window.location.href = `project-details.html?id=${project.id}`;
        });

        const duplicateButton = projectCard.querySelector('.duplicate-project');
        if (duplicateButton) {
            duplicateButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click
                duplicateProject(project.id);
            });
        }

        const deleteButton = projectCard.querySelector('.delete-project');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click
                deleteProject(project.id);
            });
        }
    });
}

// Filter projects
async function handleProjectFilter(e) {
    const filter = e.target.value.toLowerCase();
    const searchTerm = document.getElementById('projectSearch').value.toLowerCase();
    
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: authHelper.getAuthHeaders()
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const allProjects = await response.json();
        // Filter for seismic projects (projects with domain field)
        const projects = allProjects.filter(p => p.domain);
        
        // Apply both search and filter
        const filteredProjects = projects.filter(project => {
            const matchesSearch = searchTerm === '' || 
                project.name.toLowerCase().includes(searchTerm);
            const matchesFilter = filter === 'all' || 
                project.status.toLowerCase() === filter;
            
            return matchesSearch && matchesFilter;
        });
        
        renderProjects(filteredProjects);
    } catch (error) {
        console.error('Error filtering seismic projects:', error);
    }
}

// Combined search and filter function
async function handleProjectSearch() {
    const searchTerm = document.getElementById('projectSearch').value.toLowerCase();
    const filterValue = document.getElementById('projectFilter').value.toLowerCase();
    
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: authHelper.getAuthHeaders()
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const allProjects = await response.json();
        // Filter for seismic projects (projects with domain field)
        const projects = allProjects.filter(p => p.domain);
        
        // Apply both search and filter
        const filteredProjects = projects.filter(project => {
            const matchesSearch = searchTerm === '' || 
                project.name.toLowerCase().includes(searchTerm);
            const matchesFilter = filterValue === 'all' || 
                project.status.toLowerCase() === filterValue;
            
            return matchesSearch && matchesFilter;
        });
        
        renderProjects(filteredProjects);
    } catch (error) {
        console.error('Error searching seismic projects:', error);
    }
}

// Delete project function
async function deleteProject(id) {
    if (!confirm('Are you sure you want to delete this project?')) {
        return;
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            headers: authHelper.getAuthHeaders(),
            body: JSON.stringify({ id })
        });

        if (!response.ok) throw new Error(`Server responded with ${response.status}`);

        // Refresh project list
        await Promise.all([
            fetchProjects(),
            loadDashboardStats()
        ]);
        
        alert('Project deleted successfully!');
    } catch (error) {
        console.error('Error deleting project:', error);
        alert('Error deleting project. Please try again.');
    }
}

async function duplicateProject(id) {
    try {
        console.log('📋 Duplicating seismic project:', id);
        
        const response = await fetch(`${apiUrl}/${id}/duplicate`, {
            method: 'POST',
            headers: {
                ...authHelper.getAuthHeaders(),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to duplicate project: ${errorText || response.statusText}`);
        }

        const duplicatedProject = await response.json();
        console.log('✅ Project duplicated successfully:', duplicatedProject.id);

        // Refresh project list to show the new duplicate
        await Promise.all([
            fetchProjects(),
            loadDashboardStats()
        ]);
        
        alert('Project duplicated successfully!');
        
    } catch (error) {
        console.error('Error duplicating project:', error);
        alert('Error duplicating project: ' + error.message);
    }
}

// Switch to CFSS dashboard
function switchToCFSS() {
    if (!authHelper.isAdmin()) {
        alert('Admin access required');
        return;
    }
    window.location.href = 'cfss-dashboard.html';
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
    fetchProjects();
    alert('Showing all projects in the system');
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

function exportData() {
    if (!authHelper.isAdmin()) {
        alert('Admin access required');
        return;
    }
    alert('Data export feature coming soon!');
}

function openEmailClassifications() {
    if (!authHelper.isAdmin()) {
        alert('Admin access required');
        return;
    }
    
    const password = prompt('Enter password to access Email Classifications:');
    if (password === null) {
        return; // User cancelled
    }
    
    if (password === 'sismique2000') {
        sessionStorage.setItem('ecAccess', 'true');
        window.location.href = 'email-classifications.html';
    } else {
        alert('Incorrect password');
    }
}

// Make functions available globally
window.switchToCFSS = switchToCFSS;
window.openUserManagement = openUserManagement;
window.viewAllProjects = viewAllProjects;
window.openVerifyBulkProjects = openVerifyBulkProjects;
window.exportData = exportData;
window.openEmailClassifications = openEmailClassifications;
