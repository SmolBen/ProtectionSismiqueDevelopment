// Limited CFSS Project Details Page JavaScript
const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

let authHelper;
let currentProject = null;
let editingEquipmentId = null;
let editingParapetId = null;
let editingWindowId = null;
let editingSoffiteId = null;

// Same as regular CFSS: keep CFSS options in this array
let selectedCFSSOptions = [];

// Load option thumbnail from the public S3 bucket
async function loadOptionThumbnail(optionId) {
    const imgElement = document.getElementById(`img-${optionId}`);
    
    if (!imgElement) {
        console.warn(`Image element not found for ${optionId}`);
        return;
    }

    console.log(`Loading thumbnail for limited option: ${optionId}`);
    
    // Direct image loading - no CORS issues
    const pngUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionId}.png`;
    const jpgUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionId}.jpg`;
    
    imgElement.onload = () => {
        console.log(`Thumbnail loaded successfully: ${optionId}`);
    };
    
    imgElement.onerror = () => {
        console.log(`PNG failed for ${optionId}, trying JPG.`);
        // Try JPG as fallback
        imgElement.onerror = () => {
            console.log(`Both formats failed for ${optionId}, showing placeholder`);
            showThumbnailPlaceholder(optionId, 'No Image');
        };
        imgElement.src = jpgUrl;
    };
    
    // Start with PNG
    imgElement.src = pngUrl;
}

// Show a simple SVG placeholder if no image
function showThumbnailPlaceholder(optionId, message = 'IMG') {
    const imgElement = document.getElementById(`img-${optionId}`);
    if (imgElement) {
        imgElement.src =
            `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='40'%3E` +
            `%3Crect width='50' height='40' fill='%23f5f5f5' stroke='%23ddd'/%3E` +
            `%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='8'%3E` +
            `${encodeURIComponent(message)}%3C/text%3E%3C/svg%3E`;
    }
}

window.addEventListener('load', async function() {
    console.log('Limited CFSS Project Details page loaded');
    await initializeProjectDetails();
});

async function initializeProjectDetails() {
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
            document.getElementById('loadingProject').style.display = 'none';
            document.getElementById('authError').style.display = 'block';
            return;
        }

        // Limited-only page: admins should work on the admin copy in the regular CFSS UI
        if (!authHelper.isLimited()) {
            const projectId = new URLSearchParams(window.location.search).get('id');
            // If someone lands here without being limited, send them to the regular CFSS details page
            // (admins should open the submitted admin copy from the CFSS dashboard)
            window.location.href = `cfss-project-details.html?id=${projectId}`;
            return;
        }

        // Update UI
        authHelper.updateUserInterface();

        // Get project ID from URL
        const projectId = new URLSearchParams(window.location.search).get('id');
        if (!projectId) {
            alert('No project ID provided');
            window.location.href = 'limited-cfss-dashboard.html';
            return;
        }

        // Load project
        await loadProject(projectId);

        // Setup event listeners
        setupEventListeners();

        // Initialize tabs
        initializeTabSystem();

        // Initialize options
        initializeOptionsSystem();

        console.log('Limited CFSS Project Details initialized');

    } catch (error) {
        console.error('Error initializing:', error);
        document.getElementById('loadingProject').style.display = 'none';
        alert('Error loading project: ' + error.message);
    }
}

async function loadProject(projectId) {
    try {
        const response = await fetch(`${apiUrl}/${projectId}`, {
            method: 'GET',
            headers: authHelper.getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const projects = await response.json();
        currentProject = Array.isArray(projects) ? projects[0] : projects;

        if (!currentProject) {
            throw new Error('Project not found');
        }

        // Check if user owns this project (admins can view any project)
        const currentUser = authHelper.getCurrentUser();
        if (!authHelper.isAdmin() && currentProject.createdBy !== currentUser.email) {
            document.getElementById('loadingProject').style.display = 'none';
            document.getElementById('accessDenied').style.display = 'block';
            return;
        }

        // Initialize arrays if they don't exist
        currentProject.equipment = currentProject.equipment || [];
        currentProject.parapets = currentProject.parapets || [];
        currentProject.windows = currentProject.windows || [];
        currentProject.options = currentProject.options || [];
        currentProject.soffites = currentProject.soffites || [];
        currentProject.files = currentProject.files || [];

        // Display project info
        displayProjectInfo();

        // Display lists
        displayEquipmentList();
        displayParapetList();
        displayWindowList();
        displaySoffiteList();
        displayProjectFiles();

        // Show project container
        document.getElementById('loadingProject').style.display = 'none';
        document.getElementById('projectContainer').style.display = 'block';

    } catch (error) {
        console.error('Error loading project:', error);
        document.getElementById('loadingProject').style.display = 'none';
        alert('Error loading project: ' + error.message);
        window.location.href = 'limited-cfss-dashboard.html';
    }
}

function displayProjectInfo() {
    document.getElementById('projectName').textContent = currentProject.name || '';
    document.getElementById('companyName').textContent = currentProject.companyName || 'Not specified';
    document.getElementById('clientName').textContent = currentProject.clientName || 'Not specified';
    document.getElementById('projectDescription').textContent = currentProject.description || 'No description';
    
    // Build address string
    const addressParts = [
        currentProject.addressLine1,
        currentProject.addressLine2,
        currentProject.city,
        currentProject.province,
        currentProject.country
    ].filter(part => part && part.trim());
    document.getElementById('projectAddress').textContent = addressParts.length > 0 ? addressParts.join(', ') : 'Not specified';
    
    document.getElementById('projectDeflectionMax').textContent = currentProject.deflectionMax || 'Not specified';
    document.getElementById('projectThicknessMin').textContent = currentProject.thicknessMin || 'Not specified';
    
    document.getElementById('projectStatusDropdown').value = currentProject.status || 'Planning';
    
    // Display floors
    displayFloors();
}

function setupEventListeners() {
    console.log('Setting up event listeners...');

    // File upload listeners
    document.getElementById('showUploadFileBtn').addEventListener('click', () => {
        document.getElementById('uploadFileRow').style.display = 'block';
        document.getElementById('uploadFileName').value = '';
        document.getElementById('uploadFileInput').value = '';
        document.getElementById('uploadLinkInput').value = '';
        // Reset to file mode
        setUploadMode('file');
    });

    document.getElementById('uploadFileCancelBtn').addEventListener('click', () => {
        document.getElementById('uploadFileRow').style.display = 'none';
    });

    document.getElementById('uploadFileSubmitBtn').addEventListener('click', handleFileUpload);

    // Upload mode toggle listeners
    document.getElementById('uploadModeFile').addEventListener('click', () => setUploadMode('file'));
    document.getElementById('uploadModeLink').addEventListener('click', () => setUploadMode('link'));
    
    // Status change
    const statusDropdown = document.getElementById('projectStatusDropdown');
    if (statusDropdown) {
        statusDropdown.addEventListener('change', async (e) => {
            currentProject.status = e.target.value;
            await saveProject();
        });
    }

    // Add Floor button
    const addFloorBtn = document.getElementById('addFloorBtn');
    if (addFloorBtn) {
        addFloorBtn.addEventListener('click', addFloor);
    }

    // Save Floors button
    const saveFloorsBtn = document.getElementById('saveFloorsBtn');
    if (saveFloorsBtn) {
        saveFloorsBtn.addEventListener('click', saveFloors);
    }

    // Add Wall button - toggle behavior
    const newCalcButton = document.getElementById('newCalculationButton');
    const equipmentForm = document.getElementById('equipmentForm');
    
    console.log('Add Wall button:', newCalcButton);
    console.log('Equipment form:', equipmentForm);
    
    if (newCalcButton && equipmentForm) {
        newCalcButton.addEventListener('click', () => {
            initializeImageUpload();
            console.log('Add Wall button clicked');
            console.log('Form has show class:', equipmentForm.classList.contains('show'));
            
            if (equipmentForm.classList.contains('show')) {
                hideForm('equipmentForm');
                newCalcButton.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';
                newCalcButton.classList.remove('expanded');
            } else {
                hideAllForms();
                showForm('equipmentForm');
                newCalcButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
                newCalcButton.classList.add('expanded');
                editingEquipmentId = null;
                const formElement = document.getElementById('equipmentFormElement');
                if (formElement) formElement.reset();
            }
        });
    } else {
        console.error('Add Wall button or form not found!');
    }

    // Add Parapet button - toggle behavior
    const addParapetButton = document.getElementById('addParapetButton');
    const parapetForm = document.getElementById('parapetForm');
    
    if (addParapetButton && parapetForm) {
    addParapetButton.addEventListener('click', () => {
        initializeParapetImageUpload();
        console.log('Add Parapet button clicked');
        if (parapetForm.classList.contains('show')) {
            hideForm('parapetForm');
            addParapetButton.innerHTML = '<i class="fas fa-building"></i> Add Parapet';
            addParapetButton.classList.remove('expanded');
        } else {
            hideAllForms();
            showForm('parapetForm');
            addParapetButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
            addParapetButton.classList.add('expanded');
            editingParapetId = null;
            const formElement = document.getElementById('parapetFormElement');
            if (formElement) formElement.reset();
            
            // Populate parapet type dropdown and setup image preview
            populateParapetTypeDropdown();
            updateParapetTypeImage('');
        }
    });
}

    // Add Window button - toggle behavior
    const addWindowButton = document.getElementById('addWindowButton');
    const windowForm = document.getElementById('windowForm');
    
    if (addWindowButton && windowForm) {
        addWindowButton.addEventListener('click', () => {
            console.log('Add Window button clicked');
            if (windowForm.classList.contains('show')) {
                hideForm('windowForm');
                addWindowButton.innerHTML = '<i class="fas fa-window-maximize"></i> Add Window';
                addWindowButton.classList.remove('expanded');
            } else {
                hideAllForms();
                showForm('windowForm');
                addWindowButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
                addWindowButton.classList.add('expanded');
                editingWindowId = null;
                const formElement = document.getElementById('windowFormElement');
                if (formElement) formElement.reset();
            }
        });
    }

    // Add Soffites button - toggle behavior  ------------------ NEW
    const addSoffitesButton = document.getElementById('addSoffitesButton');
    const soffiteForm = document.getElementById('soffiteForm');

    if (addSoffitesButton && soffiteForm) {
        addSoffitesButton.addEventListener('click', () => {
            console.log('Add Soffites button clicked');
            if (soffiteForm.classList.contains('show')) {
                hideForm('soffiteForm');
                addSoffitesButton.innerHTML = '<i class="fas fa-grip-lines-vertical"></i> Add Soffites';
                addSoffitesButton.classList.remove('expanded');
            } else {
                hideAllForms();
                showForm('soffiteForm');
                addSoffitesButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
                addSoffitesButton.classList.add('expanded');
                editingSoffiteId = null;

                const formElement = document.getElementById('soffiteFormElement');
                if (formElement) formElement.reset();

                // Reset image state
                clearSoffiteImages();
            }
        });
    }

    // Cancel buttons - also reset button text
    const cancelWall = document.getElementById('cancelWall');
    if (cancelWall) {
        cancelWall.addEventListener('click', () => {
            hideForm('equipmentForm');
        });
    }
    
    const cancelParapet = document.getElementById('cancelParapet');
    if (cancelParapet) {
        cancelParapet.addEventListener('click', () => {
            hideForm('parapetForm');
        });
    }
    
    const cancelWindow = document.getElementById('cancelWindow');
    if (cancelWindow) {
        cancelWindow.addEventListener('click', () => {
            hideForm('windowForm');
        });
    }

    // Form submissions
    const equipmentFormElement = document.getElementById('equipmentFormElement');
    if (equipmentFormElement) {
        equipmentFormElement.addEventListener('submit', handleWallSubmit);
    }
    
    const parapetFormElement = document.getElementById('parapetFormElement');
    if (parapetFormElement) {
        parapetFormElement.addEventListener('submit', handleParapetSubmit);
    }
    
    const windowFormElement = document.getElementById('windowFormElement');
    if (windowFormElement) {
        windowFormElement.addEventListener('submit', handleWindowSubmit);
    }

    // NEW: Soffite form submit
    const soffiteFormElement = document.getElementById('soffiteFormElement');
    if (soffiteFormElement) {
        soffiteFormElement.addEventListener('submit', handleSoffiteSubmit);
    }

    // NEW: Soffite cancel button
    const cancelSoffite = document.getElementById('cancelSoffite');
    if (cancelSoffite) {
        cancelSoffite.addEventListener('click', () => {
            hideForm('soffiteForm');
        });
    }

    // NEW: Initialize soffite image upload handlers
    initializeSoffiteImageUpload();

    console.log('Event listeners setup complete');
}

// Hide all forms and reset all button states
function hideAllForms() {
    const forms = ['equipmentForm', 'parapetForm', 'windowForm', 'soffiteForm'];   // NEW soffiteForm
    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.classList.remove('show');
            form.style.display = 'none';
        }
    });

    const newCalcButton = document.getElementById('newCalculationButton');
    const addParapetButton = document.getElementById('addParapetButton');
    const addWindowButton = document.getElementById('addWindowButton');
    const addSoffitesButton = document.getElementById('addSoffitesButton');       // NEW
    
    if (newCalcButton) {
        newCalcButton.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';
        newCalcButton.classList.remove('expanded');
    }
    if (addParapetButton) {
        addParapetButton.innerHTML = '<i class="fas fa-building"></i> Add Parapet';
        addParapetButton.classList.remove('expanded');
    }
    if (addWindowButton) {
        addWindowButton.innerHTML = '<i class="fas fa-window-maximize"></i> Add Window';
        addWindowButton.classList.remove('expanded');
    }
    if (addSoffitesButton) {                                                      // NEW
        addSoffitesButton.innerHTML = '<i class="fas fa-grip-lines-vertical"></i> Add Soffites';
        addSoffitesButton.classList.remove('expanded');
    }
}

function showForm(formId) {
    // Show requested form using 'show' class (matches CSS)
    const form = document.getElementById(formId);
    if (form) {
        form.classList.add('show');
        form.style.display = 'block'; // Also set inline as backup
        console.log('Showing form:', formId);
        // Scroll form into view
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        console.error('Form not found:', formId);
    }
}

function hideForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        form.classList.remove('show');
        form.style.display = 'none';
    }
    
    // Reset corresponding button state
    if (formId === 'equipmentForm') {
        const btn = document.getElementById('newCalculationButton');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';
            btn.classList.remove('expanded');
        }
    } else if (formId === 'parapetForm') {
        const btn = document.getElementById('addParapetButton');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-building"></i> Add Parapet';
            btn.classList.remove('expanded');
        }
    } else if (formId === 'windowForm') {
        const btn = document.getElementById('addWindowButton');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-window-maximize"></i> Add Window';
            btn.classList.remove('expanded');
        }
    } else if (formId === 'soffiteForm') {   // NEW
        const btn = document.getElementById('addSoffitesButton');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-grip-lines-vertical"></i> Add Soffites';
            btn.classList.remove('expanded');
        }
    }
}

// Tab system
function initializeTabSystem() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content-section');
    const saveButtonContainer = document.getElementById('saveOptionsBtnContainer');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabContent = document.getElementById(`${tabName}-content`);
            if (tabContent) {
                tabContent.classList.add('active');
            }

            // Show/hide Save Options button based on active tab
            if (saveButtonContainer) {
                saveButtonContainer.style.display = (tabName === 'option-list') ? 'block' : 'none';
            }

            // When opening the Option List tab, preload images (same as regular CFSS)
            if (tabName === 'option-list') {
                setTimeout(() => {
                    preloadOptionImages();
                }, 200);
            }
        });
    });

    // Ensure correct initial state (Option List tab is active on first load)
    if (saveButtonContainer) {
        saveButtonContainer.style.display = 'block';
    }
}

// Initialize options for the current project
function initializeOptionsSystem() {
    console.log('Initializing LIMITED CFSS options system...');

    // Load any saved options from the project if present
    if (currentProject && Array.isArray(currentProject.selectedCFSSOptions)) {
        selectedCFSSOptions = [...currentProject.selectedCFSSOptions];
    } else {
        selectedCFSSOptions = [];
    }

    populateOptionsCategories();
    updateSelectionSummary();

    // Hook up Save Options button (if present)
    const saveOptionsBtn = document.getElementById('saveOptionsBtn');
    if (saveOptionsBtn) {
        saveOptionsBtn.addEventListener('click', async () => {
            try {
                await saveLimitedCFSSOptions();
                console.log('Limited CFSS options saved via Save Options button');
            } catch (error) {
                console.error('Error saving limited CFSS options via button:', error);
                alert('Error saving options. Please try again.');
            }
        });
    }

    console.log('Limited options system initialized');
}

