// Dashboard Page JavaScript
// Your API Gateway base URL
const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

// Initialize authHelper for dashboard
let authHelper;
let selectedProjectIds = new Set();
let currentRenderedProjects = [];

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

    // Category filter
    document.getElementById('categoryFilter').addEventListener('change', handleProjectFilter);

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
                    <span>${t('dashboard.total')}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${planningProjects}</span>
                    <span>${t('dashboard.planning')}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${inProgressProjects}</span>
                    <span>${t('dashboard.active')}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${completedProjects}</span>
                    <span>${t('dashboard.done')}</span>
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
            `<p style="color: red;">${t('dashboard.errorLoadingProjects')}${error.message}</p>`;
    }
}

// Helper function to get domain-specific CSS classes, display name, and icon
function getDomainInfo(domain) {
    const domainLower = (domain || '').toLowerCase();
    
    const domainMap = {
        'electricity': {
            badgeClass: 'electricity',
            displayName: t('domains.electricity'),
            icon: 'fas fa-bolt'
        },
        'ventilation': {
            badgeClass: 'ventilation',
            displayName: t('domains.ventilation'),
            icon: 'fas fa-wind'
        },
        'plumbing': {
            badgeClass: 'plumbing',
            displayName: t('domains.plumbing'),
            icon: 'fas fa-faucet'
        },
        'sprinklers': {
            badgeClass: 'sprinklers',
            displayName: t('domains.sprinklers'),
            icon: 'fas fa-fire-extinguisher'
        },
        'interior-design': {
            badgeClass: 'interior-design',
            displayName: t('domains.interiorDesign'),
            icon: 'fas fa-couch'
        },
        'exterior': {
            badgeClass: 'exterior',
            displayName: t('domains.exterior'),
            icon: 'fas fa-building'
        }
    };

    return domainMap[domainLower] || {
        badgeClass: 'default',
        displayName: domain || t('common.unknown'),
        icon: 'fas fa-question-circle'
    };
}

// Render projects in compact list format
function renderProjects(filteredProjects) {
    const projectList = document.getElementById('projectList');
    projectList.innerHTML = '';
    currentRenderedProjects = filteredProjects;

    // Clean up selected IDs that are no longer visible
    const visibleIds = new Set(filteredProjects.map(p => p.id));
    for (const id of selectedProjectIds) {
        if (!visibleIds.has(id)) selectedProjectIds.delete(id);
    }
    updateSelectionUI();

    if (filteredProjects.length === 0) {
        projectList.innerHTML = `
            <div class="list-header">${t('dashboard.projects')} (0)</div>
            <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
                ${t('dashboard.noProjectsFound')}
            </div>
        `;
        return;
    }

    // Add list header
    const listHeader = document.createElement('div');
    listHeader.className = 'list-header';
    listHeader.textContent = `${t('dashboard.projects')} (${filteredProjects.length})`;
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

        const isSelected = selectedProjectIds.has(project.id);
        const canModify = authHelper.canModifyProject(project);

        const projectCard = document.createElement('div');
        projectCard.className = `project-card${isSelected ? ' selected' : ''}`;
        projectCard.dataset.projectId = project.id;
        projectCard.innerHTML = `
            <div class="project-main">
                ${canModify ? `<input type="checkbox" class="project-checkbox" ${isSelected ? 'checked' : ''} data-id="${project.id}">` : ''}
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
                    ${project.createdBy && authHelper.isAdmin() ? `
                        <div class="created-by-line">
                            ${t('common.createdBy')} ${project.createdBy}
                        </div>
                    ` : ''}
                </div>
                <div class="project-status">
                    <div class="status-dot ${statusClass}"></div>
                    <span class="status-text">${project.status}</span>
                </div>
                <div class="project-actions">
                    <button class="view-details" title="${t('common.view')}">
                        <i class="fas fa-eye"></i>
                        ${t('common.view')}
                    </button>
                    <button class="duplicate-project" data-id="${project.id}" title="${t('common.copy')}">
                        <i class="fas fa-copy"></i>
                        ${t('common.copy')}
                    </button>
                    ${canModify ? `
                        <button class="delete-project" data-id="${project.id}" title="${t('common.delete')}">
                            <i class="fas fa-trash"></i>
                            ${t('common.delete')}
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        projectList.appendChild(projectCard);

        // Checkbox click handler
        const checkbox = projectCard.querySelector('.project-checkbox');
        if (checkbox) {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                toggleProjectSelect(project.id, e.target.checked, projectCard);
            });
        }

        // Add click event to entire card for navigation
        projectCard.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('.project-checkbox')) {
                return;
            }
            window.location.href = `project-details.html?id=${project.id}`;
        });

        // Add event listeners
        projectCard.querySelector('.view-details').addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `project-details.html?id=${project.id}`;
        });

        const duplicateButton = projectCard.querySelector('.duplicate-project');
        if (duplicateButton) {
            duplicateButton.addEventListener('click', (e) => {
                e.stopPropagation();
                duplicateProject(project.id);
            });
        }

        const deleteButton = projectCard.querySelector('.delete-project');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteProject(project.id);
            });
        }
    });
}

