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

        // Initialize autocomplete if Google Maps already loaded
        if (typeof google !== 'undefined' && google.maps && google.maps.places) {
            initAddressAutocomplete();
        }

    } catch (error) {
        console.error('❌ Error initializing:', error);
        alert(t('project.errorInitPage') + error.message);
        window.location.href = 'auth.html';
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const clientName = document.getElementById('clientName').value.trim();
    const description = document.getElementById('description').value.trim();

    if (!name) {
        alert(t('project.enterProjectName'));
        return;
    }

    try {
        const currentUser = authHelper.getCurrentUser();

        const projectData = {
            name: name,
            companyName: currentUser.companyName || '',
            clientName: clientName || '',
            description: description || '',
            addressLine1: document.getElementById('addressLine1').value.trim(),
            addressLine2: document.getElementById('addressLine2').value.trim(),
            city: document.getElementById('city').value.trim(),
            province: document.getElementById('province').value.trim(),
            country: document.getElementById('country').value.trim(),
            deflectionMax: document.getElementById('deflectionMax').value,
            thicknessMin: document.getElementById('thicknessMin').value,
            status: 'Planning',
            createdBy: currentUser.email,
            createdAt: new Date().toISOString(),
            isLimitedProject: true,
            // CFSS projects don't have domain field
            equipment: [],
            parapets: [],
            windows: [],
            options: []
        };

        console.log('Project data being sent:', projectData);


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

        alert(t('project.cfssProjectCreatedSuccess'));
        window.location.href = `limited-cfss-project-details.html?id=${result.id}`;

    } catch (error) {
        console.error('❌ Error creating project:', error);
        alert(t('project.errorCreating') + error.message);
    }
}

// Initialize Google Places Autocomplete for address field
function initAddressAutocomplete() {
    const address1Input = document.getElementById('addressLine1');
    
    if (!address1Input) return;
    
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        setTimeout(initAddressAutocomplete, 100);
        return;
    }
    
    const options = {
        componentRestrictions: { country: "ca" },
        fields: ["address_components"],
        types: ["address"]
    };
    
    const autocomplete = new google.maps.places.Autocomplete(address1Input, options);
    
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        
        // Reset fields
        address1Input.value = '';
        document.getElementById('addressLine2').value = '';
        document.getElementById('city').value = '';
        document.getElementById('province').value = '';
        document.getElementById('country').value = 'Canada';
        
        // Fill in the address components
        place.address_components.forEach(component => {
            const types = component.types;
            if (types.includes("street_number")) {
                address1Input.value += component.long_name + ' ';
            }
            if (types.includes("route")) {
                address1Input.value += component.short_name;
            }
            if (types.includes("subpremise")) {
                document.getElementById('addressLine2').value = component.long_name;
            }
            if (types.includes("locality")) {
                document.getElementById('city').value = component.long_name;
            }
            if (types.includes("administrative_area_level_1")) {
                document.getElementById('province').value = component.short_name;
            }
        });
    });
}