// Define option categories and their corresponding option IDs
function populateOptionsCategories() {
    const optionCategories = {
        'lisse-trouee': {
            container: 'lisse-trouee-options',
            options: [
                'fixe-beton-lisse-trouee',
                'fixe-structure-dacier-lisse-trouee',
                'fixe-tabiler-metallique-lisse-trouee',
                'fixe-bois-lisse-trouee',
                'detail-lisse-trouee',
                'identification'
            ]
        },
        'double-lisse': {
            container: 'double-lisse-options',
            options: [
                'fixe-beton-double-lisse',
                'fixe-structure-dacier-double-lisse',
                'fixe-tabiler-metallique-double-lisse',
                'detail-double-lisse'
            ]
        },
        'lisse-basse': {
            container: 'lisse-basse-options',
            options: [
                'fixe-beton-lisse-basse',
                'fixe-structure-dacier-lisse-basse',
                'fixe-bois-lisse-basse',
                'detail-entremise-1',
                'detail-entremise-2',
                'detail-lisse-basse'
            ]
        },
        'parapet': {
            container: 'parapet-options',
            options: [
                'parapet-1', 'parapet-2', 'parapet-3', 'parapet-4', 'parapet-5',
                'parapet-6', 'parapet-7', 'parapet-8', 'parapet-9', 'parapet-10',
                'parapet-11', 'parapet-12', 'parapet-13'
            ]
        },
        'fenetre': {
            container: 'fenetre-options',
            options: [
                'fenetre'
            ]
        },
        'jambages-linteaux-seuils': {
            container: 'jambages-linteaux-seuils-options',
            options: [
                // Jambages
                'jambage-JA1', 'jambage-JA2a', 'jambage-JA2b', 'jambage-JA3a', 'jambage-JA4a',
                // Linteaux
                'linteau-LT1', 'linteau-LT2', 'linteau-LT3', 'linteau-LT4', 'linteau-LT5',
                'linteau-LT6', 'linteau-LT7', 'linteau-LT8',
                // Seuils
                'seuil-SE1', 'seuil-SE2', 'seuil-SE3'
            ]
        }
    };

    Object.values(optionCategories).forEach(({ container, options }) => {
        const containerEl = document.getElementById(container);
        if (!containerEl) {
            console.warn(`Container not found: ${container}`);
            return;
        }

        containerEl.innerHTML = '';

        options.forEach(optionName => {
            const optionElement = createOptionElement(optionName);
            containerEl.appendChild(optionElement);
        });
    });

    console.log('Limited option categories populated');
}

// Create a single option card with thumbnail (same structure as regular CFSS)
function createOptionElement(optionName) {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-item';
    optionDiv.setAttribute('data-option', optionName);

    const displayName = formatOptionDisplayName(optionName);
    const isSelected = selectedCFSSOptions.includes(optionName);

    optionDiv.innerHTML = `
        <input type="checkbox"
               class="option-checkbox"
               id="option-${optionName}"
               value="${optionName}"
               ${isSelected ? 'checked' : ''}>
        <div class="option-thumbnail" id="thumbnail-${optionName}">
            <img
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='40'%3E%3Crect width='50' height='40' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='8'%3ELoading...%3C/text%3E%3C/svg%3E"
                alt="${displayName}"
                style="width: 100%; height: 100%; object-fit: cover; border-radius: 3px;"
                id="img-${optionName}">
        </div>
        <div class="option-name">${displayName}</div>
    `;

    if (isSelected) {
        optionDiv.classList.add('selected');
    }

    const checkbox = optionDiv.querySelector('.option-checkbox');

    checkbox.addEventListener('change', function () {
        handleOptionToggle(optionName, this.checked);
    });

    optionDiv.addEventListener('click', function (e) {
        if (e.target.type !== 'checkbox') {
            checkbox.click();
        }
    });

    setTimeout(() => {
        loadOptionThumbnail(optionName);
    }, 100);

    return optionDiv;
}

// Nicely format the option name for display
function formatOptionDisplayName(optionName) {
    return optionName
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/Dacier/g, "D'acier")
        .replace(/Tabiler/g, 'Tablier');
}

// Toggle option in selectedCFSSOptions and auto-save
function handleOptionToggle(optionName, isSelected) {
    const optionItem = document.querySelector(`[data-option="${optionName}"]`);

    if (isSelected) {
        if (!selectedCFSSOptions.includes(optionName)) {
            selectedCFSSOptions.push(optionName);
        }
        if (optionItem) optionItem.classList.add('selected');
    } else {
        selectedCFSSOptions = selectedCFSSOptions.filter(opt => opt !== optionName);
        if (optionItem) optionItem.classList.remove('selected');
    }

    // Keep a copy on the currentProject object as well
    currentProject.selectedCFSSOptions = [...selectedCFSSOptions];

    updateSelectionSummary();
    saveLimitedCFSSOptions().catch(err => {
        console.error('Error saving limited CFSS options', err);
    });
}

// Auto-save selectedCFSSOptions for limited users
async function saveLimitedCFSSOptions() {
    if (!currentProject || !currentProject.id) {
        return;
    }

    console.log('Saving LIMITED CFSS options:', selectedCFSSOptions);

    const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
        method: 'PUT',
        headers: authHelper.getAuthHeaders(),
        body: JSON.stringify({
            id: currentProject.id,
            selectedCFSSOptions: [...selectedCFSSOptions]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
}

// Preload all thumbnails when Option List tab opens
async function preloadOptionImages() {
    console.log('Preloading CFSS option images (limited)...');

    const allOptions = [
        // Lisse trouÃƒÆ’Ã‚Â©e options
        'fixe-beton-lisse-trouee',
        'fixe-structure-dacier-lisse-trouee',
        'fixe-tabiler-metallique-lisse-trouee',
        'fixe-bois-lisse-trouee',
        'detail-lisse-trouee',
        'identification',

        // Double lisse options
        'fixe-beton-double-lisse',
        'fixe-structure-dacier-double-lisse',
        'fixe-tabiler-metallique-double-lisse',
        'detail-double-lisse',

        // Lisse basse options
        'fixe-beton-lisse-basse',
        'fixe-structure-dacier-lisse-basse',
        'fixe-bois-lisse-basse',
        'detail-entremise-1',
        'detail-entremise-2',
        'detail-lisse-basse',

        // Parapet options
        'parapet-1', 'parapet-2', 'parapet-3', 'parapet-4', 'parapet-5',
        'parapet-6', 'parapet-7', 'parapet-8', 'parapet-9', 'parapet-10',
        'parapet-11', 'parapet-12', 'parapet-13',

        // Fenetre
        'fenetre',

        // Jambages
        'jambage-JA1', 'jambage-JA2a', 'jambage-JA2b', 'jambage-JA3a', 'jambage-JA4a',

        // Linteaux
        'linteau-LT1', 'linteau-LT2', 'linteau-LT3', 'linteau-LT4', 'linteau-LT5',
        'linteau-LT6', 'linteau-LT7', 'linteau-LT8',

        // Seuils
        'seuil-SE1', 'seuil-SE2', 'seuil-SE3'
    ];

    for (const optionName of allOptions) {
        await loadOptionThumbnail(optionName);
    }

    console.log('CFSS option images preloaded (limited)');
}

// Thumbnail loader (same as regular)
async function loadOptionThumbnail(optionName) {
    const imgElement = document.getElementById(`img-${optionName}`);
    if (!imgElement) return;

    const pngUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionName}.png`;
    const jpgUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionName}.jpg`;

    imgElement.onload = () => {
        // Successfully loaded
    };

    imgElement.onerror = () => {
        imgElement.onerror = () => {
            showThumbnailPlaceholder(optionName, 'No Image');
        };
        imgElement.src = jpgUrl;
    };

    imgElement.src = pngUrl;
}

// Placeholder if no image exists
function showThumbnailPlaceholder(optionName, message = 'IMG') {
    const imgElement = document.getElementById(`img-${optionName}`);
    if (!imgElement) return;

    imgElement.src =
        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='40'%3E` +
        `%3Crect width='50' height='40' fill='%23f5f5f5' stroke='%23ddd'/%3E` +
        `%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='8'%3E` +
        `${encodeURIComponent(message)}%3C/text%3E%3C/svg%3E`;
}

// Map limited categories to containers and option lists
function populateLimitedOptionCategories() {
    const optionCategories = {
        'lisse-trouee': {
            container: 'lisse-trouee-options',
            options: optionsData['lisse-trouee']
        },
        'double-lisse': {
            container: 'double-lisse-options',
            options: optionsData['double-lisse']
        },
        'assemblage': {
            container: 'assemblage-options',
            options: optionsData['assemblage']
        },
        'clip-deflexion': {
            container: 'clip-deflexion-options',
            options: optionsData['clip-deflexion']
        },
        'ancrage-beton': {
            container: 'ancrage-beton-options',
            options: optionsData['ancrage-beton']
        },
        'ancrage-acier': {
            container: 'ancrage-acier-options',
            options: optionsData['ancrage-acier']
        }
    };

    Object.values(optionCategories).forEach(({ container, options }) => {
        const containerEl = document.getElementById(container);
        if (!containerEl) {
            console.warn(`Container not found: ${container}`);
            return;
        }

        containerEl.innerHTML = '';

        options.forEach(option => {
            const optionElement = createLimitedOptionElement(option);
            containerEl.appendChild(optionElement);
        });
    });

    console.log('Limited option categories populated');
}

// Create one option card (with image) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ similar to full CFSS
function createLimitedOptionElement(option) {
    const isSelected = currentProject.options && currentProject.options.includes(option.id);

    const optionDiv = document.createElement('div');
    optionDiv.className = `option-item ${isSelected ? 'selected' : ''}`;
    optionDiv.setAttribute('data-option', option.id);

    optionDiv.innerHTML = `
        <input type="checkbox"
               class="option-checkbox"
               id="option-${option.id}"
               value="${option.id}"
               ${isSelected ? 'checked' : ''}>
        <div class="option-thumbnail" id="thumbnail-${option.id}">
            <img
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='40'%3E%3Crect width='50' height='40' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='8'%3ELoading...%3C/text%3E%3C/svg%3E"
                alt="${option.name}"
                style="width: 100%; height: 100%; object-fit: cover; border-radius: 3px;"
                id="img-${option.id}">
        </div>
        <div class="option-name">
            <strong>${option.name}</strong><br>
            <span style="font-size: 12px; color: #666;">${option.description}</span>
        </div>
    `;

    const checkbox = optionDiv.querySelector('.option-checkbox');

    // When checkbox changes, update project + selection summary
    checkbox.addEventListener('change', function () {
        handleLimitedOptionToggle(option.id, this.checked);
        optionDiv.classList.toggle('selected', this.checked);
    });

    // Make entire row clickable (like regular CFSS)
    optionDiv.addEventListener('click', function (e) {
        if (e.target.type !== 'checkbox') {
            checkbox.click();
        }
    });

    // Load thumbnail after element is in DOM
    setTimeout(() => {
        loadOptionThumbnail(option.id);
    }, 100);

    return optionDiv;
}

// Update currentProject.options and save
function handleLimitedOptionToggle(optionId, isChecked) {
    if (!currentProject.options) {
        currentProject.options = [];
    }

    if (isChecked) {
        if (!currentProject.options.includes(optionId)) {
            currentProject.options.push(optionId);
        }
    } else {
        currentProject.options = currentProject.options.filter(id => id !== optionId);
    }

    updateSelectionSummary();
    saveProject().catch(err => console.error('Error saving project options', err));
}

// Selection summary text
function updateSelectionSummary() {
    const count = selectedCFSSOptions ? selectedCFSSOptions.length : 0;
    const summary = document.getElementById('selectionSummary');
    if (summary) {
        summary.innerHTML = `<i class="fas fa-check-circle"></i> ${count} option${count !== 1 ? 's' : ''} selected`;
    }
}

// Thumbnail loader (same behaviour as full CFSS, but using option.id)
async function loadOptionThumbnail(optionId) {
    const imgElement = document.getElementById(`img-${optionId}`);
    
    if (!imgElement) {
        console.warn(`Image element not found for ${optionId}`);
        return;
    }

    console.log(`Loading thumbnail for limited option: ${optionId}`);

    const pngUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionId}.png`;
    const jpgUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionId}.jpg`;

    imgElement.onload = () => {
        console.log(`Thumbnail loaded successfully: ${optionId}`);
    };

    imgElement.onerror = () => {
        console.log(`PNG failed for ${optionId}, trying JPG...`);
        imgElement.onerror = () => {
            console.log(`Both formats failed for ${optionId}, showing placeholder`);
            showThumbnailPlaceholder(optionId, 'No Image');
        };
        imgElement.src = jpgUrl;
    };

    // Start with PNG
    imgElement.src = pngUrl;
}

// Placeholder if no image exists
function showThumbnailPlaceholder(optionId, message = 'IMG') {
    const imgElement = document.getElementById(`img-${optionId}`);
    if (imgElement) {
        imgElement.src =
            `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='40'%3E` +
            `%3Crect width='50' height='40' fill='%23f5f5f5' stroke='%23ddd'/%3E` +
            `%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='8'%3E` +
            `${encodeURIComponent(message)}%3C/text%3E%3C/svg%3E`;
    }
}


// Wall handling
async function handleWallSubmit(e) {
    e.preventDefault();

    const wallData = {
        id: editingEquipmentId || Date.now().toString(),
        name: document.getElementById('equipment').value.trim(),
        floor: document.getElementById('floor').value.trim(),
        hauteurMax: document.getElementById('hauteurMax').value,
        hauteurMaxMinor: document.getElementById('hauteurMaxMinor').value,
        hauteurMaxUnit: document.getElementById('hauteurMaxUnit').value,
        colombageSet1: document.getElementById('colombageSet1').value,
        colombageSet2: document.getElementById('colombageSet2').value,
        deflexionSet1: document.getElementById('deflexionSet1').value,
        deflexionSet2: document.getElementById('deflexionSet2').value,
        note: document.getElementById('note').value.trim(),
        images: [...(window.currentWallImages || [])]
    };

    if (!wallData.name) {
        alert('Please enter a wall name');
        return;
    }

    if (editingEquipmentId) {
        // Update existing
        const index = currentProject.equipment.findIndex(e => e.id === editingEquipmentId);
        if (index !== -1) {
            currentProject.equipment[index] = wallData;
        }
    } else {
        // Add new
        currentProject.equipment.push(wallData);
    }

    await saveProject();
    hideForm('equipmentForm');
    displayEquipmentList();
    editingEquipmentId = null;
    clearWallImages();
}

function displayEquipmentList() {
    const container = document.getElementById('equipmentList');
    container.innerHTML = '';

    if (!currentProject.equipment || currentProject.equipment.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No walls added yet.</p>';
        document.getElementById('wallSelectionSummary').innerHTML = '<i class="fas fa-th-large"></i> 0 walls added';
        return;
    }

    document.getElementById('wallSelectionSummary').innerHTML = `<i class="fas fa-th-large"></i> ${currentProject.equipment.length} walls added`;

    currentProject.equipment.forEach((wall, index) => {
        const wallCard = document.createElement('div');
        wallCard.className = 'equipment-card';
        wallCard.id = `wallCard${wall.id}`;
        
        wallCard.innerHTML = `
            <div class="equipment-header" onclick="toggleWallDetails('${wall.id}')">
                <div class="equipment-info-compact">
                    <h4>${wall.name}</h4>
                    <div class="equipment-meta-compact">
                        <span>Floor: ${wall.floor || 'N/A'}</span>
                        <span class="meta-separator">•</span>
                        <span>Height: ${formatHeight(wall)}</span>
                        ${wall.colombageSet1 ? `<span class="meta-separator">•</span><span>Set 1: ${wall.colombageSet1}</span>` : ''}
                        ${wall.colombageSet2 ? `<span class="meta-separator">•</span><span>Set 2: ${wall.colombageSet2}</span>` : ''}
                    </div>
                </div>
                <div class="equipment-actions-compact">
                    <button class="details-btn" onclick="event.stopPropagation(); toggleWallDetails('${wall.id}')">Details</button>
                    <button class="duplicate-btn" onclick="event.stopPropagation(); duplicateWall('${wall.id}')" style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-copy"></i> Duplicate
                    </button>
                    <button class="delete-btn" onclick="event.stopPropagation(); deleteWall('${wall.id}')">Delete</button>
                </div>
            </div>
            <div class="equipment-details" id="wallDetails${wall.id}">
                <!-- View Mode -->
                <div class="equipment-details-container" id="wallView${wall.id}">
                    <div class="equipment-info-section">
                        <p><strong>Wall Name:</strong> ${wall.name}</p>
                        <p><strong>Floor:</strong> ${wall.floor || 'N/A'}</p>
                        <p><strong>Height:</strong> ${formatHeight(wall)}</p>
                        <p><strong>Colombage Set 1:</strong> ${wall.colombageSet1 || 'N/A'}</p>
                        <p><strong>Colombage Set 2:</strong> ${wall.colombageSet2 || 'N/A'}</p>
                        <p><strong>Déflexion Set 1:</strong> ${wall.deflexionSet1 || 'N/A'}</p>
                        <p><strong>Déflexion Set 2:</strong> ${wall.deflexionSet2 || 'N/A'}</p>
                        ${wall.note ? `<p><strong>Note:</strong> ${wall.note}</p>` : ''}
                    </div>
                    <div class="equipment-images-section">
                        <h4 style="margin: 10px 0 5px 0; font-size: 14px;">Images:</h4>
                        ${renderWallImages(wall, index)}
                    </div>
                    <button class="button primary" onclick="showWallEditForm('${wall.id}')" style="margin-top: 15px;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
                
                <!-- Edit Mode -->
                ${generateWallEditForm(wall)}
            </div>
        `;
        container.appendChild(wallCard);
    });
}

function formatHeight(item) {
    if (!item.hauteurMax) return 'N/A';
    if (item.hauteurMaxUnit === 'mm') {
        return `${item.hauteurMax} mm`;
    }
    return `${item.hauteurMax}' ${item.hauteurMaxMinor || 0}"`;
}