// Filter projects
async function handleProjectFilter() {
    const statusFilter = document.getElementById('projectFilter').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value.toLowerCase();
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

        // Apply search, status filter, and category filter
        const filteredProjects = projects.filter(project => {
            const matchesSearch = searchTerm === '' ||
                project.name.toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilter === 'all' ||
                project.status.toLowerCase() === statusFilter;
            const matchesCategory = categoryFilter === 'all' ||
                (project.domain || '').toLowerCase() === categoryFilter;

            return matchesSearch && matchesStatus && matchesCategory;
        });

        renderProjects(filteredProjects);
    } catch (error) {
        console.error('Error filtering seismic projects:', error);
    }
}

// Combined search and filter function
async function handleProjectSearch() {
    const searchTerm = document.getElementById('projectSearch').value.toLowerCase();
    const statusFilter = document.getElementById('projectFilter').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value.toLowerCase();

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: authHelper.getAuthHeaders()
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const allProjects = await response.json();
        // Filter for seismic projects (projects with domain field)
        const projects = allProjects.filter(p => p.domain);

        // Apply search, status filter, and category filter
        const filteredProjects = projects.filter(project => {
            const matchesSearch = searchTerm === '' ||
                project.name.toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilter === 'all' ||
                project.status.toLowerCase() === statusFilter;
            const matchesCategory = categoryFilter === 'all' ||
                (project.domain || '').toLowerCase() === categoryFilter;

            return matchesSearch && matchesStatus && matchesCategory;
        });

        renderProjects(filteredProjects);
    } catch (error) {
        console.error('Error searching seismic projects:', error);
    }
}

// Delete project function
async function deleteProject(id) {
    if (!confirm(t('project.deleteConfirm'))) {
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
        
        alert(t('project.projectDeleted'));
    } catch (error) {
        console.error('Error deleting project:', error);
        alert(t('project.errorDeleting'));
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
        
        alert(t('project.projectDuplicated'));
        
    } catch (error) {
        console.error('Error duplicating project:', error);
        alert(t('project.errorDuplicating') + error.message);
    }
}

// Switch to CFSS dashboard
function switchToCFSS() {
    if (!authHelper.isAdmin()) {
        alert(t('admin.adminRequired'));
        return;
    }
    window.location.href = 'cfss-dashboard.html';
}

// Admin functions
function openUserManagement() {
    if (!authHelper.isAdmin()) {
        alert(t('admin.adminRequired'));
        return;
    }
    window.location.href = 'user-management.html';
}

function viewAllProjects() {
    if (!authHelper.isAdmin()) {
        alert(t('admin.adminRequired'));
        return;
    }
    fetchProjects();
    alert(t('admin.showingAllProjects'));
}

