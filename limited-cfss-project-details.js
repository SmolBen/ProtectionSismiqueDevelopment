// Limited CFSS Project Details Page JavaScript
const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

let authHelper;
let currentProject = null;
let editingEquipmentId = null;
let editingParapetId = null;
let editingWindowId = null;

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
    console.log('ðŸ“„ Limited CFSS Project Details page loaded');
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

        // Verify user is limited
        if (!authHelper.isLimited()) {
            const projectId = new URLSearchParams(window.location.search).get('id');
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

        console.log('âœ… Limited CFSS Project Details initialized');

    } catch (error) {
        console.error('âŒ Error initializing:', error);
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

        // Check if user owns this project
        const currentUser = authHelper.getCurrentUser();
        if (currentProject.createdBy !== currentUser.email) {
            document.getElementById('loadingProject').style.display = 'none';
            document.getElementById('accessDenied').style.display = 'block';
            return;
        }

        // Initialize arrays if they don't exist
        currentProject.equipment = currentProject.equipment || [];
        currentProject.parapets = currentProject.parapets || [];
        currentProject.windows = currentProject.windows || [];
        currentProject.options = currentProject.options || [];

        // Display project info
        displayProjectInfo();

        // Display lists
        displayEquipmentList();
        displayParapetList();
        displayWindowList();

        // Show project container
        document.getElementById('loadingProject').style.display = 'none';
        document.getElementById('projectContainer').style.display = 'block';

    } catch (error) {
        console.error('âŒ Error loading project:', error);
        document.getElementById('loadingProject').style.display = 'none';
        alert('Error loading project: ' + error.message);
        window.location.href = 'limited-cfss-dashboard.html';
    }
}

function displayProjectInfo() {
    document.getElementById('projectName').textContent = currentProject.name || '';
    document.getElementById('clientName').textContent = currentProject.clientName || 'Not specified';
    document.getElementById('projectDescription').textContent = currentProject.description || 'No description';
    document.getElementById('projectStatusDropdown').value = currentProject.status || 'Planning';
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Status change
    const statusDropdown = document.getElementById('projectStatusDropdown');
    if (statusDropdown) {
        statusDropdown.addEventListener('change', async (e) => {
            currentProject.status = e.target.value;
            await saveProject();
        });
    }

    // Add Wall button - toggle behavior
    const newCalcButton = document.getElementById('newCalculationButton');
    const equipmentForm = document.getElementById('equipmentForm');
    
    console.log('Add Wall button:', newCalcButton);
    console.log('Equipment form:', equipmentForm);
    
    if (newCalcButton && equipmentForm) {
        newCalcButton.addEventListener('click', () => {
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
    
    console.log('Event listeners setup complete');
}

// Hide all forms and reset all button states
function hideAllForms() {
    const forms = ['equipmentForm', 'parapetForm', 'windowForm'];
    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.classList.remove('show');
            form.style.display = 'none';
        }
    });
    
    // Reset all button states
    const newCalcButton = document.getElementById('newCalculationButton');
    const addParapetButton = document.getElementById('addParapetButton');
    const addWindowButton = document.getElementById('addWindowButton');
    
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
    }
}

// Tab system
function initializeTabSystem() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content-section');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(`${tabName}-content`).classList.add('active');

            // When opening the Option List tab, preload images (same as regular CFSS)
            if (tabName === 'option-list') {
                setTimeout(() => {
                    preloadOptionImages();
                }, 200);
            }
        });
    });
}

// Initialize options for the current project
function initializeOptionsSystem() {
    console.log('ðŸ”§ Initializing LIMITED CFSS options system...');

    // Load any saved options from the project if present
    if (currentProject && Array.isArray(currentProject.selectedCFSSOptions)) {
        selectedCFSSOptions = [...currentProject.selectedCFSSOptions];
    } else {
        selectedCFSSOptions = [];
    }

    populateOptionsCategories();
    updateSelectionSummary();

    console.log('âœ… Limited options system initialized');
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

    console.log('âœ… Limited option categories populated');
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

    console.log('ðŸ’¾ Saving LIMITED CFSS options:', selectedCFSSOptions);

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
        // Lisse trouÃ©e options
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

    console.log('âœ… CFSS option images preloaded (limited)');
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

    console.log('âœ… Limited option categories populated');
}