window.deleteWall = async function(id) {
    if (!confirm('Are you sure you want to delete this wall?')) return;

    currentProject.equipment = currentProject.equipment.filter(e => e.id !== id);
    await saveProject();
    displayEquipmentList();
};

window.toggleWallDetails = function(id) {
    const details = document.getElementById(`wallDetails${id}`);
    const btn = document.querySelector(`#wallCard${id} .details-btn`);
    if (details) {
        details.classList.toggle('show');
        if (btn) {
            const isOpen = details.classList.contains('show');
            btn.innerHTML = isOpen ? '<i class="fas fa-chevron-up"></i> Hide' : '<i class="fas fa-chevron-down"></i> Details';
        }
    }
};

window.duplicateWall = async function(id) {
    const wall = currentProject.equipment.find(e => e.id === id);
    if (!wall) return;

    const newWall = {
        ...wall,
        id: Date.now().toString(),
        name: `${wall.name} (Copy)`
    };
    currentProject.equipment.push(newWall);
    await saveProject();
    displayEquipmentList();
};

// Parapet handling
async function handleParapetSubmit(e) {
    e.preventDefault();

    const parapetData = {
    id: editingParapetId || Date.now().toString(),

    // Regular schema keys (match CFSS project-details expectations)
    parapetName: document.getElementById('parapetName').value.trim(),
    parapetType: document.getElementById('parapetType').value,

    floor: document.getElementById('parapetFloor').value.trim(),
    hauteurMax: document.getElementById('parapetHauteurMax').value,
    hauteurMaxMinor: document.getElementById('parapetHauteurMaxMinor').value,
    hauteurMaxUnit: document.getElementById('parapetHauteurMaxUnit').value,
    colombageSet1: document.getElementById('parapetColombageSet1').value,
    colombageSet2: document.getElementById('parapetColombageSet2').value,
    note: document.getElementById('parapetNote').value.trim(),
    images: [...(window.currentParapetImages || [])]
    };

    if (!parapetData.parapetName) {
        alert('Please enter a parapet name');
        return;
    }

    if (editingParapetId) {
        const index = currentProject.parapets.findIndex(p => p.id === editingParapetId);
        if (index !== -1) {
            currentProject.parapets[index] = parapetData;
        }
    } else {
        currentProject.parapets.push(parapetData);
    }

    await saveProject();
    hideForm('parapetForm');
    displayParapetList();
    editingParapetId = null;
    clearParapetImages();
}

function displayParapetList() {
    const container = document.getElementById('parapetList');
    container.innerHTML = '';

    if (!currentProject.parapets || currentProject.parapets.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No parapets added yet.</p>';
        document.getElementById('parapetSelectionSummary').innerHTML = '<i class="fas fa-building"></i> 0 parapets added';
        return;
    }

    document.getElementById('parapetSelectionSummary').innerHTML = `<i class="fas fa-building"></i> ${currentProject.parapets.length} parapets added`;

    currentProject.parapets.forEach((parapet, index) => {
        const parapetCard = document.createElement('div');
        parapetCard.className = 'equipment-card';
        parapetCard.id = `parapetCard${parapet.id}`;

        const heightDisplay = formatHeight(parapet);
        const title = parapet.parapetName || parapet.name || `Parapet ${index + 1}`;
        
        parapetCard.innerHTML = `
            <div class="equipment-header" onclick="toggleParapetDetails('${parapet.id}')">
                <div class="equipment-info-compact">
                    <h4>${title}</h4>
                    <div class="equipment-meta-compact">
                        <span>Height: ${heightDisplay}</span>
                        <span class="meta-separator">•</span>
                        <span>Montant: ${parapet.montantMetallique || 'N/A'}</span>
                        <span class="meta-separator">•</span>
                        <span>Espacement: ${parapet.espacement || 'N/A'}</span>
                    </div>
                </div>
                <div class="equipment-actions-compact">
                    <button class="details-btn" onclick="event.stopPropagation(); toggleParapetDetails('${parapet.id}')">Details</button>
                    <button class="duplicate-btn" onclick="event.stopPropagation(); duplicateParapet('${parapet.id}')" style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-copy"></i> Duplicate
                    </button>
                    <button class="delete-btn" onclick="event.stopPropagation(); deleteParapet('${parapet.id}')">Delete</button>
                </div>
            </div>
            <div class="equipment-details" id="parapetDetails${parapet.id}">
                <!-- View Mode -->
                <div class="equipment-details-container" id="parapetView${parapet.id}">
                    <div class="equipment-info-section">
                        <p><strong>Parapet Name:</strong> ${title}</p>
                        <p><strong>Type:</strong> ${(parapet.parapetType || parapet.type) || 'N/A'}</p>
                        <p><strong>Floor:</strong> ${parapet.floor || 'N/A'}</p>
                        <p><strong>Height:</strong> ${formatHeight(parapet)}</p>
                        <p><strong>Colombage Set 1:</strong> ${parapet.colombageSet1 || 'N/A'}</p>
                        <p><strong>Colombage Set 2:</strong> ${parapet.colombageSet2 || 'N/A'}</p>
                        ${parapet.note ? `<p><strong>Note:</strong> ${parapet.note}</p>` : ''}
                    </div>
                    <div class="equipment-images-section">
                        <h4 style="margin: 10px 0 5px 0; font-size: 14px;">Images:</h4>
                        ${renderParapetImages(parapet, index)}
                    </div>
                    <button class="button primary" onclick="showParapetEditForm('${parapet.id}')" style="margin-top: 15px;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
                
                <!-- Edit Mode -->
                ${generateParapetEditForm(parapet)}
            </div>
        `;
        container.appendChild(parapetCard);
    });
}

function generateParapetEditForm(parapet) {
    return `
        <form id="parapetEditForm${parapet.id}" style="display: none; padding: 15px; background: #f9f9f9; border-radius: 8px; margin-top: 10px;" onsubmit="saveParapetEdit('${parapet.id}', event)">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <!-- Left Column -->
                <div>
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Parapet Name:</strong></label>
                        <input type="text" id="editParapetName${parapet.id}" value="${(parapet.parapetName || parapet.name) || ''}" required 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Type:</strong></label>
                        <input type="text" id="editParapetType${parapet.id}" value="${(parapet.parapetType || parapet.type) || ''}" 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Floor:</strong></label>
                        <input type="text" id="editParapetFloor${parapet.id}" value="${parapet.floor || ''}" 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Hauteur Max:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="editParapetHauteurMax${parapet.id}" value="${parapet.hauteurMax || ''}" min="0" step="1"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <input type="text" id="editParapetHauteurMaxMinor${parapet.id}" value="${parapet.hauteurMaxMinor || ''}"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <select id="editParapetHauteurMaxUnit${parapet.id}" 
                                    style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="ft-in" ${parapet.hauteurMaxUnit === 'ft-in' || !parapet.hauteurMaxUnit ? 'selected' : ''}>ft-in</option>
                                <option value="mm" ${parapet.hauteurMaxUnit === 'mm' ? 'selected' : ''}>mm</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Note:</strong></label>
                        <input type="text" id="editParapetNote${parapet.id}" value="${parapet.note || ''}" maxlength="100"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                </div>
                
                <!-- Right Column -->
                <div>
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Colombage Set 1:</strong></label>
                        <select id="editParapetColombageSet1${parapet.id}" 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="">Select...</option>
                            <option value="1-5/8" ${parapet.colombageSet1 === '1-5/8' ? 'selected' : ''}>1-5/8</option>
                            <option value="2-1/2" ${parapet.colombageSet1 === '2-1/2' ? 'selected' : ''}>2-1/2</option>
                            <option value="3-5/8" ${parapet.colombageSet1 === '3-5/8' ? 'selected' : ''}>3-5/8</option>
                            <option value="6" ${parapet.colombageSet1 === '6' ? 'selected' : ''}>6</option>
                            <option value="8" ${parapet.colombageSet1 === '8' ? 'selected' : ''}>8</option>
                            <option value="10" ${parapet.colombageSet1 === '10' ? 'selected' : ''}>10</option>
                            <option value="N/A" ${parapet.colombageSet1 === 'N/A' ? 'selected' : ''}>N/A</option>
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Colombage Set 2:</strong></label>
                        <select id="editParapetColombageSet2${parapet.id}" 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="">Select...</option>
                            <option value="1-5/8" ${parapet.colombageSet2 === '1-5/8' ? 'selected' : ''}>1-5/8</option>
                            <option value="2-1/2" ${parapet.colombageSet2 === '2-1/2' ? 'selected' : ''}>2-1/2</option>
                            <option value="3-5/8" ${parapet.colombageSet2 === '3-5/8' ? 'selected' : ''}>3-5/8</option>
                            <option value="6" ${parapet.colombageSet2 === '6' ? 'selected' : ''}>6</option>
                            <option value="8" ${parapet.colombageSet2 === '8' ? 'selected' : ''}>8</option>
                            <option value="10" ${parapet.colombageSet2 === '10' ? 'selected' : ''}>10</option>
                            <option value="N/A" ${parapet.colombageSet2 === 'N/A' ? 'selected' : ''}>N/A</option>
                        </select>
                    </div>
                    
                    <!-- Image Upload Section -->
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Images:</strong></label>
                        <div class="edit-image-upload-section" id="editParapetImageSection${parapet.id}">
                            <div class="upload-controls">
                                <button type="button" class="camera-btn" id="editParapetCameraBtn${parapet.id}" title="Upload Images">
                                    <i class="fas fa-camera"></i> Browse
                                </button>
                                <input class="drop-zone" id="editParapetDropZone${parapet.id}" placeholder="Drop or paste images here (Ctrl+V)" readonly tabindex="0">
                            </div>
                            <div class="image-preview-container" id="editParapetImagePreviewContainer${parapet.id}"></div>
                        </div>
                        <input type="file" id="editParapetImageFileInput${parapet.id}" multiple accept="image/*" style="display: none;">
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button type="submit" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button type="button" onclick="cancelParapetEdit('${parapet.id}')" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
            </div>
        </form>
    `;
}

// Track current editing parapet images
let editingParapetImages = {};

window.showParapetEditForm = function(parapetId) {
    const viewSection = document.getElementById(`parapetView${parapetId}`);
    const editForm = document.getElementById(`parapetEditForm${parapetId}`);
    
    if (viewSection) viewSection.style.display = 'none';
    if (editForm) {
        editForm.style.display = 'block';
        
        // Load existing images for this parapet
        const parapet = currentProject.parapets.find(p => p.id === parapetId);
        if (parapet && parapet.images) {
            editingParapetImages[parapetId] = [...parapet.images];
            const container = document.getElementById(`editParapetImagePreviewContainer${parapetId}`);
            if (container) {
                container.innerHTML = '';
                parapet.images.forEach(imageData => {
                    addEditParapetImagePreview(parapetId, imageData);
                });
            }
        } else {
            editingParapetImages[parapetId] = [];
        }
        
        // Setup image upload handlers for this edit form
        setupEditParapetImageUploadHandlers(parapetId);
    }
};

window.cancelParapetEdit = function(parapetId) {
    const viewSection = document.getElementById(`parapetView${parapetId}`);
    const editForm = document.getElementById(`parapetEditForm${parapetId}`);
    
    if (viewSection) viewSection.style.display = 'block';
    if (editForm) editForm.style.display = 'none';
    
    // Clear editing images
    delete editingParapetImages[parapetId];
};

window.saveParapetEdit = async function(parapetId, event) {
    event.preventDefault();
    
    const parapet = currentProject.parapets.find(p => p.id === parapetId);
    if (!parapet) return;
    
    const index = currentProject.parapets.findIndex(p => p.id === parapetId);
    
    currentProject.parapets[index] = {
        ...parapet,

        // Regular schema keys
        parapetName: document.getElementById(`editParapetName${parapetId}`).value.trim(),
        parapetType: document.getElementById(`editParapetType${parapetId}`).value,

        floor: document.getElementById(`editParapetFloor${parapetId}`).value.trim(),
        hauteurMax: document.getElementById(`editParapetHauteurMax${parapetId}`).value,
        hauteurMaxMinor: document.getElementById(`editParapetHauteurMaxMinor${parapetId}`).value,
        hauteurMaxUnit: document.getElementById(`editParapetHauteurMaxUnit${parapetId}`).value,
        colombageSet1: document.getElementById(`editParapetColombageSet1${parapetId}`).value,
        colombageSet2: document.getElementById(`editParapetColombageSet2${parapetId}`).value,
        note: document.getElementById(`editParapetNote${parapetId}`).value.trim(),
        images: editingParapetImages[parapetId] || []
    };
    
    await saveProject();
    displayParapetList();
    alert('Parapet updated successfully!');
};

window.deleteParapet = async function(id) {
    if (!confirm('Are you sure you want to delete this parapet?')) return;

    currentProject.parapets = currentProject.parapets.filter(p => p.id !== id);
    await saveProject();
    displayParapetList();
};

window.toggleParapetDetails = function(id) {
    const details = document.getElementById(`parapetDetails${id}`);
    const btn = document.querySelector(`#parapetCard${id} .details-btn`);
    if (details) {
        details.classList.toggle('show');
        if (btn) {
            const isOpen = details.classList.contains('show');
            btn.innerHTML = isOpen ? '<i class="fas fa-chevron-up"></i> Hide' : '<i class="fas fa-chevron-down"></i> Details';
        }
    }
};

window.duplicateParapet = async function(id) {
    const parapet = currentProject.parapets.find(p => p.id === id);
    if (!parapet) return;

    const baseName = parapet.parapetName || parapet.name || 'Parapet';
    const newParapet = {
        ...parapet,
        id: Date.now().toString(),
        parapetName: `${baseName} (Copy)`
    };
    currentProject.parapets.push(newParapet);
    await saveProject();
    displayParapetList();
};

// Window handling
async function handleWindowSubmit(e) {
    e.preventDefault();

    const windowData = {
        id: editingWindowId || Date.now().toString(),
        type: document.getElementById('windowType').value.trim(),
        colombageSize: document.getElementById('windowColombageSize').value,
        floor: document.getElementById('windowFloor').value.trim(),
        largeurMax: document.getElementById('windowLargeurMax').value,
        largeurMaxMinor: document.getElementById('windowLargeurMaxMinor').value,
        largeurMaxUnit: document.getElementById('windowLargeurMaxUnit').value,
        hauteurMax: document.getElementById('windowHauteurMax').value,
        hauteurMaxMinor: document.getElementById('windowHauteurMaxMinor').value,
        hauteurMaxUnit: document.getElementById('windowHauteurMaxUnit').value,
        l1: document.getElementById('windowL1').value,
        l1Minor: document.getElementById('windowL1Minor').value,
        l1Unit: document.getElementById('windowL1Unit').value,
        l2: document.getElementById('windowL2').value,
        l2Minor: document.getElementById('windowL2Minor').value,
        l2Unit: document.getElementById('windowL2Unit').value
    };

    if (!windowData.type) {
        alert('Please enter a window type');
        return;
    }

    if (editingWindowId) {
        const index = currentProject.windows.findIndex(w => w.id === editingWindowId);
        if (index !== -1) {
            currentProject.windows[index] = windowData;
        }
    } else {
        currentProject.windows.push(windowData);
    }

    await saveProject();
    hideForm('windowForm');
    displayWindowList();
    editingWindowId = null;
}