function openVerifyBulkProjects() {
    const allowedEmails = (typeof BULK_VERIFY_ALLOWED_EMAILS !== 'undefined')
        ? BULK_VERIFY_ALLOWED_EMAILS
        : ['anhquan1212004@gmail.com', 'hoangminhduc.ite@gmail.com'];
    const currentUser = authHelper?.getCurrentUser ? authHelper.getCurrentUser() : null;
    const userEmail = (currentUser?.email || '').toLowerCase();

    if (!allowedEmails.includes(userEmail)) {
        alert(t('admin.accessRestricted'));
        return;
    }

    window.location.href = 'cfss-verify-bulk-projects.html';
}

function exportData() {
    if (!authHelper.isAdmin()) {
        alert(t('admin.adminRequired'));
        return;
    }
    alert(t('dataExport.comingSoon'));
}

function openEmailClassifications() {
    if (!authHelper.isAdmin()) {
        alert(t('admin.adminRequired'));
        return;
    }
    
    window.location.href = 'email-classifications.html';
}

function openNewProjectOverview() {
    if (!authHelper.isAdmin()) {
        alert(t('admin.adminRequired'));
        return;
    }

    window.location.href = 'create-project-overview.html';
}

// Bulk selection functions
function toggleProjectSelect(projectId, isChecked, cardEl) {
    if (isChecked) {
        selectedProjectIds.add(projectId);
        cardEl.classList.add('selected');
    } else {
        selectedProjectIds.delete(projectId);
        cardEl.classList.remove('selected');
    }
    updateSelectionUI();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.project-checkbox');

    checkboxes.forEach(cb => {
        const id = cb.dataset.id;
        const card = cb.closest('.project-card');
        cb.checked = selectAllCheckbox.checked;
        if (selectAllCheckbox.checked) {
            selectedProjectIds.add(id);
            card.classList.add('selected');
        } else {
            selectedProjectIds.delete(id);
            card.classList.remove('selected');
        }
    });
    updateSelectionUI();
}

function updateSelectionUI() {
    const count = selectedProjectIds.size;
    const bulkActions = document.getElementById('bulkActions');
    const selectedCountEl = document.getElementById('selectedCount');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

    if (selectedCountEl) selectedCountEl.textContent = count;
    if (bulkActions) bulkActions.classList.toggle('visible', count > 0);

    // Update select-all checkbox state
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.project-checkbox');
        const checkedCount = document.querySelectorAll('.project-checkbox:checked').length;
        selectAllCheckbox.checked = allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
    }
}

async function deleteSelectedProjects() {
    const count = selectedProjectIds.size;
    if (count === 0) return;
    if (!confirm(t('bulk.deleteCount').replace('{count}', count))) return;

    const ids = [...selectedProjectIds];
    let successCount = 0;
    let failCount = 0;

    // Hide selected cards immediately
    ids.forEach(id => {
        const card = document.querySelector(`.project-card[data-project-id="${id}"]`);
        if (card) card.style.display = 'none';
    });

    // Delete sequentially to avoid throttling
    for (const id of ids) {
        try {
            const response = await fetch(apiUrl, {
                method: 'DELETE',
                headers: authHelper.getAuthHeaders(),
                body: JSON.stringify({ id })
            });
            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            console.error('Error deleting project:', id, error);
            failCount++;
        }
    }

    selectedProjectIds.clear();

    // Refresh
    await Promise.all([
        fetchProjects(),
        loadDashboardStats()
    ]);

    if (failCount > 0) {
        alert(t('bulk.deletedCount').replace('{success}', successCount).replace('{fail}', failCount));
    }
}

// Make functions available globally
window.switchToCFSS = switchToCFSS;
window.openUserManagement = openUserManagement;
window.viewAllProjects = viewAllProjects;
window.openVerifyBulkProjects = openVerifyBulkProjects;
window.exportData = exportData;
window.openEmailClassifications = openEmailClassifications;
window.openNewProjectOverview = openNewProjectOverview;
window.toggleSelectAll = toggleSelectAll;
window.deleteSelectedProjects = deleteSelectedProjects;
