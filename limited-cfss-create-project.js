// Limited CFSS Create Project Page JavaScript
const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

let authHelper;

window.addEventListener('load', async function() {
    console.log('📄 Limited CFSS Create Project page loaded');
    await initializeCreateProject();
});

async function initializeCreateProject() {
    try {
        // Wait for AWS libraries
        let retries = 0;
        while ((typeof AWS === 'undefined' || typeof AmazonCognitoIdentity === 'undefined') && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        // Initialize authHelper
        authHelper = new AuthHelper();
        
        // Check authentication
        const userData = await authHelper.checkAuthentication();
        
        if (!userData) {
            window.location.href = 'auth.html';
            return;
        }

        // Verify user is limited
        if (!authHelper.isLimited()) {
            if (authHelper.isAdmin()) {
                window.location.href = 'cfss-create-project.html';
            } else {
                window.location.href = 'cfss-create-project.html';
            }
            return;
        }

        // Update UI
        authHelper.updateUserInterface();

        // Populate company name field
        const companyNameField = document.getElementById('companyName');
        if (companyNameField && userData.companyName) {
            companyNameField.value = userData.companyName;
        }

        // Setup form submission
        document.getElementById('createCFSSProjectForm').addEventListener('submit', handleFormSubmit);

        console.log('✅ Limited CFSS Create Project initialized');

    } catch (error) {
        console.error('❌ Error initializing:', error);
        alert('Error initializing page: ' + error.message);
        window.location.href = 'auth.html';
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const clientName = document.getElementById('clientName').value.trim();
    const description = document.getElementById('description').value.trim();

    if (!name) {
        alert('Please enter a project name');
        return;
    }

    try {
        const currentUser = authHelper.getCurrentUser();

        const projectData = {
            name: name,
            clientName: clientName || '',
            description: description || '',
            status: 'Planning',
            createdBy: currentUser.email,
            createdAt: new Date().toISOString(),
            // CFSS projects don't have domain field
            equipment: [],
            parapets: [],
            windows: [],
            options: []
        };

        console.log('📤 Creating CFSS project:', projectData);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                ...authHelper.getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(projectData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create project: ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Project created:', result);

        alert('CFSS Project created successfully!');
        window.location.href = `limited-cfss-project-details.html?id=${result.id}`;

    } catch (error) {
        console.error('❌ Error creating project:', error);
        alert('Error creating project: ' + error.message);
    }
}