async function handleSoffiteSubmit(e) {
    e.preventDefault();

    if (!currentProject) {
        alert('Project not loaded');
        return;
    }

    const nameInput = document.getElementById('soffiteName');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) {
        alert('Please enter a soffite name.');
        if (nameInput) nameInput.focus();
        return;
    }

    const images = window.currentSoffiteImages || [];

    // Require at least one image?  (You can relax this if you want)
    if (images.length === 0) {
        const proceed = confirm('No images have been added. Save this soffite anyway?');
        if (!proceed) return;
    }

    const soffiteData = {
        id: editingSoffiteId || Date.now().toString(),
        name,
        images
    };

    currentProject.soffites = currentProject.soffites || [];

    if (editingSoffiteId) {
        const index = currentProject.soffites.findIndex(s => s.id === editingSoffiteId);
        if (index !== -1) {
            currentProject.soffites[index] = soffiteData;
        } else {
            currentProject.soffites.push(soffiteData);
        }
    } else {
        currentProject.soffites.push(soffiteData);
    }

    await saveProject();

    editingSoffiteId = null;
    const formElement = document.getElementById('soffiteFormElement');
    if (formElement) formElement.reset();
    clearSoffiteImages();
    hideForm('soffiteForm');

    console.log('Soffite saved:', soffiteData);
}

function displayWindowList() {
    const container = document.getElementById('windowList');
    container.innerHTML = '';

    if (!currentProject.windows || currentProject.windows.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No windows added yet.</p>';
        document.getElementById('windowSelectionSummary').innerHTML = '<i class="fas fa-window-maximize"></i> 0 windows added';
        return;
    }

    document.getElementById('windowSelectionSummary').innerHTML = `<i class="fas fa-window-maximize"></i> ${currentProject.windows.length} windows added`;

    currentProject.windows.forEach((win, index) => {
        const windowCard = document.createElement('div');
        windowCard.className = 'equipment-card';
        windowCard.id = `windowCard${win.id}`;
        
        const title = win.windowName || win.name || win.type || `Window ${index + 1}`;
        const largeurDisplay = formatDimension(win, 'largeur');
        const hauteurDisplay = formatDimension(win, 'hauteur');
        const dims = `${largeurDisplay} × ${hauteurDisplay}`;
        
        windowCard.innerHTML = `
            <div class="equipment-header" onclick="toggleWindowDetails('${win.id}')">
                <div class="equipment-info-compact">
                    <h4>${title}</h4>
                    <div class="equipment-meta-compact">
                        ${win.floor ? `<span>Floor: ${win.floor}</span><span style="margin: 0 6px; color: #aaa;">•</span>` : ''}<span>Dimensions: ${dims}</span>
                    </div>
                </div>
                <div class="equipment-actions-compact">
                    <button class="details-btn" onclick="event.stopPropagation(); toggleWindowDetails('${win.id}')">Details</button>
                    <button class="duplicate-btn" onclick="event.stopPropagation(); duplicateWindow('${win.id}')" style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-copy"></i> Duplicate
                    </button>
                    <button class="delete-btn" onclick="event.stopPropagation(); deleteWindow('${win.id}')">Delete</button>
                </div>
            </div>
            <div class="equipment-details" id="windowDetails${win.id}">
                <!-- View Mode -->
                <div class="equipment-details-container" id="windowView${win.id}">
                    <div class="equipment-info-section">
                        <p><strong>Window Type:</strong> ${win.type}</p>
                        <p><strong>Colombage:</strong> ${win.colombageSize || 'N/A'}</p>
                        <p><strong>Floor:</strong> ${win.floor || 'N/A'}</p>
                        <p><strong>Width (Largeur):</strong> ${formatDimension(win, 'largeur')}</p>
                        <p><strong>Height (Hauteur):</strong> ${formatDimension(win, 'hauteur')}</p>
                        <p><strong>L1:</strong> ${formatL(win, 'l1')}</p>
                        <p><strong>L2:</strong> ${formatL(win, 'l2')}</p>
                    </div>
                    <button class="button primary" onclick="showWindowEditForm('${win.id}')" style="margin-top: 15px;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
                
                <!-- Edit Mode -->
                ${generateWindowEditForm(win)}
            </div>
        `;
        container.appendChild(windowCard);
    });
}

function displaySoffiteList() {
    const container = document.getElementById('soffiteList');
    if (!container) return;

    container.innerHTML = '';

    // If no soffites yet
    if (!currentProject.soffites || currentProject.soffites.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No soffites added yet.</p>';
        const summary = document.getElementById('soffiteSelectionSummary');
        if (summary) {
            summary.innerHTML = '<i class="fas fa-grip-lines-vertical"></i> 0 soffites added';
        }
        return;
    }

    // Update summary
    const summary = document.getElementById('soffiteSelectionSummary');
    if (summary) {
        summary.innerHTML = `<i class="fas fa-grip-lines-vertical"></i> ${currentProject.soffites.length} soffites added`;
    }

    // Render each soffite card
    currentProject.soffites.forEach((soffite, index) => {
        const name = soffite.name || soffite.soffiteName || `Soffite ${index + 1}`;
        const images = Array.isArray(soffite.images) ? soffite.images : [];
        const imageCount = images.length;

        const soffiteCard = document.createElement('div');
        soffiteCard.className = 'equipment-card';
        soffiteCard.id = `soffiteCard${soffite.id}`;
        
        soffiteCard.innerHTML = `
            <div class="equipment-header" onclick="toggleSoffiteDetails('${soffite.id}')">
                <div class="equipment-info-compact">
                    <h4>${name}</h4>
                    <div class="equipment-meta-compact">
                        <span>Images: ${imageCount}</span>
                    </div>
                </div>
                <div class="equipment-actions-compact">
                    <button class="details-btn" onclick="event.stopPropagation(); toggleSoffiteDetails('${soffite.id}')">Details</button>
                    <button class="duplicate-btn" onclick="event.stopPropagation(); duplicateSoffite('${soffite.id}')" style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-copy"></i> Duplicate
                    </button>
                    <button class="delete-btn" onclick="event.stopPropagation(); deleteSoffite('${soffite.id}')">Delete</button>
                </div>
            </div>
            <div class="equipment-details" id="soffiteDetails${soffite.id}">
                <div class="equipment-details-container">
                    <div class="equipment-info-section">
                        <p><strong>Soffite Name:</strong> ${name}</p>
                        <p><strong>Images:</strong> ${imageCount}</p>
                        ${imageCount > 0 ? `
                            <div class="soffite-images-preview" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
                                ${images.map(img => `
                                    <div style="width: 80px; height: 60px; border-radius: 4px; overflow: hidden; border: 1px solid #ddd;">
                                        <img src="https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/${img.key}" 
                                             alt="${img.filename || 'Soffite image'}"
                                             style="width: 100%; height: 100%; object-fit: cover;"
                                             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2780%27 height=%2760%27%3E%3Crect width=%2780%27 height=%2760%27 fill=%27%23f0f0f0%27/%3E%3Ctext x=%2750%25%27 y=%2750%25%27 text-anchor=%27middle%27 dy=%27.3em%27 fill=%27%23999%27 font-size=%2710%27%3ENo Image%3C/text%3E%3C/svg%3E'">
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
                <button class="button primary" onclick="editSoffite('${soffite.id}')" style="margin-top: 15px;">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </div>
        `;
        container.appendChild(soffiteCard);
    });
}

function formatDimension(item, prefix) {
    const value = item[`${prefix}Max`];
    const minor = item[`${prefix}MaxMinor`];
    const unit = item[`${prefix}MaxUnit`];
    
    if (!value) return 'N/A';
    if (unit === 'mm') {
        return `${value} mm`;
    }
    return `${value}' ${minor || 0}"`;
}

function formatL(item, prefix) {
    const value = item[prefix];
    const minor = item[`${prefix}Minor`];
    const unit = item[`${prefix}Unit`];
    
    if (!value) return 'N/A';
    if (unit === 'mm') {
        return `${value} mm`;
    }
    return `${value}' ${minor || 0}"`;
}

function generateWindowEditForm(win) {
    return `
        <form id="windowEditForm${win.id}" style="display: none; padding: 15px; background: #f9f9f9; border-radius: 8px; margin-top: 10px;" onsubmit="saveWindowEdit('${win.id}', event)">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <!-- Left Column -->
                <div>
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Window Type:</strong></label>
                        <input type="text" id="editWindowType${win.id}" value="${win.type || ''}" required 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Colombage:</strong></label>
                        <select id="editWindowColombageSize${win.id}" 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="">Select...</option>
                            <option value="3-5/8" ${win.colombageSize === '3-5/8' ? 'selected' : ''}>3-5/8</option>
                            <option value="6" ${win.colombageSize === '6' ? 'selected' : ''}>6"</option>
                            <option value="8" ${win.colombageSize === '8' ? 'selected' : ''}>8"</option>
                            <option value="10" ${win.colombageSize === '10' ? 'selected' : ''}>10"</option>
                            <option value="N/A" ${win.colombageSize === 'N/A' ? 'selected' : ''}>N/A</option>
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Floor:</strong></label>
                        <input type="text" id="editWindowFloor${win.id}" value="${win.floor || ''}" 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Largeur Max:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="editWindowLargeurMax${win.id}" value="${win.largeurMax || ''}" min="0" step="1"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <input type="text" id="editWindowLargeurMaxMinor${win.id}" value="${win.largeurMaxMinor || ''}"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <select id="editWindowLargeurMaxUnit${win.id}" 
                                    style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="ft-in" ${win.largeurMaxUnit === 'ft-in' || !win.largeurMaxUnit ? 'selected' : ''}>ft-in</option>
                                <option value="mm" ${win.largeurMaxUnit === 'mm' ? 'selected' : ''}>mm</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Hauteur Max:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="editWindowHauteurMax${win.id}" value="${win.hauteurMax || ''}" min="0" step="1"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <input type="text" id="editWindowHauteurMaxMinor${win.id}" value="${win.hauteurMaxMinor || ''}"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <select id="editWindowHauteurMaxUnit${win.id}" 
                                    style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="ft-in" ${win.hauteurMaxUnit === 'ft-in' || !win.hauteurMaxUnit ? 'selected' : ''}>ft-in</option>
                                <option value="mm" ${win.hauteurMaxUnit === 'mm' ? 'selected' : ''}>mm</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Right Column -->
                <div>
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>L1:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="editWindowL1${win.id}" value="${win.l1 || ''}" min="0" step="1"
                                style="flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px;">
                            <input type="text" id="editWindowL1Minor${win.id}" value="${win.l1Minor || ''}"
                                style="flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; display: ${(win.l1Unit === 'mm') ? 'none' : 'block'};">
                            <select id="editWindowL1Unit${win.id}" 
                                onchange="toggleEditMinorField(${win.id}, 'L1')"
                                style="flex: 1; padding: 8px 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="ft-in" ${(!win.l1Unit || win.l1Unit === 'ft-in') ? 'selected' : ''}>ft-in</option>
                                <option value="mm" ${win.l1Unit === 'mm' ? 'selected' : ''}>mm</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>L2:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="editWindowL2${win.id}" value="${win.l2 || ''}" min="0" step="1"
                                style="flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px;">
                            <input type="text" id="editWindowL2Minor${win.id}" value="${win.l2Minor || ''}"
                                style="flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; display: ${(win.l2Unit === 'mm') ? 'none' : 'block'};">
                            <select id="editWindowL2Unit${win.id}" 
                                onchange="toggleEditMinorField(${win.id}, 'L2')"
                                style="flex: 1; padding: 8px 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="ft-in" ${(!win.l2Unit || win.l2Unit === 'ft-in') ? 'selected' : ''}>ft-in</option>
                                <option value="mm" ${win.l2Unit === 'mm' ? 'selected' : ''}>mm</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Window Reference Image -->
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Reference:</strong></label>
                        <div style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            background: white;
                            display: flex;
                            justify-content: center;
                        ">
                            <img 
                                src="https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/fenetre.png" 
                                alt="Window Reference"
                                style="
                                    max-width: 100%;
                                    height: auto;
                                    border-radius: 4px;
                                "
                                onerror="this.style.display='none';">
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button type="submit" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button type="button" onclick="cancelWindowEdit('${win.id}')" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
            </div>
        </form>
    `;
}

window.showWindowEditForm = function(windowId) {
    const viewSection = document.getElementById(`windowView${windowId}`);
    const editForm = document.getElementById(`windowEditForm${windowId}`);
    
    if (viewSection) viewSection.style.display = 'none';
    if (editForm) editForm.style.display = 'block';
};

window.cancelWindowEdit = function(windowId) {
    const viewSection = document.getElementById(`windowView${windowId}`);
    const editForm = document.getElementById(`windowEditForm${windowId}`);
    
    if (viewSection) viewSection.style.display = 'block';
    if (editForm) editForm.style.display = 'none';
};

window.saveWindowEdit = async function(windowId, event) {
    event.preventDefault();
    
    const win = currentProject.windows.find(w => w.id === windowId);
    if (!win) return;
    
    const index = currentProject.windows.findIndex(w => w.id === windowId);
    
    currentProject.windows[index] = {
        ...win,
        type: document.getElementById(`editWindowType${windowId}`).value.trim(),
        colombageSize: document.getElementById(`editWindowColombageSize${windowId}`).value,
        floor: document.getElementById(`editWindowFloor${windowId}`).value.trim(),
        largeurMax: document.getElementById(`editWindowLargeurMax${windowId}`).value,
        largeurMaxMinor: document.getElementById(`editWindowLargeurMaxMinor${windowId}`).value,
        largeurMaxUnit: document.getElementById(`editWindowLargeurMaxUnit${windowId}`).value,
        hauteurMax: document.getElementById(`editWindowHauteurMax${windowId}`).value,
        hauteurMaxMinor: document.getElementById(`editWindowHauteurMaxMinor${windowId}`).value,
        hauteurMaxUnit: document.getElementById(`editWindowHauteurMaxUnit${windowId}`).value,
        l1: document.getElementById(`editWindowL1${windowId}`).value,
        l1Minor: document.getElementById(`editWindowL1Minor${windowId}`).value,
        l1Unit: document.getElementById(`editWindowL1Unit${windowId}`).value,
        l2: document.getElementById(`editWindowL2${windowId}`).value,
        l2Minor: document.getElementById(`editWindowL2Minor${windowId}`).value,
        l2Unit: document.getElementById(`editWindowL2Unit${windowId}`).value
    };
    
    await saveProject();
    displayWindowList();
    alert('Window updated successfully!');
};

window.deleteWindow = async function(id) {
    if (!confirm('Are you sure you want to delete this window?')) return;

    currentProject.windows = currentProject.windows.filter(w => w.id !== id);
    await saveProject();
    displayWindowList();
};

window.toggleWindowDetails = function(id) {
    const details = document.getElementById(`windowDetails${id}`);
    const btn = document.querySelector(`#windowCard${id} .details-btn`);
    if (details) {
        details.classList.toggle('show');
        if (btn) {
            const isOpen = details.classList.contains('show');
            btn.innerHTML = isOpen ? '<i class="fas fa-chevron-up"></i> Hide' : '<i class="fas fa-chevron-down"></i> Details';
        }
    }
};

window.duplicateWindow = async function(id) {
    const win = currentProject.windows.find(w => w.id === id);
    if (!win) return;

    const newWindow = {
        ...win,
        id: Date.now().toString(),
        type: `${win.type} (Copy)`
    };
    currentProject.windows.push(newWindow);
    await saveProject();
    displayWindowList();
};

window.toggleSoffiteDetails = function(id) {
    const details = document.getElementById(`soffiteDetails${id}`);
    const btn = document.querySelector(`#soffiteCard${id} .details-btn`);
    if (details) {
        details.classList.toggle('show');
        if (btn) {
            const isOpen = details.classList.contains('show');
            btn.innerHTML = isOpen ? '<i class="fas fa-chevron-up"></i> Hide' : '<i class="fas fa-chevron-down"></i> Details';
        }
    }
};

window.deleteSoffite = async function(id) {
    if (!confirm('Are you sure you want to delete this soffite?')) return;

    currentProject.soffites = currentProject.soffites.filter(s => s.id !== id);
    await saveProject();
    displaySoffiteList();
};

window.duplicateSoffite = async function(id) {
    const soffite = currentProject.soffites.find(s => s.id === id);
    if (!soffite) return;

    const newSoffite = {
        ...soffite,
        id: Date.now().toString(),
        name: `${soffite.name || 'Soffite'} (Copy)`,
        images: [...(soffite.images || [])] // Copy images array
    };
    currentProject.soffites.push(newSoffite);
    await saveProject();
    displaySoffiteList();
};

window.editSoffite = function(id) {
    const soffite = currentProject.soffites.find(s => s.id === id);
    if (!soffite) return;

    editingSoffiteId = id;
    document.getElementById('soffiteName').value = soffite.name || '';
    
    // Load existing images into preview
    window.currentSoffiteImages = [...(soffite.images || [])];
    const container = document.getElementById('soffiteImagePreviewContainer');
    if (container) {
        container.innerHTML = '';
        window.currentSoffiteImages.forEach(img => {
            const preview = document.createElement('div');
            preview.className = 'image-preview';
            preview.innerHTML = `
                <img src="https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/${img.key}" 
                     alt="${img.filename || 'Soffite image'}"
                     style="width: 100%; height: 100%; object-fit: cover;">
                <button type="button" class="image-remove" title="Remove image">&times;</button>
            `;
            container.appendChild(preview);
            
            const removeButton = preview.querySelector('.image-remove');
            removeButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                removeSoffiteImage(img.key);
            });
        });
    }
    updateSoffiteDropZoneState();

    showForm('soffiteForm');
};

