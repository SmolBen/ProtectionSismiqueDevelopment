// Basic Project Dashboard JavaScript for index.html
// Simplified version without admin features and stats

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Basic dashboard loaded');

    // Load required scripts if not already loaded
    await loadRequiredScripts();

    // Initialize authentication and page
    await initializePage();

    const projectList = document.getElementById('projectList');
    const projectFilter = document.getElementById('projectFilter');
    const createProjectButton = document.getElementById('createProjectButton');

    // Your API Gateway base URL
    const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

    // Load required scripts with updated CDN URLs
    async function loadRequiredScripts() {
        // Load AWS SDK if not available
        if (typeof AWS === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/aws-sdk@2.1692.0/dist/aws-sdk.min.js');
        }

        // Load Cognito SDK if not available
        if (typeof AmazonCognitoIdentity === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.15/dist/amazon-cognito-identity.min.js');
        }

        // Load auth helper if not available
        if (typeof authHelper === 'undefined') {
            await loadScript('auth-helper.js');
            // Wait a moment for script to initialize
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    // Initialize page with authentication
    async function initializePage() {
        console.log('🚀 Initializing basic dashboard...');
        
        try {
            // Check authentication using simplified approach
            const userData = await authHelper.checkAuthentication();
            
            if (!userData) {
                console.log('❌ No user authenticated, redirecting to auth page');
                window.location.href = 'auth.html';
                return;
            }

            console.log('✅ User authenticated:', userData.email);

            // Load projects
            await fetchProjects();

            // Setup event listeners
            setupEventListeners();

        } catch (error) {
            console.error('❌ Error initializing page:', error);
            // If there's an authentication error, redirect to auth page
            window.location.href = 'auth.html';
        }
    }

    function setupEventListeners() {
        // Create project button
        if (createProjectButton) {
            createProjectButton.addEventListener('click', () => {
                console.log('🎯 Create project button clicked');
                window.location.href = 'create-project.html';
            });
        }

        // Filter projects
        if (projectFilter) {
            projectFilter.addEventListener('change', handleProjectFilter);
        }
    }

    // Fetch projects from AWS with simplified authentication
    async function fetchProjects() {
        if (!projectList) return; // Not on a page with project list

        try {
            console.log('🔄 Fetching projects...');
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: authHelper.getAuthHeaders()
            });

            if (!response.ok) {
                console.error('Failed to fetch projects:', response.status, response.statusText);
                throw new Error(`HTTP ${response.status}`);
            }

            const projects = await response.json();

            // Sort by newest first
            projects.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

            console.log('✅ Projects fetched:', projects.length);
            renderProjects(projects);
        } catch (error) {
            console.error('❌ Error fetching projects:', error);
            if (projectList) {
                projectList.innerHTML = 
                    `<p style="color: red;">Error loading projects: ${error.message}</p>`;
            }
        }
    }

    // Render projects on the page
    function renderProjects(filteredProjects) {
        if (!projectList) return;

        projectList.innerHTML = '';
        
        if (filteredProjects.length === 0) {
            projectList.innerHTML = '<p>No projects found. Create your first project to get started!</p>';
            return;
        }

        filteredProjects.forEach((project) => {
            // Create a formatted address line
            const formattedAddress = `${project.addressLine1}, ${project.city}, ${project.province}, ${project.country}`;
            
            const projectCard = document.createElement('div');
            projectCard.className = 'project-card';
            projectCard.innerHTML = `
                <h2>${project.name}</h2>
                <p>${project.description}</p>
                <span class="status ${project.status.toLowerCase().replace(' ', '-')}">${project.status}</span>
                <p>Type: ${project.type}</p>
                <p>Domain: ${project.domain || 'N/A'}</p>
                <p>Address: ${formattedAddress}</p>
                ${project.createdAt ? `<p><small>Created: ${new Date(project.createdAt).toLocaleDateString()}</small></p>` : ''}
                <button class="view-details">View Details</button>
                ${authHelper.canModifyProject(project) ? `<button class="delete-project" data-id="${project.id}">Delete</button>` : ''}
            `;

            // Append the project card to the list
            projectList.appendChild(projectCard);

            // Add event listener for the "View Details" button
            projectCard.querySelector('.view-details').addEventListener('click', () => {
                window.location.href = `project-details.html?id=${project.id}`;
            });

            // Add event listener for the "Delete" button if it exists
            const deleteButton = projectCard.querySelector('.delete-project');
            if (deleteButton) {
                deleteButton.addEventListener('click', () => {
                    deleteProject(project.id);
                });
            }
        });
    }

    // Filter projects based on the selected status
    async function handleProjectFilter(e) {
        const filter = e.target.value.toLowerCase();
        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: authHelper.getAuthHeaders(),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch projects');
            }

            const projects = await response.json();
            
            // Convert the project status to lowercase for comparison
            const filteredProjects = filter === 'all'
                ? projects
                : projects.filter(project => project.status.toLowerCase() === filter);
            
            renderProjects(filteredProjects);
        } catch (error) {
            console.error('Error filtering projects:', error);
            alert('Error filtering projects: ' + error.message);
        }
    }

    // Function to delete a project with simplified authentication
    async function deleteProject(id) {
        if (!confirm('Are you sure you want to delete this project?')) {
            return;
        }

        try {
            console.log(`🗑️ Attempting to delete project with ID: ${id}`);
            
            const response = await fetch(apiUrl, {
                method: 'DELETE',
                headers: authHelper.getAuthHeaders(),
                body: JSON.stringify({ id })
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const result = await response.json();
                throw new Error(`Server responded with ${response.status}: ${result.error || 'Unknown error'}`);
            }

            const result = await response.json();
            console.log('✅ Delete response:', result);

            // Show success message
            alert('Project deleted successfully!');

            // Fetch projects again to update the list
            await fetchProjects();

        } catch (error) {
            console.error('❌ Error deleting project:', error);
            alert('Error deleting project: ' + error.message);
        }
    }

    console.log('🎉 Basic dashboard initialization complete');
});