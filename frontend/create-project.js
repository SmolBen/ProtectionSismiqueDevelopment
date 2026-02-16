// Create Project Page JavaScript
function initGoogleMaps() {
    console.log('Google Maps API loaded successfully');
}

function handleGoogleMapsError() {
    console.error('Failed to load Google Maps API');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize authentication
    await initializeAuth();

    const form = document.getElementById('createProjectForm');
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
    console.log('🔍 Initializing authentication for create project...');
    
    try {
        // Initialize authHelper if not available
        if (!window.authHelper) {
            window.authHelper = new AuthHelper();
        }

        // Check authentication
        const userData = await window.authHelper.checkAuthentication();
        
        if (!userData) {
            console.log('❌ No user authenticated, redirecting to auth page');
            alert(t('auth.pleaseLogin'));
            window.location.href = 'auth.html';
            return;
        }

        console.log('✅ User authenticated for project creation:', userData.email);
        
        // THIS IS THE MISSING LINE:
        window.authHelper.updateUserInterface();
        
        return userData;
    } catch (error) {
        console.error('❌ Authentication error:', error);
        alert(`Authentication error: ${error.message}`);
        window.location.href = 'auth.html';
    }
}

    // Load auth helper if not available
    async function loadAuthHelper() {
        return new Promise((resolve, reject) => {
            // Check if AWS SDK is loaded
            if (typeof AWS === 'undefined') {
                const awsScript = document.createElement('script');
                awsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/aws-sdk/2.1025.0/aws-sdk.min.js';
                awsScript.onload = () => {
                    loadCognito().then(resolve).catch(reject);
                };
                awsScript.onerror = () => reject(new Error('Failed to load AWS SDK'));
                document.head.appendChild(awsScript);
            } else {
                loadCognito().then(resolve).catch(reject);
            }
        });
    }

    function loadCognito() {
        return new Promise((resolve, reject) => {
            if (typeof AmazonCognitoIdentity === 'undefined') {
                // Try multiple CDN sources for better reliability
                const cognitoUrls = [
                    'https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.15/dist/amazon-cognito-identity.min.js',
                    'https://unpkg.com/amazon-cognito-identity-js@6.3.15/dist/amazon-cognito-identity.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/amazon-cognito-identity-js/6.3.15/amazon-cognito-identity.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/amazon-cognito-identity-js/6.3.12/amazon-cognito-identity.min.js'
                ];
                
                // Try to load from the first URL
                loadFromNextUrl(cognitoUrls, 0, resolve, reject);
            } else {
                console.log('✅ Cognito SDK already loaded');
                loadAuthHelperScript().then(resolve).catch(reject);
            }
        });
    }

    function loadFromNextUrl(urls, index, resolve, reject) {
        if (index >= urls.length) {
            reject(new Error('Failed to load Cognito SDK from all sources'));
            return;
        }
        
        const cognitoScript = document.createElement('script');
        cognitoScript.src = urls[index];
        cognitoScript.onload = () => {
            console.log(`✅ Loaded Cognito SDK from ${urls[index]}`);
            loadAuthHelperScript().then(resolve).catch(reject);
        };
        cognitoScript.onerror = () => {
            console.warn(`❌ Failed to load Cognito SDK from ${urls[index]}, trying next source...`);
            loadFromNextUrl(urls, index + 1, resolve, reject);
        };
        document.head.appendChild(cognitoScript);
    }

    function loadAuthHelperScript() {
        return new Promise((resolve, reject) => {
            const authScript = document.createElement('script');
            authScript.src = 'auth-helper.js';
            authScript.onload = () => {
                // Wait a bit for the script to initialize
                setTimeout(resolve, 100);
            };
            authScript.onerror = () => reject(new Error('Failed to load auth helper'));
            document.head.appendChild(authScript);
        });
    }

    // Define getGeocode function
async function getGeocode(address) {
    const baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
    const response = await fetch(`${baseUrl}?address=${encodeURIComponent(address)}&key=${CONFIG.GOOGLE_API_KEY}`);
    const data = await response.json();
    if (data.status !== 'OK') {
        throw new Error('Geocoding failed: ' + data.error_message);
    }
    return data.results[0].geometry.location;
}

    function determineRiskCategory(type) {
        if (["hospital", "fire-station", "government"].includes(type)) {
            return "Protection";
        } else if (["industrial", "school"].includes(type)) {
            return "High";
        } else {
            return "Normal";
        }
    }

    function setFormLoading(loading) {
        const submitButton = form.querySelector('button[type="submit"]');
        const formContainer = document.querySelector('.form-container');
        
        if (loading) {
            submitButton.innerHTML = '<span class="spinner-inline"></span>' + t('createProject.creatingProject');
            submitButton.disabled = true;
            formContainer.classList.add('loading-state');
        } else {
            submitButton.textContent = t('createProject.createProject');
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
                alert(t('auth.sessionExpired'));
                window.location.href = 'auth.html';
                return;
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            alert(t('auth.authError'));
            window.location.href = 'auth.html';
            return;
        }

        const formData = new FormData(form);
        const type = formData.get('type');
        const fullAddress = `${formData.get('address1')}, ${formData.get('city')}, ${formData.get('province')}, ${formData.get('country')}`;
        const riskCategory = determineRiskCategory(type);

        // Show loading state
        setFormLoading(true);
        try {
            const { lat, lng } = await getGeocode(fullAddress);

            const numberOfFloorsValue = formData.get('numberOfFloors');
            const newProject = {
                name: formData.get('name'),
                description: formData.get('description') || '',
                type: formData.get('type'),
                domain: authHelper.getCurrentUser().domain,
                status: 'Planning',
                addressLine1: formData.get('address1'),
                addressLine2: formData.get('address2'),
                city: formData.get('city'),
                province: formData.get('province'),
                country: formData.get('country'),
                latitude: lat,
                longitude: lng,
                riskCategory,
                numberOfFloors: numberOfFloorsValue ? parseInt(numberOfFloorsValue, 10) : null
            };

            console.log('🚀 Creating project:', newProject);

            const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
                method: 'POST',
                headers: authHelper.getAuthHeaders(),
                body: JSON.stringify(newProject)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create project');
            }

            const createdProject = await response.json();
            console.log('✅ Project created successfully:', createdProject);

            alert(t('createProject.projectCreated'));
            // Redirect directly to the new project's details page
            window.location.href = `project-details.html?id=${createdProject.id}`;

        } catch (error) {
            console.error('❌ Error creating project:', error);
            alert(t('createProject.errorCreating') + error.message);
        } finally {
            // Reset loading state
            setFormLoading(false);
        }
    });

    // Make functions globally available
    window.initGoogleMaps = initGoogleMaps;
    window.handleGoogleMapsError = handleGoogleMapsError;
});