// Reuse the same S3 upload flow as regular CFSS
async function uploadImageToS3(file) {
    if (!currentProject || !currentProject.id) {
        throw new Error('Project not loaded');
    }

    const projectId = encodeURIComponent(currentProject.id);

    try {
        // 1) Ask backend for a pre-signed upload URL
        const response = await fetch(`${apiUrl}/${projectId}/image-upload-url`, {
            method: 'POST',
            headers: {
                ...authHelper.getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: file.name,
                contentType: file.type
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get upload URL');
        }

        const uploadData = await response.json();

        // 2) Upload the file directly to S3
        const uploadResponse = await fetch(uploadData.uploadUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });

        if (!uploadResponse.ok) {
            throw new Error('Failed to upload image to S3');
        }

        // 3) Return a compact descriptor that we store on the project
        return {
            key: uploadData.key,
            filename: file.name,
            uploadedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error in uploadImageToS3:', error);
        throw error;
    }
}

function updateSoffiteImageLayout() {
    const container = document.getElementById('soffiteImagePreviewContainer');
    if (!container) return;

    const count = window.currentSoffiteImages?.length || 0;

    container.classList.remove('one-image', 'two-images');

    if (count === 1) {
        container.classList.add('one-image');
    } else if (count === 2) {
        container.classList.add('two-images');
    }
}

function initializeSoffiteImageUpload() {
    if (!window.currentSoffiteImages) {
        window.currentSoffiteImages = [];
    }

    setupSoffiteImageUploadHandlers();
    updateSoffiteDropZoneState();
    console.log('Soffite image upload initialized');
}

function setupSoffiteImageUploadHandlers() {
    const cameraBtn = document.getElementById('soffiteCameraBtn');
    const dropZone = document.getElementById('soffiteDropZone');
    const fileInput = document.getElementById('soffiteImageFileInput');

    if (!cameraBtn || !dropZone || !fileInput) {
        console.warn('Soffite image upload elements not found');
        return;
    }

    // Browse button
    cameraBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', handleSoffiteFileSelect);

    // Drop zone events (no click handler - use button for browsing)
    dropZone.addEventListener('paste', handleSoffitePaste);
    dropZone.addEventListener('dragover', handleSoffiteDragOver);
    dropZone.addEventListener('dragleave', handleSoffiteDragLeave);
    dropZone.addEventListener('drop', handleSoffiteDrop);

    // Focus/blur for visual feedback
    dropZone.addEventListener('focus', () => {
        dropZone.style.borderColor = '#007bff';
        dropZone.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.25)';
    });

    dropZone.addEventListener('blur', () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    });
}

function handleSoffiteFileSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
        processSoffiteFiles(files);
    }
}

function handleSoffitePaste(event) {
    const items = event.clipboardData ? event.clipboardData.items : [];
    const files = [];

    for (let item of items) {
        if (item.type && item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }

    if (files.length > 0) {
        event.preventDefault();
        processSoffiteFiles(files);
    }
}

function handleSoffiteDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleSoffiteDragLeave(event) {
    event.currentTarget.classList.remove('dragover');
}

function handleSoffiteDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
        processSoffiteFiles(files);
    }
}

// Max 2 images per soffite
async function processSoffiteFiles(files) {
    const validFiles = files.filter(file => file.type && file.type.startsWith('image/'));

    if (validFiles.length === 0) {
        alert('Please select valid image files.');
        return;
    }

    if (!window.currentSoffiteImages) {
        window.currentSoffiteImages = [];
    }

    const currentCount = window.currentSoffiteImages.length;
    const remainingSlots = 2 - currentCount;

    if (remainingSlots <= 0) {
        alert('Maximum 2 images allowed per soffite. Please remove an image to add another one.');
        return;
    }

    const filesToUpload = validFiles.slice(0, remainingSlots);

    const dropZone = document.getElementById('soffiteDropZone');
    if (dropZone) {
        dropZone.placeholder = 'Uploading image(s)...';
    }

    for (const file of filesToUpload) {
        try {
            const imageData = await uploadImageToS3(file);
            window.currentSoffiteImages.push(imageData);
            addSoffiteImagePreview(imageData, file);
        } catch (error) {
            console.error('Error uploading soffite image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }

    updateSoffiteImageLayout();
    updateSoffiteDropZoneState();
}

function addSoffiteImagePreview(imageData, file) {
    const container = document.getElementById('soffiteImagePreviewContainer');
    if (!container) return;

    const preview = document.createElement('div');
    preview.className = 'image-preview';

    // Use a local object URL so user sees the real image immediately
    const objectUrl = file ? URL.createObjectURL(file) : '';

    preview.innerHTML = `
        <img
            src="${objectUrl}"
            alt="${imageData.filename}"
            style="width: 100%; height: 100%; object-fit: cover;">
        <button type="button" class="image-remove" title="Remove image">&times;</button>
    `;

    container.appendChild(preview);

    const removeButton = preview.querySelector('.image-remove');
    removeButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        removeSoffiteImage(imageData.key);
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    });
}

function removeSoffiteImage(imageKey) {
    if (!window.currentSoffiteImages) {
        window.currentSoffiteImages = [];
    }

    window.currentSoffiteImages = window.currentSoffiteImages.filter(img => img.key !== imageKey);

    const container = document.getElementById('soffiteImagePreviewContainer');
    if (container) {
        container.innerHTML = '';
        window.currentSoffiteImages.forEach(img => {
            // For already-uploaded images we no longer have the file,
            // so just show a simple placeholder box with the filename.
            const preview = document.createElement('div');
            preview.className = 'image-preview';
            preview.innerHTML = `
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 12px; padding: 4px; text-align: center;">
                    ${img.filename}
                </div>
            `;
            container.appendChild(preview);
        });
    }

    updateSoffiteImageLayout();
    updateSoffiteDropZoneState();
}

function clearSoffiteImages() {
    window.currentSoffiteImages = [];
    const container = document.getElementById('soffiteImagePreviewContainer');
    if (container) {
        container.innerHTML = '';
    }
    updateSoffiteDropZoneState();
}

function updateSoffiteDropZoneState() {
    const dropZone = document.getElementById('soffiteDropZone');
    if (!dropZone) return;

    const count = window.currentSoffiteImages ? window.currentSoffiteImages.length : 0;

    if (count >= 2) {
        dropZone.placeholder = 'Maximum 2 images reached. Remove an image to add a new one.';
        dropZone.classList.add('max-reached');
    } else {
        dropZone.placeholder = 'Drop or paste image here (Ctrl+V)';
        dropZone.classList.remove('max-reached');
    }
}

// Save project
async function saveProject() {
    try {
        const response = await fetch(`${apiUrl}/${currentProject.id}`, {
            method: 'PUT',
            headers: {
                ...authHelper.getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentProject)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('Project saved');
    } catch (error) {
        console.error('Error saving project:', error);
        alert('Error saving project: ' + error.message);
    }
}

// Floor management
let floorCounter = 0;

function getFloorLabel(index) {
    if (index === 0) return 'RDC';
    return `NV${index + 1}`;
}

function displayFloors() {
    const tbody = document.getElementById('floorTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    floorCounter = 0;
    
    const floors = currentProject.floors || [];
    
    if (floors.length === 0) {
        // Add one default floor
        addFloor();
    } else {
        floors.forEach((floor, index) => {
            addFloorRow(floor.name || getFloorLabel(index), floor.height || '');
        });
    }
}

function addFloor() {
    const label = getFloorLabel(floorCounter);
    addFloorRow(label, '');
}

function addFloorRow(name, height) {
    const tbody = document.getElementById('floorTableBody');
    const row = document.createElement('tr');
    
    const rowIndex = document.getElementById('floorTableBody').children.length;
    const bgColor = rowIndex % 2 === 0 ? '#f8f9fa' : 'white';

    row.style.background = bgColor;
    row.innerHTML = `
        <td style="padding: 8px;">
            <input type="text" class="floor-name" value="${name}" style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 4px; background: white;">
        </td>
        <td style="padding: 8px; text-align: center;">
            <input type="number" class="floor-height" value="${height}" placeholder="0" step="0.1" min="0" style="width: 80px; padding: 5px; border: 1px solid #ddd; border-radius: 4px; text-align: center;">
        </td>
        <td style="padding: 8px; text-align: center;">
            <button type="button" class="remove-floor-btn" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(row);
    floorCounter++;
    
    // Add event listeners
    const nameInput = row.querySelector('.floor-name');
    const heightInput = row.querySelector('.floor-height');
    const removeBtn = row.querySelector('.remove-floor-btn');
    
    removeBtn.addEventListener('click', () => removeFloor(row));
}

function removeFloor(row) {
    const tbody = document.getElementById('floorTableBody');
    const rows = tbody.querySelectorAll('tr');
    
    if (rows.length <= 1) {
        alert('At least one floor is required.');
        return;
    }
    
    row.remove();
    
    // Re-label floors
    const remainingRows = tbody.querySelectorAll('tr');
    remainingRows.forEach((r, index) => {
        const nameInput = r.querySelector('.floor-name');
        if (nameInput && nameInput.value.match(/^(RDC|NV\d+)$/)) {
            nameInput.value = getFloorLabel(index);
        }
    });
    
    floorCounter = remainingRows.length;
}

async function saveFloors() {
    const tbody = document.getElementById('floorTableBody');
    const rows = tbody.querySelectorAll('tr');
    
    const floors = [];
    rows.forEach(row => {
        const name = row.querySelector('.floor-name').value.trim();
        const height = parseFloat(row.querySelector('.floor-height').value) || 0;
        floors.push({ name, height });
    });
    
    currentProject.floors = floors;
    await saveProject();
    alert('Floors saved successfully!');
}

// Image Upload Functions
let currentWallImages = [];

function initializeImageUpload() {
    if (!window.currentWallImages) {
        window.currentWallImages = [];
    }
    setupImageUploadHandlers();
}

function setupImageUploadHandlers() {
    const cameraBtn = document.getElementById('cameraBtn');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('imageFileInput');
    
    if (!cameraBtn || !dropZone || !fileInput) {
        console.warn('Image upload elements not found');
        return;
    }
    
    cameraBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.click();
    });
    
    fileInput.addEventListener('change', handleFileSelect);
    dropZone.addEventListener('paste', handlePaste);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    
    dropZone.addEventListener('focus', () => {
        dropZone.style.borderColor = '#17a2b8';
        dropZone.style.boxShadow = '0 0 0 2px rgba(23, 162, 184, 0.25)';
    });
    
    dropZone.addEventListener('blur', () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    });
    
    console.log('Image upload handlers setup successfully');
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    processFiles(files);
}

function handlePaste(event) {
    const items = event.clipboardData.items;
    const files = [];
    
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    
    if (files.length > 0) {
        event.preventDefault();
        processFiles(files);
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const files = Array.from(event.dataTransfer.files);
    processFiles(files);
}

async function processFiles(files) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('Please select valid image files.');
        return;
    }
    
    const currentImageCount = window.currentWallImages?.length || 0;
    const remainingSlots = 2 - currentImageCount;
    
    if (remainingSlots <= 0) {
        alert('Maximum 2 images allowed per wall. Please remove existing images to add new ones.');
        return;
    }
    
    if (validFiles.length > remainingSlots) {
        alert(`You can only add ${remainingSlots} more image(s). Maximum 2 images allowed per wall.`);
        return;
    }
    
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.placeholder = `Uploading ${validFiles.length} image(s)...`;
    }
    
    if (!window.currentWallImages) {
        window.currentWallImages = [];
    }
    
    for (const file of validFiles) {
        try {
            const imageData = await uploadImageToS3(file);
            window.currentWallImages.push(imageData);
            addImagePreview(imageData);
        } catch (error) {
            console.error('Error uploading image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    updateDropZoneState();
}

async function uploadImageToS3(file) {
    const projectId = new URLSearchParams(window.location.search).get('id');
    
    const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${projectId}/image-upload-url`, {
        method: 'POST',
        headers: authHelper.getAuthHeaders(),
        body: JSON.stringify({
            filename: file.name,
            contentType: file.type
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to get upload URL');
    }
    
    const uploadData = await response.json();
    
    const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': file.type
        }
    });
    
    if (!uploadResponse.ok) {
        throw new Error('Failed to upload image to S3');
    }
    
    return {
        key: uploadData.key,
        filename: file.name,
        uploadedAt: new Date().toISOString()
    };
}

function addImagePreview(imageData) {
    const container = document.getElementById('imagePreviewContainer');
    
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.dataset.imageKey = imageData.key;
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename}">
        <button type="button" class="image-remove" title="Remove image">×</button>
    `;
    
    container.appendChild(preview);
    
    const removeButton = preview.querySelector('.image-remove');
    removeButton.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        removeImage(imageData.key);
    });
    
    loadImagePreview(preview.querySelector('img'), imageData.key);
}

async function loadImagePreview(imgElement, imageKey) {
    const projectId = new URLSearchParams(window.location.search).get('id');
    
    try {
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${projectId}/images/sign?key=${encodeURIComponent(imageKey)}`, {
            headers: authHelper.getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            imgElement.src = data.url;
        }
    } catch (error) {
        console.error('Error loading image preview:', error);
    }
}

function removeImage(imageKey) {
    if (!window.currentWallImages) {
        window.currentWallImages = [];
    }
    window.currentWallImages = window.currentWallImages.filter(img => img.key !== imageKey);
    
    const container = document.getElementById('imagePreviewContainer');
    const preview = container.querySelector(`[data-image-key="${imageKey}"]`);
    if (preview) {
        preview.remove();
    }
    
    updateDropZoneState();
}

function updateDropZoneState() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;
    
    const currentCount = window.currentWallImages?.length || 0;
    
    if (currentCount >= 2) {
        dropZone.placeholder = 'Maximum 2 images reached. Remove images to add new ones.';
        dropZone.style.background = '#fff5f5';
        dropZone.style.borderColor = '#ffc107';
    } else {
        dropZone.placeholder = 'Drop or paste images here (Ctrl+V)';
        dropZone.style.background = 'white';
        dropZone.style.borderColor = '#ccc';
    }
}

function clearWallImages() {
    window.currentWallImages = [];
    const container = document.getElementById('imagePreviewContainer');
    if (container) {
        container.innerHTML = '';
    }
    updateDropZoneState();
}

// Parapet Image Upload Functions
function initializeParapetImageUpload() {
    if (!window.currentParapetImages) {
        window.currentParapetImages = [];
    }
    setupParapetImageUploadHandlers();
}