// Create one option card (with image) â€“ similar to full CFSS
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
    const count = currentProject.options ? currentProject.options.length : 0;
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
        note: document.getElementById('note').value.trim()
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

    currentProject.equipment.forEach(wall => {
        const wallDiv = document.createElement('div');
        wallDiv.className = 'equipment-item';
        wallDiv.innerHTML = `
            <div class="equipment-info">
                <strong>${wall.name}</strong>
                <span>Floor: ${wall.floor || 'N/A'} | Height: ${formatHeight(wall)}</span>
                ${wall.note ? `<span style="font-style: italic; color: #666;">Note: ${wall.note}</span>` : ''}
            </div>
            <div class="equipment-actions">
                <button class="edit-btn" onclick="editWall('${wall.id}')"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" onclick="deleteWall('${wall.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        container.appendChild(wallDiv);
    });
}

function formatHeight(item) {
    if (!item.hauteurMax) return 'N/A';
    if (item.hauteurMaxUnit === 'mm') {
        return `${item.hauteurMax} mm`;
    }
    return `${item.hauteurMax}' ${item.hauteurMaxMinor || 0}"`;
}

window.editWall = function(id) {
    const wall = currentProject.equipment.find(e => e.id === id);
    if (!wall) return;

    editingEquipmentId = id;
    document.getElementById('equipment').value = wall.name || '';
    document.getElementById('floor').value = wall.floor || '';
    document.getElementById('hauteurMax').value = wall.hauteurMax || '';
    document.getElementById('hauteurMaxMinor').value = wall.hauteurMaxMinor || '';
    document.getElementById('hauteurMaxUnit').value = wall.hauteurMaxUnit || 'ft-in';
    document.getElementById('colombageSet1').value = wall.colombageSet1 || '';
    document.getElementById('colombageSet2').value = wall.colombageSet2 || '';
    document.getElementById('note').value = wall.note || '';

    showForm('equipmentForm');
};

window.deleteWall = async function(id) {
    if (!confirm('Are you sure you want to delete this wall?')) return;

    currentProject.equipment = currentProject.equipment.filter(e => e.id !== id);
    await saveProject();
    displayEquipmentList();
};

// Parapet handling
async function handleParapetSubmit(e) {
    e.preventDefault();

    const parapetData = {
        id: editingParapetId || Date.now().toString(),
        name: document.getElementById('parapetName').value.trim(),
        type: document.getElementById('parapetType').value,
        floor: document.getElementById('parapetFloor').value.trim(),
        hauteurMax: document.getElementById('parapetHauteurMax').value,
        hauteurMaxMinor: document.getElementById('parapetHauteurMaxMinor').value,
        hauteurMaxUnit: document.getElementById('parapetHauteurMaxUnit').value,
        colombageSet1: document.getElementById('parapetColombageSet1').value,
        colombageSet2: document.getElementById('parapetColombageSet2').value,
        note: document.getElementById('parapetNote').value.trim()
    };

    if (!parapetData.name) {
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

    currentProject.parapets.forEach(parapet => {
        const parapetDiv = document.createElement('div');
        parapetDiv.className = 'equipment-item';
        parapetDiv.innerHTML = `
            <div class="equipment-info">
                <strong>${parapet.name}</strong>
                <span>Type: ${parapet.type || 'N/A'} | Floor: ${parapet.floor || 'N/A'} | Height: ${formatHeight(parapet)}</span>
                ${parapet.note ? `<span style="font-style: italic; color: #666;">Note: ${parapet.note}</span>` : ''}
            </div>
            <div class="equipment-actions">
                <button class="edit-btn" onclick="editParapet('${parapet.id}')"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" onclick="deleteParapet('${parapet.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        container.appendChild(parapetDiv);
    });
}

window.editParapet = function(id) {
    const parapet = currentProject.parapets.find(p => p.id === id);
    if (!parapet) return;

    editingParapetId = id;
    document.getElementById('parapetName').value = parapet.name || '';
    document.getElementById('parapetType').value = parapet.type || '';
    document.getElementById('parapetFloor').value = parapet.floor || '';
    document.getElementById('parapetHauteurMax').value = parapet.hauteurMax || '';
    document.getElementById('parapetHauteurMaxMinor').value = parapet.hauteurMaxMinor || '';
    document.getElementById('parapetHauteurMaxUnit').value = parapet.hauteurMaxUnit || 'ft-in';
    document.getElementById('parapetColombageSet1').value = parapet.colombageSet1 || '';
    document.getElementById('parapetColombageSet2').value = parapet.colombageSet2 || '';
    document.getElementById('parapetNote').value = parapet.note || '';

    showForm('parapetForm');
};

window.deleteParapet = async function(id) {
    if (!confirm('Are you sure you want to delete this parapet?')) return;

    currentProject.parapets = currentProject.parapets.filter(p => p.id !== id);
    await saveProject();
    displayParapetList();
};

// Window handling
async function handleWindowSubmit(e) {
    e.preventDefault();

    const windowData = {
        id: editingWindowId || Date.now().toString(),
        type: document.getElementById('windowType').value.trim(),
        floor: document.getElementById('windowFloor').value.trim(),
        largeurMax: document.getElementById('windowLargeurMax').value,
        largeurMaxMinor: document.getElementById('windowLargeurMaxMinor').value,
        largeurMaxUnit: document.getElementById('windowLargeurMaxUnit').value,
        hauteurMax: document.getElementById('windowHauteurMax').value,
        hauteurMaxMinor: document.getElementById('windowHauteurMaxMinor').value,
        hauteurMaxUnit: document.getElementById('windowHauteurMaxUnit').value
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

function displayWindowList() {
    const container = document.getElementById('windowList');
    container.innerHTML = '';

    if (!currentProject.windows || currentProject.windows.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No windows added yet.</p>';
        document.getElementById('windowSelectionSummary').innerHTML = '<i class="fas fa-window-maximize"></i> 0 windows added';
        return;
    }

    document.getElementById('windowSelectionSummary').innerHTML = `<i class="fas fa-window-maximize"></i> ${currentProject.windows.length} windows added`;

    currentProject.windows.forEach(window => {
        const windowDiv = document.createElement('div');
        windowDiv.className = 'equipment-item';
        windowDiv.innerHTML = `
            <div class="equipment-info">
                <strong>${window.type}</strong>
                <span>Floor: ${window.floor || 'N/A'} | Width: ${formatDimension(window, 'largeur')} | Height: ${formatDimension(window, 'hauteur')}</span>
            </div>
            <div class="equipment-actions">
                <button class="edit-btn" onclick="editWindow('${window.id}')"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" onclick="deleteWindow('${window.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        container.appendChild(windowDiv);
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

window.editWindow = function(id) {
    const window = currentProject.windows.find(w => w.id === id);
    if (!window) return;

    editingWindowId = id;
    document.getElementById('windowType').value = window.type || '';
    document.getElementById('windowFloor').value = window.floor || '';
    document.getElementById('windowLargeurMax').value = window.largeurMax || '';
    document.getElementById('windowLargeurMaxMinor').value = window.largeurMaxMinor || '';
    document.getElementById('windowLargeurMaxUnit').value = window.largeurMaxUnit || 'ft-in';
    document.getElementById('windowHauteurMax').value = window.hauteurMax || '';
    document.getElementById('windowHauteurMaxMinor').value = window.hauteurMaxMinor || '';
    document.getElementById('windowHauteurMaxUnit').value = window.hauteurMaxUnit || 'ft-in';

    showForm('windowForm');
};

window.deleteWindow = async function(id) {
    if (!confirm('Are you sure you want to delete this window?')) return;

    currentProject.windows = currentProject.windows.filter(w => w.id !== id);
    await saveProject();
    displayWindowList();
};

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

        console.log('âœ… Project saved');
    } catch (error) {
        console.error('âŒ Error saving project:', error);
        alert('Error saving project: ' + error.message);
    }
}