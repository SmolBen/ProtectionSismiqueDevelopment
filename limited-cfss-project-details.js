// Limited CFSS Project Details Page JavaScript
const apiUrl = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects';

let authHelper;
let currentProject = null;
let editingEquipmentId = null;
let editingParapetId = null;
let editingWindowId = null;

// Options data for the option list tab
const optionsData = {
    'lisse-trouee': [
        { id: 'lt-1', name: 'Lisse trouée - Standard', description: 'Configuration standard' },
        { id: 'lt-2', name: 'Lisse trouée - Renforcée', description: 'Configuration renforcée' }
    ],
    'double-lisse': [
        { id: 'dl-1', name: 'Double lisse - Type A', description: 'Type A standard' },
        { id: 'dl-2', name: 'Double lisse - Type B', description: 'Type B renforcé' }
    ],
    'assemblage': [
        { id: 'as-1', name: 'Vis #10 x 3/4"', description: 'Assemblage standard' },
        { id: 'as-2', name: 'Vis #10 x 1"', description: 'Assemblage renforcé' }
    ],
    'clip-deflexion': [
        { id: 'cd-1', name: 'Clip standard', description: 'Déflexion standard' },
        { id: 'cd-2', name: 'Clip renforcé', description: 'Déflexion importante' }
    ],
    'ancrage-beton': [
        { id: 'ab-1', name: 'Ancrage 3/8"', description: 'Béton standard' },
        { id: 'ab-2', name: 'Ancrage 1/2"', description: 'Béton haute résistance' }
    ],
    'ancrage-acier': [
        { id: 'aa-1', name: 'Boulon 3/8"', description: 'Acier standard' },
        { id: 'aa-2', name: 'Boulon 1/2"', description: 'Acier haute résistance' }
    ]
};

window.addEventListener('load', async function() {
    console.log('📄 Limited CFSS Project Details page loaded');
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

        console.log('✅ Limited CFSS Project Details initialized');

    } catch (error) {
        console.error('❌ Error initializing:', error);
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
        console.error('❌ Error loading project:', error);
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
    // Status change
    document.getElementById('projectStatusDropdown').addEventListener('change', async (e) => {
        currentProject.status = e.target.value;
        await saveProject();
    });

    // Add Wall button
    document.getElementById('newCalculationButton').addEventListener('click', () => {
        showForm('equipmentForm');
        editingEquipmentId = null;
        document.getElementById('equipmentFormElement').reset();
    });

    // Add Parapet button
    document.getElementById('addParapetButton').addEventListener('click', () => {
        showForm('parapetForm');
        editingParapetId = null;
        document.getElementById('parapetFormElement').reset();
    });

    // Add Window button
    document.getElementById('addWindowButton').addEventListener('click', () => {
        showForm('windowForm');
        editingWindowId = null;
        document.getElementById('windowFormElement').reset();
    });

    // Cancel buttons
    document.getElementById('cancelWall').addEventListener('click', () => hideForm('equipmentForm'));
    document.getElementById('cancelParapet').addEventListener('click', () => hideForm('parapetForm'));
    document.getElementById('cancelWindow').addEventListener('click', () => hideForm('windowForm'));

    // Form submissions
    document.getElementById('equipmentFormElement').addEventListener('submit', handleWallSubmit);
    document.getElementById('parapetFormElement').addEventListener('submit', handleParapetSubmit);
    document.getElementById('windowFormElement').addEventListener('submit', handleWindowSubmit);
}

function showForm(formId) {
    // Hide all forms first
    document.getElementById('equipmentForm').style.display = 'none';
    document.getElementById('parapetForm').style.display = 'none';
    document.getElementById('windowForm').style.display = 'none';
    
    // Show requested form
    document.getElementById(formId).style.display = 'block';
}

function hideForm(formId) {
    document.getElementById(formId).style.display = 'none';
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
        });
    });
}

// Options system
function initializeOptionsSystem() {
    Object.keys(optionsData).forEach(category => {
        const container = document.getElementById(`${category}-options`);
        if (!container) return;

        container.innerHTML = '';
        optionsData[category].forEach(option => {
            const isSelected = currentProject.options && currentProject.options.includes(option.id);
            const optionDiv = document.createElement('div');
            optionDiv.className = `option-item ${isSelected ? 'selected' : ''}`;
            optionDiv.innerHTML = `
                <input type="checkbox" id="${option.id}" ${isSelected ? 'checked' : ''}>
                <label for="${option.id}">
                    <strong>${option.name}</strong>
                    <span>${option.description}</span>
                </label>
            `;
            
            optionDiv.addEventListener('click', () => toggleOption(option.id, optionDiv));
            container.appendChild(optionDiv);
        });
    });

    updateSelectionSummary();
}

async function toggleOption(optionId, element) {
    const checkbox = element.querySelector('input[type="checkbox"]');
    checkbox.checked = !checkbox.checked;
    element.classList.toggle('selected', checkbox.checked);

    // Update project options
    if (!currentProject.options) currentProject.options = [];
    
    if (checkbox.checked) {
        if (!currentProject.options.includes(optionId)) {
            currentProject.options.push(optionId);
        }
    } else {
        currentProject.options = currentProject.options.filter(id => id !== optionId);
    }

    updateSelectionSummary();
    await saveProject();
}

function updateSelectionSummary() {
    const count = currentProject.options ? currentProject.options.length : 0;
    const summary = document.getElementById('selectionSummary');
    if (summary) {
        summary.innerHTML = `<i class="fas fa-check-circle"></i> ${count} options selected`;
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

        console.log('✅ Project saved');
    } catch (error) {
        console.error('❌ Error saving project:', error);
        alert('Error saving project: ' + error.message);
    }
}