function setupParapetImageUploadHandlers() {
    const cameraBtn = document.getElementById('parapetCameraBtn');
    const dropZone = document.getElementById('parapetDropZone');
    const fileInput = document.getElementById('parapetImageFileInput');
    
    if (!cameraBtn || !dropZone || !fileInput) {
        console.warn('Parapet image upload elements not found');
        return;
    }
    
    cameraBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.click();
    });
    
    fileInput.addEventListener('change', handleParapetFileSelect);
    dropZone.addEventListener('paste', handleParapetPaste);
    dropZone.addEventListener('dragover', handleParapetDragOver);
    dropZone.addEventListener('dragleave', handleParapetDragLeave);
    dropZone.addEventListener('drop', handleParapetDrop);
    
    dropZone.addEventListener('focus', () => {
        dropZone.style.borderColor = '#17a2b8';
        dropZone.style.boxShadow = '0 0 0 2px rgba(23, 162, 184, 0.25)';
    });
    
    dropZone.addEventListener('blur', () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    });
    
    console.log('Parapet image upload handlers setup successfully');
}

function handleParapetFileSelect(event) {
    const files = Array.from(event.target.files);
    processParapetFiles(files);
}

function handleParapetPaste(event) {
    const items = event.clipboardData.items;
    const files = [];
    
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    
    if (files.length > 0) {
        event.preventDefault();
        processParapetFiles(files);
    }
}

function handleParapetDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleParapetDragLeave(event) {
    event.currentTarget.classList.remove('dragover');
}

function handleParapetDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const files = Array.from(event.dataTransfer.files);
    processParapetFiles(files);
}

async function processParapetFiles(files) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('Please select valid image files.');
        return;
    }
    
    const currentImageCount = window.currentParapetImages?.length || 0;
    const remainingSlots = 2 - currentImageCount;
    
    if (remainingSlots <= 0) {
        alert('Maximum 2 images allowed per parapet. Please remove existing images to add new ones.');
        return;
    }
    
    if (validFiles.length > remainingSlots) {
        alert(`You can only add ${remainingSlots} more image(s). Maximum 2 images allowed per parapet.`);
        return;
    }
    
    const dropZone = document.getElementById('parapetDropZone');
    if (dropZone) {
        dropZone.placeholder = `Uploading ${validFiles.length} image(s)...`;
    }
    
    if (!window.currentParapetImages) {
        window.currentParapetImages = [];
    }
    
    for (const file of validFiles) {
        try {
            const imageData = await uploadImageToS3(file);
            window.currentParapetImages.push(imageData);
            addParapetImagePreview(imageData);
        } catch (error) {
            console.error('Error uploading image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    updateParapetDropZoneState();
}

function addParapetImagePreview(imageData) {
    const container = document.getElementById('parapetImagePreviewContainer');
    
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.dataset.imageKey = imageData.key;
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename}">
        <button type="button" class="image-remove" title="Remove image">×</button>
    `;
    
    container.appendChild(preview);
    
    const removeButton = preview.querySelector('.image-remove');
    removeButton.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        removeParapetImage(imageData.key);
    });
    
    loadImagePreview(preview.querySelector('img'), imageData.key);
}

function removeParapetImage(imageKey) {
    if (!window.currentParapetImages) {
        window.currentParapetImages = [];
    }
    window.currentParapetImages = window.currentParapetImages.filter(img => img.key !== imageKey);
    
    const container = document.getElementById('parapetImagePreviewContainer');
    const preview = container.querySelector(`[data-image-key="${imageKey}"]`);
    if (preview) {
        preview.remove();
    }
    
    updateParapetDropZoneState();
}

function updateParapetDropZoneState() {
    const dropZone = document.getElementById('parapetDropZone');
    if (!dropZone) return;
    
    const currentCount = window.currentParapetImages?.length || 0;
    
    if (currentCount >= 2) {
        dropZone.placeholder = 'Maximum 2 images reached. Remove images to add new ones.';
        dropZone.style.background = '#fff5f5';
        dropZone.style.borderColor = '#ffc107';
    } else {
        dropZone.placeholder = 'Drop or paste images here (Ctrl+V)';
        dropZone.style.background = 'white';
        dropZone.style.borderColor = '#ccc';
    }
}

function clearParapetImages() {
    window.currentParapetImages = [];
    const container = document.getElementById('parapetImagePreviewContainer');
    if (container) {
        container.innerHTML = '';
    }
    updateParapetDropZoneState();
}

// Render wall images in the wall list
function renderWallImages(wall, index) {
    if (!wall.images || wall.images.length === 0) {
        return '<p style="color: #666; font-style: italic;">No images</p>';
    }
    
    const imagesToShow = wall.images.slice(0, 2);
    
    let imagesHTML = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; max-width: 200px;">';
    
    imagesToShow.forEach((image, imgIndex) => {
        const imageId = `wall-image-${wall.id}-${imgIndex}`;
        const imageWidth = imagesToShow.length === 1 ? '100px' : '90px';
        
        imagesHTML += `
            <div style="position: relative; width: ${imageWidth}; height: 80px; border-radius: 4px; overflow: hidden; border: 1px solid #ddd; background: #f5f5f5;">
                <img id="${imageId}" 
                     src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" 
                     alt="${image.filename || 'Wall image'}"
                     style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                     onclick="openImageModal('${image.key}', '${image.filename || 'Wall image'}')">
            </div>
        `;
    });
    
    imagesHTML += '</div>';
    
    // Load actual images
    setTimeout(() => {
        imagesToShow.forEach((image, imgIndex) => {
            const imageId = `wall-image-${wall.id}-${imgIndex}`;
            const imgElement = document.getElementById(imageId);
            if (imgElement) {
                loadWallImage(imgElement, image.key);
            }
        });
    }, 100);
    
    return imagesHTML;
}

// Load wall image from S3
async function loadWallImage(imgElement, imageKey) {
    if (!imgElement || !imageKey) return;
    
    const projectId = new URLSearchParams(window.location.search).get('id');
    
    try {
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${projectId}/images/sign?key=${encodeURIComponent(imageKey)}`, {
            headers: authHelper.getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.url) {
                imgElement.src = data.url;
            }
        }
    } catch (error) {
        console.error('Error loading wall image:', error);
        imgElement.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23f0f0f0"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EError%3C/text%3E%3C/svg%3E';
    }
}

// Parapet Edit Image Handlers
function setupEditParapetImageUploadHandlers(parapetId) {
    const cameraBtn = document.getElementById(`editParapetCameraBtn${parapetId}`);
    const dropZone = document.getElementById(`editParapetDropZone${parapetId}`);
    const fileInput = document.getElementById(`editParapetImageFileInput${parapetId}`);
    
    if (!cameraBtn || !dropZone || !fileInput) return;
    
    cameraBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.click();
    };
    
    fileInput.onchange = (event) => {
        const files = Array.from(event.target.files);
        processEditParapetFiles(parapetId, files);
    };
    
    dropZone.onpaste = (event) => {
        const items = event.clipboardData.items;
        const files = [];
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }
        if (files.length > 0) {
            event.preventDefault();
            processEditParapetFiles(parapetId, files);
        }
    };
    
    dropZone.ondragover = (event) => {
        event.preventDefault();
        dropZone.classList.add('dragover');
    };
    
    dropZone.ondragleave = () => {
        dropZone.classList.remove('dragover');
    };
    
    dropZone.ondrop = (event) => {
        event.preventDefault();
        dropZone.classList.remove('dragover');
        const files = Array.from(event.dataTransfer.files);
        processEditParapetFiles(parapetId, files);
    };
    
    dropZone.onfocus = () => {
        dropZone.style.borderColor = '#17a2b8';
        dropZone.style.boxShadow = '0 0 0 2px rgba(23, 162, 184, 0.25)';
    };
    
    dropZone.onblur = () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    };
}

async function processEditParapetFiles(parapetId, files) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('Please select valid image files.');
        return;
    }
    
    if (!editingParapetImages[parapetId]) {
        editingParapetImages[parapetId] = [];
    }
    
    const currentCount = editingParapetImages[parapetId].length;
    const remainingSlots = 2 - currentCount;
    
    if (remainingSlots <= 0) {
        alert('Maximum 2 images allowed per parapet.');
        return;
    }
    
    if (validFiles.length > remainingSlots) {
        alert(`You can only add ${remainingSlots} more image(s).`);
        return;
    }
    
    const dropZone = document.getElementById(`editParapetDropZone${parapetId}`);
    if (dropZone) {
        dropZone.placeholder = `Uploading ${validFiles.length} image(s)...`;
    }
    
    for (const file of validFiles) {
        try {
            const imageData = await uploadImageToS3(file);
            editingParapetImages[parapetId].push(imageData);
            addEditParapetImagePreview(parapetId, imageData);
        } catch (error) {
            console.error('Error uploading image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    updateEditParapetDropZoneState(parapetId);
}

function addEditParapetImagePreview(parapetId, imageData) {
    const container = document.getElementById(`editParapetImagePreviewContainer${parapetId}`);
    if (!container) return;
    
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.dataset.imageKey = imageData.key;
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename || 'Image'}">
        <button type="button" class="image-remove" title="Remove image">×</button>
    `;
    
    container.appendChild(preview);
    
    preview.querySelector('.image-remove').onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeEditParapetImage(parapetId, imageData.key);
    };
    
    loadWallImage(preview.querySelector('img'), imageData.key);
}

function removeEditParapetImage(parapetId, imageKey) {
    if (!editingParapetImages[parapetId]) return;
    
    editingParapetImages[parapetId] = editingParapetImages[parapetId].filter(img => img.key !== imageKey);
    
    const container = document.getElementById(`editParapetImagePreviewContainer${parapetId}`);
    const preview = container?.querySelector(`[data-image-key="${imageKey}"]`);
    if (preview) {
        preview.remove();
    }
    
    updateEditParapetDropZoneState(parapetId);
}

function updateEditParapetDropZoneState(parapetId) {
    const dropZone = document.getElementById(`editParapetDropZone${parapetId}`);
    if (!dropZone) return;
    
    const currentCount = editingParapetImages[parapetId]?.length || 0;
    
    if (currentCount >= 2) {
        dropZone.placeholder = 'Maximum 2 images reached.';
        dropZone.style.background = '#fff5f5';
        dropZone.style.borderColor = '#ffc107';
    } else {
        dropZone.placeholder = 'Drop or paste images here (Ctrl+V)';
        dropZone.style.background = 'white';
        dropZone.style.borderColor = '#ccc';
    }
}

// Render parapet images in the parapet list
function renderParapetImages(parapet, index) {
    if (!parapet.images || parapet.images.length === 0) {
        return '<p style="color: #666; font-style: italic;">No images</p>';
    }
    
    const imagesToShow = parapet.images.slice(0, 2);
    
    let imagesHTML = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; max-width: 200px;">';
    
    imagesToShow.forEach((image, imgIndex) => {
        const imageId = `parapet-image-${parapet.id}-${imgIndex}`;
        const imageWidth = imagesToShow.length === 1 ? '100px' : '90px';
        
        imagesHTML += `
            <div style="position: relative; width: ${imageWidth}; height: 80px; border-radius: 4px; overflow: hidden; border: 1px solid #ddd; background: #f5f5f5;">
                <img id="${imageId}" 
                     src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" 
                     alt="${image.filename || 'Parapet image'}"
                     style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                     onclick="openImageModal('${image.key}', '${image.filename || 'Parapet image'}')">
            </div>
        `;
    });
    
    imagesHTML += '</div>';
    
    // Load actual images
    setTimeout(() => {
        imagesToShow.forEach((image, imgIndex) => {
            const imageId = `parapet-image-${parapet.id}-${imgIndex}`;
            const imgElement = document.getElementById(imageId);
            if (imgElement) {
                loadWallImage(imgElement, image.key);
            }
        });
    }, 100);
    
    return imagesHTML;
}

// Open image in modal for full view
window.openImageModal = function(imageKey, filename) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.8); display: flex; align-items: center; 
        justify-content: center; z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div style="position: relative; max-width: 90%; max-height: 90%;">
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23fff'%3ELoading...%3C/text%3E%3C/svg%3E" 
                style="max-width: 100%; max-height: 100%; border-radius: 8px;"
                alt="${filename}">
            <button style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.9); border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer;"
                    onclick="this.closest('.image-modal').remove()">×</button>
        </div>
    `;
    
    modal.className = 'image-modal';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    document.body.appendChild(modal);
    
    // Load the full-size image
    loadWallImage(modal.querySelector('img'), imageKey);
};

function generateWallEditForm(wall) {
    return `
        <form id="wallEditForm${wall.id}" style="display: none; padding: 15px; background: #f9f9f9; border-radius: 8px; margin-top: 10px;" onsubmit="saveWallEdit('${wall.id}', event)">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <!-- Left Column -->
                <div>
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Wall Name:</strong></label>
                        <input type="text" id="editName${wall.id}" value="${wall.name || ''}" required 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Floor:</strong></label>
                        <input type="text" id="editFloor${wall.id}" value="${wall.floor || ''}" 
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Hauteur Max:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="editHauteurMax${wall.id}" value="${wall.hauteurMax || ''}" min="0" step="1"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <input type="text" id="editHauteurMaxMinor${wall.id}" value="${wall.hauteurMaxMinor || ''}"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <select id="editHauteurMaxUnit${wall.id}" 
                                    style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="ft-in" ${wall.hauteurMaxUnit === 'ft-in' || !wall.hauteurMaxUnit ? 'selected' : ''}>ft-in</option>
                                <option value="mm" ${wall.hauteurMaxUnit === 'mm' ? 'selected' : ''}>mm</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Note:</strong></label>
                        <input type="text" id="editNote${wall.id}" value="${wall.note || ''}" maxlength="100"
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                </div>
                
                <!-- Right Column -->
                <div>
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Colombage Set 1:</strong></label>
                        <select id="editColombageSet1${wall.id}" 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="">Select...</option>
                            <option value="1-5/8" ${wall.colombageSet1 === '1-5/8' ? 'selected' : ''}>1-5/8</option>
                            <option value="2-1/2" ${wall.colombageSet1 === '2-1/2' ? 'selected' : ''}>2-1/2</option>
                            <option value="3-5/8" ${wall.colombageSet1 === '3-5/8' ? 'selected' : ''}>3-5/8</option>
                            <option value="6" ${wall.colombageSet1 === '6' ? 'selected' : ''}>6</option>
                            <option value="8" ${wall.colombageSet1 === '8' ? 'selected' : ''}>8</option>
                            <option value="10" ${wall.colombageSet1 === '10' ? 'selected' : ''}>10</option>
                            <option value="N/A" ${wall.colombageSet1 === 'N/A' ? 'selected' : ''}>N/A</option>
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Colombage Set 2:</strong></label>
                        <select id="editColombageSet2${wall.id}" 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="">Select...</option>
                            <option value="1-5/8" ${wall.colombageSet2 === '1-5/8' ? 'selected' : ''}>1-5/8</option>
                            <option value="2-1/2" ${wall.colombageSet2 === '2-1/2' ? 'selected' : ''}>2-1/2</option>
                            <option value="3-5/8" ${wall.colombageSet2 === '3-5/8' ? 'selected' : ''}>3-5/8</option>
                            <option value="6" ${wall.colombageSet2 === '6' ? 'selected' : ''}>6</option>
                            <option value="8" ${wall.colombageSet2 === '8' ? 'selected' : ''}>8</option>
                            <option value="10" ${wall.colombageSet2 === '10' ? 'selected' : ''}>10</option>
                            <option value="N/A" ${wall.colombageSet2 === 'N/A' ? 'selected' : ''}>N/A</option>
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Déflexion Set 1:</strong></label>
                        <select id="editDeflexionSet1${wall.id}" 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="">Select...</option>
                            <option value="L/180" ${wall.deflexionSet1 === 'L/180' ? 'selected' : ''}>L/180</option>
                            <option value="L/240" ${wall.deflexionSet1 === 'L/240' ? 'selected' : ''}>L/240</option>
                            <option value="L/360" ${wall.deflexionSet1 === 'L/360' ? 'selected' : ''}>L/360</option>
                            <option value="L/480" ${wall.deflexionSet1 === 'L/480' ? 'selected' : ''}>L/480</option>
                            <option value="L/600" ${wall.deflexionSet1 === 'L/600' ? 'selected' : ''}>L/600</option>
                            <option value="L/720" ${wall.deflexionSet1 === 'L/720' ? 'selected' : ''}>L/720</option>
                            <option value="N/A" ${wall.deflexionSet1 === 'N/A' ? 'selected' : ''}>N/A</option>
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Déflexion Set 2:</strong></label>
                        <select id="editDeflexionSet2${wall.id}" 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <option value="">Select...</option>
                            <option value="L/180" ${wall.deflexionSet2 === 'L/180' ? 'selected' : ''}>L/180</option>
                            <option value="L/240" ${wall.deflexionSet2 === 'L/240' ? 'selected' : ''}>L/240</option>
                            <option value="L/360" ${wall.deflexionSet2 === 'L/360' ? 'selected' : ''}>L/360</option>
                            <option value="L/480" ${wall.deflexionSet2 === 'L/480' ? 'selected' : ''}>L/480</option>
                            <option value="L/600" ${wall.deflexionSet2 === 'L/600' ? 'selected' : ''}>L/600</option>
                            <option value="L/720" ${wall.deflexionSet2 === 'L/720' ? 'selected' : ''}>L/720</option>
                            <option value="N/A" ${wall.deflexionSet2 === 'N/A' ? 'selected' : ''}>N/A</option>
                        </select>
                    </div>
                    
                    <!-- Image Upload Section -->
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label><strong>Images:</strong></label>
                        <div class="edit-image-upload-section" id="editImageSection${wall.id}">
                            <div class="upload-controls">
                                <button type="button" class="camera-btn" id="editCameraBtn${wall.id}" title="Upload Images">
                                    <i class="fas fa-camera"></i> Browse
                                </button>
                                <input class="drop-zone" id="editDropZone${wall.id}" placeholder="Drop or paste images here (Ctrl+V)" readonly tabindex="0">
                            </div>
                            <div class="image-preview-container" id="editImagePreviewContainer${wall.id}"></div>
                        </div>
                        <input type="file" id="editImageFileInput${wall.id}" multiple accept="image/*" style="display: none;">
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button type="submit" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button type="button" onclick="cancelWallEdit('${wall.id}')" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
            </div>
        </form>
    `;
}

// Track current editing wall images
let editingWallImages = {};

window.showWallEditForm = function(wallId) {
    const viewSection = document.getElementById(`wallView${wallId}`);
    const editForm = document.getElementById(`wallEditForm${wallId}`);
    
    if (viewSection) viewSection.style.display = 'none';
    if (editForm) {
        editForm.style.display = 'block';
        
        // Load existing images for this wall
        const wall = currentProject.equipment.find(e => e.id === wallId);
        if (wall && wall.images) {
            editingWallImages[wallId] = [...wall.images];
            const container = document.getElementById(`editImagePreviewContainer${wallId}`);
            if (container) {
                container.innerHTML = '';
                wall.images.forEach(imageData => {
                    addEditImagePreview(wallId, imageData);
                });
            }
        } else {
            editingWallImages[wallId] = [];
        }
        
        // Setup image upload handlers for this edit form
        setupEditImageUploadHandlers(wallId);
    }
};

window.cancelWallEdit = function(wallId) {
    const viewSection = document.getElementById(`wallView${wallId}`);
    const editForm = document.getElementById(`wallEditForm${wallId}`);
    
    if (viewSection) viewSection.style.display = 'block';
    if (editForm) editForm.style.display = 'none';
    
    // Clear editing images
    delete editingWallImages[wallId];
};

window.saveWallEdit = async function(wallId, event) {
    event.preventDefault();
    
    const wall = currentProject.equipment.find(e => e.id === wallId);
    if (!wall) return;
    
    const index = currentProject.equipment.findIndex(e => e.id === wallId);
    
    currentProject.equipment[index] = {
        ...wall,
        name: document.getElementById(`editName${wallId}`).value.trim(),
        floor: document.getElementById(`editFloor${wallId}`).value.trim(),
        hauteurMax: document.getElementById(`editHauteurMax${wallId}`).value,
        hauteurMaxMinor: document.getElementById(`editHauteurMaxMinor${wallId}`).value,
        hauteurMaxUnit: document.getElementById(`editHauteurMaxUnit${wallId}`).value,
        colombageSet1: document.getElementById(`editColombageSet1${wallId}`).value,
        colombageSet2: document.getElementById(`editColombageSet2${wallId}`).value,
        deflexionSet1: document.getElementById(`editDeflexionSet1${wallId}`).value,
        deflexionSet2: document.getElementById(`editDeflexionSet2${wallId}`).value,
        note: document.getElementById(`editNote${wallId}`).value.trim(),
        images: editingWallImages[wallId] || []
    };
    
    await saveProject();
    displayEquipmentList();
    alert('Wall updated successfully!');
};

function setupEditImageUploadHandlers(wallId) {
    const cameraBtn = document.getElementById(`editCameraBtn${wallId}`);
    const dropZone = document.getElementById(`editDropZone${wallId}`);
    const fileInput = document.getElementById(`editImageFileInput${wallId}`);
    
    if (!cameraBtn || !dropZone || !fileInput) return;
    
    cameraBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.click();
    };
    
    fileInput.onchange = (event) => {
        const files = Array.from(event.target.files);
        processEditFiles(wallId, files);
    };
    
    dropZone.onpaste = (event) => {
        const items = event.clipboardData.items;
        const files = [];
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }
        if (files.length > 0) {
            event.preventDefault();
            processEditFiles(wallId, files);
        }
    };
    
    dropZone.ondragover = (event) => {
        event.preventDefault();
        dropZone.classList.add('dragover');
    };
    
    dropZone.ondragleave = () => {
        dropZone.classList.remove('dragover');
    };
    
    dropZone.ondrop = (event) => {
        event.preventDefault();
        dropZone.classList.remove('dragover');
        const files = Array.from(event.dataTransfer.files);
        processEditFiles(wallId, files);
    };
    
    dropZone.onfocus = () => {
        dropZone.style.borderColor = '#17a2b8';
        dropZone.style.boxShadow = '0 0 0 2px rgba(23, 162, 184, 0.25)';
    };
    
    dropZone.onblur = () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    };
}

