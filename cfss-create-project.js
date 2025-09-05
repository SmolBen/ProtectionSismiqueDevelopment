// CFSS Create Project Page JavaScript
function initGoogleMaps() {
    console.log('Google Maps API loaded successfully');
}

function handleGoogleMapsError() {
    console.error('Failed to load Google Maps API');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize authentication
    await initializeAuth();

    const form = document.getElementById('createCFSSProjectForm');
    const address1Input = document.getElementById('address1');
    const address2Input = document.getElementById('address2');
    const cityInput = document.getElementById('city');
    const provinceInput = document.getElementById('province');
    const countryInput = document.getElementById('country');

    // Initialize Google Places Autocomplete
    const options = {
        componentRestrictions: { country: "ca" },
        fields: ["address_components", "formatted_address"],
        types: ["address"],
    };
    
    // Wait for Google Maps to be available
    function initAutocomplete() {
        if (typeof google !== 'undefined' && google.maps && google.maps.places && google.maps.places.Autocomplete) {
            const autocomplete = new google.maps.places.Autocomplete(address1Input, options);
            autocomplete.setFields(['address_components']);

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                address1Input.value = '';
                address2Input.value = '';
                cityInput.value = '';
                provinceInput.value = '';
                countryInput.value = 'Canada';

                place.address_components.forEach(component => {
                    const types = component.types;
                    if (types.includes("street_number")) {
                        address1Input.value += component.long_name + ' ';
                    }
                    if (types.includes("route")) {
                        address1Input.value += component.short_name;
                    }
                    if (types.includes("subpremise")) {
                        address2Input.value = component.long_name;
                    }
                    if (types.includes("locality")) {
                        cityInput.value = component.long_name;
                    }
                    if (types.includes("administrative_area_level_1")) {
                        provinceInput.value = component.short_name;
                    }
                });
            });
        } else {
            // Retry if Google Maps isn't ready yet
            setTimeout(initAutocomplete, 100);
        }
    }

    // Start initialization
    initAutocomplete();

    // Initialize authentication helper
    async function initializeAuth() {
        console.log('🔍 Initializing authentication for create CFSS project...');
        
        try {
            // Initialize authHelper if not available
            if (!window.authHelper) {
                window.authHelper = new AuthHelper();
            }

            // Check authentication
            const userData = await window.authHelper.checkAuthentication();
            
            if (!userData) {
                console.log('❌ No user authenticated, redirecting to auth page');
                alert('Please login to create CFSS projects');
                window.location.href = 'auth.html';
                return;
            }

            console.log('✅ User authenticated for CFSS project creation:', userData.email);
            
            window.authHelper.updateUserInterface();
            
            return userData;
        } catch (error) {
            console.error('❌ Authentication error:', error);
            alert(`Authentication error: ${error.message}`);
            window.location.href = 'auth.html';
        }
    }
    
    function setFormLoading(loading) {
        const submitButton = form.querySelector('button[type="submit"]');
        const formContainer = document.querySelector('.form-container');
        
        if (loading) {
            submitButton.innerHTML = '<span class="spinner-inline"></span>Creating CFSS Project...';
            submitButton.disabled = true;
            formContainer.classList.add('loading-state');
        } else {
            submitButton.textContent = 'Create CFSS Project';
            submitButton.disabled = false;
            formContainer.classList.remove('loading-state');
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Verify authentication before submitting
        try {
            const userData = await authHelper.checkAuthentication();
            if (!userData) {
                alert('Session expired. Please login again.');
                window.location.href = 'auth.html';
                return;
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            alert('Authentication error. Please login again.');
            window.location.href = 'auth.html';
            return;
        }

        const formData = new FormData(form);

        // Show loading state
        setFormLoading(true);
        try {
            // Create CFSS project data - no seismic calculations needed
            const newCFSSProject = {
                name: formData.get('name'),
                description: formData.get('description'),
                type: formData.get('type'),
                status: 'Planning',
                addressLine1: formData.get('address1'),
                addressLine2: formData.get('address2'),
                city: formData.get('city'),
                province: formData.get('province'),
                country: formData.get('country'),
                // No domain field for CFSS projects
                equipment: [] // Initialize empty equipment array
            };

            console.log('🚀 Creating CFSS project:', newCFSSProject);

            const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
                method: 'POST',
                headers: authHelper.getAuthHeaders(),
                body: JSON.stringify(newCFSSProject)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create CFSS project');
            }

            const createdProject = await response.json();
            console.log('✅ CFSS Project created successfully:', createdProject);

            alert('CFSS Project created successfully!');
            // Redirect directly to the new CFSS project's details page
            window.location.href = `cfss-project-details.html?id=${createdProject.id}`;

        } catch (error) {
            console.error('❌ Error creating CFSS project:', error);
            alert('Error creating CFSS project: ' + error.message);
        } finally {
            // Reset loading state
            setFormLoading(false);
        }
    });

    // Make functions globally available
    window.initGoogleMaps = initGoogleMaps;
    window.handleGoogleMapsError = handleGoogleMapsError;
});