async function processEditFiles(wallId, files) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('Please select valid image files.');
        return;
    }
    
    if (!editingWallImages[wallId]) {
        editingWallImages[wallId] = [];
    }
    
    const currentCount = editingWallImages[wallId].length;
    const remainingSlots = 2 - currentCount;
    
    if (remainingSlots <= 0) {
        alert('Maximum 2 images allowed per wall.');
        return;
    }
    
    if (validFiles.length > remainingSlots) {
        alert(`You can only add ${remainingSlots} more image(s).`);
        return;
    }
    
    const dropZone = document.getElementById(`editDropZone${wallId}`);
    if (dropZone) {
        dropZone.placeholder = `Uploading ${validFiles.length} image(s)...`;
    }
    
    for (const file of validFiles) {
        try {
            const imageData = await uploadImageToS3(file);
            editingWallImages[wallId].push(imageData);
            addEditImagePreview(wallId, imageData);
        } catch (error) {
            console.error('Error uploading image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    updateEditDropZoneState(wallId);
}

function addEditImagePreview(wallId, imageData) {
    const container = document.getElementById(`editImagePreviewContainer${wallId}`);
    if (!container) return;
    
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.dataset.imageKey = imageData.key;
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename || 'Image'}">
        <button type="button" class="image-remove" title="Remove image">×</button>
    `;
    
    container.appendChild(preview);
    
    preview.querySelector('.image-remove').onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeEditImage(wallId, imageData.key);
    };
    
    loadWallImage(preview.querySelector('img'), imageData.key);
}

function removeEditImage(wallId, imageKey) {
    if (!editingWallImages[wallId]) return;
    
    editingWallImages[wallId] = editingWallImages[wallId].filter(img => img.key !== imageKey);
    
    const container = document.getElementById(`editImagePreviewContainer${wallId}`);
    const preview = container?.querySelector(`[data-image-key="${imageKey}"]`);
    if (preview) {
        preview.remove();
    }
    
    updateEditDropZoneState(wallId);
}

function updateEditDropZoneState(wallId) {
    const dropZone = document.getElementById(`editDropZone${wallId}`);
    if (!dropZone) return;
    
    const currentCount = editingWallImages[wallId]?.length || 0;
    
    if (currentCount >= 2) {
        dropZone.placeholder = 'Maximum 2 images reached.';
        dropZone.style.background = '#fff5f5';
        dropZone.style.borderColor = '#ffc107';
    } else {
        dropZone.placeholder = 'Drop or paste images here (Ctrl+V)';
        dropZone.style.background = 'white';
        dropZone.style.borderColor = '#ccc';
    }
}

// Populate parapet type dropdown based on selected options
function populateParapetTypeDropdown() {
    const parapetTypeSelect = document.getElementById('parapetType');
    if (!parapetTypeSelect) return;
    
    // Get selected parapet options from the options list
    const selectedParapetOptions = selectedCFSSOptions.filter(opt => opt.startsWith('parapet-'));
    
    // Clear existing options
    parapetTypeSelect.innerHTML = '<option value="">Select Parapet Type</option>';
    
    if (selectedParapetOptions.length === 0) {
        // No parapet options selected - show all types (1-13)
        for (let i = 1; i <= 13; i++) {
            const option = document.createElement('option');
            option.value = `Type ${i}`;
            option.textContent = `Type ${i}`;
            parapetTypeSelect.appendChild(option);
        }
        console.log('No parapet options selected - showing all 13 types');
    } else {
        // Show only selected types
        selectedParapetOptions.forEach(opt => {
            const typeNumber = opt.replace('parapet-', '');
            const option = document.createElement('option');
            option.value = `Type ${typeNumber}`;
            option.textContent = `Type ${typeNumber}`;
            parapetTypeSelect.appendChild(option);
        });
        console.log(`Filtered parapet types - showing ${selectedParapetOptions.length} selected types`);
    }
    
    // Setup change listener for image preview
    parapetTypeSelect.removeEventListener('change', handleParapetTypeChange);
    parapetTypeSelect.addEventListener('change', handleParapetTypeChange);
}

function handleParapetTypeChange() {
    updateParapetTypeImage(this.value);
}

// Update parapet type image preview
function updateParapetTypeImage(selectedType) {
    const previewBox = document.getElementById('parapetTypeImagePreview');
    if (!previewBox) return;
    
    if (!selectedType) {
        previewBox.innerHTML = '<span style="color: #999; font-size: 13px; text-align: center;">Select a type</span>';
        return;
    }
    
    // Extract type number (e.g., "Type 1" -> "1")
    const typeNumber = selectedType.replace('Type ', '');
    const imageUrl = `https://protection-sismique-equipment-images.s3.amazonaws.com/cfss-options/parapet-${typeNumber}.png`;
    
    previewBox.innerHTML = `
        <img 
            src="${imageUrl}" 
            alt="${selectedType}"
            style="max-width: 105px; max-height: 105px; object-fit: contain;"
            onerror="this.parentElement.innerHTML='<span style=\\'color: #999; font-size: 11px; text-align: center;\\'><i class=\\'fas fa-image\\' style=\\'font-size: 20px; margin-bottom: 4px; display: block;\\'></i>${selectedType}<br/>(image not found)</span>';"
        >
    `;
}

// Track current upload mode
let currentUploadMode = 'file';

function setUploadMode(mode) {
    currentUploadMode = mode;
    const fileBtn = document.getElementById('uploadModeFile');
    const linkBtn = document.getElementById('uploadModeLink');
    const fileInput = document.getElementById('uploadFileInput');
    const linkInput = document.getElementById('uploadLinkInput');
    const inputLabel = document.getElementById('uploadInputLabel');

    if (mode === 'file') {
        fileBtn.style.background = '#17a2b8';
        fileBtn.style.color = 'white';
        linkBtn.style.background = 'transparent';
        linkBtn.style.color = '#555';
        fileInput.style.display = 'block';
        linkInput.style.display = 'none';
        inputLabel.innerHTML = 'Select File <span style="color: red;">*</span>';
    } else {
        linkBtn.style.background = '#17a2b8';
        linkBtn.style.color = 'white';
        fileBtn.style.background = 'transparent';
        fileBtn.style.color = '#555';
        fileInput.style.display = 'none';
        linkInput.style.display = 'block';
        inputLabel.innerHTML = 'Paste Link <span style="color: red;">*</span>';
    }
}

// File upload handler
async function handleFileUpload() {
    const fileName = document.getElementById('uploadFileName').value.trim();

    if (!fileName) {
        alert('Please enter a file name');
        return;
    }

    if (currentUploadMode === 'link') {
        // Handle link upload
        const linkUrl = document.getElementById('uploadLinkInput').value.trim();
        
        if (!linkUrl) {
            alert('Please paste a link');
            return;
        }

        // URL validation - only allow https://
        try {
            const urlObj = new URL(linkUrl);
            if (urlObj.protocol !== 'https:') {
                alert('Only secure HTTPS links are allowed');
                return;
            }
        } catch {
            alert('Please enter a valid URL');
            return;
        }

        try {
            document.getElementById('uploadFileSubmitBtn').disabled = true;
            document.getElementById('uploadFileSubmitBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

            // Save link metadata to project
            const fileMetadata = {
                id: Date.now().toString(),
                name: fileName,
                url: linkUrl,
                type: 'Link',
                uploadedAt: new Date().toISOString(),
                uploadedBy: authHelper.getCurrentUser().email
            };

            currentProject.files = currentProject.files || [];
            currentProject.files.push(fileMetadata);

            await updateProject(currentProject.id, { files: currentProject.files });

            // Reset form and refresh display
            document.getElementById('uploadFileRow').style.display = 'none';
            displayProjectFiles();
            
            alert('Link added successfully!');

        } catch (error) {
            console.error('Error adding link:', error);
            alert('Error adding link: ' + error.message);
        } finally {
            document.getElementById('uploadFileSubmitBtn').disabled = false;
            document.getElementById('uploadFileSubmitBtn').innerHTML = '<i class="fas fa-upload"></i> Upload';
        }

    } else {
        // Handle file upload
        const fileInput = document.getElementById('uploadFileInput');
        const file = fileInput.files[0];

        if (!file) {
            alert('Please select a file');
            return;
        }

        try {
            document.getElementById('uploadFileSubmitBtn').disabled = true;
            document.getElementById('uploadFileSubmitBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            // Get upload URL from backend
            const uploadUrlResponse = await fetch(`${apiUrl}/${currentProject.id}/file-upload-url`, {
                method: 'POST',
                headers: {
                    ...authHelper.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type
                })
            });

            if (!uploadUrlResponse.ok) {
                throw new Error('Failed to get upload URL');
            }

            const { uploadUrl, key } = await uploadUrlResponse.json();

            // Upload file to S3
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type
                }
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload file');
            }

            // Save file metadata to project
            const fileMetadata = {
                id: Date.now().toString(),
                name: fileName,
                key: key,
                type: file.type.startsWith('image/') ? 'Image' : 'PDF',
                uploadedAt: new Date().toISOString(),
                uploadedBy: authHelper.getCurrentUser().email
            };

            currentProject.files = currentProject.files || [];
            currentProject.files.push(fileMetadata);

            await updateProject(currentProject.id, { files: currentProject.files });

            // Reset form and refresh display
            document.getElementById('uploadFileRow').style.display = 'none';
            displayProjectFiles();
            
            alert('File uploaded successfully!');

        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Error uploading file: ' + error.message);
        } finally {
            document.getElementById('uploadFileSubmitBtn').disabled = false;
            document.getElementById('uploadFileSubmitBtn').innerHTML = '<i class="fas fa-upload"></i> Upload';
        }
    }
}

// Display project files in table
function displayProjectFiles() {
    const tbody = document.getElementById('filesTableBody');
    const emptyState = document.getElementById('filesEmptyState');
    const files = currentProject.files || [];

    if (files.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = files.map(file => {
        const date = new Date(file.uploadedAt).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        
        const icon = file.type === 'PDF' ? 'fa-file-pdf' : file.type === 'Link' ? 'fa-link' : 'fa-image';
        const iconBg = file.type === 'Link' ? '#6f42c1' : '#17a2b8';

        // Different action button for links vs files
        const actionButton = file.type === 'Link' 
            ? `<button onclick="window.open('${file.url}', '_blank')" style="background: none; border: 1px solid #6f42c1; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; color: #6f42c1;" title="${file.url}">
                   <i class="fas fa-external-link-alt"></i>
               </button>`
            : `<button onclick="downloadProjectFile('${file.id}')" style="background: none; border: 1px solid #17a2b8; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; color: #17a2b8;" title="Download">
                   <i class="fas fa-download"></i>
               </button>`;

        return `
            <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 12px 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: ${iconBg}; color: white; border-radius: 4px; font-size: 14px;">
                            <i class="fas ${icon}"></i>
                        </div>
                        <span style="font-weight: 500; color: #333;">${file.name}</span>
                    </div>
                </td>
                <td style="padding: 12px 10px; color: #666; font-size: 12px;">${file.type}</td>
                <td style="padding: 12px 10px; color: #666; font-size: 12px;">${date}</td>
                <td style="padding: 12px 10px; text-align: center;">
                    <div style="display: flex; gap: 5px; justify-content: center;">
                        ${actionButton}
                        <button onclick="deleteProjectFile('${file.id}')" style="background: none; border: 1px solid #dc3545; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; color: #dc3545;" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function toggleMinorField(fieldPrefix) {
    // Handle both formats: "windowLargeur"/"windowHauteur" and "windowL1"/"windowL2"
    let unitSelect, minorField;
    
    if (fieldPrefix === 'windowL1' || fieldPrefix === 'windowL2') {
        // For L1 and L2 fields
        unitSelect = document.getElementById(`${fieldPrefix}Unit`);
        minorField = document.getElementById(`${fieldPrefix}Minor`);
    } else {
        // For largeur and hauteur fields
        unitSelect = document.getElementById(`${fieldPrefix}MaxUnit`);
        minorField = document.getElementById(`${fieldPrefix}MaxMinor`);
    }
    
    if (!unitSelect || !minorField) return;
    
    const selectedUnit = unitSelect.value;
    
    if (selectedUnit === 'mm' || selectedUnit === 'm-mm') {
        minorField.style.display = 'none';
        minorField.value = '';
    } else {
        minorField.style.display = 'block';
    }
}

function toggleEditMinorField(windowId, fieldType) {
    let unitSelect, minorInput;
    
    if (fieldType === 'L1' || fieldType === 'L2') {
        // For L1 and L2 fields
        unitSelect = document.getElementById(`editWindow${fieldType}Unit${windowId}`);
        minorInput = document.getElementById(`editWindow${fieldType}Minor${windowId}`);
    } else {
        // For Largeur and Hauteur fields
        unitSelect = document.getElementById(`edit${fieldType}MaxUnit${windowId}`);
        minorInput = document.getElementById(`edit${fieldType}MaxMinor${windowId}`);
    }
    
    if (!unitSelect || !minorInput) {
        console.log(`Toggle failed - elements not found for window ${windowId}, field ${fieldType}`);
        return;
    }
    
    if (unitSelect.value === 'mm' || unitSelect.value === 'm-mm') {
        minorInput.style.display = 'none';
        minorInput.value = '';
    } else {
        minorInput.style.display = 'block';
    }
}

// Download project file
async function downloadProjectFile(fileId) {
    try {
        const file = currentProject.files.find(f => f.id === fileId);
        if (!file) {
            alert('File not found');
            return;
        }

        // Get signed URL from backend
        const response = await fetch(`${apiUrl}/${currentProject.id}/file-download-url?key=${encodeURIComponent(file.key)}`, {
            method: 'GET',
            headers: authHelper.getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to get download URL');
        }

        const { url } = await response.json();
        
        // Open in new tab or download
        window.open(url, '_blank');

    } catch (error) {
        console.error('Error downloading file:', error);
        alert('Error downloading file: ' + error.message);
    }
}

// Delete project file
async function deleteProjectFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) {
        return;
    }

    try {
        const file = currentProject.files.find(f => f.id === fileId);
        if (!file) {
            alert('File not found');
            return;
        }

        // Delete from S3
        await fetch(`${apiUrl}/${currentProject.id}/file-delete`, {
            method: 'POST',
            headers: {
                ...authHelper.getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key: file.key })
        });

        // Remove from project
        currentProject.files = currentProject.files.filter(f => f.id !== fileId);
        await updateProject(currentProject.id, { files: currentProject.files });

        displayProjectFiles();
        alert('File deleted successfully');

    } catch (error) {
        console.error('Error deleting file:', error);
        alert('Error deleting file: ' + error.message);
    }
}

// Update project helper
async function updateProject(projectId, updates) {
    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
            ...authHelper.getAuthHeaders(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            id: projectId,
            ...updates
        })
    });

    if (!response.ok) {
        throw new Error('Failed to update project');
    }

    return await response.json();
}

// ============================================
// SUBMIT TO ADMIN - CONVERT TO REGULAR PROJECT
// ============================================

// Colombage to Montant prefix mapping
const colombageToMontantPrefix = {
    '1-5/8': '162',
    '2-1/2': '250',
    '2 1/2': '250',
    '3-5/8': '362',
    '4': '400',
    '6': '600',
    '8': '800',
    '10': '1000'
};

// Convert limited wall to regular wall format
function convertWallToRegular(limitedWall) {
    const montantPrefix1 = colombageToMontantPrefix[limitedWall.colombageSet1] || 'N/A';
    const montantPrefix2 = limitedWall.colombageSet2 ? colombageToMontantPrefix[limitedWall.colombageSet2] || 'N/A' : null;
    
    const regularWall = {
        equipment: limitedWall.name || limitedWall.equipment || 'Unnamed Wall',
        floor: limitedWall.floor || 'N/A',
        hauteurMax: limitedWall.hauteurMax || '0',
        hauteurMaxUnit: limitedWall.hauteurMaxUnit || 'ft',
        hauteurMaxMinor: limitedWall.hauteurMaxMinor || '0',
        hauteurMaxMinorUnit: limitedWall.hauteurMaxMinorUnit || 'in',
        deflexionMax: limitedWall.deflexionSet1 || 'N/A',
        montantMetallique: montantPrefix1,
        montantFilter: montantPrefix1 !== 'N/A' ? montantPrefix1 : null,
        dosADos: false,
        lisseSuperieure: 'N/A',
        lisseInferieure: 'N/A',
        entremise: 'N/A',
        espacement: 'N/A',
        note: limitedWall.note || '',
        images: limitedWall.images || [],
        dateAdded: limitedWall.dateAdded || new Date().toISOString(),
        addedBy: limitedWall.addedBy || 'limited-user'
    };
    
    // Add Set 2 data if it exists
    if (limitedWall.colombageSet2 || limitedWall.deflexionSet2) {
        regularWall.montantMetallique2 = montantPrefix2 || 'N/A';
        regularWall.montantFilter2 = montantPrefix2 && montantPrefix2 !== 'N/A' ? montantPrefix2 : null;
        regularWall.deflexionMax2 = limitedWall.deflexionSet2 || 'N/A';
        regularWall.dosADos2 = false;
        regularWall.lisseSuperieure2 = 'N/A';
        regularWall.lisseInferieure2 = 'N/A';
        regularWall.entremise2 = 'N/A';
        regularWall.espacement2 = 'N/A';
    }
    
    return regularWall;
}

function convertParapetToRegular(limitedParapet) {
    const montantPrefix1 = colombageToMontantPrefix[limitedParapet.colombageSet1] || null;
    const montantPrefix2 = limitedParapet.colombageSet2 ? colombageToMontantPrefix[limitedParapet.colombageSet2] || null : null;
    
    // Parse combined unit into separate major/minor units
    const combinedUnit = limitedParapet.hauteurMaxUnit || 'ft-in';
    let majorUnit, minorUnit;
    if (combinedUnit === 'ft-in') {
        majorUnit = 'ft';
        minorUnit = 'in';
    } else if (combinedUnit === 'm-mm' || combinedUnit === 'mm') {
        majorUnit = 'm';
        minorUnit = 'mm';
    } else {
        majorUnit = combinedUnit;
        minorUnit = '';
    }
    
    const regularParapet = {
        id: limitedParapet.id,
        parapetName: (limitedParapet.parapetName || limitedParapet.name) || '',
        parapetType: (limitedParapet.parapetType || limitedParapet.type) || '',
        floor: limitedParapet.floor || '',
        hauteurMax: limitedParapet.hauteurMax || '',
        hauteurMaxMinor: limitedParapet.hauteurMaxMinor || '',
        hauteurMaxUnit: majorUnit,
        hauteurMaxMinorUnit: minorUnit,
        
        // Set 1 - Initialize with placeholder values for admin to fill in
        montantMetallique: montantPrefix1 || '',
        montantFilter: montantPrefix1 && montantPrefix1 !== 'N/A' ? montantPrefix1 : null,
        espacement: '',
        lisseSuperieure: '',
        lisseInferieure: '',
        entremise: '',
        
        note: limitedParapet.note || '',
        images: limitedParapet.images || [],
        dateAdded: limitedParapet.dateAdded || new Date().toISOString()
    };
    
    // Add Set 2 data if colombageSet2 exists
    if (limitedParapet.colombageSet2 && limitedParapet.colombageSet2 !== '' && limitedParapet.colombageSet2 !== 'N/A') {
        regularParapet.montantMetallique2 = montantPrefix2 || '';
        regularParapet.montantFilter2 = montantPrefix2 && montantPrefix2 !== 'N/A' ? montantPrefix2 : null;
        regularParapet.espacement2 = '';
        regularParapet.lisseSuperieure2 = '';
        regularParapet.lisseInferieure2 = '';
        regularParapet.entremise2 = '';
    }
    
    return regularParapet;
}

// Convert limited window to regular format
function convertWindowToRegular(limitedWindow) {
    return {
        ...limitedWindow,
        // Ensure all fields exist
        type: limitedWindow.type || 'N/A',
        colombageSize: limitedWindow.colombageSize || 'N/A',
        floor: limitedWindow.floor || 'N/A'
    };
}

// Convert entire limited project to regular project format
function convertProjectToRegular(limitedProject) {
    // Convert floors array to cfssWindData.storeys format
    const floors = limitedProject.floors || [];
    const storeys = floors.map(floor => ({
        label: floor.name || 'RDC',
        height: parseFloat(floor.height) || 0,
        area: 0,
        uls: 0,
        sls: 0
    }));
    
    const regularProject = {
        // Basic info - same
        name: limitedProject.name,
        companyName: limitedProject.companyName || 'N/A',
        clientName: limitedProject.clientName || 'N/A',
        description: limitedProject.description || '',
        addressLine1: limitedProject.addressLine1 || 'N/A',
        addressLine2: limitedProject.addressLine2 || '',
        city: limitedProject.city || 'N/A',
        province: limitedProject.province || 'N/A',
        country: limitedProject.country || 'N/A',
        status: limitedProject.status || 'Planning',
        
        // Project settings
        deflectionMax: limitedProject.deflectionMax || 'N/A',
        thicknessMin: limitedProject.thicknessMin || 'N/A',
        floors: limitedProject.floors || [],
        
        // Convert equipment (walls)
        equipment: (limitedProject.equipment || []).map(convertWallToRegular),
        
        // Convert parapets
        parapets: (limitedProject.parapets || []).map(convertParapetToRegular),
        
        // Convert windows
        windows: (limitedProject.windows || []).map(convertWindowToRegular),
        
        // Copy soffites as-is
        soffites: limitedProject.soffites || [],
        
        // Copy files as-is
        files: limitedProject.files || [],
        
        // Copy options
        selectedCFSSOptions: limitedProject.selectedCFSSOptions || [],
        options: limitedProject.options || [],
        
        // CFSS Wind Data with converted storeys
        cfssWindData: storeys.length > 0 ? {
            storeys: storeys,
            floorGroups: [],
            windParams: {},
            specifications: {},
            dateAdded: new Date().toISOString(),
            addedBy: limitedProject.createdBy || 'limited-user'
        } : null,
        
        // Metadata
        isAdminCopy: true,
        linkedLimitedProjectId: limitedProject.id,
        createdBy: limitedProject.createdBy,
        createdAt: new Date().toISOString(),
        convertedAt: new Date().toISOString(),
        convertedFrom: limitedProject.id
    };
    
    return regularProject;
}

// Main submit to admin function
async function submitToAdmin() {
    if (!currentProject) {
        alert('No project loaded');
        return;
    }
    
    const btn = document.getElementById('submitToAdminBtn');
    const btnText = document.getElementById('submitBtnText');
    
    try {
        // Disable button and show loading
        btn.disabled = true;
        btnText.textContent = 'Submitting...';
        btn.style.opacity = '0.7';
        
        // Check if already submitted
        if (currentProject.linkedRegularProjectId) {
            // Update existing regular project
            console.log('Updating existing linked regular project:', currentProject.linkedRegularProjectId);
            
            const regularProjectData = convertProjectToRegular(currentProject);
            regularProjectData.id = currentProject.linkedRegularProjectId;
            regularProjectData.updatedAt = new Date().toISOString();
            
            const updateResponse = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    ...authHelper.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(regularProjectData)
            });
            
            if (!updateResponse.ok) {
                throw new Error('Failed to update regular project');
            }
            
            // Save CFSS wind data separately if it exists
            if (regularProjectData.cfssWindData) {
                const cfssResponse = await fetch(`${apiUrl}/${currentProject.linkedRegularProjectId}/cfss-data`, {
                    method: 'PUT',
                    headers: {
                        ...authHelper.getAuthHeaders(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cfssWindData: regularProjectData.cfssWindData })
                });
                
                if (!cfssResponse.ok) {
                    console.warn('Failed to save CFSS data, but project was updated');
                }
            }
            
            // Update limited project's lastSubmittedAt
            await updateProject(currentProject.id, {
                lastSubmittedAt: new Date().toISOString()
            });
            
            currentProject.lastSubmittedAt = new Date().toISOString();
            
            alert('Project updated successfully! Admin can now see your changes.');
            
        } else {
            // Create new regular project
            console.log('Creating new regular project from limited project');
            
            const regularProjectData = convertProjectToRegular(currentProject);
            
            const createResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    ...authHelper.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(regularProjectData)
            });
            
            if (!createResponse.ok) {
                throw new Error('Failed to create regular project');
            }
            
            const newProject = await createResponse.json();
            const newProjectId = newProject.id || newProject.projectId;
            
            console.log('Created regular project with ID:', newProjectId);
            
            // Save CFSS wind data separately if it exists
            if (regularProjectData.cfssWindData) {
                const cfssResponse = await fetch(`${apiUrl}/${newProjectId}/cfss-data`, {
                    method: 'PUT',
                    headers: {
                        ...authHelper.getAuthHeaders(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cfssWindData: regularProjectData.cfssWindData })
                });
                
                if (!cfssResponse.ok) {
                    console.warn('Failed to save CFSS data, but project was created');
                }
            }
            
            // Update limited project with link to regular project
            await updateProject(currentProject.id, {
                linkedRegularProjectId: newProjectId,
                firstSubmittedAt: new Date().toISOString(),
                lastSubmittedAt: new Date().toISOString()
            });
            
            currentProject.linkedRegularProjectId = newProjectId;
            currentProject.firstSubmittedAt = new Date().toISOString();
            currentProject.lastSubmittedAt = new Date().toISOString();
            
            alert('Project submitted successfully! Admin can now review your project.');
        }
        
        // Update UI to show submitted status
        updateSubmitStatusUI();
        
    } catch (error) {
        console.error('Error submitting to admin:', error);
        alert('Error submitting project: ' + error.message);
    } finally {
        // Re-enable button
        btn.disabled = false;
        btn.style.opacity = '1';
        updateSubmitButtonText();
    }
}

// Update the submit button text based on state
function updateSubmitButtonText() {
    const btnText = document.getElementById('submitBtnText');
    if (btnText) {
        if (currentProject && currentProject.linkedRegularProjectId) {
            btnText.textContent = 'Update Submission';
        } else {
            btnText.textContent = 'Submit';
        }
    }
}

// Update the submit status UI
function updateSubmitStatusUI() {
    const statusText = document.getElementById('submitStatusText');
    const submittedInfo = document.getElementById('submittedInfo');
    const submittedDate = document.getElementById('submittedDate');
    
    if (currentProject && currentProject.linkedRegularProjectId) {
        if (statusText) {
            statusText.textContent = 'Project has been submitted. You can update your submission anytime.';
        }
        if (submittedInfo && submittedDate) {
            const lastSubmitted = currentProject.lastSubmittedAt ? 
                new Date(currentProject.lastSubmittedAt).toLocaleString() : 
                'Unknown';
            submittedDate.textContent = `Last submitted: ${lastSubmitted}`;
            submittedInfo.style.display = 'block';
        }
        updateSubmitButtonText();
    }
}

// Call this when project loads to set initial UI state
function initializeSubmitUI() {
    updateSubmitStatusUI();
    updateSubmitButtonText();
}

// Add to displayProjectInfo to initialize submit UI
const originalDisplayProjectInfo = displayProjectInfo;
displayProjectInfo = function() {
    originalDisplayProjectInfo();
    initializeSubmitUI();
};