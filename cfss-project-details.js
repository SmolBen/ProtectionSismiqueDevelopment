// CFSS Project Details Page JavaScript
let currentProjectId = null;
let projectEquipment = []; // For CFSS, this will store walls
let currentUser = null;
let isAdmin = false;
let projectData = null;
let cfssWindData = []; // Store wind data
let storeyCounter = 0; // Counter for storey labels (RDC, NV1, NV2...)

// Global state for floor selection
let selectedFloorIndices = new Set();

// Soffite state
let editingSoffiteId = null;
window.currentSoffiteImages = [];

// Files state
let currentUploadMode = 'file'; // 'file' or 'link'

/**
 * Parse various inch formats: 3.5, 3/4, 9 3/4
 * Returns decimal value or null if invalid
 */
function parseInchInput(value) {
    if (!value || value.trim() === '') return null;
    
    value = value.trim();
    
    // Check for mixed number format: "9 3/4"
    const mixedMatch = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixedMatch) {
        const whole = parseFloat(mixedMatch[1]);
        const numerator = parseFloat(mixedMatch[2]);
        const denominator = parseFloat(mixedMatch[3]);
        if (denominator === 0) return null;
        return whole + (numerator / denominator);
    }
    
    // Check for simple fraction: "3/4"
    const fractionMatch = value.match(/^(\d+)\/(\d+)$/);
    if (fractionMatch) {
        const numerator = parseFloat(fractionMatch[1]);
        const denominator = parseFloat(fractionMatch[2]);
        if (denominator === 0) return null;
        return numerator / denominator;
    }
    
    // Check for decimal: "3.5"
    const decimal = parseFloat(value);
    if (!isNaN(decimal) && decimal >= 0) {
        return decimal;
    }
    
    return null;
}

/**
 * Toggle visibility of minor field based on unit selection
 * When mm or m-mm is selected, hide the minor field
 */
function toggleMinorField(fieldPrefix) {
    // Handle both formats: "windowLargeur" and "windowL1"
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

/**
 * Toggle visibility of minor field in edit forms
 */
function toggleEditMinorField(index, fieldType) {
    const unitSelect = document.getElementById(`edit${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)}MaxUnit${index}`);
    const minorInput = document.getElementById(`edit${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)}MaxMinor${index}`);
    
    if (!unitSelect || !minorInput) return;
    
    if (unitSelect.value === 'mm' || unitSelect.value === 'm-mm') {
        minorInput.style.display = 'none';
        minorInput.value = '';
    } else {
        minorInput.style.display = '';
    }
}

/**
 * Toggle visibility of minor field in edit window forms
 */
function toggleEditWindowMinorField(windowId, fieldType) {
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
        minorInput.style.display = '';
    }
}

// Helper function to find which group a floor belongs to
function findGroupForFloor(floorGroups, floorIndex) {
    if (!floorGroups) return null;
    
    for (const group of floorGroups) {
        if (floorIndex >= group.firstIndex && floorIndex <= group.lastIndex) {
            return group;
        }
    }
    return null;
}

// Helper function to check if floors are consecutive
function areFloorsConsecutive(indices) {
    if (indices.length === 0) return false;
    const sorted = [...indices].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i-1] + 1) {
            return false;
        }
    }
    return true;
}

// Initialize floor grouping event listeners
function initializeFloorGrouping() {
    const contentDiv = document.getElementById('cfssDataContent');
    if (!contentDiv) return;
    
    // Clear selection state when initializing
    selectedFloorIndices.clear();
    
    // Remove any existing listeners to prevent duplicates
    const oldListener = contentDiv._floorGroupingListener;
    if (oldListener) {
        contentDiv.removeEventListener('click', oldListener);
        document.removeEventListener('keydown', contentDiv._keydownListener);
    }
    
    // Create new listener functions
    const clickListener = function(e) {
    // Check if clicked on arrow (for ungrouping)
    const arrow = e.target.closest('.group-arrow');
    if (arrow) {
        const floorIndex = parseInt(arrow.getAttribute('data-floor-index'));
        if (!projectData || !projectData.cfssWindData) return;
        const groupInfo = findGroupForFloor(projectData.cfssWindData.floorGroups, floorIndex);
        if (groupInfo) {
            ungroupFloors(groupInfo);
        }
        return;
    }
    
    // Check if clicked on a floor row (for selection)
    const floorRow = e.target.closest('.floor-row');
    if (!floorRow) return;
    
    // Don't allow selection of already grouped floors
    if (floorRow.classList.contains('grouped-floor')) {
        return;
    }
    
    const floorIndex = parseInt(floorRow.getAttribute('data-floor-index'));
    handleFloorClick(floorIndex);
};
    
    const keydownListener = function(e) {
        if (e.key === 'Enter' && selectedFloorIndices.size > 0) {
            e.preventDefault();
            groupSelectedFloors();
        }
    };
    
    // Store listeners for cleanup
    contentDiv._floorGroupingListener = clickListener;
    contentDiv._keydownListener = keydownListener;
    
    // Attach listeners
    contentDiv.addEventListener('click', clickListener);
    document.addEventListener('keydown', keydownListener);
}

// Handle clicking on a floor name
function handleFloorClick(floorIndex) {
    // CHANGED: Always get fresh data from projectData
    if (!projectData || !projectData.cfssWindData || !projectData.cfssWindData.storeys) return;
    
    const cfssData = projectData.cfssWindData;
    
    // Check if this floor is already in a group
    const groupInfo = findGroupForFloor(cfssData.floorGroups, floorIndex);
    
    if (groupInfo) {
    // Grouped floors can't be selected - only ungrouped via arrow clicks
    return;
}
    
    // Toggle selection
    if (selectedFloorIndices.has(floorIndex)) {
        selectedFloorIndices.delete(floorIndex);
    } else {
        selectedFloorIndices.add(floorIndex);
    }
    
    updateFloorSelection();
}

// Update visual selection state
function updateFloorSelection() {
    const floorRows = document.querySelectorAll('.floor-row');
    const instruction = document.getElementById('grouping-instruction');
    const selectionCount = document.getElementById('selection-count');
    
    floorRows.forEach(row => {
        const index = parseInt(row.getAttribute('data-floor-index'));
        const isGrouped = row.classList.contains('grouped-floor');
        
        if (selectedFloorIndices.has(index)) {
            // Highlight like grouped rows (light blue with left border)
            row.style.background = '#e7f5f7';
            row.style.borderLeft = '3px solid #17a2b8';
        } else if (!isGrouped) {
            // Reset to original striped background
            const originalBg = index % 2 === 0 ? '#f8f9fa' : 'white';
            row.style.background = originalBg;
            row.style.borderLeft = '';
        }
    });
    
    // Show/hide instruction
    if (selectedFloorIndices.size > 0) {
        instruction.style.display = 'block';
        selectionCount.textContent = selectedFloorIndices.size;
    } else {
        instruction.style.display = 'none';
    }
}

// Group selected floors
async function groupSelectedFloors() {
    if (selectedFloorIndices.size < 2) {
        alert('Please select at least 2 floors to group.');
        return;
    }
    
    // CHANGED: Always get fresh data from projectData
    if (!projectData || !projectData.cfssWindData || !projectData.cfssWindData.storeys) return;
    
    const cfssData = projectData.cfssWindData;
    const indices = [...selectedFloorIndices].sort((a, b) => a - b);
    
    // Check if floors are consecutive
    if (!areFloorsConsecutive(indices)) {
        alert('Please select consecutive floors only.');
        return;
    }
    
    // Initialize floorGroups if needed
    if (!cfssData.floorGroups) {
        cfssData.floorGroups = [];
    }
    
    // Check for overlaps with existing groups
    for (const index of indices) {
        if (findGroupForFloor(cfssData.floorGroups, index)) {
            alert('One or more selected floors are already in a group. Please ungroup them first.');
            return;
        }
    }
    
    // Create new group
    const newGroup = {
        firstIndex: indices[0],
        lastIndex: indices[indices.length - 1]
    };
    
    cfssData.floorGroups.push(newGroup);
    
    // Clear selection
    selectedFloorIndices.clear();
    
    // Save to backend
    await saveCFSSDataToBackend(cfssData);
    
    // CHANGED: Refresh display using the updated data from projectData
    displayCFSSData(projectData.cfssWindData);
}

// Ungroup floors
async function ungroupFloors(groupInfo) {
    // CHANGED: Always get fresh data from projectData
    if (!projectData || !projectData.cfssWindData) return;
    
    const cfssData = projectData.cfssWindData;
    
    // Remove the group
    cfssData.floorGroups = cfssData.floorGroups.filter(g => 
        g.firstIndex !== groupInfo.firstIndex || g.lastIndex !== groupInfo.lastIndex
    );
    
    // Save to backend
    await saveCFSSDataToBackend(cfssData);
    
    // CHANGED: Refresh display using the updated data from projectData
    displayCFSSData(projectData.cfssWindData);
}

// Save CFSS data to backend
async function saveCFSSDataToBackend(cfssData) {
    try {
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/cfss-data`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                cfssWindData: cfssData
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save floor grouping');
        }
        
        // Update local project data
        projectData.cfssWindData = cfssData;
        
    } catch (error) {
        console.error('Error saving floor grouping:', error);
        alert('Failed to save floor grouping. Please try again.');
    }
}
// CFSS Wind Load Calculation - Lookup tables from Excel
const IW_VALUES = {
    'Low': { ULS: 0.8, SLS: 0.75 },
    'Normal': { ULS: 1.0, SLS: 0.75 },
    'High': { ULS: 1.15, SLS: 0.75 },
    'Post Disaster': { ULS: 1.25, SLS: 0.75 }
};

const CPI_VALUES = {
    'Category 1': { min: -0.15, max: 0 },
    'Category 2': { min: -0.45, max: 0.3 },
    'Category 3': { min: -0.7, max: 0.7 }
};
let projectRevisions = [];
let currentRevisionId = null;

let sortableInstance = null;

let projectWindows = [];

let saveInProgress = false;
let pendingSaveTimeout = null;
let lastSaveTimestamp = null;

let windowsSaveTimer = null;

let projectParapets = []; // Store parapets

let projectSoffites = []; // Store soffites

let projectFiles = []; // Store project files

// Global variable to track edit mode
let isEditingProjectDetails = false;

// Available CFSS options in logical order
const CFSS_OPTIONS = [
    // Page S-2: Lisse Trouée options
    'fixe-beton-lisse-trouee',
    'fixe-structure-dacier-lisse-trouee', 
    'fixe-tabiler-metallique-lisse-trouee',
    'fixe-bois-lisse-trouee',
    'detail-lisse-trouee',
    
    // Page S-3: Double lisse options
    'fixe-beton-double-lisse',
    'fixe-structure-dacier-double-lisse',
    'fixe-tabiler-metallique-double-lisse',
    'detail-double-lisse',
    
    // Page S-4: Lisse basse options
    'fixe-beton-lisse-basse',
    'fixe-structure-dacier-lisse-basse',
    'fixe-bois-lisse-basse',
    'detail-lisse-basse',
    'identification',
    
    // Page S-5: Parapet types 1-6
    'parapet-1',
    'parapet-2',
    'parapet-3',
    'parapet-4',
    'parapet-5',
    'parapet-6',
    
    // Page S-6: Parapet types 7-10
    'parapet-7',
    'parapet-8',
    'parapet-9',
    'parapet-10',
    
    // Page S-7: Structure detail
    'detail-structure'
];

const AUTHORIZED_SENDER_EMAILS = [
    'anhquan1212004@gmail.com',
    'hoangminhduc.ite@gmail.com'
];

const compositionBuilderCounts = {};

function createCompositionBuilder(containerId, hiddenInputId, existingValue = '') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container ${containerId} not found`);
    return;
  }

  // Initialize count for this builder
  if (!compositionBuilderCounts[containerId]) {
    compositionBuilderCounts[containerId] = 0;
  }

  // Parse existing value(s) if provided - can be single string or array
  let existingCompositions = [];
  if (existingValue) {
    if (Array.isArray(existingValue)) {
      existingCompositions = existingValue;
    } else if (typeof existingValue === 'string' && existingValue.trim()) {
      existingCompositions = [existingValue];
    }
  }

  // Clear container
  container.innerHTML = '';
  compositionBuilderCounts[containerId] = 0;

  // Add existing compositions or at least one default
  if (existingCompositions.length > 0) {
    existingCompositions.forEach(comp => {
      addCompositionItem(containerId, hiddenInputId, comp);
    });
  } else {
    addCompositionItem(containerId, hiddenInputId, '');
  }
}

// Function to initialize the edit button
function initializeProjectDetailsEditButton() {
    // Add edit button after the basic-info div
    const basicInfoDiv = document.querySelector('.basic-info');
    if (basicInfoDiv && !document.getElementById('editProjectDetailsBtn')) {
        const editButtonHTML = `
            <div style="margin-top: 15px; display: flex; gap: 10px;">
                <button id="editProjectDetailsBtn" class="edit-project-btn" onclick="toggleEditProjectDetails()">
                    <i class="fas fa-edit"></i> Edit Project Details
                </button>
            </div>
        `;
        basicInfoDiv.insertAdjacentHTML('afterend', editButtonHTML);
    }
}

// Function to toggle edit mode
async function toggleEditProjectDetails() {
    if (!canModifyProject()) {
        alert('You do not have permission to edit this project.');
        return;
    }

    const editBtn = document.getElementById('editProjectDetailsBtn');
    
    if (!isEditingProjectDetails) {
        // Switch to edit mode
        showEditForm();
        isEditingProjectDetails = true;
        editBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Edit';
        editBtn.classList.add('cancel-mode');
    } else {
        // Cancel edit mode
        hideEditForm();
        isEditingProjectDetails = false;
        editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Project Details';
        editBtn.classList.remove('cancel-mode');
    }
}

// Function to initialize Google Places Autocomplete for edit form
function initEditFormAutocomplete() {
    const address1Input = document.getElementById('edit_addressLine1');
    
    if (!address1Input) return;
    
    // Check if Google Maps is available (with retry limit)
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        // Add retry counter
        if (!window.autocompleteRetries) window.autocompleteRetries = 0;
        if (window.autocompleteRetries < 50) { // Max 5 seconds of retrying
            window.autocompleteRetries++;
            setTimeout(initEditFormAutocomplete, 100);
        } else {
            console.error('Google Maps failed to load after multiple attempts');
        }
        return;
    }
    
    // Reset retry counter on success
    window.autocompleteRetries = 0;
    
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
        document.getElementById('edit_addressLine2').value = '';
        document.getElementById('edit_city').value = '';
        document.getElementById('edit_province').value = '';
        document.getElementById('edit_country').value = 'Canada';
        
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
                document.getElementById('edit_addressLine2').value = component.long_name;
            }
            if (types.includes("locality")) {
                document.getElementById('edit_city').value = component.long_name;
            }
            if (types.includes("administrative_area_level_1")) {
                document.getElementById('edit_province').value = component.short_name;
            }
        });
    });
}

// Function to show the edit form
function showEditForm() {
    const basicInfo = document.querySelector('.basic-info');

    // Hide action buttons while editing
    hideActionButtons();
    
    // Get current values
const currentData = {
        name: document.getElementById('projectName').textContent,
        projectNumber: document.getElementById('projectNumber').textContent,
        clientName: document.getElementById('clientName').textContent,
        clientEmails: document.getElementById('clientEmails').textContent,
        description: document.getElementById('projectDescription').textContent,
        type: document.getElementById('projectType').textContent,
        status: document.getElementById('projectStatusDropdown').value,
        designedBy: (window.projectData && window.projectData.designedBy) || '',
        approvedBy: (window.projectData && window.projectData.approvedBy) || ''
    };
    
    // Get address values from project data object (not from display string)
    const addressLine1 = (window.projectData && window.projectData.addressLine1) || '';
    const addressLine2 = (window.projectData && window.projectData.addressLine2) || '';
    const city = (window.projectData && window.projectData.city) || '';
    const province = (window.projectData && window.projectData.province) || '';
    const country = (window.projectData && window.projectData.country) || 'Canada';
    
    // Create edit form
    const editFormHTML = `
        <div id="projectDetailsEditForm" class="project-edit-form">
            <div class="form-group">
                <label><strong>Project Name:</strong></label>
                <input type="text" id="edit_name" value="${currentData.name}" required>
            </div>
            
            <div class="form-group">
                <label><strong>Project Number:</strong></label>
                <input type="text" id="edit_projectNumber" value="${currentData.projectNumber}" required>
            </div>

            <div class="form-group">
                <label><strong>Client Name:</strong></label>
                <input type="text" id="edit_clientName" value="${currentData.clientName}">
            </div>
            
            <div class="form-group">
                <label><strong>Client Email(s):</strong></label>
                <input type="text" id="edit_clientEmails" value="${currentData.clientEmails}" required>
                <small style="display: block; margin-top: 5px; color: #666;">Separate multiple emails with commas</small>
            </div>
            
            <div class="form-group">
                <label><strong>Description:</strong></label>
                <textarea id="edit_description" rows="3" required>${currentData.description}</textarea>
            </div>
            
            <div class="form-group">
                <label><strong>Type:</strong></label>
                <select id="edit_type" required>
                    <option value="condo" ${currentData.type === 'condo' ? 'selected' : ''}>Condo</option>
                    <option value="commercial" ${currentData.type === 'commercial' ? 'selected' : ''}>Commercial</option>
                    <option value="residential" ${currentData.type === 'residential' ? 'selected' : ''}>Residential</option>
                    <option value="industrial" ${currentData.type === 'industrial' ? 'selected' : ''}>Industrial</option>
                    <option value="hospital" ${currentData.type === 'hospital' ? 'selected' : ''}>Hospital</option>
                    <option value="fire-station" ${currentData.type === 'fire-station' ? 'selected' : ''}>Fire-station</option>
                    <option value="government" ${currentData.type === 'government' ? 'selected' : ''}>Government</option>
                    <option value="school" ${currentData.type === 'school' ? 'selected' : ''}>School</option>
                    <option value="other" ${currentData.type === 'other' ? 'selected' : ''}>Other</option>
                </select>
            </div>
            
            <div class="form-group">
                <label><strong>Status:</strong></label>
                <select id="edit_status" required>
                    <option value="Planning" ${currentData.status === 'Planning' ? 'selected' : ''}>Planning</option>
                    <option value="In Progress" ${currentData.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="Completed" ${currentData.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
            
            <div class="form-group">
                <label><strong>Address Line 1:</strong></label>
                <input type="text" id="edit_addressLine1" value="${addressLine1}" required>
            </div>
            
            <div class="form-group">
                <label><strong>Address Line 2:</strong></label>
                <input type="text" id="edit_addressLine2" value="${addressLine2}">
            </div>
            
            <div class="form-group">
                <label><strong>City:</strong></label>
                <input type="text" id="edit_city" value="${city}" required>
            </div>
            
            <div class="form-group">
                <label><strong>Province:</strong></label>
                <input type="text" id="edit_province" value="${province}" required>
            </div>
            
            <div class="form-group">
                <label><strong>Country:</strong></label>
                <input type="text" id="edit_country" value="${country}" required>
            </div>

            <div class="form-group">
                <label><strong>Designed by:</strong></label>
                <input type="text" id="edit_designedBy" value="${currentData.designedBy}">
            </div>
            
            <div class="form-group">
                <label><strong>Approved by:</strong></label>
                <input type="text" id="edit_approvedBy" value="${currentData.approvedBy}">
            </div>
            
            <div class="form-actions" style="margin-top: 20px; display: flex; gap: 10px;">
                <button onclick="saveProjectDetails()" class="save-btn">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button onclick="toggleEditProjectDetails()" class="cancel-btn">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    
    // Hide the display view and show edit form
    basicInfo.style.display = 'none';
    basicInfo.insertAdjacentHTML('afterend', editFormHTML);

    // Initialize Google Places Autocomplete for the edit form
    initEditFormAutocomplete();
}

// Helper function to hide action buttons
function hideActionButtons() {
    const buttons = [
        document.querySelector('.cfss-btn'), // Edit CFSS Data button
        document.getElementById('newCalculationButton'), // Add Wall button
        document.getElementById('addParapetButton'), // Add Parapet button
        document.getElementById('addWindowButton') // Add Window button
    ];
    
    buttons.forEach(btn => {
        if (btn) {
            btn.style.display = 'none';
        }
    });
}

// Helper function to show action buttons
function showActionButtons() {
    const buttons = [
        document.querySelector('.cfss-btn'),
        document.getElementById('newCalculationButton'),
        document.getElementById('addParapetButton'),
        document.getElementById('addWindowButton')
    ];
    
    buttons.forEach(btn => {
        if (btn) {
            btn.style.display = '';
        }
    });
}

// Function to hide the edit form
function hideEditForm() {
    const editForm = document.getElementById('projectDetailsEditForm');
    const basicInfo = document.querySelector('.basic-info');
    
    if (editForm) {
        editForm.remove();
    }
    
    if (basicInfo) {
        basicInfo.style.display = 'block';
    }

    // Show action buttons again
    showActionButtons();
}

// Function to save the edited project details
async function saveProjectDetails() {
    try {
        // Get values from form
        const updatedData = {
            id: currentProjectId,
            name: document.getElementById('edit_name').value.trim(),
            projectNumber: document.getElementById('edit_projectNumber').value.trim(),
            clientName: document.getElementById('edit_clientName').value.trim(),
            clientEmails: document.getElementById('edit_clientEmails').value.trim(),
            description: document.getElementById('edit_description').value.trim(),
            type: document.getElementById('edit_type').value,
            status: document.getElementById('edit_status').value,
            addressLine1: document.getElementById('edit_addressLine1').value.trim(),
            addressLine2: document.getElementById('edit_addressLine2').value.trim(),
            city: document.getElementById('edit_city').value.trim(),
            province: document.getElementById('edit_province').value.trim(),
            country: document.getElementById('edit_country').value.trim(),
            designedBy: document.getElementById('edit_designedBy').value.trim(),
            approvedBy: document.getElementById('edit_approvedBy').value.trim()
        };
        
        // Validate required fields
        if (!updatedData.name || !updatedData.projectNumber || !updatedData.clientEmails || 
            !updatedData.description || !updatedData.addressLine1 || !updatedData.city || 
            !updatedData.province || !updatedData.country) {
            alert('Please fill in all required fields.');
            return;
        }
        
        console.log('ðŸ’¾ Saving updated project details:', updatedData);
        
        // Show loading state
        const saveBtn = document.querySelector('.save-btn');
        const originalText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        // Send update request
        const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updatedData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('âœ… Project details updated successfully:', result);
        
        // Update the display with new values
        document.getElementById('projectName').textContent = updatedData.name;
        document.getElementById('projectNumber').textContent = updatedData.projectNumber;
        document.getElementById('clientName').textContent = updatedData.clientName;
        document.getElementById('clientEmails').textContent = updatedData.clientEmails;
        document.getElementById('projectDescription').textContent = updatedData.description;
        document.getElementById('projectType').textContent = updatedData.type;
        document.getElementById('projectStatusDropdown').value = updatedData.status;
        
        // Update address display
        const addressParts = [
            updatedData.addressLine1,
            updatedData.addressLine2,
            updatedData.city,
            updatedData.province,
            updatedData.country
        ].filter(Boolean);
        document.getElementById('projectAddress').textContent = addressParts.join(', ');
        document.getElementById('projectDesignedBy').textContent = updatedData.designedBy || 'N/A';
        document.getElementById('projectApprovedBy').textContent = updatedData.approvedBy || 'N/A';
        
        // Update global project data
        if (window.projectData) {
            window.projectData = { ...window.projectData, ...updatedData };
        }
        
        // Exit edit mode
        hideEditForm();
        isEditingProjectDetails = false;
        const editBtn = document.getElementById('editProjectDetailsBtn');
        editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Project Details';
        editBtn.classList.remove('cancel-mode');
        
        alert('Project details updated successfully!');

        // Reload project data from server to ensure fresh data
        await reloadProjectData();
        
    } catch (error) {
        console.error('âŒ Error saving project details:', error);
        alert('Error saving project details: ' + error.message);
        
        // Reset button
        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        }
    }
}

function addCompositionItem(containerId, hiddenInputId, existingValue = '') {
  const MAX_COMPOSITIONS = 5;
  
  if (compositionBuilderCounts[containerId] >= MAX_COMPOSITIONS) {
    alert(`Maximum ${MAX_COMPOSITIONS} compositions reached`);
    return;
  }

  const container = document.getElementById(containerId);
  const isFirst = compositionBuilderCounts[containerId] === 0;
  const itemId = `${containerId}_item_${Date.now()}_${Math.random()}`;

  // Parse existing value
  let defaultQuantity = '1';
  let defaultSize = '162';
  let defaultType = 'S';
  let defaultDimension = '125';
  let defaultVariant = '18';

  if (existingValue) {
    const match = existingValue.match(/(\d+)x\s*(\d+)([A-Z])(\d+)-(\d+)/);
    if (match) {
      defaultQuantity = match[1];
      defaultSize = match[2];
      defaultType = match[3] === 'U' ? 'T' : match[3];
      defaultDimension = match[4];
      defaultVariant = match[5];
    }
  }

  if (!['S', 'T'].includes(defaultType)) {
    defaultType = 'S';
  }

  const compositionItem = document.createElement('div');
  compositionItem.className = 'composition-item';
  compositionItem.id = itemId;
  // FIXED: Changed align-items from 'center' to 'flex-start' to prevent layout shift
  compositionItem.style.cssText = 'display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px;';

  // FIXED: Wrapped selects in a container with fixed height to prevent shifting
  compositionItem.innerHTML = `
    <div style="display: flex; gap: 6px; align-items: center; flex: 1; flex-wrap: nowrap; min-height: 38px;">
      <select style="width: 60px; padding: 6px 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 13px;" onchange="updateAllCompositions('${containerId}', '${hiddenInputId}')">
        <option value="1" ${defaultQuantity === '1' ? 'selected' : ''}>1</option>
        <option value="2" ${defaultQuantity === '2' ? 'selected' : ''}>2</option>
        <option value="3" ${defaultQuantity === '3' ? 'selected' : ''}>3</option>
        <option value="4" ${defaultQuantity === '4' ? 'selected' : ''}>4</option>
        <option value="5" ${defaultQuantity === '5' ? 'selected' : ''}>5</option>
      </select>
      
      <span style="color: #666; font-weight: 500;">x</span>
      
      <select style="width: 75px; padding: 6px 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 13px;" onchange="updateAllCompositions('${containerId}', '${hiddenInputId}')">
        <option value="162" ${defaultSize === '162' ? 'selected' : ''}>162</option>
        <option value="212" ${defaultSize === '212' ? 'selected' : ''}>212</option>
        <option value="250" ${defaultSize === '250' ? 'selected' : ''}>250</option>
        <option value="300" ${defaultSize === '300' ? 'selected' : ''}>300</option>
        <option value="350" ${defaultSize === '350' ? 'selected' : ''}>350</option>
        <option value="362" ${defaultSize === '362' ? 'selected' : ''}>362</option>
        <option value="400" ${defaultSize === '400' ? 'selected' : ''}>400</option>
        <option value="600" ${defaultSize === '600' ? 'selected' : ''}>600</option>
        <option value="800" ${defaultSize === '800' ? 'selected' : ''}>800</option>
        <option value="1000" ${defaultSize === '1000' ? 'selected' : ''}>1000</option>
      </select>
      
    <select data-item-id="${itemId}" data-role="type-selector" style="width: 55px; padding: 6px 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 13px;" onchange="updateDimensionOptions('${itemId}'); updateAllCompositions('${containerId}', '${hiddenInputId}')">
        <option value="S" ${defaultType === 'S' ? 'selected' : ''}>S</option>
        <option value="T" ${defaultType === 'T' ? 'selected' : ''}>T</option>
      </select>
      
      <select data-item-id="${itemId}" data-role="dimension-selector" style="width: 70px; padding: 6px 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 13px;" onchange="updateAllCompositions('${containerId}', '${hiddenInputId}')">
        ${getDimensionOptions(defaultType, defaultDimension)}
      </select>
    
    <span style="color: #666; font-weight: 500;">-</span>
    
    <select style="width: 60px; padding: 6px 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 13px;" onchange="updateAllCompositions('${containerId}', '${hiddenInputId}')">
        <option value="18" ${defaultVariant === '18' ? 'selected' : ''}>18</option>
        <option value="33" ${defaultVariant === '33' ? 'selected' : ''}>33</option>
        <option value="34" ${defaultVariant === '34' ? 'selected' : ''}>34</option>
        <option value="43" ${defaultVariant === '43' ? 'selected' : ''}>43</option>
        <option value="54" ${defaultVariant === '54' ? 'selected' : ''}>54</option>
        <option value="68" ${defaultVariant === '68' ? 'selected' : ''}>68</option>
        <option value="97" ${defaultVariant === '97' ? 'selected' : ''}>97</option>
      </select>
    </div>
    
    ${isFirst ? `
      <button type="button" class="button primary" style="padding: 6px 12px; font-size: 13px; display: flex; align-items: center; gap: 6px; flex-shrink: 0;" 
              onclick="addCompositionItem('${containerId}', '${hiddenInputId}')" 
              id="${containerId}_addBtn">
        <i class="fas fa-plus"></i> Add
      </button>
    ` : `
      <button type="button" class="button secondary" style="padding: 6px 10px; font-size: 12px; flex-shrink: 0;" 
              onclick="deleteCompositionItem('${itemId}', '${containerId}', '${hiddenInputId}')">
        <i class="fas fa-trash"></i>
      </button>
    `}
  `;

  container.appendChild(compositionItem);
  compositionBuilderCounts[containerId]++;
  
  updateAllCompositions(containerId, hiddenInputId);
  updateAddButton(containerId);
}

// Get dimension options based on type (S or T)
function getDimensionOptions(type, selectedValue) {
  const optionsMap = {
    'S': ['125', '162', '200', '250', '300', '350'],
    'T': ['125', '150', '200', '250', '300']
  };
  
  const options = optionsMap[type] || optionsMap['S'];
  
  return options.map(val => 
    `<option value="${val}" ${val === selectedValue ? 'selected' : ''}>${val}</option>`
  ).join('');
}

// Update dimension dropdown when type (S/T) changes
function updateDimensionOptions(itemId) {
  const typeSelector = document.querySelector(`[data-item-id="${itemId}"][data-role="type-selector"]`);
  const dimensionSelector = document.querySelector(`[data-item-id="${itemId}"][data-role="dimension-selector"]`);
  
  if (!typeSelector || !dimensionSelector) return;
  
  const selectedType = typeSelector.value;
  const currentValue = dimensionSelector.value;
  
  // Get new options
  const optionsMap = {
    'S': ['125', '162', '200', '250', '300', '350'],
    'T': ['125', '150', '200', '250', '300']
  };
  
  const newOptions = optionsMap[selectedType] || optionsMap['S'];
  
  // Check if current value is valid for new type, otherwise default to first option
  const newValue = newOptions.includes(currentValue) ? currentValue : newOptions[0];
  
  // Update options
  dimensionSelector.innerHTML = newOptions.map(val => 
    `<option value="${val}" ${val === newValue ? 'selected' : ''}>${val}</option>`
  ).join('');
}

function deleteCompositionItem(itemId, containerId, hiddenInputId) {
  if (compositionBuilderCounts[containerId] <= 1) {
    alert('You must have at least one composition');
    return;
  }

  const element = document.getElementById(itemId);
  if (element) {
    element.remove();
    compositionBuilderCounts[containerId]--;
    updateAllCompositions(containerId, hiddenInputId);
    updateAddButton(containerId);
  }
}

function updateAddButton(containerId) {
  const MAX_COMPOSITIONS = 5;
  const btn = document.getElementById(`${containerId}_addBtn`);
  if (!btn) return;

  if (compositionBuilderCounts[containerId] >= MAX_COMPOSITIONS) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-check"></i> Max (${MAX_COMPOSITIONS})`;
    btn.style.opacity = '0.6';
    btn.style.cursor = 'not-allowed';
  } else {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-plus"></i> Add`;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }
}

function updateAllCompositions(containerId, hiddenInputId) {
  const container = document.getElementById(containerId);
  const hiddenInput = document.getElementById(hiddenInputId);
  
  if (!container || !hiddenInput) return;

  const items = container.querySelectorAll('.composition-item');
  const compositions = [];

  items.forEach(item => {
    const selects = item.querySelectorAll('select');
    if (selects.length >= 5) {
      const quantity = selects[0].value;
      const size = selects[1].value;
      const type = selects[2].value;
      const dimension = selects[3].value;
      const variant = selects[4].value;
      
      compositions.push(`${quantity}x ${size}${type}${dimension}-${variant}`);
    }
  });

  // Store as JSON array
  hiddenInput.value = JSON.stringify(compositions);
}

// Helper: enable/disable EDIT composition builders when type is N/A
function setEditCompositionDisabled(windowId, section, value) {
  const isNA = value === 'N/A' || value === 'NA' || value === '#';
  let builderId, hiddenId;

  switch (section) {
    case 'jambage':
      builderId = `editJambageCompositionBuilder${windowId}`;
      hiddenId  = `editJambageComposition${windowId}`;
      break;
    case 'linteau':
      builderId = `editLinteauCompositionBuilder${windowId}`;
      hiddenId  = `editLinteauComposition${windowId}`;
      break;
    case 'seuil':
      builderId = `editSeuilCompositionBuilder${windowId}`;
      hiddenId  = `editSeuilComposition${windowId}`;
      break;
    default:
      return;
  }

  const builder   = document.getElementById(builderId);
  const hidden    = document.getElementById(hiddenId);
  if (!builder || !hidden) return;

  const selects   = builder.querySelectorAll('select');
  const addButton = document.getElementById(`${builderId}_addBtn`);

  if (isNA) {
    builder.style.opacity = '0.5';
    builder.style.pointerEvents = 'none';

    selects.forEach(sel => {
      sel.disabled = true;
      sel.value = '';
    });

    if (addButton) {
      addButton.disabled = true;
      addButton.style.opacity = '0.5';
      addButton.style.cursor = 'not-allowed';
    }

    // N/A â‡’ empty composition list
    hidden.value = '[]';
  } else {
    builder.style.opacity = '';
    builder.style.pointerEvents = '';

    selects.forEach(sel => {
      sel.disabled = false;
    });

    if (addButton) {
      addButton.disabled = false;
      addButton.style.opacity = '';
      addButton.style.cursor = '';
    }

    // Recompute composition JSON based on current UI state
    updateAllCompositions(builderId, hiddenId);
  }
}

// Helper: for EDIT form, update image preview + disabled state
function handleEditTypeChange(windowId, section, value) {
  const cap = section.charAt(0).toUpperCase() + section.slice(1); // jambage -> Jambage
  // Only update preview for the image-preview based edit UI
  updateTypeImage(`edit${cap}${windowId}`, value);
  setEditCompositionDisabled(windowId, section, value);
}

// Replace the React-based initialization functions with these simpler ones
function initializeCompositionBuilders() {
  // Initialize composition builders for new window form
  createCompositionBuilder('jambageCompositionBuilder', 'jambageComposition');
  createCompositionBuilder('linteauCompositionBuilder', 'linteauComposition');
  createCompositionBuilder('seuilCompositionBuilder', 'seuilComposition');
}

function initializeEditCompositionBuilders(windowId, window) {
  setTimeout(() => {
    // Jambage
    if (window.jambage?.compositions) {
      createCompositionBuilder(
        `editJambageCompositionBuilder${windowId}`, 
        `editJambageComposition${windowId}`,
        window.jambage.compositions
      );
    } else if (window.jambage?.composition) {
      createCompositionBuilder(
        `editJambageCompositionBuilder${windowId}`, 
        `editJambageComposition${windowId}`,
        [window.jambage.composition]
      );
    } else {
      createCompositionBuilder(
        `editJambageCompositionBuilder${windowId}`, 
        `editJambageComposition${windowId}`
      );
    }

    // Linteau
    if (window.linteau?.compositions) {
      createCompositionBuilder(
        `editLinteauCompositionBuilder${windowId}`, 
        `editLinteauComposition${windowId}`,
        window.linteau.compositions
      );
    } else if (window.linteau?.composition) {
      createCompositionBuilder(
        `editLinteauCompositionBuilder${windowId}`, 
        `editLinteauComposition${windowId}`,
        [window.linteau.composition]
      );
    } else {
      createCompositionBuilder(
        `editLinteauCompositionBuilder${windowId}`, 
        `editLinteauComposition${windowId}`
      );
    }

    // Seuil
    if (window.seuil?.compositions) {
      createCompositionBuilder(
        `editSeuilCompositionBuilder${windowId}`, 
        `editSeuilComposition${windowId}`,
        window.seuil.compositions
      );
    } else if (window.seuil?.composition) {
      createCompositionBuilder(
        `editSeuilCompositionBuilder${windowId}`, 
        `editSeuilComposition${windowId}`,
        [window.seuil.composition]
      );
    } else {
      createCompositionBuilder(
        `editSeuilCompositionBuilder${windowId}`, 
        `editSeuilComposition${windowId}`
      );
    }

    // Apply disabled state for any types already set to N/A
    if (window.jambage?.type) {
      setEditCompositionDisabled(windowId, 'jambage', window.jambage.type);
    }
    if (window.linteau?.type) {
      setEditCompositionDisabled(windowId, 'linteau', window.linteau.type);
    }
    if (window.seuil?.type) {
      setEditCompositionDisabled(windowId, 'seuil', window.seuil.type);
    }
  }, 100);
}

// Modified section for Jambage in edit form:
function getJambageEditSection(window) {
  return `
    <div style="border-top: 1px solid #e9ecef; margin: 15px 0 10px 0; padding-top: 12px;">
        <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 10px;">
            <div class="form-group" style="margin-bottom: 0; width: 180px;">
                <label for="editJambageType${window.id}">Jambage Type</label>
            <div class="type-selection-row">
                <select id="editJambageType${window.id}" required onchange="handleEditTypeChange(${window.id}, 'jambage', this.value)" style="width: 72px;">
                <option value="">Select Jambage Type</option>
                <option value="JA1" ${window.jambage?.type === 'JA1' ? 'selected' : ''}>JA1</option>
                <option value="JA2a" ${window.jambage?.type === 'JA2a' ? 'selected' : ''}>JA2a</option>
                <option value="JA2b" ${window.jambage?.type === 'JA2b' ? 'selected' : ''}>JA2b</option>
                <option value="JA3a" ${window.jambage?.type === 'JA3a' ? 'selected' : ''}>JA3a</option>
                <option value="JA4a" ${window.jambage?.type === 'JA4a' ? 'selected' : ''}>JA4a</option>
                <option value="NA" ${window.jambage?.type === 'NA' ? 'selected' : ''}>N/A</option>
                </select>
            <div id="editJambage${window.id}ImagePreview" class="type-image-preview ${window.jambage?.type ? '' : 'empty'}">
              ${window.jambage?.type ? `<img src="https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/jambage-${window.jambage.type}.png" alt="${window.jambage.type}" onerror="handleImageError(this, '${window.jambage.type}')">` : 'Select a type'}
            </div>
          </div>
        </div>
        <div class="form-group" style="width: 250px;">
          <label for="editJambageComposition${window.id}">Jambage Composition</label>
          <div id="editJambageCompositionBuilder${window.id}"></div>
          <input type="hidden" id="editJambageComposition${window.id}" value="${window.jambage?.composition || ''}">
        </div>
      </div>
    </div>
  `;
}

// Modified section for Linteau in edit form:
function getLinteauEditSection(window) {
  return `
    <div style="border-top: 1px solid #e9ecef; margin: 15px 0 10px 0; padding-top: 12px;">
        <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 10px;">
            <div class="form-group" style="margin-bottom: 0; width: 180px;">
          <label for="editLinteauType${window.id}">Linteau Type</label>
          <div class="type-selection-row">
            <select id="editLinteauType${window.id}" required onchange="updateTypeImage('editLinteau${window.id}', this.value)" style="width: 72px;">
              <option value="">Select Linteau Type</option>
              <option value="LT1" ${window.linteau?.type === 'LT1' ? 'selected' : ''}>LT1</option>
              <option value="LT2" ${window.linteau?.type === 'LT2' ? 'selected' : ''}>LT2</option>
              <option value="LT3" ${window.linteau?.type === 'LT3' ? 'selected' : ''}>LT3</option>
              <option value="LT4" ${window.linteau?.type === 'LT4' ? 'selected' : ''}>LT4</option>
              <option value="LT5" ${window.linteau?.type === 'LT5' ? 'selected' : ''}>LT5</option>
              <option value="NA" ${window.linteau?.type === 'NA' ? 'selected' : ''}>N/A</option>
            </select>
            <div id="editLinteau${window.id}ImagePreview" class="type-image-preview ${window.linteau?.type ? '' : 'empty'}">
              ${window.linteau?.type ? `<img src="https://s3.amazonaws.com/protection-sismique-equipment-images/linteau/${window.linteau.type}.png" alt="${window.linteau.type}" onerror="handleImageError(this, '${window.linteau.type}')">` : 'Select a type'}
            </div>
          </div>
        </div>
        <div class="form-group" style="width: 250px;">
          <label for="editLinteauComposition${window.id}">Linteau Composition</label>
          <div id="editLinteauCompositionBuilder${window.id}"></div>
          <input type="hidden" id="editLinteauComposition${window.id}" value="${window.linteau?.composition || ''}">
        </div>
      </div>
    </div>
  `;
}

// Modified section for Seuil in edit form:
function getSeuilEditSection(window) {
  return `
    <div style="border-top: 1px solid #e9ecef; margin: 15px 0 10px 0; padding-top: 12px;">
        <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 10px;">
            <div class="form-group" style="margin-bottom: 0; width: 180px;">
          <label for="editSeuilType${window.id}">Seuil Type</label>
          <div class="type-selection-row">
            <select id="editSeuilType${window.id}" required onchange="updateTypeImage('editSeuil${window.id}', this.value)" style="width: 70px;">
              <option value="">Select Seuil Type</option>
              <option value="SE1" ${window.seuil?.type === 'SE1' ? 'selected' : ''}>SE1</option>
              <option value="SE2" ${window.seuil?.type === 'SE2' ? 'selected' : ''}>SE2</option>
              <option value="SE3" ${window.seuil?.type === 'SE3' ? 'selected' : ''}>SE3</option>
              <option value="SE4" ${window.seuil?.type === 'SE4' ? 'selected' : ''}>SE4</option>
              <option value="SE5" ${window.seuil?.type === 'SE5' ? 'selected' : ''}>SE5</option>
              <option value="NA" ${window.seuil?.type === 'NA' ? 'selected' : ''}>N/A</option>
            </select>
            <div id="editSeuil${window.id}ImagePreview" class="type-image-preview ${window.seuil?.type ? '' : 'empty'}">
              ${window.seuil?.type ? `<img src="https://s3.amazonaws.com/protection-sismique-equipment-images/seuil/${window.seuil.type}.png" alt="${window.seuil.type}" onerror="handleImageError(this, '${window.seuil.type}')">` : 'Select a type'}
            </div>
          </div>
        </div>
        <div class="form-group" style="width: 250px;">
          <label for="editSeuilComposition${window.id}">Seuil Composition</label>
          <div id="editSeuilCompositionBuilder${window.id}"></div>
          <input type="hidden" id="editSeuilComposition${window.id}" value="${window.seuil?.composition || ''}">
        </div>
      </div>
    </div>
  `;
}

window.editWindow = function(windowId) {
  if (!canModifyProject()) {
    alert('You do not have permission to edit windows in this project.');
    return;
  }

  const window = projectWindows.find(w => w.id === windowId);
  if (!window) {
    console.error('Window not found:', windowId);
    return;
  }

  console.log(`Entering edit mode for window ID: ${windowId}`, window);
  
  // Hide view mode and show edit mode
  document.getElementById(`windowView${windowId}`).style.display = 'none';
  document.getElementById(`windowEdit${windowId}`).style.display = 'block';
  
  // Initialize composition builders with existing values
  initializeEditCompositionBuilders(windowId, window);
};

// Call initialization when the page loads
document.addEventListener('DOMContentLoaded', function() {
  // Initialize composition builders for new window form
    initializeCompositionBuilders();
    initializeCustomPages();
});

function getWallDisplayOrder() {
    // Check if current revision has a display order
    const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
    if (currentRevision && currentRevision.displayOrder) {
        return currentRevision.displayOrder;
    }
    return null;
}

// Add this function to save the wall display order
async function saveWallDisplayOrder(newOrder) {
    console.log('ðŸ’¾ Saving wall display order...', newOrder);
    
    try {
        // Update current revision with new display order
        const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
        if (currentRevision) {
            currentRevision.displayOrder = newOrder;
            currentRevision.lastModified = new Date().toISOString();
            currentRevision.lastModifiedBy = currentUser?.email || 'unknown';
            
            // Save to database
            await saveRevisionsToDatabase();
            console.log('âœ… Wall display order saved successfully');
        } else {
            console.warn('âš ï¸ No current revision found to save display order');
        }
    } catch (error) {
        console.error('âŒ Error saving wall display order:', error);
    }
}

// Function to populate parapet type dropdown based on selected options
function populateParapetTypeDropdown() {
    const parapetTypeSelect = document.getElementById('parapetType');
    if (!parapetTypeSelect) return;
    
    // Get selected parapet options from the options list
    const selectedParapetOptions = selectedCFSSOptions.filter(opt => opt.startsWith('parapet-'));
    
    // Clear existing options except the first one (placeholder)
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
            // Extract number from 'parapet-1', 'parapet-2', etc.
            const typeNumber = opt.replace('parapet-', '');
            const option = document.createElement('option');
            option.value = `Type ${typeNumber}`;
            option.textContent = `Type ${typeNumber}`;
            parapetTypeSelect.appendChild(option);
        });
        console.log(`Filtered parapet types - showing ${selectedParapetOptions.length} selected types`);
    }
}

// Initialize parapet handlers
function initializeParapetHandlers() {
    const addParapetButton = document.getElementById('addParapetButton');
    const parapetForm = document.getElementById('parapetForm');
    const parapetFormElement = document.getElementById('parapetFormElement');
    
    if (addParapetButton && parapetForm) {
        addParapetButton.addEventListener('click', function() {
            if (parapetForm.style.display !== 'none') {
                // Hide form
                parapetForm.style.display = 'none';
                addParapetButton.innerHTML = '<i class="fas fa-building"></i> Add Parapet';
            } else {
                // Close all other forms first
                hideAllForms();
                closeAllExpandedDetails();
                
                // Show form
                clearParapetForm();
                
                // Populate parapet type dropdown based on selected options
                populateParapetTypeDropdown();
                
                parapetForm.style.display = 'block';
                addParapetButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
                parapetForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
    
    if (parapetFormElement) {
        parapetFormElement.addEventListener('submit', handleSaveParapet);
    }
    
    // Setup parapet type image preview
    setupParapetTypeImagePreview();
    
    // Setup montant auto-fill for parapets
    setupParapetMontantAutoFill();
    
    // Initialize parapet image upload
    initializeParapetImageUpload();
}

// Setup image preview for parapet type selection
function setupParapetTypeImagePreview() {
    const parapetTypeSelect = document.getElementById('parapetType');
    const previewBox = document.getElementById('parapetTypeImagePreview');
    
    if (!parapetTypeSelect || !previewBox) return;
    
    parapetTypeSelect.addEventListener('change', function() {
        updateParapetTypeImage(this.value);
    });
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
    
    // Create image element
    previewBox.innerHTML = `
        <img 
            src="${imageUrl}" 
            alt="${selectedType}"
            style="max-width: 105px; max-height: 105px; object-fit: contain;"
            onerror="this.parentElement.innerHTML='<span style=\\'color: #999; font-size: 11px; text-align: center;\\'><i class=\\'fas fa-image\\' style=\\'font-size: 20px; margin-bottom: 4px; display: block;\\'></i>${selectedType}<br/>(image not found)</span>';"
        />
    `;
}

// Setup auto-fill for parapet lisse fields
function setupParapetMontantAutoFill() {
    const montantSelect = document.getElementById('parapetMontantMetallique');
    const lisseInferieureInput = document.getElementById('parapetLisseInferieure');
    const lisseSuperieureInput = document.getElementById('parapetLisseSuperieure');
    
    // Set 2 fields
    const montantSelect2 = document.getElementById('parapetMontantMetallique2');
    const lisseInferieureInput2 = document.getElementById('parapetLisseInferieure2');
    const lisseSuperieureInput2 = document.getElementById('parapetLisseSuperieure2');
    
    // Set 1 auto-fill
    if (montantSelect && lisseInferieureInput && lisseSuperieureInput) {
        montantSelect.addEventListener('change', function() {
            const selectedMontant = this.value;
            
            if (selectedMontant && colombageData && colombageData[selectedMontant]) {
                const data = colombageData[selectedMontant];
                lisseInferieureInput.value = data.lisseInferieure;
                // For parapets, lisse Supérieure defaults to same as Inférieure
                lisseSuperieureInput.value = data.lisseInferieure;
                
                lisseInferieureInput.classList.add('auto-filled');
                lisseSuperieureInput.classList.add('auto-filled');
            } else {
                lisseInferieureInput.value = '';
                lisseSuperieureInput.value = '';
                lisseInferieureInput.classList.remove('auto-filled');
                lisseSuperieureInput.classList.remove('auto-filled');
            }
        });
    }
    
    // Set 2 auto-fill
    if (montantSelect2 && lisseInferieureInput2 && lisseSuperieureInput2) {
        montantSelect2.addEventListener('change', function() {
            const selectedMontant = this.value;
            
            if (selectedMontant && colombageData && colombageData[selectedMontant]) {
                const data = colombageData[selectedMontant];
                lisseInferieureInput2.value = data.lisseInferieure;
                // For parapets, lisse Supérieure defaults to same as Inférieure
                lisseSuperieureInput2.value = data.lisseInferieure;
                
                lisseInferieureInput2.classList.add('auto-filled');
                lisseSuperieureInput2.classList.add('auto-filled');
            } else {
                lisseInferieureInput2.value = '';
                lisseSuperieureInput2.value = '';
                lisseInferieureInput2.classList.remove('auto-filled');
                lisseSuperieureInput2.classList.remove('auto-filled');
            }
        });
    }
}

// Save parapet
async function handleSaveParapet(e) {
    e.preventDefault();
    
    if (!canModifyProject()) {
        alert('You do not have permission to add parapets to this project.');
        return;
    }
    
    try {
        const parapetData = getParapetFormData();
        if (!parapetData) return;
        
        projectParapets.push(parapetData);
        await saveParapetsToDatabase();
        renderParapetList();
        updateParapetSummary();
        clearParapetForm();
        
        document.getElementById('parapetForm').classList.remove('show');
        document.getElementById('addParapetButton').innerHTML = '<i class="fas fa-building"></i> Add Parapet';
        
        alert('Parapet saved successfully!');
    } catch (error) {
        console.error('Error saving parapet:', error);
        alert('Error saving parapet: ' + error.message);
    }
}

// Get parapet form data
function getParapetFormData() {
    const parapetName = document.getElementById('parapetName').value.trim();
    const parapetType = document.getElementById('parapetType').value.trim();
    const floor = document.getElementById('parapetFloor').value.trim();
    const hauteurMax = document.getElementById('parapetHauteurMax').value.trim();
    const hauteurMaxCombined = document.getElementById('parapetHauteurMaxUnit').value.trim();
    const [hauteurMaxUnit, hauteurMaxMinorUnit] = hauteurMaxCombined.split('-');
    const hauteurMaxMinor = document.getElementById('parapetHauteurMaxMinor').value.trim();
    
    // Set 1 fields
    const montantMetallique = document.getElementById('parapetMontantMetallique').value.trim();
    const espacement = document.getElementById('parapetEspacement').value.trim();
    const lisseSuperieure = document.getElementById('parapetLisseSuperieure').value.trim();
    const lisseInferieure = document.getElementById('parapetLisseInferieure').value.trim();
    const entremise = document.getElementById('parapetEntremise').value.trim();
    
    // Set 2 fields
    const montantMetallique2 = document.getElementById('parapetMontantMetallique2').value.trim();
    const espacement2 = document.getElementById('parapetEspacement2').value.trim();
    const lisseSuperieure2 = document.getElementById('parapetLisseSuperieure2').value.trim();
    const lisseInferieure2 = document.getElementById('parapetLisseInferieure2').value.trim();
    const entremise2 = document.getElementById('parapetEntremise2').value.trim();
    
    // Validation
    if (!parapetName) {
        alert('Please enter a parapet name.');
        return null;
    }
    if (!parapetType) {
        alert('Please select a parapet type.');
        return null;
    }
    if (!hauteurMax) {
        alert('Please enter hauteur max.');
        return null;
    }
    if (!hauteurMaxUnit) {
        alert('Please select a unit for hauteur max.');
        return null;
    }
    if (!montantMetallique) {
        alert('Please select montant métallique.');
        return null;
    }
    if (!espacement) {
        alert('Please select espacement.');
        return null;
    }
    if (!lisseInferieure) {
        alert('Please enter lisse Inférieure.');
        return null;
    }
    if (!lisseSuperieure) {
        alert('Please enter lisse Supérieure.');
        return null;
    }
    if (!entremise) {
        alert('Please select entremise.');
        return null;
    }
    
    return {
        id: Date.now(),
        parapetName,
        parapetType,
        floor: floor || '',
        hauteurMax,
        hauteurMaxUnit: hauteurMaxUnit || 'ft',
        hauteurMaxMinor: hauteurMaxMinor || '',
        hauteurMaxMinorUnit: hauteurMaxMinorUnit || 'in',
        montantMetallique,
        espacement,
        lisseSuperieure,
        lisseInferieure,
        entremise,
        montantMetallique2: montantMetallique2 || '',
        espacement2: espacement2 || '',
        lisseSuperieure2: lisseSuperieure2 || '',
        lisseInferieure2: lisseInferieure2 || '',
        entremise2: entremise2 || '',
        images: window.currentParapetImages || [],
        dateAdded: new Date().toISOString(),
        addedBy: currentUser?.email || 'unknown'
    };
}

// Clear parapet form
function clearParapetForm() {
    document.getElementById('parapetName').value = '';
    document.getElementById('parapetType').value = 'Type 1';
    document.getElementById('parapetFloor').value = '';
    
    // Trigger image preview for default Type 1
    updateParapetTypeImage('Type 1');
    
    document.getElementById('parapetHauteurMax').value = '';
    
    // Default to last wall's unit, or 'ft-in' if no walls
    const lastWall = projectEquipment && projectEquipment.length > 0 ? projectEquipment[projectEquipment.length - 1] : null;
    let defaultUnit = 'ft-in';
    if (lastWall?.hauteurMaxUnit && lastWall?.hauteurMaxMinorUnit) {
        if (lastWall?.hauteurMaxUnit === 'mm') {
    defaultUnit = 'mm';
} else {
    defaultUnit = 'ft-in';
}
    }
    console.log('Setting parapet unit to:', defaultUnit, 'from last wall:', lastWall);
    document.getElementById('parapetHauteurMaxUnit').value = defaultUnit;

    // NEW: make sure minor field visibility matches the unit (ft-in => show, m-mm => hide)
    toggleMinorField('parapetHauteur');
    
    document.getElementById('parapetHauteurMaxMinor').value = '';
    document.getElementById('parapetMontantMetallique').value = '';
    document.getElementById('parapetEspacement').value = '16"c/c';
    document.getElementById('parapetLisseSuperieure').value = '';
    document.getElementById('parapetLisseInferieure').value = '';
    document.getElementById('parapetEntremise').value = 'N/A';
    
    // Clear Set 2 fields
    document.getElementById('parapetMontantMetallique2').value = '';
    document.getElementById('parapetEspacement2').value = '16"c/c';
    document.getElementById('parapetLisseSuperieure2').value = '';
    document.getElementById('parapetLisseInferieure2').value = '';
    document.getElementById('parapetEntremise2').value = 'N/A';
    
    // Hide Set 2
    const parapetSet2 = document.getElementById('parapetSet2');
    const addParapetSet2Btn = document.getElementById('addParapetSet2Btn');
    if (parapetSet2) parapetSet2.style.display = 'none';
    if (addParapetSet2Btn) addParapetSet2Btn.style.display = 'inline-block';
    
    // Clear images
    clearParapetImages();
}

// Render parapet list
function renderParapetList() {
    const container = document.getElementById('parapetList');
    
    if (projectParapets.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #6c757d; padding: 40px;">
                <i class="fas fa-building" style="font-size: 48px; margin-bottom: 10px;"></i>
                <p>No parapets added yet. Click "Add Parapet" to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = projectParapets.map((parapet, index) => {
    const heightDisplay = formatHeight(parapet);
    const hasSet2 = parapet.montantMetallique2 && parapet.montantMetallique2.trim() !== '';
        
    return `
        <div class="equipment-card" id="parapetCard${parapet.id}">
            <!-- View Mode -->
            <div id="parapetView${parapet.id}">
                <div class="equipment-header" onclick="toggleParapetDetails(${parapet.id})">
                    <div class="equipment-info-compact">
                        <h4>${parapet.parapetName}</h4>
                        <div class="equipment-meta-compact">
                            <span>Height: ${heightDisplay}</span>
                            <span class="meta-separator">•</span>
                            <span>Montant: ${parapet.montantMetallique}</span>
                            <span class="meta-separator">•</span>
                            <span>Espacement: ${parapet.espacement}</span>
                        </div>
                    </div>
                    <div class="equipment-actions-compact">
                        <button class="details-btn" onclick="event.stopPropagation(); toggleParapetDetails(${parapet.id})">Details</button>
                        <button class="duplicate-btn" onclick="event.stopPropagation(); duplicateParapet(${parapet.id})" style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-copy"></i> Duplicate
                        </button>
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteParapet(${parapet.id})">Delete</button>
                    </div>
                </div>

                <div class="equipment-details" id="parapetDetails${parapet.id}">
                    <div class="equipment-details-container">
                        <div class="equipment-info-section">
                            <p><strong>Parapet Type:</strong> ${parapet.parapetType || 'N/A'}</p>
                            ${parapet.floor ? `<p><strong>Floor:</strong> ${parapet.floor}</p>` : ''}
                            <p><strong>Height:</strong> ${heightDisplay}</p>
                            
                            ${parapet.montantMetallique2 && parapet.montantMetallique2.trim() !== '' ? '<p style="margin-top: 15px; font-weight: bold; color: #666;">Set 1</p>' : ''}
                            <p><strong>Montant Métallique:</strong> ${parapet.montantMetallique}</p>
                            <p><strong>Espacement:</strong> ${parapet.espacement}</p>
                            <p><strong>Lisse Supérieure:</strong> ${parapet.lisseSuperieure}</p>
                            <p><strong>Lisse Inférieure:</strong> ${parapet.lisseInferieure}</p>
                            <p><strong>Entremise:</strong> ${parapet.entremise}</p>
                            
                            ${parapet.montantMetallique2 && parapet.montantMetallique2.trim() !== '' ? `
                                <p style="margin-top: 15px; font-weight: bold; color: #666;">Set 2</p>
                                <p><strong>Montant Métallique 2:</strong> ${parapet.montantMetallique2}</p>
                                <p><strong>Espacement 2:</strong> ${parapet.espacement2}</p>
                                <p><strong>Lisse Supérieure 2:</strong> ${parapet.lisseSuperieure2}</p>
                                <p><strong>Lisse Inférieure 2:</strong> ${parapet.lisseInferieure2}</p>
                                <p><strong>Entremise 2:</strong> ${parapet.entremise2}</p>
                            ` : ''}
                            ${renderParapetImages(parapet, index)}
                        </div>
                    </div>
                    <button class="button primary" onclick="editParapet(${parapet.id})" style="margin-top: 15px;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>

            <!-- Edit Mode -->
            <div id="parapetEdit${parapet.id}" class="equipment-edit" style="display: none;">
                <form onsubmit="saveParapetEdit(${parapet.id}, event); return false;">
                    <div class="form-row">
    <div class="form-group">
        <label>Parapet Name</label>
        <input type="text" id="editParapetName${parapet.id}" value="${parapet.parapetName}" required>
    </div>
    <div class="form-group">
        <label>Parapet Type</label>
        <select id="editParapetType${parapet.id}" required>
            <option value="">Select...</option>
            <option value="Type 1" ${parapet.parapetType === 'Type 1' ? 'selected' : ''}>Type 1</option>
            <option value="Type 2" ${parapet.parapetType === 'Type 2' ? 'selected' : ''}>Type 2</option>
            <option value="Type 3" ${parapet.parapetType === 'Type 3' ? 'selected' : ''}>Type 3</option>
            <option value="Type 4" ${parapet.parapetType === 'Type 4' ? 'selected' : ''}>Type 4</option>
            <option value="Type 5" ${parapet.parapetType === 'Type 5' ? 'selected' : ''}>Type 5</option>
            <option value="Type 6" ${parapet.parapetType === 'Type 6' ? 'selected' : ''}>Type 6</option>
            <option value="Type 7" ${parapet.parapetType === 'Type 7' ? 'selected' : ''}>Type 7</option>
            <option value="Type 8" ${parapet.parapetType === 'Type 8' ? 'selected' : ''}>Type 8</option>
            <option value="Type 9" ${parapet.parapetType === 'Type 9' ? 'selected' : ''}>Type 9</option>
            <option value="Type 10" ${parapet.parapetType === 'Type 10' ? 'selected' : ''}>Type 10</option>
            <option value="Type 11" ${parapet.parapetType === 'Type 11' ? 'selected' : ''}>Type 11</option>
            <option value="Type 12" ${parapet.parapetType === 'Type 12' ? 'selected' : ''}>Type 12</option>
            <option value="Type 13" ${parapet.parapetType === 'Type 13' ? 'selected' : ''}>Type 13</option>
        </select>
    </div>
    <div class="form-group">
        <label>Floor</label>
        <input type="text" id="editParapetFloor${parapet.id}" value="${parapet.floor || ''}" placeholder="e.g., NV2 - NV3">
    </div>
</div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>Hauteur Max</label>
                                <div style="display: flex; gap: 8px;">
                                    <input type="number" id="editParapetHauteurMax${parapet.id}" value="${parapet.hauteurMax || ''}" min="0" required>
                                    <input type="number" id="editParapetHauteurMaxMinor${parapet.id}" value="${parapet.hauteurMaxMinor || ''}" min="0">
                                    <select
                                        id="editParapetHauteurMaxUnit${parapet.id}"
                                        required
                                        onchange="toggleEditMinorField(${parapet.id}, 'parapetHauteur')"
                                    >
                                        <option value="ft-in" ${(parapet.hauteurMaxUnit === 'ft-in' || !parapet.hauteurMaxUnit) ? 'selected' : ''}>ft-in</option>
                                        <option value="mm" ${parapet.hauteurMaxUnit === 'mm' ? 'selected' : ''}>mm</option>
                                    </select>
                                </div>
                        </div>
<!-- Set 1 and Set 2 in Edit Form -->
                    <div style="display: flex; gap: 20px; grid-column: 1 / -1;">
                        <!-- Set 1 -->
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                                <h4 style="margin: 0; font-size: 14px; color: #666;">Set 1</h4>
                                <button 
                                    type="button" 
                                    id="editParapetAddSet2Btn${parapet.id}" 
                                    onclick="toggleEditParapetSet2(${parapet.id}, true, event)"
                                    style="
                                        background: #28a745;
                                        color: white;
                                        border: none;
                                        width: 24px;
                                        height: 24px;
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 14px;
                                        line-height: 1;
                                        padding: 0;
                                        display: ${hasSet2 ? 'none' : 'inline-block'};
                                    "
                                >
                                    +
                                </button>
                            </div>

                            <div class="form-group">
                                <label>Montant Métallique</label>
                                <select id="editParapetMontantMetallique${parapet.id}" required>
                                    <option value="">Select...</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Espacement</label>
                                <select id="editParapetEspacement${parapet.id}" required>
                                    <option value="">Select...</option>
                                    <option value='8"c/c' ${parapet.espacement === '8"c/c' ? 'selected' : ''}>8"c/c</option>
                                    <option value='12"c/c' ${parapet.espacement === '12"c/c' ? 'selected' : ''}>12"c/c</option>
                                    <option value='16"c/c' ${parapet.espacement === '16"c/c' ? 'selected' : ''}>16"c/c</option>
                                    <option value='24"c/c' ${parapet.espacement === '24"c/c' ? 'selected' : ''}>24"c/c</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Lisse Supérieure</label>
                                <input 
                                    type="text" 
                                    id="editParapetLisseSuperieure${parapet.id}" 
                                    value="${parapet.lisseSuperieure || ''}" 
                                    required
                                >
                            </div>
                            
                            <div class="form-group">
                                <label>Lisse Inférieure</label>
                                <input 
                                    type="text" 
                                    id="editParapetLisseInferieure${parapet.id}" 
                                    value="${parapet.lisseInferieure || ''}" 
                                    required
                                >
                            </div>
                            
                            <div class="form-group">
                                <label>Entremise</label>
                                <select id="editParapetEntremise${parapet.id}" required>
                                    <option value="">Select...</option>
                                    <option value="150U75-43" ${parapet.entremise === '150U75-43' ? 'selected' : ''}>150U75-43</option>
                                    <option value="N/A" ${parapet.entremise === 'N/A' ? 'selected' : ''}>N/A</option>
                                </select>
                            </div>
                        </div>
                        
                        <!-- Set 2 -->
                        <div 
                            id="editParapetSet2${parapet.id}" 
                            style="flex: 1; min-width: 0; display: ${hasSet2 ? 'block' : 'none'};"
                        >
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                                <h4 style="margin: 0; font-size: 14px; color: #666;">Set 2</h4>
                                <button 
                                    type="button" 
                                    id="editParapetRemoveSet2Btn${parapet.id}" 
                                    onclick="toggleEditParapetSet2(${parapet.id}, false, event)"
                                    style="
                                        background: #dc3545;
                                        color: white;
                                        border: none;
                                        width: 24px;
                                        height: 24px;
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 14px;
                                        line-height: 1;
                                        padding: 0;
                                    "
                                >
                                    ×
                                </button>
                            </div>
                            
                            <div class="form-group">
                                <label>Montant Métallique 2</label>
                                <select id="editParapetMontantMetallique2${parapet.id}">
                                    <option value="">Select...</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Espacement 2</label>
                                <select id="editParapetEspacement2${parapet.id}">
                                    <option value="">Select...</option>
                                    <option value='8"c/c' ${parapet.espacement2 === '8"c/c' ? 'selected' : ''}>8"c/c</option>
                                    <option value='12"c/c' ${parapet.espacement2 === '12"c/c' ? 'selected' : ''}>12"c/c</option>
                                    <option value='16"c/c' ${parapet.espacement2 === '16"c/c' ? 'selected' : ''}>16"c/c</option>
                                    <option value='24"c/c' ${parapet.espacement2 === '24"c/c' ? 'selected' : ''}>24"c/c</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Lisse Supérieure 2</label>
                                <input 
                                    type="text" 
                                    id="editParapetLisseSuperieure2${parapet.id}" 
                                    value="${parapet.lisseSuperieure2 || ''}"
                                >
                            </div>
                            
                            <div class="form-group">
                                <label>Lisse Inférieure 2</label>
                                <input 
                                    type="text" 
                                    id="editParapetLisseInferieure2${parapet.id}" 
                                    value="${parapet.lisseInferieure2 || ''}"
                                >
                            </div>
                            
                            <div class="form-group">
                                <label>Entremise 2</label>
                                <select id="editParapetEntremise2${parapet.id}">
                                    <option value="">Select...</option>
                                    <option value="150U75-43" ${parapet.entremise2 === '150U75-43' ? 'selected' : ''}>150U75-43</option>
                                    <option value="N/A" ${parapet.entremise2 === 'N/A' ? 'selected' : ''}>N/A</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Image Upload Section for Edit Mode -->
                    <div class="edit-image-section" style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; grid-column: 1 / -1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h4 style="margin: 0; color: #333; font-size: 16px;">Parapet Image</h4>
                            <button type="button" class="camera-btn" onclick="triggerParapetEditImageUpload(${parapet.id}, event)"
                                    style="background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;">
                                <i class="fas fa-camera"></i> Add Image
                            </button>
                        </div>
                        
                        <div id="editParapetDropZone${parapet.id}" tabindex="0"
                            style="border: 2px dashed #ddd; border-radius: 8px; padding: 30px; text-align: center; background: white; cursor: default; min-height: 120px;">
                            <p style="color: #666; margin: 0 0 10px 0;">
                                <i class="fas fa-image" style="font-size: 32px; color: #ccc; margin-bottom: 8px;"></i><br>
                                Drop image here or paste from clipboard<br>
                                <small>Or click the button above to select file</small>
                            </p>
                            <div id="editParapetImagePreviewContainer${parapet.id}" style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 15px;"></div>
                        </div>
                        
                        <input type="file" id="editParapetImageFileInput${parapet.id}" accept="image/*" style="display: none;">
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="button primary">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                        <button type="button" class="button secondary" onclick="cancelParapetEdit(${parapet.id})">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
        `;
    }).join('');
    updateParapetSummary();

    setTimeout(() => {
    projectParapets.forEach(parapet => {
        populateParapetEditMontant(parapet.id, parapet.montantMetallique, parapet.montantMetallique2);
        setupParapetEditAutoFill(parapet.id);
    });
}, 100);
}

function toggleParapetDetails(id) {
    const detailsDiv = document.getElementById(`parapetDetails${id}`);
    const btn = detailsDiv.closest('.equipment-card').querySelector('.details-btn');
    
    if (detailsDiv.classList.contains('show')) {
        detailsDiv.classList.remove('show');
        if (btn) btn.textContent = 'Details';
    } else {
        detailsDiv.classList.add('show');
        if (btn) btn.textContent = 'Hide Details';
    }
}


function toggleWindowDetails(windowId) {
    const details = document.getElementById(`windowDetails${windowId}`);
    if (!details) return;

    const wasOpen = details.classList.contains('show');
    closeAllExpandedDetails(); // closes other open cards (used elsewhere already)

    if (!wasOpen) {
        details.classList.add('show');
        // update button label
        const card = document.getElementById(`windowCard${windowId}`);
        const btn = card?.querySelector('.details-btn');
        if (btn) btn.textContent = 'Hide';
    } else {
        details.classList.remove('show');
        const card = document.getElementById(`windowCard${windowId}`);
        const btn = card?.querySelector('.details-btn');
        if (btn) btn.textContent = 'Details';
    }
}

// Function to render parapet images in the details view
function renderParapetImages(parapet, index) {
    if (!parapet.images || parapet.images.length === 0) {
        return '<p style="color: #666; font-style: italic;">No image</p>';
    }
    
    console.log(`Rendering image for parapet ${parapet.parapetName}`);
    
    // Limit to first image only (parapets have max 1 image)
    const image = parapet.images[0];
    const imageId = `parapet-image-${index}`;
    
    let imagesHTML = '<div style="margin-top: 10px; max-width: 100px;">';
    
    imagesHTML += `
        <div style="position: relative; width: 100px; height: 80px; border-radius: 4px; overflow: hidden; border: 1px solid #ddd; background: #f5f5f5;">
            <img id="${imageId}" 
                 src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" 
                 alt="${image.filename || 'Parapet image'}"
                 style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                 onclick="openImageModal('${image.key}', '${image.filename || 'Parapet image'}')">
        </div>
    `;
    
    imagesHTML += '</div>';
    
    // Load actual image
    setTimeout(() => {
        const imgElement = document.getElementById(imageId);
        if (imgElement) {
            loadWallImage(imgElement, image.key);
        }
    }, 100);
    
    return imagesHTML;
}

// Edit parapet - toggle to edit mode
function editParapet(id) {
    console.log(`Entering edit mode for parapet ID: ${id}`);
    
    // Find the parapet
    const parapet = projectParapets.find(p => p.id === id);
    if (!parapet) {
        console.error('Parapet not found');
        return;
    }
    
    // Load images for editing
    window.currentParapetImages = parapet.images ? [...parapet.images] : [];
    
    // Hide view mode and show edit mode
    document.getElementById(`parapetView${id}`).style.display = 'none';
    document.getElementById(`parapetEdit${id}`).style.display = 'block';

    // Make sure Hauteur Max minor field matches current unit (ft-in vs mm)
    toggleEditMinorField(id, 'parapetHauteur');
    
    // Setup image upload handlers for this specific edit form
    setTimeout(() => {
        setupParapetEditImageHandlers(id);
        // Display existing images
        displayParapetEditImages(id);
    }, 100);
}

// Setup image handlers for parapet edit form
function setupParapetEditImageHandlers(parapetId) {
    const fileInput = document.getElementById(`editParapetImageFileInput${parapetId}`);
    const dropZone = document.getElementById(`editParapetDropZone${parapetId}`);
    
    if (!fileInput || !dropZone) {
        console.warn('Edit parapet image elements not found for ID:', parapetId);
        return;
    }
    
    // Remove existing listeners by cloning
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    
    const newDropZone = dropZone.cloneNode(true);
    const previewContainer = dropZone.querySelector(`#editParapetImagePreviewContainer${parapetId}`);
    if (previewContainer) {
        // Preserve the preview container
        const newPreviewContainer = previewContainer.cloneNode(true);
        dropZone.parentNode.replaceChild(newDropZone, dropZone);
        const containerInNew = newDropZone.querySelector(`#editParapetImagePreviewContainer${parapetId}`);
        if (containerInNew) {
            containerInNew.parentNode.replaceChild(newPreviewContainer, containerInNew);
        }
    } else {
        dropZone.parentNode.replaceChild(newDropZone, dropZone);
    }
    
    // Get updated references
    const updatedFileInput = document.getElementById(`editParapetImageFileInput${parapetId}`);
    const updatedDropZone = document.getElementById(`editParapetDropZone${parapetId}`);
    
    // File input change
    updatedFileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        processParapetEditFiles(files, parapetId);
    });
    
    // Drop zone events - NO CLICK HANDLER for file upload
    updatedDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        updatedDropZone.style.borderColor = '#007bff';
        updatedDropZone.style.backgroundColor = '#f0f8ff';
    });
    
    updatedDropZone.addEventListener('dragleave', (e) => {
        updatedDropZone.style.borderColor = '#ddd';
        updatedDropZone.style.backgroundColor = 'white';
    });
    
    updatedDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        updatedDropZone.style.borderColor = '#ddd';
        updatedDropZone.style.backgroundColor = 'white';
        const files = Array.from(e.dataTransfer.files);
        processParapetEditFiles(files, parapetId);
    });
    
    updatedDropZone.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        const files = [];
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }
        if (files.length > 0) {
            e.preventDefault();
            processParapetEditFiles(files, parapetId);
        }
    });
    
    // Focus/blur for better UX
    updatedDropZone.addEventListener('focus', () => {
        updatedDropZone.style.borderColor = '#007bff';
        updatedDropZone.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.25)';
    });
    
    updatedDropZone.addEventListener('blur', () => {
        updatedDropZone.style.borderColor = '#ddd';
        updatedDropZone.style.boxShadow = 'none';
    });
    
    console.log('Edit parapet image handlers setup for ID:', parapetId);
}

// Process files for parapet edit
async function processParapetEditFiles(files, parapetId) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('Please select valid image files.');
        return;
    }
    
    const currentCount = window.currentParapetImages?.length || 0;
    const remainingSlots = 1 - currentCount;
    
    if (remainingSlots <= 0) {
        alert('Maximum 1 image allowed per parapet. Please remove existing image to add a new one.');
        return;
    }
    
    if (validFiles.length > remainingSlots) {
        alert('Maximum 1 image allowed per parapet.');
        return;
    }
    
    const dropZone = document.getElementById(`editParapetDropZone${parapetId}`);
    if (dropZone) {
        dropZone.placeholder = 'Uploading image...';
    }
    
    if (!window.currentParapetImages) {
        window.currentParapetImages = [];
    }
    
    for (const file of validFiles) {
        try {
            const imageData = await uploadImageToS3(file);
            window.currentParapetImages.push(imageData);
            displayParapetEditImages(parapetId);
        } catch (error) {
            console.error('Error uploading parapet edit image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    updateParapetEditDropZoneState(parapetId);
}

// Display images in edit form
function displayParapetEditImages(parapetId) {
    const container = document.getElementById(`editParapetImagePreviewContainer${parapetId}`);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!window.currentParapetImages || window.currentParapetImages.length === 0) {
        return;
    }
    
    window.currentParapetImages.forEach(image => {
        const preview = document.createElement('div');
        preview.className = 'edit-image-preview';
        preview.style.cssText = `
            position: relative; 
            width: 80px; 
            height: 80px; 
            border-radius: 4px; 
            overflow: hidden; 
            border: 1px solid #ddd;
            background: #f5f5f5;
        `;
        
        preview.innerHTML = `
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" 
                alt="${image.filename}"
                style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                onclick="openImageModal('${image.key}', '${image.filename}')"
                data-image-key="${image.key}">
            <button type="button" class="edit-image-remove" 
                    title="Remove image"
                    style="position: absolute; top: 2px; right: 2px; background: rgba(255,0,0,0.8); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                ×
            </button>
        `;
        
        container.appendChild(preview);
        
        // Add event listener instead of onclick to properly handle the event
        const removeButton = preview.querySelector('.edit-image-remove');
        removeButton.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            removeParapetEditImage(image.key, parapetId);
        });
        
        // Load the actual image
        const imgElement = preview.querySelector('img');
        loadImagePreview(imgElement, image.key);
    });
    
    updateParapetEditDropZoneState(parapetId);
}

// Remove image from edit form
function removeParapetEditImage(imageKey, parapetId) {
    if (!window.currentParapetImages) {
        window.currentParapetImages = [];
    }
    window.currentParapetImages = window.currentParapetImages.filter(img => img.key !== imageKey);
    displayParapetEditImages(parapetId);
    updateParapetEditDropZoneState(parapetId);
}

// Update drop zone state for edit form
function updateParapetEditDropZoneState(parapetId) {
    const dropZone = document.getElementById(`editParapetDropZone${parapetId}`);
    if (!dropZone) return;
    
    const currentCount = window.currentParapetImages?.length || 0;
    
    // Visual feedback when max images reached
    if (currentCount >= 1) {
        // Optional: Add visual indication that max is reached
        // For now, just ensure proper styling is maintained
        dropZone.style.backgroundColor = 'white';
        dropZone.style.borderColor = '#ddd';
    } else {
        dropZone.style.backgroundColor = 'white';
        dropZone.style.borderColor = '#ddd';
    }
}

function cancelParapetEdit(id) {
    console.log(`Cancelling edit for parapet ID: ${id}`);
    
    // Show view mode and hide edit mode
    document.getElementById(`parapetView${id}`).style.display = 'block';
    document.getElementById(`parapetEdit${id}`).style.display = 'none';
}

// Save parapet edit
async function saveParapetEdit(id, event) {
    event.preventDefault();
    
    try {
        // Find the parapet to update
        const parapetIndex = projectParapets.findIndex(p => p.id === id);
        if (parapetIndex === -1) {
            throw new Error('Parapet not found');
        }

        // Get updated data from form
        const updatedData = {
            id: id,
            parapetName: document.getElementById(`editParapetName${id}`).value.trim(),
            parapetType: document.getElementById(`editParapetType${id}`).value.trim(),
            floor: document.getElementById(`editParapetFloor${id}`).value.trim() || '',
            hauteurMax: document.getElementById(`editParapetHauteurMax${id}`).value.trim(),
            hauteurMaxUnit: (() => { const combined = document.getElementById(`editParapetHauteurMaxUnit${id}`).value.trim(); return combined.split('-')[0] || 'ft'; })(),
            hauteurMaxMinor: document.getElementById(`editParapetHauteurMaxMinor${id}`).value.trim() || '',
            hauteurMaxMinorUnit: (() => { const combined = document.getElementById(`editParapetHauteurMaxUnit${id}`).value.trim(); return combined.split('-')[1] || 'in'; })(),
            montantMetallique: document.getElementById(`editParapetMontantMetallique${id}`).value.trim(),
            espacement: document.getElementById(`editParapetEspacement${id}`).value.trim(),
            lisseSuperieure: document.getElementById(`editParapetLisseSuperieure${id}`).value.trim(),
            lisseInferieure: document.getElementById(`editParapetLisseInferieure${id}`).value.trim(),
            entremise: document.getElementById(`editParapetEntremise${id}`).value.trim(),
            montantMetallique2: document.getElementById(`editParapetMontantMetallique2${id}`).value.trim() || '',
            espacement2: document.getElementById(`editParapetEspacement2${id}`).value.trim() || '',
            lisseSuperieure2: document.getElementById(`editParapetLisseSuperieure2${id}`).value.trim() || '',
            lisseInferieure2: document.getElementById(`editParapetLisseInferieure2${id}`).value.trim() || '',
            entremise2: document.getElementById(`editParapetEntremise2${id}`).value.trim() || '',
            images: window.currentParapetImages || [],
            dateAdded: projectParapets[parapetIndex].dateAdded,
            addedBy: projectParapets[parapetIndex].addedBy
        };

        // Update the parapet
        projectParapets[parapetIndex] = updatedData;
        
        // Save to database
        await saveParapetsToDatabase();
        
        // Re-render the list
        renderParapetList();
        updateParapetSummary();
        
        alert('Parapet updated successfully!');
    } catch (error) {
        console.error('Error updating parapet:', error);
        alert('Error updating parapet: ' + error.message);
    }
}

// Helper function to populate montant dropdown in edit mode
function populateParapetEditMontant(parapetId, selectedValue, selectedValue2 = '') {
    const montantSelect = document.getElementById(`editParapetMontantMetallique${parapetId}`);
    const montantSelect2 = document.getElementById(`editParapetMontantMetallique2${parapetId}`);
    if (!montantSelect || typeof colombageData === 'undefined') return;
    
    const sortedKeys = Object.keys(colombageData).sort();
    
    // Populate Set 1
    montantSelect.innerHTML = '<option value="">Select montant métallique...</option>';
    sortedKeys.forEach(montant => {
        const option = document.createElement('option');
        option.value = montant;
        option.textContent = montant;
        if (montant === selectedValue) {
            option.selected = true;
        }
        montantSelect.appendChild(option);
    });
    
    // Populate Set 2
    if (montantSelect2) {
        montantSelect2.innerHTML = '<option value="">Select montant métallique...</option>';
        sortedKeys.forEach(montant => {
            const option = document.createElement('option');
            option.value = montant;
            option.textContent = montant;
            if (montant === selectedValue2) {
                option.selected = true;
            }
            montantSelect2.appendChild(option);
        });
    }
}

function setupParapetEditAutoFill(parapetId) {
    const montantSelect = document.getElementById(`editParapetMontantMetallique${parapetId}`);
    const lisseSuperieureInput = document.getElementById(`editParapetLisseSuperieure${parapetId}`);
    const lisseInferieureInput = document.getElementById(`editParapetLisseInferieure${parapetId}`);
    
    // Set 2 fields
    const montantSelect2 = document.getElementById(`editParapetMontantMetallique2${parapetId}`);
    const lisseSuperieureInput2 = document.getElementById(`editParapetLisseSuperieure2${parapetId}`);
    const lisseInferieureInput2 = document.getElementById(`editParapetLisseInferieure2${parapetId}`);
    
    if (!montantSelect || !lisseSuperieureInput || !lisseInferieureInput) return;
    if (typeof colombageData === 'undefined') return;
    
    // Set 1 auto-fill
    montantSelect.addEventListener('change', function() {
        const selectedMontant = this.value;
        
        if (selectedMontant && colombageData[selectedMontant]) {
            const data = colombageData[selectedMontant];
            lisseSuperieureInput.value = data.lisseInferieure;
            lisseInferieureInput.value = data.lisseInferieure;
        } else {
            lisseSuperieureInput.value = '';
            lisseInferieureInput.value = '';
        }
    });
    
    // Set 2 auto-fill
    if (montantSelect2 && lisseSuperieureInput2 && lisseInferieureInput2) {
        montantSelect2.addEventListener('change', function() {
            const selectedMontant = this.value;
            
            if (selectedMontant && colombageData[selectedMontant]) {
                const data = colombageData[selectedMontant];
                lisseSuperieureInput2.value = data.lisseInferieure;
                lisseInferieureInput2.value = data.lisseInferieure;
            } else {
                lisseSuperieureInput2.value = '';
                lisseInferieureInput2.value = '';
            }
        });
    }
}

// Duplicate parapet
function duplicateParapet(id) {
    if (!canModifyProject()) {
        alert('You do not have permission to add parapets to this project.');
        return;
    }
    
    const parapetToDuplicate = projectParapets.find(p => p.id === id);
    if (!parapetToDuplicate) {
        alert('Parapet not found.');
        return;
    }
    
    // Hide all forms first
    hideAllForms();
    closeAllExpandedDetails();
    
    // Clear the parapet form
    clearParapetForm();
    
    // Populate parapet type dropdown based on selected options
    populateParapetTypeDropdown();
    
    // Copy images
    window.currentParapetImages = parapetToDuplicate.images ? [...parapetToDuplicate.images] : [];
    
    // Populate form with parapet data (except images, they're handled separately)
    document.getElementById('parapetName').value = parapetToDuplicate.parapetName;
    document.getElementById('parapetType').value = parapetToDuplicate.parapetType || 'Type 1';
    document.getElementById('parapetFloor').value = parapetToDuplicate.floor || '';
    document.getElementById('parapetHauteurMax').value = parapetToDuplicate.hauteurMax || '';
    const combinedUnit = `${parapetToDuplicate.hauteurMaxUnit || 'ft'}-${parapetToDuplicate.hauteurMaxMinorUnit || 'in'}`;
    document.getElementById('parapetHauteurMaxUnit').value = combinedUnit;
    document.getElementById('parapetHauteurMaxMinor').value = parapetToDuplicate.hauteurMaxMinor || '';
// Set 1 fields
    document.getElementById('parapetMontantMetallique').value = parapetToDuplicate.montantMetallique || '';
    document.getElementById('parapetEspacement').value = parapetToDuplicate.espacement || '';
    document.getElementById('parapetLisseSuperieure').value = parapetToDuplicate.lisseSuperieure || '';
    document.getElementById('parapetLisseInferieure').value = parapetToDuplicate.lisseInferieure || '';
    document.getElementById('parapetEntremise').value = parapetToDuplicate.entremise || '';
    
    // Set 2 fields
    document.getElementById('parapetMontantMetallique2').value = parapetToDuplicate.montantMetallique2 || '';
    document.getElementById('parapetEspacement2').value = parapetToDuplicate.espacement2 || '';
    document.getElementById('parapetLisseSuperieure2').value = parapetToDuplicate.lisseSuperieure2 || '';
    document.getElementById('parapetLisseInferieure2').value = parapetToDuplicate.lisseInferieure2 || '';
    document.getElementById('parapetEntremise2').value = parapetToDuplicate.entremise2 || '';
    
    // Show Set 2 if it has data
    if (parapetToDuplicate.montantMetallique2 && parapetToDuplicate.montantMetallique2.trim() !== '') {
        const parapetSet2 = document.getElementById('parapetSet2');
        const addParapetSet2Btn = document.getElementById('addParapetSet2Btn');
        if (parapetSet2) parapetSet2.style.display = 'block';
        if (addParapetSet2Btn) addParapetSet2Btn.style.display = 'none';
    }
    
    // Display duplicated images in preview
    if (window.currentParapetImages.length > 0) {
        const previewContainer = document.getElementById('parapetImagePreviewContainer');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            window.currentParapetImages.forEach((imageData) => {
                const preview = document.createElement('div');
                preview.className = 'image-preview';
                preview.innerHTML = `
                    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename}">
                    <button type="button" class="image-remove" title="Remove image">×</button>
                `;
                previewContainer.appendChild(preview);
                
                // Add remove listener
                const removeButton = preview.querySelector('.image-remove');
                removeButton.addEventListener('click', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    removeParapetImage(imageData.key);
                });
                
                // Load the actual image
                loadImagePreview(preview.querySelector('img'), imageData.key);
            });
            updateParapetDropZoneState();
        }
    }
    
    // Show the form
    const parapetForm = document.getElementById('parapetForm');
    const addParapetButton = document.getElementById('addParapetButton');
    
    if (parapetForm && addParapetButton) {
        parapetForm.style.display = 'block';
        addParapetButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
        
        // Scroll to form
        parapetForm.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
        
        // Focus on the name field so user can modify it
        setTimeout(() => {
            const nameField = document.getElementById('parapetName');
            if (nameField) {
                nameField.focus();
                nameField.select();
            }
        }, 100);
    }
    
    console.log(`Duplicated parapet: ${parapetToDuplicate.parapetName}`);
}

// Delete parapet
async function deleteParapet(id) {
    const parapet = projectParapets.find(p => p.id === id);
    if (!parapet) return;
    
    if (confirm(`Are you sure you want to delete parapet "${parapet.parapetName}"?`)) {
        projectParapets = projectParapets.filter(p => p.id !== id);
        await saveParapetsToDatabase();
        renderParapetList();
        updateParapetSummary();
        alert('Parapet deleted successfully!');
    }
}

function updateWallSummary() {
    const el = document.getElementById('wallSelectionSummary');
    if (!el) return;
    const n = Array.isArray(projectEquipment) ? projectEquipment.length : 0;
    el.innerHTML = `<i class="fas fa-th-large"></i> ${n} wall${n === 1 ? '' : 's'} added`;
}

// Update parapet summary
function updateParapetSummary() {
    const summary = document.getElementById('parapetSelectionSummary');
    if (summary) {
        const count = projectParapets.length;
        summary.innerHTML = `<i class="fas fa-building"></i> ${count} parapet${count !== 1 ? 's' : ''} added`;
    }
}

function updateCustomPagesSummary() {
    const el = document.getElementById('customPagesSelectionSummary');
    if (!el) return;
    const count = (typeof projectCustomPages !== 'undefined' && Array.isArray(projectCustomPages))
        ? projectCustomPages.length
        : 0;
    el.innerHTML = `<i class="fas fa-file-alt"></i> ${count} custom page${count !== 1 ? 's' : ''} added`;
}

// Save parapets to database
async function saveParapetsToDatabase() {
    if (!currentProjectId) return;
    
    try {
        const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id: currentProjectId,
                parapets: projectParapets
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save parapets: ${errorText}`);
        }
        
        console.log('Parapets saved to database');
    } catch (error) {
        console.error('Error saving parapets:', error);
        throw error;
    }
}

// Load parapets from project data
function loadParapetsFromProject(project) {
    console.log('ðŸ”„ loadParapetsFromProject called');
    console.log('Project has parapets?', !!project.parapets);
    console.log('Parapets value:', project.parapets);
    
    projectParapets = project.parapets || [];
    
    console.log(`âœ… Loaded ${projectParapets.length} parapets from project`);
    
    if (projectParapets.length > 0) {
        console.log('First parapet:', projectParapets[0]);
    }
    
    renderParapetList();
    updateParapetSummary();
}

// ============================================
// SOFFITES FUNCTIONS
// ============================================

// Load soffites from project data
function loadSoffitesFromProject(project) {
    console.log('📄 loadSoffitesFromProject called');
    projectSoffites = project.soffites || [];
    console.log(`✅ Loaded ${projectSoffites.length} soffites from project`);
    renderSoffiteList();
    updateSoffiteSummary();
}

// Initialize soffite handlers
function initializeSoffiteHandlers() {
    const addSoffitesButton = document.getElementById('addSoffitesButton');
    const soffiteForm = document.getElementById('soffiteForm');
    const soffiteFormElement = document.getElementById('soffiteFormElement');
    const cancelSoffite = document.getElementById('cancelSoffite');
    
    if (addSoffitesButton && soffiteForm) {
        addSoffitesButton.addEventListener('click', function() {
            if (soffiteForm.style.display !== 'none') {
                soffiteForm.style.display = 'none';
                addSoffitesButton.innerHTML = '<i class="fas fa-grip-lines-vertical"></i> Add Soffites';
            } else {
                hideAllForms();
                clearSoffiteForm();
                soffiteForm.style.display = 'block';
                addSoffitesButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
                soffiteForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
    
    if (soffiteFormElement) {
        soffiteFormElement.addEventListener('submit', handleSaveSoffite);
    }
    
    if (cancelSoffite) {
        cancelSoffite.addEventListener('click', function() {
            soffiteForm.style.display = 'none';
            addSoffitesButton.innerHTML = '<i class="fas fa-grip-lines-vertical"></i> Add Soffites';
            clearSoffiteForm();
        });
    }
    
    initializeSoffiteImageUpload();
}

// Handle save soffite
async function handleSaveSoffite(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('soffiteName');
    const name = nameInput ? nameInput.value.trim() : '';
    
    if (!name) {
        alert('Please enter a soffite name.');
        return;
    }
    
    const images = window.currentSoffiteImages || [];
    
    const soffiteData = {
        id: editingSoffiteId || Date.now().toString(),
        name,
        images
    };
    
    if (editingSoffiteId) {
        const index = projectSoffites.findIndex(s => s.id === editingSoffiteId);
        if (index !== -1) {
            projectSoffites[index] = soffiteData;
        }
    } else {
        projectSoffites.push(soffiteData);
    }
    
    await saveSoffitesToProject();
    
    editingSoffiteId = null;
    clearSoffiteForm();
    document.getElementById('soffiteForm').style.display = 'none';
    document.getElementById('addSoffitesButton').innerHTML = '<i class="fas fa-grip-lines-vertical"></i> Add Soffites';
    
    renderSoffiteList();
    updateSoffiteSummary();
}

// Clear soffite form
function clearSoffiteForm() {
    const form = document.getElementById('soffiteFormElement');
    if (form) form.reset();
    window.currentSoffiteImages = [];
    const preview = document.getElementById('soffiteImagePreviewContainer');
    if (preview) preview.innerHTML = '';
    editingSoffiteId = null;
    document.getElementById('soffiteFormTitle').textContent = 'Add Soffite';
}

// Render soffite list
function renderSoffiteList() {
    const container = document.getElementById('soffiteList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!projectSoffites || projectSoffites.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No soffites added yet.</p>';
        return;
    }
    
    projectSoffites.forEach((soffite, index) => {
        const name = soffite.name || `Soffite ${index + 1}`;
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

// Update soffite summary
function updateSoffiteSummary() {
    const summary = document.getElementById('soffiteSelectionSummary');
    if (summary) {
        summary.innerHTML = `<i class="fas fa-grip-lines-vertical"></i> ${projectSoffites.length} soffites added`;
    }
}

// Toggle soffite details
window.toggleSoffiteDetails = function(id) {
    const details = document.getElementById(`soffiteDetails${id}`);
    if (details) {
        details.classList.toggle('show');
    }
};

// Edit soffite
window.editSoffite = function(id) {
    const soffite = projectSoffites.find(s => s.id === id);
    if (!soffite) return;
    
    editingSoffiteId = id;
    document.getElementById('soffiteName').value = soffite.name || '';
    document.getElementById('soffiteFormTitle').textContent = 'Edit Soffite';
    
    window.currentSoffiteImages = soffite.images || [];
    renderSoffiteImagePreviews();
    
    document.getElementById('soffiteForm').style.display = 'block';
    document.getElementById('addSoffitesButton').innerHTML = '<i class="fas fa-times"></i> Hide Form';
    document.getElementById('soffiteForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Duplicate soffite
window.duplicateSoffite = async function(id) {
    const soffite = projectSoffites.find(s => s.id === id);
    if (!soffite) return;
    
    const newSoffite = {
        ...soffite,
        id: Date.now().toString(),
        name: `${soffite.name} (Copy)`
    };
    projectSoffites.push(newSoffite);
    await saveSoffitesToProject();
    renderSoffiteList();
    updateSoffiteSummary();
};

// Delete soffite
window.deleteSoffite = async function(id) {
    if (!confirm('Are you sure you want to delete this soffite?')) return;
    
    projectSoffites = projectSoffites.filter(s => s.id !== id);
    await saveSoffitesToProject();
    renderSoffiteList();
    updateSoffiteSummary();
};

// Save soffites to project
async function saveSoffitesToProject() {
    try {
        const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
            method: 'PUT',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: currentProjectId,
                soffites: projectSoffites
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save soffites');
        }
        
        console.log('✅ Soffites saved successfully');
    } catch (error) {
        console.error('❌ Error saving soffites:', error);
        alert('Error saving soffites: ' + error.message);
    }
}

// Initialize soffite image upload
function initializeSoffiteImageUpload() {
    const fileInput = document.getElementById('soffiteImageInput');
    const dropZone = document.getElementById('soffiteDropZone');
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            handleSoffiteImageFiles(e.target.files);
        });
    }
    
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            handleSoffiteImageFiles(e.dataTransfer.files);
        });
    }
}

// Handle soffite image files
async function handleSoffiteImageFiles(files) {
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        
        try {
            const uploadResult = await uploadSoffiteImage(file);
            if (uploadResult) {
                window.currentSoffiteImages.push(uploadResult);
                renderSoffiteImagePreviews();
            }
        } catch (error) {
            console.error('Error uploading soffite image:', error);
        }
    }
}

// Upload soffite image to S3
async function uploadSoffiteImage(file) {
    try {
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/image-upload-url`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: file.name,
                contentType: file.type
            })
        });
        
        if (!response.ok) throw new Error('Failed to get upload URL');
        
        const { uploadUrl, key } = await response.json();
        
        await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type }
        });
        
        return { key, filename: file.name };
    } catch (error) {
        console.error('Error uploading image:', error);
        return null;
    }
}

// Render soffite image previews
function renderSoffiteImagePreviews() {
    const container = document.getElementById('soffiteImagePreviewContainer');
    if (!container) return;
    
    container.innerHTML = window.currentSoffiteImages.map((img, index) => `
        <div class="image-preview" style="position: relative; width: 80px; height: 80px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
            <img src="https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/${img.key}" 
                 alt="${img.filename}" 
                 style="width: 100%; height: 100%; object-fit: cover;">
            <button type="button" class="image-remove" onclick="removeSoffiteImage(${index})" 
                    style="position: absolute; top: 2px; right: 2px; background: #e74c3c; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px;">×</button>
        </div>
    `).join('');
}

// Remove soffite image
window.removeSoffiteImage = function(index) {
    window.currentSoffiteImages.splice(index, 1);
    renderSoffiteImagePreviews();
};

// ============================================
// FILES FUNCTIONS
// ============================================

// Load files from project data
function loadFilesFromProject(project) {
    console.log('📁 loadFilesFromProject called');
    projectFiles = project.files || [];
    console.log(`✅ Loaded ${projectFiles.length} files from project`);
    displayProjectFiles();
}

// Initialize file handlers
function initializeFileHandlers() {
    const showUploadBtn = document.getElementById('showUploadFileBtn');
    const uploadRow = document.getElementById('uploadFileRow');
    const cancelBtn = document.getElementById('uploadFileCancelBtn');
    const submitBtn = document.getElementById('uploadFileSubmitBtn');
    const modeFileBtn = document.getElementById('uploadModeFile');
    const modeLinkBtn = document.getElementById('uploadModeLink');
    
    if (showUploadBtn) {
        showUploadBtn.addEventListener('click', () => {
            uploadRow.style.display = uploadRow.style.display === 'none' ? 'block' : 'none';
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            uploadRow.style.display = 'none';
            clearFileUploadForm();
        });
    }
    
    if (submitBtn) {
        submitBtn.addEventListener('click', handleFileUpload);
    }
    
    if (modeFileBtn && modeLinkBtn) {
        modeFileBtn.addEventListener('click', () => {
            currentUploadMode = 'file';
            modeFileBtn.style.background = '#17a2b8';
            modeFileBtn.style.color = 'white';
            modeLinkBtn.style.background = 'transparent';
            modeLinkBtn.style.color = '#555';
            document.getElementById('uploadFileInput').style.display = 'block';
            document.getElementById('uploadLinkInput').style.display = 'none';
            document.getElementById('uploadInputLabel').textContent = 'Select File';
        });
        
        modeLinkBtn.addEventListener('click', () => {
            currentUploadMode = 'link';
            modeLinkBtn.style.background = '#17a2b8';
            modeLinkBtn.style.color = 'white';
            modeFileBtn.style.background = 'transparent';
            modeFileBtn.style.color = '#555';
            document.getElementById('uploadFileInput').style.display = 'none';
            document.getElementById('uploadLinkInput').style.display = 'block';
            document.getElementById('uploadInputLabel').textContent = 'Paste Link';
        });
    }
}

// Handle file upload
async function handleFileUpload() {
    const fileName = document.getElementById('uploadFileName').value.trim();
    
    if (!fileName) {
        alert('Please enter a file name');
        return;
    }
    
    const submitBtn = document.getElementById('uploadFileSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    
    try {
        if (currentUploadMode === 'link') {
            const linkUrl = document.getElementById('uploadLinkInput').value.trim();
            if (!linkUrl) {
                alert('Please enter a link URL');
                return;
            }
            
            const fileData = {
                id: Date.now().toString(),
                name: fileName,
                type: 'Link',
                url: linkUrl,
                uploadedAt: new Date().toISOString(),
                uploadedBy: currentUser?.email || 'unknown'
            };
            
            projectFiles.push(fileData);
            await saveFilesToProject();
            
        } else {
            const fileInput = document.getElementById('uploadFileInput');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select a file');
                return;
            }
            
            // Get upload URL
            const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/file-upload-url`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type
                })
            });
            
            if (!response.ok) throw new Error('Failed to get upload URL');
            
            const { uploadUrl, key } = await response.json();
            
            // Upload file to S3
            await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type }
            });
            
            const fileType = file.type.includes('pdf') ? 'PDF' : 'Image';
            
            const fileData = {
                id: Date.now().toString(),
                name: fileName,
                type: fileType,
                key: key,
                uploadedAt: new Date().toISOString(),
                uploadedBy: currentUser?.email || 'unknown'
            };
            
            projectFiles.push(fileData);
            await saveFilesToProject();
        }
        
        displayProjectFiles();
        document.getElementById('uploadFileRow').style.display = 'none';
        clearFileUploadForm();
        alert('File uploaded successfully!');
        
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Error uploading file: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload';
    }
}

// Clear file upload form
function clearFileUploadForm() {
    document.getElementById('uploadFileName').value = '';
    document.getElementById('uploadFileInput').value = '';
    document.getElementById('uploadLinkInput').value = '';
}

// Save files to project
async function saveFilesToProject() {
    try {
        const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
            method: 'PUT',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: currentProjectId,
                files: projectFiles
            })
        });
        
        if (!response.ok) throw new Error('Failed to save files');
        
        console.log('✅ Files saved successfully');
    } catch (error) {
        console.error('❌ Error saving files:', error);
        throw error;
    }
}

// Display project files
function displayProjectFiles() {
    const tbody = document.getElementById('filesTableBody');
    const emptyState = document.getElementById('filesEmptyState');
    
    if (!projectFiles || projectFiles.length === 0) {
        if (tbody) tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    if (tbody) {
        tbody.innerHTML = projectFiles.map(file => {
            const date = new Date(file.uploadedAt).toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', year: 'numeric' 
            });
            
            const icon = file.type === 'PDF' ? 'fa-file-pdf' : file.type === 'Link' ? 'fa-link' : 'fa-image';
            const iconBg = file.type === 'Link' ? '#6f42c1' : '#17a2b8';
            
            const actionButton = file.type === 'Link' 
                ? `<button onclick="window.open('${file.url}', '_blank')" style="background: none; border: 1px solid #6f42c1; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; color: #6f42c1;">
                       <i class="fas fa-external-link-alt"></i>
                   </button>`
                : `<button onclick="downloadProjectFile('${file.id}')" style="background: none; border: 1px solid #17a2b8; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; color: #17a2b8;">
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
                            <button onclick="deleteProjectFile('${file.id}')" style="background: none; border: 1px solid #dc3545; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; color: #dc3545;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// Download project file
window.downloadProjectFile = async function(fileId) {
    try {
        const file = projectFiles.find(f => f.id === fileId);
        if (!file) {
            alert('File not found');
            return;
        }
        
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/file-download-url?key=${encodeURIComponent(file.key)}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to get download URL');
        
        const { url } = await response.json();
        window.open(url, '_blank');
        
    } catch (error) {
        console.error('Error downloading file:', error);
        alert('Error downloading file: ' + error.message);
    }
};

// Delete project file
window.deleteProjectFile = async function(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;
    
    try {
        const file = projectFiles.find(f => f.id === fileId);
        if (!file) {
            alert('File not found');
            return;
        }
        
        // Delete from S3 if it's a file (not a link)
        if (file.key) {
            await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/file-delete`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ key: file.key })
            });
        }
        
        projectFiles = projectFiles.filter(f => f.id !== fileId);
        await saveFilesToProject();
        displayProjectFiles();
        alert('File deleted successfully');
        
    } catch (error) {
        console.error('Error deleting file:', error);
        alert('Error deleting file: ' + error.message);
    }
};

// Initialize revision system when project loads
function initializeRevisionSystem(project) {
    console.log('ðŸ”„ Initializing revision system...');
    
    // Load existing revisions or initialize empty
    projectRevisions = project.wallRevisions || [];
    currentRevisionId = project.currentWallRevisionId || null;
    
    // If we have revisions, ensure we're showing the latest
    if (projectRevisions.length > 0) {
        const latestRevision = projectRevisions[projectRevisions.length - 1];
        currentRevisionId = latestRevision.id;
        projectEquipment = [...latestRevision.walls]; // Load latest revision walls
    }
    
    updateRevisionIndicator();
    console.log(`âœ… Revision system initialized with ${projectRevisions.length} revisions`);
}

// Update the revision indicator in wall list header
function updateRevisionIndicator() {
    const equipmentListDiv = document.getElementById('equipmentList');
    if (!equipmentListDiv) return;
    
    let indicatorHtml = '';
    if (projectRevisions.length > 0) {
        const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
        if (currentRevision) {
            const revNumber = currentRevision.number;
            const description = currentRevision.description ? `: ${currentRevision.description}` : '';
            indicatorHtml = `
                <div style="font-size: 12px; color: #666; margin-bottom: 10px; font-style: italic;">
                    Currently viewing: Revision ${revNumber}${description} (Latest)
                </div>
            `;
        }
    }
    
    // Find existing indicator and update or create new one
    let indicator = equipmentListDiv.querySelector('.revision-indicator');
    if (indicator) {
        indicator.innerHTML = indicatorHtml;
    } else if (indicatorHtml) {
        const indicatorDiv = document.createElement('div');
        indicatorDiv.className = 'revision-indicator';
        indicatorDiv.innerHTML = indicatorHtml;
        equipmentListDiv.insertBefore(indicatorDiv, equipmentListDiv.firstChild);
    }
}

function showRevisionPopup(actionType, wallName = '', callback, isFirstRevision = false) {
    const modal = document.createElement('div');
    modal.className = 'revision-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.5); display: flex; align-items: center; 
        justify-content: center; z-index: 2000;
    `;
    
    const actionText = {
        'add': `add wall "${wallName}"`,
        'edit': `save changes to wall "${wallName}"`,
        'delete': `delete wall "${wallName}"`
    };
    
    let modalContent;
    
    if (isFirstRevision) {
        // First revision modal - simpler, only asks for description
        modalContent = `
            <div style="background: white; padding: 25px; border-radius: 8px; min-width: 400px; max-width: 500px;">
                <h3 style="margin: 0 0 15px 0; color: #333;">Create First Revision</h3>
                <p style="margin-bottom: 20px; color: #555;">
                    You're about to ${actionText[actionType]} and create the first revision for this project.
                </p>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #555; font-weight: 500;">
                        Revision description (optional):
                    </label>
                    <input type="text" id="revisionDescription" maxlength="100" 
                           placeholder="e.g., Initial wall layout, Preliminary design..."
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                    <div style="font-size: 12px; color: #666; margin-top: 2px;">Maximum 100 characters</div>
                </div>
                
                <div style="background: #f8f9fa; padding: 12px; border-radius: 4px; margin-bottom: 20px; border-left: 3px solid #28a745;">
                    <div style="font-size: 13px; color: #495057;">
                        <strong>This will create:</strong> Revision 0
                    </div>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button onclick="closeRevisionModal()" 
                            style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                        Cancel
                    </button>
                    <button onclick="processRevisionChoice()" 
                            style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                        Create Revision 0
                    </button>
                </div>
            </div>
        `;
    } else {
        // Existing modal content for subsequent revisions
        const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
        const currentRevInfo = currentRevision ? 
            `Revision ${currentRevision.number}${currentRevision.description ? ': ' + currentRevision.description : ''}` : 
            'No current revision';
            
        modalContent = `
            <div style="background: white; padding: 25px; border-radius: 8px; min-width: 400px; max-width: 500px;">
                <h3 style="margin: 0 0 15px 0; color: #333;">Save Wall Changes</h3>
                <p style="margin-bottom: 20px; color: #555;">
                    Choose how to ${actionText[actionType]}:
                </p>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 10px; cursor: pointer;">
                        <input type="radio" name="revisionChoice" value="current" checked style="margin-right: 8px;">
                        <strong>Update current revision</strong> (${currentRevInfo})
                    </label>
                    
                    <label style="display: block; cursor: pointer;">
                        <input type="radio" name="revisionChoice" value="new" style="margin-right: 8px;">
                        <strong>Create new revision</strong>
                    </label>
                </div>
                
                <div id="newRevisionOptions" style="margin-left: 20px; margin-bottom: 20px; display: none;">
                    <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #555;">
                        Optional description:
                    </label>
                    <input type="text" id="revisionDescription" maxlength="100" 
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                    <div style="font-size: 12px; color: #666; margin-top: 2px;">Maximum 100 characters</div>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button onclick="closeRevisionModal()" 
                            style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                        Cancel
                    </button>
                    <button onclick="processRevisionChoice()" 
                            style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                        Save
                    </button>
                </div>
            </div>
        `;
    }
    
    modal.innerHTML = modalContent;
    document.body.appendChild(modal);
    
    // Store callback and first revision flag for processing
    modal.revisionCallback = callback;
    modal.isFirstRevision = isFirstRevision;
    
    // Handle radio button changes (only for non-first revision)
    if (!isFirstRevision) {
        const radioButtons = modal.querySelectorAll('input[name="revisionChoice"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', function() {
                const newRevisionOptions = modal.querySelector('#newRevisionOptions');
                if (this.value === 'new') {
                    newRevisionOptions.style.display = 'block';
                } else {
                    newRevisionOptions.style.display = 'none';
                }
            });
        });
    }
    
    // Focus on description input for better UX
    setTimeout(() => {
        const descInput = modal.querySelector('#revisionDescription');
        if (descInput) {
            descInput.focus();
        }
    }, 100);
    
    // Make functions globally accessible for this modal
    window.currentRevisionModal = modal;
}

// Close revision modal
function closeRevisionModal() {
    if (window.currentRevisionModal) {
        window.currentRevisionModal.remove();
        window.currentRevisionModal = null;
    }
}

// Process revision choice
function processRevisionChoice() {
    const modal = window.currentRevisionModal;
    if (!modal) return;
    
    const isFirstRevision = modal.isFirstRevision;
    const description = modal.querySelector('#revisionDescription').value.trim();
    
    if (isFirstRevision) {
        // Create the first revision
        createFirstRevision(description, modal.revisionCallback);
    } else {
        // Existing logic for subsequent revisions
        const selectedChoice = modal.querySelector('input[name="revisionChoice"]:checked').value;
        
        if (selectedChoice === 'new') {
            // Check if we're at max revisions
            if (projectRevisions.length >= 5) {
                alert('Maximum of 5 revisions allowed. Please delete an old revision first.');
                return;
            }
            
            // Create new revision
            createNewRevision(description, modal.revisionCallback);
        } else {
            // Update current revision
            updateCurrentRevision(modal.revisionCallback);
        }
    }
    
    closeRevisionModal();
}

// New function specifically for creating the first revision
async function createFirstRevision(description, callback) {
    console.log('ðŸ“„ Creating first revision with description:', description);
    
    try {
        const firstRevision = {
            id: `rev_${Date.now()}`,
            number: 0,
            description: description || '',
            createdAt: new Date().toISOString(),
            createdBy: currentUser?.email || 'unknown',
            walls: [...projectEquipment] // Current walls state
        };
        
        projectRevisions.push(firstRevision);
        currentRevisionId = firstRevision.id;
        
        console.log('ðŸ“„ Saving first revision to database...', {
            revisionId: firstRevision.id,
            wallCount: firstRevision.walls.length,
            description: description || '(no description)'
        });
        
        const saveResult = await saveRevisionsToDatabase();
        
        if (saveResult === false) {
            // Save failed, revert changes
            projectEquipment.pop();
            projectRevisions.pop();
            currentRevisionId = null;
            alert('Failed to save wall. Please try again.');
            return;
        }
        
        console.log('âœ… First revision created successfully');
        
        // Success path
        renderEquipmentList();
        updateRevisionIndicator();
        clearWallForm();
        hideForm();
        showSuccessMessage();
        
        if (callback) callback();
        
    } catch (error) {
        console.error('Error creating first revision:', error);
        
        // Revert changes on error
        if (projectEquipment.length > 0) {
            projectEquipment.pop();
        }
        if (projectRevisions.length > 0) {
            projectRevisions.pop();
        }
        currentRevisionId = null;
        
        alert('Error creating first revision: ' + error.message);
    }
}

function showRevisionSelectionModal() {
    // Check if we have any revisions
    if (!projectRevisions || projectRevisions.length === 0) {
        alert('No revisions found. Please add walls to create revisions first.');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'revision-selection-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.5); display: flex; align-items: center; 
        justify-content: center; z-index: 2000;
    `;

    // Sort revisions by number
    const sortedRevisions = [...projectRevisions].sort((a, b) => a.number - b.number);
    
    let revisionsHTML = '';
    sortedRevisions.forEach((revision, index) => {
        const isLatest = revision.id === currentRevisionId;
        const wallCount = revision.walls?.length || 0;
        const createdDate = new Date(revision.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        const description = revision.description || '(no description)';
        const latestBadge = isLatest ? '<span style="background: #28a745; color: white; font-size: 11px; padding: 2px 6px; border-radius: 3px; margin-left: 8px;">CURRENT</span>' : '';
        
        revisionsHTML += `
            <label style="display: block; margin-bottom: 12px; cursor: pointer; padding: 12px; border: 1px solid #ddd; border-radius: 6px; background: ${isLatest ? '#f8fff8' : '#fff'}; transition: all 0.2s;">
                <input type="radio" name="selectedRevision" value="${revision.id}" ${isLatest ? 'checked' : ''} style="margin-right: 12px;">
                <div style="display: inline-block; vertical-align: top; width: calc(100% - 30px);">
                    <div style="font-weight: 500; color: #333; margin-bottom: 4px;">
                        Revision ${revision.number}${latestBadge}
                    </div>
                    <div style="font-size: 13px; color: #666; margin-bottom: 4px;">
                        ${description}
                    </div>
                    <div style="font-size: 12px; color: #888;">
                        ${createdDate} • ${wallCount} wall${wallCount !== 1 ? 's' : ''} • by ${revision.createdBy}
                    </div>
                </div>
            </label>
        `;
    });

    // UPDATED: Show selected options count in modal
    const optionsCount = selectedCFSSOptions.length;
    const optionsSummary = optionsCount > 0 ? 
        `<div style="background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 15px; border-left: 3px solid #007bff;">
            <div style="font-size: 13px; color: #495057;">
                <strong>Selected Options:</strong> ${optionsCount} construction option${optionsCount !== 1 ? 's' : ''} will be included from the Option List tab.
            </div>
        </div>` : 
        `<div style="background: #fff3cd; padding: 10px; border-radius: 4px; margin-bottom: 15px; border-left: 3px solid #ffc107;">
            <div style="font-size: 13px; color: #856404;">
                <strong>Note:</strong> No construction options selected. You can select options in the Option List tab before generating the report.
            </div>
        </div>`;

    modal.innerHTML = `
        <div style="background: white; padding: 25px; border-radius: 8px; min-width: 500px; max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h3 style="margin: 0 0 20px 0; color: #333; display: flex; align-items: center;">
                <i class="fas fa-file-pdf" style="margin-right: 10px; color: #dc3545;"></i>
                Generate CFSS Report
            </h3>
            
            <p style="margin-bottom: 20px; color: #555; line-height: 1.5;">
                Select which revision to generate the report for:
            </p>
            
            ${optionsSummary}
            
            <div style="margin-bottom: 25px; max-height: 300px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 6px; padding: 15px;">
                <div style="font-weight: 500; margin-bottom: 15px; color: #495057; border-bottom: 1px solid #e9ecef; padding-bottom: 8px;">
                    Available Revisions (${sortedRevisions.length})
                </div>
                ${revisionsHTML}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 12px; color: #6c757d;">
                    <i class="fas fa-info-circle" style="margin-right: 4px;"></i>
                    Construction options from the Option List tab will be included
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="closeRevisionSelectionModal()" 
                            style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                        Cancel
                    </button>
                    <button onclick="proceedToOptionsSelection()" 
                            style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-pdf"></i>
                        Generate Report
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add hover effects for revision options
    const labels = modal.querySelectorAll('label');
    labels.forEach(label => {
        label.addEventListener('mouseenter', () => {
            if (!label.querySelector('input').checked) {
                label.style.backgroundColor = '#f8f9fa';
                label.style.borderColor = '#007bff';
            }
        });
        
        label.addEventListener('mouseleave', () => {
            if (!label.querySelector('input').checked) {
                label.style.backgroundColor = '#fff';
                label.style.borderColor = '#ddd';
            }
        });
        
        // Update styling when selection changes
        const radio = label.querySelector('input');
        radio.addEventListener('change', () => {
            labels.forEach(l => {
                const isSelected = l.querySelector('input').checked;
                l.style.backgroundColor = isSelected ? '#f8fff8' : '#fff';
                l.style.borderColor = isSelected ? '#28a745' : '#ddd';
            });
        });
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeRevisionSelectionModal();
        }
    });

    // Store modal reference
    window.currentRevisionSelectionModal = modal;
}

// UPDATED: Proceed directly to report generation using tab-selected options
function proceedToOptionsSelection() {
    const modal = window.currentRevisionSelectionModal;
    if (!modal) return;

    const selectedRadio = modal.querySelector('input[name="selectedRevision"]:checked');
    if (!selectedRadio) {
        alert('Please select a revision.');
        return;
    }

    const selectedRevisionId = selectedRadio.value;
    const selectedRevision = projectRevisions.find(rev => rev.id === selectedRevisionId);
    
    if (!selectedRevision) {
        alert('Selected revision not found.');
        return;
    }

    // Close revision modal
    closeRevisionSelectionModal();
    
    // CHANGED: Skip options modal and directly generate report with tab-selected options
    generateCFSSReportDirectlyWithTabOptions(selectedRevision);
}

// NEW: Direct report generation using tab-selected options
async function generateCFSSReportDirectlyWithTabOptions(selectedRevision) {
    console.log('Generating CFSS report with tab-selected options...');
    
    // Get options from the tab interface
    const selectedOptions = [...selectedCFSSOptions]; // Use global array from tab selections
    
    console.log('Selected options from tab:', selectedOptions);
    console.log('Selected revision:', selectedRevision.number);

    // Show loading state
    const generateButton = document.getElementById('generateCFSSReportButton');
    if (generateButton) {
        generateButton.disabled = true;
        generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating CFSS Report...`;
    }

    try {
        // Generate report with tab-selected options
        await generateCFSSReportForRevisionWithOptions(selectedRevision, selectedOptions);
        
    } catch (error) {
        console.error('Error generating CFSS report:', error);
        alert('Error generating CFSS report: ' + error.message);
    } finally {
        if (generateButton) {
            generateButton.disabled = false;
            generateButton.innerHTML = '<i class="fas fa-file-pdf"></i> Generate CFSS Report';
        }
    }
}

// Updated report generation function that includes options
async function generateCFSSReportForRevisionWithOptions(selectedRevision, selectedOptions = []) {
    if (!currentProjectId) {
        alert('Error: No project selected');
        return;
    }

    const generateButton = document.getElementById('generateCFSSReportButton');
    
    // Check if user should get popups
    const allowedEmails = ['hoangminhduc.ite@gmail.com', 'anhquan1212004@gmail.com'];
    const shouldShowPopups = allowedEmails.includes(currentUser?.email);
    
    let signDocument = false;
    let saveToGoogleDrive = false;
    
    // Show popups if user is in allowed list
    if (shouldShowPopups) {
        try {
            // First popup: Signature
            signDocument = await showSignaturePopup();
            console.log('User signature choice:', signDocument);
            
            // Second popup: Google Drive
            saveToGoogleDrive = await showGoogleDrivePopup();
            console.log('User Google Drive choice:', saveToGoogleDrive);
        } catch (error) {
            console.error('Error showing popups:', error);
            alert('Error displaying options. Please try again.');
            return;
        }
    }
    
    try {
        generateButton.disabled = true;
        generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating CFSS PDF... (up to 30 seconds)';
        
        if (!selectedRevision || !selectedRevision.walls) {
            throw new Error('Invalid revision data');
        }

        const revisionsUpToSelected = projectRevisions
            .filter(rev => rev.number <= selectedRevision.number)
            .sort((a, b) => a.number - b.number);

        const cfssProjectData = {
            ...projectData,
            walls: [...selectedRevision.walls],
            wallRevisions: [...revisionsUpToSelected],
            currentWallRevisionId: selectedRevision.id,
            selectedRevisionNumber: selectedRevision.number,
            cfssWindData: cfssWindData,
            selectedOptions: selectedOptions,
            signDocument: signDocument  // Pass signature decision to backend
        };
        
        console.log('CFSS Report data:', {
            name: cfssProjectData.name,
            selectedRevision: selectedRevision.number,
            wallsCount: cfssProjectData.walls?.length || 0,
            revisionsIncluded: revisionsUpToSelected.map(r => `Rev ${r.number}`).join(', '),
            windDataCount: cfssProjectData.cfssWindData?.length || 0,
            selectedOptionsCount: selectedOptions.length,
            signDocument: signDocument,
            saveToGoogleDrive: saveToGoogleDrive
        });
        
        if (!cfssProjectData.walls || cfssProjectData.walls.length === 0) {
            alert(`Revision ${selectedRevision.number} contains no walls. Please select a revision with walls.`);
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/cfss-report`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectData: cfssProjectData
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 504) {
                throw new Error('CFSS PDF generation timed out. Please try again.');
            }
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'CFSS PDF generation failed');
        }

        if (!result.downloadUrl) {
            throw new Error('No download URL received from server');
        }

        console.log(`âœ… Opening CFSS download URL for Revision ${selectedRevision.number}`);
        
        // Handle Google Drive upload based on user choice
        if (shouldShowPopups && saveToGoogleDrive) {
            await sendReportToMakeWebhook(result.downloadUrl);
            alert('Report sent to Google Drive successfully!');
        } else {
            // Only download to browser if NOT saving to Google Drive
            window.location.href = result.downloadUrl;
        }
        
    } catch (error) {
        console.error('âŒ CFSS PDF generation error:', error);
        if (error.name === 'AbortError' || error.message.includes('504')) {
            alert('CFSS PDF generation timed out. Please try again in a few minutes.');
        } else {
            alert('Error generating CFSS report: ' + error.message);
        }
    } finally {
        generateButton.disabled = false;
        generateButton.innerHTML = '<i class="fas fa-file-pdf"></i> Generate CFSS Report';
    }
}

// Function to close revision selection modal
function closeRevisionSelectionModal() {
    if (window.currentRevisionSelectionModal) {
        window.currentRevisionSelectionModal.remove();
        window.currentRevisionSelectionModal = null;
    }
}

// Function to generate report for selected revision
async function generateSelectedRevisionReport() {
    const modal = window.currentRevisionSelectionModal;
    if (!modal) return;

    const selectedRadio = modal.querySelector('input[name="selectedRevision"]:checked');
    if (!selectedRadio) {
        alert('Please select a revision to generate the report for.');
        return;
    }

    const selectedRevisionId = selectedRadio.value;
    const selectedRevision = projectRevisions.find(rev => rev.id === selectedRevisionId);
    
    if (!selectedRevision) {
        alert('Selected revision not found.');
        return;
    }

    // Close the modal
    closeRevisionSelectionModal();

    // Generate report for selected revision
    await generateCFSSReportForRevision(selectedRevision);
}

// Main function to generate CFSS report for a specific revision
async function generateCFSSReportForRevision(selectedRevision) {
    if (!currentProjectId) {
        alert('Error: No project selected');
        return;
    }

    const generateButton = document.getElementById('generateCFSSReportButton');
    
    try {
        generateButton.disabled = true;
        generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating Revision ${selectedRevision.number} PDF...`;
        
        // Get all revisions up to and including the selected revision
        const revisionsUpToSelected = projectRevisions
            .filter(rev => rev.number <= selectedRevision.number)
            .sort((a, b) => a.number - b.number);
        
        // Prepare CFSS project data with selected revision
        const cfssProjectData = {
            ...projectData,
            walls: [...selectedRevision.walls], // Walls from selected revision
            wallRevisions: [...revisionsUpToSelected], // All revisions up to selected
            currentWallRevisionId: selectedRevision.id, // Set selected as "current" for report
            selectedRevisionNumber: selectedRevision.number, // Add revision number for filename
            cfssWindData: cfssWindData
        };
        
        console.log('ðŸ“Š Report data for revision', selectedRevision.number, ':', {
            name: cfssProjectData.name,
            selectedRevision: selectedRevision.number,
            wallsCount: cfssProjectData.walls?.length || 0,
            revisionsIncluded: revisionsUpToSelected.map(r => `Rev ${r.number}`).join(', '),
            windDataCount: cfssProjectData.cfssWindData?.length || 0
        });
        
        // Validate we have walls to report on
        if (!cfssProjectData.walls || cfssProjectData.walls.length === 0) {
            alert(`Revision ${selectedRevision.number} contains no walls. Please select a revision with walls.`);
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/cfss-report`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectData: cfssProjectData
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 504) {
                throw new Error('CFSS PDF generation timed out. Please try again.');
            }
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'CFSS PDF generation failed');
        }

        if (!result.downloadUrl) {
            throw new Error('No download URL received from server');
        }

        console.log(`âœ… Opening CFSS download URL for Revision ${selectedRevision.number}:`, result.downloadUrl);
        window.location.href = result.downloadUrl;
        
    } catch (error) {
        console.error('âŒ CFSS PDF generation error:', error);
        if (error.name === 'AbortError' || error.message.includes('504')) {
            alert('CFSS PDF generation timed out. Please try again in a few minutes.');
        } else {
            alert('Error generating CFSS report: ' + error.message);
        }
    } finally {
        generateButton.disabled = false;
        generateButton.innerHTML = '<i class="fas fa-file-pdf"></i> Generate CFSS Report';
    }
}

// Create new revision
async function createNewRevision(description, callback) {
    console.log('ðŸ“ Creating new revision with description:', description);
    
    const newRevisionNumber = projectRevisions.length;
    const newRevision = {
        id: `rev_${Date.now()}`,
        number: newRevisionNumber,
        description: description || '',
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.email || 'unknown',
        walls: [...projectEquipment] // Current walls state
    };
    
    projectRevisions.push(newRevision);
    currentRevisionId = newRevision.id;
    
    await saveRevisionsToDatabase();
    updateRevisionIndicator();
    
    console.log(`âœ… Created revision ${newRevisionNumber}: ${description || '(no description)'}`);
    
    if (callback) callback();
}

// Update current revision
async function updateCurrentRevision(callback) {
    console.log('ðŸ“ Updating current revision');
    
    const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
    if (currentRevision) {
        currentRevision.walls = [...projectEquipment];
        currentRevision.lastModified = new Date().toISOString();
        currentRevision.lastModifiedBy = currentUser?.email || 'unknown';
        
        await saveRevisionsToDatabase();
        console.log(`âœ… Updated revision ${currentRevision.number}`);
    }
    
    if (callback) callback();
}

async function saveRevisionsToDatabase() {
    try {
        console.log('ðŸ’¾ Saving revisions to database...', {
            totalRevisions: projectRevisions.length,
            currentRevisionId: currentRevisionId,
            projectId: currentProjectId,
            wallCount: projectEquipment.length
        });
        
        // Validate data before sending
        if (!currentProjectId) {
            throw new Error('No project ID available');
        }
        
        if (!projectRevisions || projectRevisions.length === 0) {
            throw new Error('No revisions to save');
        }
        
        // Ensure current revision exists and has the latest walls
        const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
        if (currentRevision) {
            currentRevision.walls = [...projectEquipment]; // Sync with current state
            currentRevision.lastModified = new Date().toISOString();
            currentRevision.lastModifiedBy = currentUser?.email || 'unknown';
        }
        
        const requestBody = {
            wallRevisions: projectRevisions,
            currentWallRevisionId: currentRevisionId
        };
        
        console.log('ðŸ“¤ Sending revision data:', {
            revisionsCount: projectRevisions.length,
            currentRevisionId: currentRevisionId,
            wallsInCurrentRevision: currentRevision?.walls?.length || 0
        });
        
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/wall-revisions`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });
        
        console.log('ðŸ“¥ Server response:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });
        
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMessage = errorData.error;
                }
                console.error('âŒ Server error details:', errorData);
            } catch (parseError) {
                try {
                    const errorText = await response.text();
                    console.error('âŒ Server error text:', errorText);
                    if (errorText) {
                        errorMessage += ` - ${errorText}`;
                    }
                } catch (textError) {
                    console.error('âŒ Could not parse error response:', parseError);
                }
            }
            throw new Error(errorMessage);
        }
        
        // Try to parse success response
        let responseData;
        try {
            responseData = await response.json();
            console.log('âœ… Save response data:', responseData);
        } catch (parseError) {
            console.warn('âš ï¸ Could not parse success response as JSON, but save appears successful');
        }
        
        console.log('âœ… Revisions saved successfully to database');
        return true;
        
    } catch (error) {
        console.error('âŒ Error saving revisions:', error);
        
        // Show user-friendly error message
        let userMessage = 'Error saving wall revisions: ';
        if (error.message.includes('network') || error.message.includes('fetch')) {
            userMessage += 'Network connection issue. Please check your internet and try again.';
        } else if (error.message.includes('403') || error.message.includes('Access denied')) {
            userMessage += 'You do not have permission to save walls for this project.';
        } else if (error.message.includes('404')) {
            userMessage += 'Project not found. The project may have been deleted.';
        } else {
            userMessage += error.message;
        }
        
        alert(userMessage);
        return false;
    }
}

function debugWallState() {
    console.log('=== WALL STATE DEBUG ===');
    console.log('projectEquipment:', projectEquipment?.length || 0, 'walls');
    console.log('projectRevisions:', projectRevisions?.length || 0, 'revisions');
    console.log('currentRevisionId:', currentRevisionId);
    
    if (projectRevisions && projectRevisions.length > 0) {
        const currentRev = projectRevisions.find(r => r.id === currentRevisionId);
        console.log('Current revision walls:', currentRev?.walls?.length || 0);
        console.log('Revision numbers:', projectRevisions.map(r => r.number));
    }
    
    console.log('cfssWindData:', cfssWindData?.length || 0, 'entries');
    console.log('========================');
}

// Debug function to check current state
function debugCurrentState() {
    console.log('=== CFSS DEBUG STATE ===');
    console.log('Current Project ID:', currentProjectId);
    console.log('Project Data:', projectData);
    console.log('Project Equipment (walls):', projectEquipment);
    console.log('Project Revisions:', projectRevisions);
    console.log('Current Revision ID:', currentRevisionId);
    console.log('CFSS Wind Data:', cfssWindData);
    
    if (projectRevisions && projectRevisions.length > 0) {
        console.log('--- REVISION DETAILS ---');
        projectRevisions.forEach((rev, index) => {
            console.log(`Revision ${index + 1}:`, {
                id: rev.id,
                number: rev.number,
                description: rev.description || '(no description)',
                wallCount: rev.walls?.length || 0,
                createdAt: rev.createdAt,
                createdBy: rev.createdBy,
                isCurrentRevision: rev.id === currentRevisionId
            });
            
            if (rev.walls && rev.walls.length > 0) {
                console.log(`  Walls in revision ${rev.number}:`, rev.walls.map(wall => ({
                    name: wall.equipment,
                    floor: wall.floor,
                    images: wall.images?.length || 0
                })));
            }
        });
    }
    console.log('=== END DEBUG ===');
}

// Function to manually reload project data
async function reloadProjectData() {
    try {
        console.log('ðŸ”„ Manually reloading project data...');
        
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects?id=${currentProjectId}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const projectResponse = await response.json();
        
        if (projectResponse.length > 0) {
            const project = projectResponse[0];
            window.projectData = project;
            projectData = project;
            
            console.log('ðŸ“Š Reloaded project data:', {
                name: project.name,
                hasRevisions: !!(project.wallRevisions && project.wallRevisions.length > 0),
                revisionCount: project.wallRevisions?.length || 0,
                currentRevisionId: project.currentWallRevisionId,
                hasEquipment: !!(project.equipment && project.equipment.length > 0),
                equipmentCount: project.equipment?.length || 0,
                hasCFSSData: !!(project.cfssWindData && project.cfssWindData.length > 0)
            });
            
            // Re-initialize revision system
            initializeRevisionSystem(project);
            
            // Re-render everything
            renderEquipmentList();
            updateRevisionIndicator();
            
            // Load CFSS data
            if (project.cfssWindData) {
                cfssWindData = project.cfssWindData;
                displayCFSSData(project.cfssWindData);
            }

            // Ensure floorGroups are preserved from backend
            if (project.cfssWindData && !project.cfssWindData.floorGroups) {
                project.cfssWindData.floorGroups = [];
            }
            
            console.log('âœ… Project data reloaded successfully');

            // Setup floor input listener
            setupFloorInputListener();
        }
        
    } catch (error) {
        console.error('âŒ Error reloading project data:', error);
        alert('Error reloading project data: ' + error.message);
    }
}

// Function to force save current state
async function forceSaveCurrentState() {
    try {
        console.log('ðŸ’¾ Force saving current state...');
        
        // Save both revisions and equipment
        const revisionSaveResult = await saveRevisionsToDatabase();
        const equipmentSaveResult = await saveEquipmentToProject({ silent: true });
        
        if (revisionSaveResult && equipmentSaveResult !== false) {
            console.log('âœ… Force save completed successfully');
            alert('Current state saved successfully');
        } else {
            throw new Error('One or more save operations failed');
        }
        
    } catch (error) {
        console.error('âŒ Error force saving:', error);
        alert('Error saving current state: ' + error.message);
    }
}

async function handleSaveEquipmentWithRevisions(e) {
    if (!canModifyProject()) {
        alert('You do not have permission to add walls to this project.');
        return;
    }
    
    console.log('ðŸ’¾ Save button clicked for CFSS wall with revisions!');
    
    try {
        const wallData = getWallFormData();
        if (!wallData) {
            return;
        }

        console.log('Wall data to save:', wallData);

        // Add wall to projectEquipment FIRST (before saving)
        projectEquipment.push(wallData);
        console.log('Wall added to projectEquipment, current count:', projectEquipment.length);

        // Check if this is the first wall
        const isFirstWall = projectRevisions.length === 0;
        
        if (isFirstWall) {
            console.log('ðŸ“„ First wall - showing revision popup for Revision 1');
            
            // Show revision popup for first wall
            showRevisionPopup('add', wallData.equipment, async () => {
                console.log('ðŸ“„ Creating first revision...');
                
                // This will be handled by processRevisionChoice
                // No additional logic needed here since the callback handles success
            }, true); // Pass true to indicate this is the first revision
            
        } else {
            // Show revision popup for subsequent saves
            showRevisionPopup('add', wallData.equipment, async () => {
                console.log('ðŸ“„ Saving wall to existing revision system...');
                
                // SINGLE SAVE OPERATION - revisions only
                const saveResult = await saveRevisionsToDatabase();
                if (saveResult === false) {
                    // Save failed, revert changes
                    projectEquipment.pop();
                    alert('Failed to save wall. Please try again.');
                    return;
                }
                
                console.log('âœ… Wall saved to revision successfully');
                
                renderEquipmentList();
                clearWallForm();
                hideForm();
                showSuccessMessage();
            });
        }
        
    } catch (error) {
        console.error('Error saving wall:', error);
        
        // Revert projectEquipment if error occurred
        if (projectEquipment.length > 0 && projectEquipment[projectEquipment.length - 1] === wallData) {
            projectEquipment.pop();
        }
        
        alert('Error saving wall: ' + error.message);
    }
}

// Updated saveEquipmentEdit with revision system
async function saveEquipmentEditWithRevisions(index, event) {
    event.preventDefault();
    
    if (!canModifyProject()) {
        alert('You do not have permission to edit walls in this project.');
        return;
    }

    try {
        const currentWall = projectEquipment[index];
        const wallName = currentWall.equipment;
        
        // Get all form values - Set 1
        const equipment = document.getElementById(`editEquipment${index}`).value.trim();
        const floor = document.getElementById(`editFloor${index}`).value.trim();
        const hauteurMax = document.getElementById(`editHauteurMax${index}`).value.trim();
        const hauteurMaxCombined = document.getElementById(`editHauteurMaxUnit${index}`).value.trim();
        const [hauteurMaxUnit, hauteurMaxMinorUnit] = hauteurMaxCombined.split('-');
        const hauteurMaxMinor = document.getElementById(`editHauteurMaxMinor${index}`).value.trim();
        const deflexionMax = document.getElementById(`editDeflexionMax${index}`).value.trim();
        const montantMetallique = document.getElementById(`editMontantMetallique${index}`).value.trim();
        const espacement = document.getElementById(`editEspacement${index}`).value.trim();
        const lisseSuperieure = document.getElementById(`editLisseSuperieure${index}`).value.trim();
        const lisseInferieure = document.getElementById(`editLisseInferieure${index}`).value.trim();

        const entremisePart1 = document.getElementById(`editEntremisePart1_${index}`).value.trim();
        const entremisePart2 = document.getElementById(`editEntremisePart2_${index}`).value.trim();
        let entremise = '';
        if (entremisePart1 === 'N/A') {
            entremise = 'N/A';
        } else if (entremisePart1 && entremisePart2) {
            entremise = `${entremisePart1} @${entremisePart2}`;
        } else if (entremisePart1) {
            entremise = entremisePart1;
        }

        const note = document.getElementById(`editNote${index}`).value.trim();
        
        // Get Set 2 values (if visible)
        const set2Visible = document.getElementById(`editSet2_${index}`).style.display !== 'none';
        const montantMetallique2 = set2Visible ? document.getElementById(`editMontantMetallique2_${index}`).value.trim() : '';
        const deflexionMax2 = set2Visible ? document.getElementById(`editDeflexionMax2_${index}`).value.trim() : '';
        const espacement2 = set2Visible ? document.getElementById(`editEspacement2_${index}`).value.trim() : '';
        const lisseSuperieure2 = set2Visible ? document.getElementById(`editLisseSuperieure2_${index}`).value.trim() : '';
        const lisseInferieure2 = set2Visible ? document.getElementById(`editLisseInferieure2_${index}`).value.trim() : '';
        let entremise2 = '';
        if (set2Visible) {
            const entremise2Part1 = document.getElementById(`editEntremise2Part1_${index}`).value.trim();
            const entremise2Part2 = document.getElementById(`editEntremise2Part2_${index}`).value.trim();
            if (entremise2Part1 === 'N/A') {
                entremise2 = 'N/A';
            } else if (entremise2Part1 && entremise2Part2) {
                entremise2 = `${entremise2Part1} @${entremise2Part2}`;
            } else if (entremise2Part1) {
                entremise2 = entremise2Part1;
            }
        }

        // Validation - Set 1 (required)
        if (!equipment) {
            alert('Please enter a wall name.');
            return;
        }

        if (!floor) {
            alert('Please enter a floor.');
            return;
        }

        if (!hauteurMax && !hauteurMaxMinor) {
            alert('Please enter at least one height value.');
            return;
        }

        if (hauteurMax && !hauteurMaxCombined) {
            alert('Please select units.');
            return;
        }

        if (!deflexionMax) {
            alert('Please select a déflexion max.');
            return;
        }

        if (!montantMetallique) {
            alert('Please select montant métallique.');
            return;
        }

        if (!espacement) {
            alert('Please select an espacement.');
            return;
        }

        if (!lisseSuperieure) {
            alert('Please enter lisse Supérieure.');
            return;
        }

        if (!lisseInferieure) {
            alert('Please enter lisse Inférieure.');
            return;
        }

        if (!entremise) {
            alert('Please select entremise.');
            return;
        }

        // Validation - Set 2 (if visible, all fields required)
        if (set2Visible) {
            if (!montantMetallique2) {
                alert('Please select montant métallique 2.');
                return;
            }
            if (!espacement2) {
                alert('Please select espacement 2.');
                return;
            }
            if (!lisseSuperieure2) {
                alert('Please enter lisse Supérieure 2.');
                return;
            }
            if (!lisseInferieure2) {
                alert('Please enter lisse Inférieure 2.');
                return;
            }
            if (!entremise2) {
                alert('Please select entremise 2.');
                return;
            }
        }

        // Create updated wall object
        const updatedWall = {
            ...currentWall,
            equipment: equipment,
            floor: floor,
            hauteurMax: hauteurMax || '0',
            hauteurMaxUnit: hauteurMaxUnit || 'ft',
            hauteurMaxMinor: hauteurMaxMinor || '0',
            hauteurMaxMinorUnit: hauteurMaxMinorUnit || 'in',
            deflexionMax: deflexionMax,
            montantMetallique: montantMetallique,
            dosADos: document.getElementById(`editDosADos${index}`)?.checked || false,
            espacement: espacement,
            lisseSuperieure: lisseSuperieure,
            lisseInferieure: lisseInferieure,
            entremise: entremise,
            note: note,
            lastModified: new Date().toISOString(),
            modifiedBy: window.currentUser?.email || 'unknown'
        };

        // Add Set 2 data if it exists
        if (set2Visible && montantMetallique2) {
            updatedWall.montantMetallique2 = montantMetallique2;
            updatedWall.deflexionMax2 = deflexionMax2;
            updatedWall.dosADos2 = document.getElementById(`editDosADos2_${index}`)?.checked || false;
            updatedWall.espacement2 = espacement2;
            updatedWall.lisseSuperieure2 = lisseSuperieure2;
            updatedWall.lisseInferieure2 = lisseInferieure2;
            updatedWall.entremise2 = entremise2;
        } else {
            // Clear Set 2 data if not visible
            updatedWall.montantMetallique2 = '';
            updatedWall.deflexionMax2 = '';
            updatedWall.dosADos2 = false;
            updatedWall.espacement2 = '';
            updatedWall.lisseSuperieure2 = '';
            updatedWall.lisseInferieure2 = '';
            updatedWall.entremise2 = '';
        }

        // Show revision popup
        showRevisionPopup('edit', wallName, async () => {
            // Handle images
            const editImages = getEditModeImages(index);
            updatedWall.images = editImages;
            
            console.log('Saving wall with images:', {
                wallName: updatedWall.equipment,
                imageCount: editImages.length,
                images: editImages.map(img => ({ key: img.key, filename: img.filename }))
            });
            
            // Update the project equipment array
            projectEquipment[index] = updatedWall;
            
            // Save to database
            await saveRevisionsToDatabase();
            
            // Clean up edit mode
            clearEditModeImages(index);
            
            // Re-render the equipment list
            renderEquipmentList();
            
            alert('Wall updated successfully!');
        });
        
    } catch (error) {
        console.error('Error saving wall edit:', error);
        alert('Error saving wall changes: ' + error.message);
    }
}

// Updated deleteEquipment with revision system
async function deleteEquipmentWithRevisions(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to delete walls from this project.');
        return;
    }

    const wall = projectEquipment[index];
    const wallName = wall.equipment;
    
    if (confirm(`Are you sure you want to delete wall "${wallName}" and all its images?`)) {
        
        showRevisionPopup('delete', wallName, async () => {
            // Delete associated images from S3 (existing code)
            if (wall.images && wall.images.length > 0) {
                try {
                    for (const image of wall.images) {
                        await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/delete`, {
                            method: 'POST',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({ key: image.key })
                        });
                    }
                    console.log('Wall images deleted from S3');
                } catch (error) {
                    console.error('Error deleting wall images:', error);
                }
            }
            
            projectEquipment.splice(index, 1);
            
            // Save to database
            await saveRevisionsToDatabase();
            
            renderEquipmentList();
        });
    }
}

// Helper functions
function hideForm() {
    const equipmentForm = document.getElementById('equipmentForm');
    const newCalcButton = document.getElementById('newCalculationButton');
    equipmentForm.classList.remove('show');
    if (newCalcButton) {
        newCalcButton.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';
    }
}

function showSuccessMessage() {
    const newWallIndex = projectEquipment.length - 1;
    setTimeout(() => {
        const newWallCard = document.querySelector(`#equipmentDetails${newWallIndex}`);
        if (newWallCard) {
            toggleEquipmentDetails(newWallIndex);
            newWallCard.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            const wallCard = newWallCard.closest('.equipment-card');
            if (wallCard) {
                wallCard.classList.add('highlighted');
                setTimeout(() => {
                    wallCard.classList.remove('highlighted');
                }, 3000);
            }
        }
    }, 100);
        
    alert('Wall saved successfully!');
}

// Function to check authentication
async function checkAuthentication() {
    try {
        console.log('ðŸ” Checking authentication using authHelper...');
        
        if (!window.authHelper) {
            window.authHelper = new AuthHelper();
        }
        authHelper = window.authHelper;
        
        const userData = await authHelper.checkAuthentication();
        
        if (!userData) {
            console.log('âŒ No user authenticated');
            document.getElementById('loadingProject').style.display = 'none';
            document.getElementById('authError').style.display = 'block';
            return false;
        }

        console.log('âœ… User authenticated:', userData.email);
        currentUser = userData;
        isAdmin = userData.isAdmin;
        
        authHelper.updateUserInterface();
        
        return true;

    } catch (error) {
        console.error('âŒ Authentication error:', error);
        document.getElementById('loadingProject').style.display = 'none';
        document.getElementById('authError').style.display = 'block';
        return false;
    }
}

function getAuthHeaders() {
    return authHelper.getAuthHeaders();
}

function handleAuthError(response) {
    if (response.status === 401) {
        document.getElementById('projectContainer').style.display = 'none';
        document.getElementById('authError').style.display = 'block';
        return true;
    }
    if (response.status === 403) {
        document.getElementById('projectContainer').style.display = 'none';
        document.getElementById('accessDenied').style.display = 'block';
        return true;
    }
    return false;
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        authHelper.logout();
        window.location.href = 'auth.html';
    }
}

function canModifyProject() {
    return !!(currentUser && currentUser.email);
}

function renderEquipmentList() {
    try {
        console.log('=== renderEquipmentList() for CFSS walls START ===');
        
        const equipmentListDiv = document.getElementById('equipmentList');
        
        if (!equipmentListDiv) {
            console.error('equipmentList div not found!');
            return;
        }
        
        // Destroy existing sortable instance if it exists
        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }
        
        equipmentListDiv.innerHTML = '';
        equipmentListDiv.className = 'equipment-list-container';

        if (projectEquipment.length === 0) {
            equipmentListDiv.innerHTML += '<p>No walls added yet.</p>';
            updateWallSummary();   
            return;
        }

        // Create a sortable container for the wall cards
        const sortableContainer = document.createElement('div');
        sortableContainer.id = 'sortable-wall-container';
        sortableContainer.className = 'sortable-wall-container';
        equipmentListDiv.appendChild(sortableContainer);

        // Get display order or use alphabetical
        let wallsToDisplay = [...projectEquipment];
        const displayOrder = getWallDisplayOrder();
        
        if (displayOrder && displayOrder.length > 0) {
            console.log('ðŸ“‹ Using custom display order:', displayOrder);
            // Sort walls according to saved display order
            wallsToDisplay.sort((a, b) => {
                const indexA = displayOrder.indexOf(a.id || `${a.equipment}_${a.floor}_${a.dateAdded}`);
                const indexB = displayOrder.indexOf(b.id || `${b.equipment}_${b.floor}_${b.dateAdded}`);
                
                // If not in display order, put at end
                if (indexA === -1 && indexB === -1) return 0;
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                
                return indexA - indexB;
            });
        } else {
            console.log('ðŸ“‹ Using alphabetical order (default)');
            // SORT WALLS BY NAME (DEFAULT)
            wallsToDisplay.sort((a, b) => {
                const nameA = (a.equipment || '').toLowerCase();
                const nameB = (b.equipment || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        }

        wallsToDisplay.forEach((wall, displayIndex) => {
            // Find the original index in projectEquipment array for operations
            const originalIndex = projectEquipment.findIndex(w => 
                w.equipment === wall.equipment && 
                w.floor === wall.floor &&
                w.dateAdded === wall.dateAdded
            );
            
            // Generate a unique ID for the wall if it doesn't have one
            if (!wall.id) {
                wall.id = `${wall.equipment}_${wall.floor}_${wall.dateAdded}`;
            }
            
            // Format hauteur max display with unit
            const hauteurMaxDisplay = formatHauteurDisplay(wall);
            
            const wallCard = document.createElement('div');
            wallCard.className = 'equipment-card draggable';
            wallCard.setAttribute('data-wall-id', wall.id);
            wallCard.setAttribute('data-original-index', originalIndex);
            
            wallCard.innerHTML = `
            <div class="drag-handle">
                <i class="fas fa-equals"></i>
            </div>
            <div class="equipment-header">
                <div class="equipment-info-compact">
                    <h4 title="Click to toggle details">
                        ${wall.equipment}
                    </h4>
                    <div class="equipment-meta-compact">
                        <span>Floor: ${wall.floor || 'N/A'}</span>
                        <span class="meta-separator">•</span>
                        <span>Hauteur: ${hauteurMaxDisplay}</span>
                        <span class="meta-separator">•</span>
                        <span>Déflexion: ${wall.deflexionMax || 'N/A'}</span>
                        <span class="meta-separator">•</span>
                        <span>Espacement: ${wall.espacement || 'N/A'}</span>
                    </div>
                </div>
                <div class="equipment-actions-compact">
                    <button class="details-btn" onclick="event.stopPropagation(); toggleEquipmentDetails(${originalIndex})">Details</button>
                    ${canModifyProject() ? `
                        <button class="duplicate-btn" onclick="event.stopPropagation(); duplicateEquipment(${originalIndex})" style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-copy"></i> Duplicate
                        </button>
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteEquipmentWithRevisions(${originalIndex})">Delete</button>
                    ` : ''}
                </div>
            </div>

                <div class="equipment-details" id="equipmentDetails${originalIndex}">
                    <!-- Details content here (same as before) -->
                    ${generateWallDetailsContent(wall, originalIndex)}
                </div>
            `;
            
            sortableContainer.appendChild(wallCard);

            // Add click event to entire card for toggling details
            wallCard.addEventListener('click', (e) => {
                if (e.target.closest('.equipment-actions-compact') || 
                    e.target.closest('.equipment-details') ||
                    e.target.closest('.drag-handle')) {
                    return;
                }
                toggleEquipmentDetails(originalIndex);
            });
            
            // Setup entremise dropdown event listeners for edit form
            setTimeout(() => {
                const part1Edit = document.getElementById(`editEntremisePart1_${originalIndex}`);
                const part2Edit = document.getElementById(`editEntremisePart2_${originalIndex}`);
                
                if (part1Edit && part2Edit) {
                    part1Edit.addEventListener('change', function() {
                        if (this.value === 'N/A') {
                            part2Edit.style.display = 'none';
                            part2Edit.required = false;
                            part2Edit.value = '';
                        } else {
                            part2Edit.style.display = '';
                            part2Edit.required = true;
                        }
                    });
                }
                
                const part1Edit2 = document.getElementById(`editEntremise2Part1_${originalIndex}`);
                const part2Edit2 = document.getElementById(`editEntremise2Part2_${originalIndex}`);
                
                if (part1Edit2 && part2Edit2) {
                    part1Edit2.addEventListener('change', function() {
                        if (this.value === 'N/A') {
                            part2Edit2.style.display = 'none';
                            part2Edit2.required = false;
                            part2Edit2.value = '';
                        } else {
                            part2Edit2.style.display = '';
                            part2Edit2.required = false;
                        }
                    });
                }
            }, 100);
        });
        
        updateWallSummary();  

        // Initialize SortableJS if user can modify
        if (canModifyProject()) {
            initializeSortable();
        }
        
    } catch (error) {
        console.error('Error in renderEquipmentList():', error);
    }
}

// Add this new function to generate wall details content
function generateWallDetailsContent(wall, originalIndex) {
    const hasSet2 = wall.montantMetallique2 && wall.montantMetallique2.trim() !== '';
    
    return `
        <div id="equipmentView${originalIndex}">
            <div class="equipment-details-container">
                <div class="equipment-info-section">
                    <p><strong>Wall Name:</strong> ${wall.equipment}</p>
                    <p><strong>Floor:</strong> ${wall.floor || 'N/A'}</p>
                    <p><strong>Hauteur Max:</strong> ${formatHauteurDisplay(wall)}</p>
                    
                    ${hasSet2 ? '<p style="margin-top: 15px; font-weight: bold; color: #666;">Set 1:</p>' : ''}
                    <p><strong>Montant Métallique:</strong> ${wall.montantMetallique || 'N/A'}${wall.dosADos ? ' dos-Ã -dos' : ''}</p>
                    <p><strong>Déflexion Max:</strong> ${wall.deflexionMax || 'N/A'}</p>
                    <p><strong>Espacement:</strong> ${wall.espacement || 'N/A'}</p>
                    <p><strong>Lisse Supérieure:</strong> ${wall.lisseSuperieure || 'N/A'}</p>
                    <p><strong>Lisse Inférieure:</strong> ${wall.lisseInferieure || 'N/A'}</p>
                    <p><strong>Entremise:</strong> ${wall.entremise || 'N/A'}</p>
                    
                    ${hasSet2 ? `
                        <p style="margin-top: 15px; font-weight: bold; color: #666;">Set 2:</p>
                        <p><strong>Montant Métallique 2:</strong> ${wall.montantMetallique2 || 'N/A'}${wall.dosADos2 ? ' dos-Ã -dos' : ''}</p>
                        <p><strong>Déflexion Max 2:</strong> ${wall.deflexionMax2 || 'N/A'}</p>
                        <p><strong>Espacement 2:</strong> ${wall.espacement2 || 'N/A'}</p>
                        <p><strong>Lisse Supérieure 2:</strong> ${wall.lisseSuperieure2 || 'N/A'}</p>
                        <p><strong>Lisse Inférieure 2:</strong> ${wall.lisseInferieure2 || 'N/A'}</p>
                        <p><strong>Entremise 2:</strong> ${wall.entremise2 || 'N/A'}</p>
                    ` : ''}
                    
                    ${wall.note ? `<p><strong>Note:</strong> ${wall.note}</p>` : ''}
                    ${wall.dateAdded ? `<p class="added-info">Added: ${new Date(wall.dateAdded).toLocaleDateString()} by ${wall.addedBy || 'Unknown'}</p>` : ''}
                    
                    ${canModifyProject() ? `
                        <div style="margin-top: 15px;">
                            <button class="edit-btn" onclick="editEquipment(${originalIndex})" style="background: #ffc107; color: #212529; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-edit"></i> Edit Wall
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                <div class="equipment-images-section">
                    <h4>Images:</h4>
                    ${renderWallImages(wall, originalIndex)}
                </div>
            </div>
        </div>
        
        ${generateEditForm(wall, originalIndex)}
    `;
}

// Add this function to generate the edit form
function generateEditForm(wall, originalIndex) {
    const hasSet2 = wall.montantMetallique2 && wall.montantMetallique2.trim() !== '';
    
    return `
        <form id="equipmentEdit${originalIndex}" style="display: none;" onsubmit="saveEquipmentEditWithRevisions(${originalIndex}, event)">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                
                <!-- Left Column -->
                <div>
                    <!-- Wall Name -->
                    <div class="form-group">
                        <label for="editEquipment${originalIndex}"><strong>Wall Name:</strong></label>
                        <input type="text" id="editEquipment${originalIndex}" value="${wall.equipment || ''}" 
                               required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                    </div>

                    <!-- Floor -->
                    <div class="form-group">
                        <label for="editFloor${originalIndex}"><strong>Floor:</strong></label>
                        <input type="text" id="editFloor${originalIndex}" value="${wall.floor || ''}" 
                               required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                    </div>

                    <!-- Hauteur Max with Units -->
                    <div class="form-group">
                        <label for="editHauteurMax${originalIndex}"><strong>Hauteur Max:</strong></label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="number" id="editHauteurMax${originalIndex}" 
                                   value="${wall.hauteurMax || ''}" min="0" step="1"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;"
                                   placeholder="Main height">
                            <input type="text" id="editHauteurMaxMinor${originalIndex}" 
                                   value="${wall.hauteurMaxMinor || ''}"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;"
                                   placeholder="">
                            <select id="editHauteurMaxUnit${originalIndex}" 
                                    onchange="toggleEditMinorField(${originalIndex}, 'hauteur')"
                                    style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                <option value="ft-in" ${(wall.hauteurMaxUnit === 'ft' || !wall.hauteurMaxUnit) ? 'selected' : ''}>ft-in</option>
                                <option value="mm" ${wall.hauteurMaxUnit === 'm' || wall.hauteurMaxUnit === 'mm' ? 'selected' : ''}>mm</option>
                            </select>
                        </div>
                        <div id="editHauteurPreview${originalIndex}" style="margin-top: 5px; font-size: 13px; color: #666;"></div>
                    </div>

                    <!-- Note -->
                    <div class="form-group">
                        <label for="editNote${originalIndex}"><strong>Note:</strong></label>
                        <input type="text" id="editNote${originalIndex}" value="${wall.note || ''}" 
                               maxlength="100" placeholder="Optional note (max 100 characters)..."
                               style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                        <div style="font-size: 12px; color: #666; margin-top: 2px;">Maximum 100 characters</div>
                    </div>
                </div>

                <!-- Right Column - Dual Sets -->
                <div>
                    <!-- Dual Set Container for Edit -->
                    <div id="editDualSetContainer${originalIndex}" style="position: relative;">
                        <!-- Set 1 and Set 2 Wrapper -->
                        <div id="editSetsWrapper${originalIndex}" style="display: flex; gap: 15px;">
                            
                            <!-- SET 1 -->
                            <div id="editSet1_${originalIndex}" style="flex: 1; min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <h4 style="margin: 0; font-size: 13px; color: #666;">Set 1</h4>
                                    <button type="button" id="editAddSet2Btn${originalIndex}" onclick="toggleEditSet2(${originalIndex}, true, event)" 
                                            style="background: #28a745; color: white; border: none; width: 20px; height: 20px; border-radius: 3px; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; display: ${hasSet2 ? 'none' : 'inline-block'};">
                                        +
                                    </button>
                                </div>

                                <div class="form-group">
                                    <label for="editMontantMetallique${originalIndex}"><strong>Montant Métallique:</strong></label>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <select id="editMontantMetallique${originalIndex}" required 
                                                style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                            <option value="">Select montant métallique...</option>
                                            ${generateMontantOptions(wall.montantMetallique)}
                                        </select>
                                        <label style="display: flex; align-items: center; gap: 5px; white-space: nowrap; margin: 0;">
                                            <input type="checkbox" id="editDosADos${originalIndex}" ${wall.dosADos ? 'checked' : ''} style="margin: 0;">
                                            <span>dos-Ã -dos</span>
                                        </label>
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label for="editDeflexionMax${originalIndex}"><strong>Déflexion Max:</strong></label>
                                    <select id="editDeflexionMax${originalIndex}" required 
                                            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                        <option value="">Select déflexion max...</option>
                                        <option value="L/180" ${wall.deflexionMax === 'L/180' ? 'selected' : ''}>L/180</option>
                                        <option value="L/240" ${wall.deflexionMax === 'L/240' ? 'selected' : ''}>L/240</option>
                                        <option value="L/360" ${wall.deflexionMax === 'L/360' ? 'selected' : ''}>L/360</option>
                                        <option value="L/480" ${wall.deflexionMax === 'L/480' ? 'selected' : ''}>L/480</option>
                                        <option value="L/600" ${wall.deflexionMax === 'L/600' ? 'selected' : ''}>L/600</option>
                                        <option value="L/720" ${wall.deflexionMax === 'L/720' ? 'selected' : ''}>L/720</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="editEspacement${originalIndex}"><strong>Espacement:</strong></label>
                                    <select id="editEspacement${originalIndex}" required 
                                            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                        <option value="">Select espacement...</option>
                                        <option value="8&quot;c/c" ${wall.espacement === '8"c/c' ? 'selected' : ''}>8"c/c</option>
                                        <option value="12&quot;c/c" ${wall.espacement === '12"c/c' ? 'selected' : ''}>12"c/c</option>
                                        <option value="16&quot;c/c" ${wall.espacement === '16"c/c' ? 'selected' : ''}>16"c/c</option>
                                        <option value="24&quot;c/c" ${wall.espacement === '24"c/c' ? 'selected' : ''}>24"c/c</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="editLisseSuperieure${originalIndex}"><strong>Lisse Supérieure:</strong></label>
                                    <input type="text" id="editLisseSuperieure${originalIndex}" value="${wall.lisseSuperieure || ''}" 
                                           required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                </div>

                                <div class="form-group">
                                    <label for="editLisseInferieure${originalIndex}"><strong>Lisse Inférieure:</strong></label>
                                    <input type="text" id="editLisseInferieure${originalIndex}" value="${wall.lisseInferieure || ''}" 
                                           required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                </div>

                                <div class="form-group">
                                    <label for="editEntremise${originalIndex}"><strong>Entremise:</strong></label>
                                    <div style="display: flex; gap: 10px;">
                                        <select id="editEntremisePart1_${originalIndex}" required style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                            <option value="">Select...</option>
                                            ${(() => {
                                                const [part1, part2] = (wall.entremise || '').includes('@') 
                                                    ? wall.entremise.split(' @') 
                                                    : [wall.entremise || '', ''];
                                                return `
                                                    <option value="150U50-43" ${part1 === '150U50-43' ? 'selected' : ''}>150U50-43</option>
                                                    <option value="150U50-54" ${part1 === '150U50-54' ? 'selected' : ''}>150U50-54</option>
                                                    <option value="N/A" ${part1 === 'N/A' ? 'selected' : ''}>N/A</option>
                                                `;
                                            })()}
                                        </select>
                                        <select id="editEntremisePart2_${originalIndex}" required style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; ${(() => {
                                            const [part1] = (wall.entremise || '').includes('@') ? wall.entremise.split(' @') : [wall.entremise || '', ''];
                                            return part1 === 'N/A' ? 'display: none;' : '';
                                        })()}">
                                            <option value="">Select spacing...</option>
                                            ${(() => {
                                                const [part1, part2] = (wall.entremise || '').includes('@') 
                                                    ? wall.entremise.split(' @') 
                                                    : [wall.entremise || '', ''];
                                                return `
                                                    <option value="48&quot;c/c" ${part2 === '48"c/c' ? 'selected' : ''}>48"c/c</option>
                                                    <option value="Mi-hauteur" ${part2 === 'Mi-hauteur' ? 'selected' : ''}>Mi-hauteur</option>
                                                    <option value="60&quot;c/c" ${part2 === '60"c/c' ? 'selected' : ''}>60"c/c</option>
                                                    <option value="72&quot;c/c" ${part2 === '72"c/c' ? 'selected' : ''}>72"c/c</option>
                                                    <option value="96&quot;c/c" ${part2 === '96"c/c' ? 'selected' : ''}>96"c/c</option>
                                                `;
                                            })()}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- SET 2 (Conditionally visible) -->
                            <div id="editSet2_${originalIndex}" style="flex: 1; min-width: 0; display: ${hasSet2 ? 'block' : 'none'};">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <h4 style="margin: 0; font-size: 13px; color: #666;">Set 2</h4>
                                    <button type="button" id="editRemoveSet2Btn${originalIndex}" onclick="toggleEditSet2(${originalIndex}, false, event)" 
                                            style="background: #dc3545; color: white; border: none; width: 20px; height: 20px; border-radius: 3px; cursor: pointer; font-size: 14px; line-height: 1; padding: 0;">
                                        ×
                                    </button>
                                </div>

                                <div class="form-group">
                                    <label for="editMontantMetallique2_${originalIndex}"><strong>Montant Métallique 2:</strong></label>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <select id="editMontantMetallique2_${originalIndex}" 
                                                style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                            <option value="">Select montant métallique...</option>
                                            ${generateMontantOptions(wall.montantMetallique2 || '')}
                                        </select>
                                        <label style="display: flex; align-items: center; gap: 5px; white-space: nowrap; margin: 0;">
                                            <input type="checkbox" id="editDosADos2_${originalIndex}" ${wall.dosADos2 ? 'checked' : ''} style="margin: 0;">
                                            <span>dos-Ã -dos</span>
                                        </label>
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label for="editDeflexionMax2_${originalIndex}"><strong>Déflexion Max 2:</strong></label>
                                    <select id="editDeflexionMax2_${originalIndex}" 
                                            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                        <option value="">Select déflexion max...</option>
                                        <option value="L/180" ${wall.deflexionMax2 === 'L/180' ? 'selected' : ''}>L/180</option>
                                        <option value="L/240" ${wall.deflexionMax2 === 'L/240' ? 'selected' : ''}>L/240</option>
                                        <option value="L/360" ${wall.deflexionMax2 === 'L/360' ? 'selected' : ''}>L/360</option>
                                        <option value="L/480" ${wall.deflexionMax2 === 'L/480' ? 'selected' : ''}>L/480</option>
                                        <option value="L/600" ${wall.deflexionMax2 === 'L/600' ? 'selected' : ''}>L/600</option>
                                        <option value="L/720" ${wall.deflexionMax2 === 'L/720' ? 'selected' : ''}>L/720</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <select id="editEspacement2_${originalIndex}" 
                                            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                        <option value="">Select espacement...</option>
                                        <option value="8&quot;c/c" ${wall.espacement2 === '8"c/c' ? 'selected' : ''}>8"c/c</option>
                                        <option value="12&quot;c/c" ${wall.espacement2 === '12"c/c' ? 'selected' : ''}>12"c/c</option>
                                        <option value="16&quot;c/c" ${wall.espacement2 === '16"c/c' ? 'selected' : ''}>16"c/c</option>
                                        <option value="24&quot;c/c" ${wall.espacement2 === '24"c/c' ? 'selected' : ''}>24"c/c</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="editLisseSuperieure2_${originalIndex}"><strong>Lisse Supérieure 2:</strong></label>
                                    <input type="text" id="editLisseSuperieure2_${originalIndex}" value="${wall.lisseSuperieure2 || ''}" 
                                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                </div>

                                <div class="form-group">
                                    <label for="editLisseInferieure2_${originalIndex}"><strong>Lisse Inférieure 2:</strong></label>
                                    <input type="text" id="editLisseInferieure2_${originalIndex}" value="${wall.lisseInferieure2 || ''}" 
                                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                </div>

                                <div class="form-group">
                                    <label for="editEntremise2_${originalIndex}"><strong>Entremise 2:</strong></label>
                                    <div style="display: flex; gap: 10px;">
                                        <select id="editEntremise2Part1_${originalIndex}" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                            <option value="">Select...</option>
                                            ${(() => {
                                                const [part1, part2] = (wall.entremise2 || '').includes('@') 
                                                    ? wall.entremise2.split(' @') 
                                                    : [wall.entremise2 || '', ''];
                                                return `
                                                    <option value="150U50-43" ${part1 === '150U50-43' ? 'selected' : ''}>150U50-43</option>
                                                    <option value="150U50-54" ${part1 === '150U50-54' ? 'selected' : ''}>150U50-54</option>
                                                    <option value="N/A" ${part1 === 'N/A' ? 'selected' : ''}>N/A</option>
                                                `;
                                            })()}
                                        </select>
                                        <select id="editEntremise2Part2_${originalIndex}" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; ${(() => {
                                            const [part1] = (wall.entremise2 || '').includes('@') ? wall.entremise2.split(' @') : [wall.entremise2 || '', ''];
                                            return part1 === 'N/A' ? 'display: none;' : '';
                                        })()}">
                                            <option value="">Select spacing...</option>
                                            ${(() => {
                                                const [part1, part2] = (wall.entremise2 || '').includes('@') 
                                                    ? wall.entremise2.split(' @') 
                                                    : [wall.entremise2 || '', ''];
                                                return `
                                                    <option value="48&quot;c/c" ${part2 === '48"c/c' ? 'selected' : ''}>48"c/c</option>
                                                    <option value="Mi-hauteur" ${part2 === 'Mi-hauteur' ? 'selected' : ''}>Mi-hauteur</option>
                                                    <option value="60&quot;c/c" ${part2 === '60"c/c' ? 'selected' : ''}>60"c/c</option>
                                                    <option value="72&quot;c/c" ${part2 === '72"c/c' ? 'selected' : ''}>72"c/c</option>
                                                    <option value="96&quot;c/c" ${part2 === '96"c/c' ? 'selected' : ''}>96"c/c</option>
                                                `;
                                            })()}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Image Upload Section for Edit Mode -->
            <div class="edit-image-section" style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0; color: #333; font-size: 16px;">Wall Images</h4>
                    <button type="button" class="camera-btn" onclick="triggerEditImageUpload(${originalIndex}, event)"
                            style="background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;">
                        <i class="fas fa-camera"></i> Add Images
                    </button>
                </div>
                
                <div id="editDropZone${originalIndex}" tabindex="0"
                    style="border: 2px dashed #ddd; border-radius: 8px; padding: 30px; text-align: center; background: white; cursor: default; min-height: 120px;">
                    <p style="color: #666; margin: 0 0 10px 0;">
                        <i class="fas fa-images" style="font-size: 32px; color: #ccc; margin-bottom: 8px;"></i><br>
                        Drop images here or paste from clipboard<br>
                        <small>Or click the button above to select files</small>
                    </p>
                    <div id="editImagePreviewContainer${originalIndex}" style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 15px;"></div>
                </div>
                
                <input type="file" id="editImageFileInput${originalIndex}" multiple accept="image/*" style="display: none;">
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button type="button" onclick="cancelEquipmentEdit(${originalIndex})" 
                        style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
                <button type="submit" 
                        style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-save"></i> Save Changes
                </button>
            </div>
        </form>
    `;
}

// Helper function to generate montant options with current selection
function generateMontantOptions(currentSelection) {
    if (typeof window.colombageData === 'undefined') {
        return '<option value="">Loading options...</option>';
    }
    
    const sortedKeys = Object.keys(window.colombageData).sort();
    let optionsHtml = '';
    
    sortedKeys.forEach(montant => {
        const selected = montant === currentSelection ? 'selected' : '';
        optionsHtml += `<option value="${montant}" ${selected}>${montant}</option>`;
    });
    
    return optionsHtml;
}

// Initialize SortableJS
function initializeSortable() {
    const container = document.getElementById('sortable-wall-container');
    if (!container) {
        console.warn('Sortable container not found');
        return;
    }
    
    sortableInstance = Sortable.create(container, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        chosenClass: 'sortable-chosen',
        handle: '.drag-handle',
        forceFallback: false,
        fallbackOnBody: false,
        swapThreshold: 0.65,
        
        onStart: function(evt) {
            console.log('ðŸŽ¯ Started dragging wall:', evt.item.querySelector('h4').textContent);
        },
        
        onEnd: async function(evt) {
            console.log('âœ‹ Dropped wall at new position');
            
            // Get the new order of wall IDs
            const newOrder = Array.from(container.children).map(card => 
                card.getAttribute('data-wall-id')
            );
            
            console.log('ðŸ“‹ New wall order:', newOrder);
            
            // Update the actual projectEquipment array order
            const reorderedWalls = [];
            newOrder.forEach(wallId => {
                const wall = projectEquipment.find(w => 
                    (w.id || `${w.equipment}_${w.floor}_${w.dateAdded}`) === wallId
                );
                if (wall) {
                    reorderedWalls.push(wall);
                }
            });
            
            // Update projectEquipment with new order
            projectEquipment = reorderedWalls;
            
            // Save the new display order to revision
            await saveWallDisplayOrder(newOrder);
        }
    });
    
    console.log('âœ… SortableJS initialized for wall cards');
}

function duplicateEquipment(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to add walls to this project.');
        return;
    }

    const wallToDuplicate = projectEquipment[index];
    
    // Clear any existing form data and images
    clearWallForm();
    window.currentWallImages = wallToDuplicate.images ? [...wallToDuplicate.images] : [];
    
    // Populate form with wall data (except images)
    document.getElementById('equipment').value = wallToDuplicate.equipment;
    document.getElementById('floor').value = wallToDuplicate.floor || '';
    document.getElementById('hauteurMax').value = wallToDuplicate.hauteurMax || '';
    const combinedUnit = `${wallToDuplicate.hauteurMaxUnit || 'ft'}-${wallToDuplicate.hauteurMaxMinorUnit || 'in'}`;
    document.getElementById('hauteurMaxUnit').value = combinedUnit;
    document.getElementById('hauteurMaxMinor').value = wallToDuplicate.hauteurMaxMinor || '';
    document.getElementById('deflexionMax').value = wallToDuplicate.deflexionMax || '';
    document.getElementById('montantMetallique').value = wallToDuplicate.montantMetallique || '';
    document.getElementById('lisseSuperieure').value = wallToDuplicate.lisseSuperieure || '';
    document.getElementById('lisseInferieure').value = wallToDuplicate.lisseInferieure || '';
    
    // Split entremise back into two parts
    const entremiseValue = wallToDuplicate.entremise || '';
    let entremisePart1 = '';
    let entremisePart2 = '';
    if (entremiseValue === 'N/A') {
        entremisePart1 = 'N/A';
    } else if (entremiseValue.includes(' @')) {
        const parts = entremiseValue.split(' @');
        entremisePart1 = parts[0];
        entremisePart2 = parts[1];
    } else {
        entremisePart1 = entremiseValue;
    }
    document.getElementById('entremisePart1').value = entremisePart1;
    document.getElementById('entremisePart2').value = entremisePart2;
    
    document.getElementById('espacement').value = wallToDuplicate.espacement || '';
    document.getElementById('dosADos').checked = wallToDuplicate.dosADos || false;
    document.getElementById('note').value = wallToDuplicate.note || '';
    // Display duplicated images in preview
if (window.currentWallImages.length > 0) {
    const previewContainer = document.getElementById('imagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        window.currentWallImages.forEach((imageData) => {
            const preview = document.createElement('div');
            preview.className = 'image-preview';
            preview.innerHTML = `
                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename}">
                <button type="button" class="image-remove" title="Remove image">×</button>
            `;
            previewContainer.appendChild(preview);
            
            // Add remove listener
            const removeButton = preview.querySelector('.image-remove');
            removeButton.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                removeImage(imageData.key);
            });
            
            // Load the actual image
            loadImagePreview(preview.querySelector('img'), imageData.key);
        });
        updateImagePreviewLayout();
        updateDropZoneState();
    }
}
    
    // Handle Set 2 if it exists
    const hasSet2 = wallToDuplicate.montantMetallique2 && wallToDuplicate.montantMetallique2.trim() !== '';
    if (hasSet2) {
        // Show Set 2
        toggleSet2(true);
        
        // Populate Set 2 fields
        document.getElementById('montantMetallique2').value = wallToDuplicate.montantMetallique2 || '';
        document.getElementById('deflexionMax2').value = wallToDuplicate.deflexionMax2 || '';
        document.getElementById('espacement2').value = wallToDuplicate.espacement2 || '';
        document.getElementById('lisseSuperieure2').value = wallToDuplicate.lisseSuperieure2 || '';
        document.getElementById('lisseInferieure2').value = wallToDuplicate.lisseInferieure2 || '';
        document.getElementById('dosADos2').checked = wallToDuplicate.dosADos2 || false;
        
        // Split entremise2 into two parts
        const entremise2Value = wallToDuplicate.entremise2 || '';
        let entremise2Part1 = '';
        let entremise2Part2 = '';
        if (entremise2Value === 'N/A') {
            entremise2Part1 = 'N/A';
        } else if (entremise2Value.includes(' @')) {
            const parts = entremise2Value.split(' @');
            entremise2Part1 = parts[0];
            entremise2Part2 = parts[1];
        } else {
            entremise2Part1 = entremise2Value;
        }
        document.getElementById('entremise2Part1').value = entremise2Part1;
        document.getElementById('entremise2Part2').value = entremise2Part2;
    }
    
    // Show the form
    const equipmentForm = document.getElementById('equipmentForm');
    const newCalcButton = document.getElementById('newCalculationButton');
    
    if (equipmentForm && newCalcButton) {
        equipmentForm.classList.add('show');
        newCalcButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
        
        // Scroll to form
        equipmentForm.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
        
        // Focus on the floor field so user can modify it
        setTimeout(() => {
            const floorField = document.getElementById('floor');
            if (floorField) {
                floorField.focus();
                floorField.select();
            }
        }, 100);
    }
    
    console.log(`Duplicated wall: ${wallToDuplicate.equipment}`);
}

function toggleEditSet2(wallIndex, show, event) {
    if (event) event.preventDefault();
    
    const set2Container = document.getElementById(`editSet2_${wallIndex}`);
    const addBtn = document.getElementById(`editAddSet2Btn${wallIndex}`);
    
    if (show) {
        set2Container.style.display = 'block';
        addBtn.style.display = 'none';
    } else {
        set2Container.style.display = 'none';
        addBtn.style.display = 'inline-block';
        
        // Clear Set 2 fields
        const montant2 = document.getElementById(`editMontantMetallique2_${wallIndex}`);
        const deflexion2 = document.getElementById(`editDeflexionMax2_${wallIndex}`);
        const espacement2 = document.getElementById(`editEspacement2_${wallIndex}`);
        const lisseSuperieure2 = document.getElementById(`editLisseSuperieure2_${wallIndex}`);
        const lisseInferieure2 = document.getElementById(`editLisseInferieure2_${wallIndex}`);
        const entremise2 = document.getElementById(`editEntremise2_${wallIndex}`);
        
        if (montant2) montant2.value = '';
        if (deflexion2) deflexion2.value = '';
        if (espacement2) espacement2.value = '';
        if (lisseSuperieure2) lisseSuperieure2.value = '';
        if (lisseInferieure2) lisseInferieure2.value = '';
        if (entremise2) entremise2.value = '';
    }
}

function toggleEditParapetSet2(parapetId, show, event) {
    if (event) event.preventDefault();

    const set2Container = document.getElementById(`editParapetSet2${parapetId}`);
    const addBtn = document.getElementById(`editParapetAddSet2Btn${parapetId}`);

    if (!set2Container || !addBtn) {
        return;
    }

    if (show) {
        set2Container.style.display = 'block';
        addBtn.style.display = 'none';
    } else {
        set2Container.style.display = 'none';
        addBtn.style.display = 'inline-block';

        // Clear Set 2 fields
        const montant2 = document.getElementById(`editParapetMontantMetallique2${parapetId}`);
        const espacement2 = document.getElementById(`editParapetEspacement2${parapetId}`);
        const lisseSuperieure2 = document.getElementById(`editParapetLisseSuperieure2${parapetId}`);
        const lisseInferieure2 = document.getElementById(`editParapetLisseInferieure2${parapetId}`);
        const entremise2 = document.getElementById(`editParapetEntremise2${parapetId}`);

        if (montant2) montant2.value = '';
        if (espacement2) espacement2.value = '';
        if (lisseSuperieure2) lisseSuperieure2.value = '';
        if (lisseInferieure2) lisseInferieure2.value = '';
        if (entremise2) entremise2.value = '';
    }
}

window.toggleEditSet2 = toggleEditSet2;

// Function to toggle wall details
function toggleEquipmentDetails(index) {
    const detailsDiv = document.getElementById(`equipmentDetails${index}`);
    const wallCard = detailsDiv.closest('.equipment-card');
    const detailsButton = wallCard.querySelector('.details-btn');
    
    if (detailsDiv.classList.contains('show')) {
        detailsDiv.classList.remove('show');
        if (detailsButton) {
            detailsButton.textContent = 'Details';
        }
    } else {
        // Close all forms when opening details
        hideAllForms();
        
        detailsDiv.classList.add('show');
        if (detailsButton) {
            detailsButton.textContent = 'Hide Details';
        }
    }
}

// Enhanced editEquipment function with better setup
function editEquipment(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to edit walls in this project.');
        return;
    }

    const wall = projectEquipment[index];
    console.log(`Starting edit mode for wall ${wall.equipment} at index ${index}`);
    
    // Show edit form and hide view
    document.getElementById(`equipmentView${index}`).style.display = 'none';
    document.getElementById(`equipmentEdit${index}`).style.display = 'block';
    
    // Ensure details section is expanded
    const detailsDiv = document.getElementById(`equipmentDetails${index}`);
    const detailsButton = detailsDiv.closest('.equipment-card').querySelector('.details-btn');
    
    if (!detailsDiv.classList.contains('show')) {
        detailsDiv.classList.add('show');
        if (detailsButton) {
            detailsButton.textContent = 'Hide Details';
        }
    }
    
    // Setup enhanced height preview for edit mode
    setTimeout(() => {
        setupEditHauteurPreview(index);
        setupEditMontantChangeHandler(index);
        setupEditImageHandlers(index);
        loadExistingImagesInEdit(wall, index);
        
        // Initialize minor field visibility based on current unit selection
        toggleEditMinorField(index, 'hauteur');
        
        console.log(`Edit mode setup complete for wall ${index}`);
    }, 100);
}

// Setup height preview for edit mode
function setupEditHauteurPreview(wallIndex) {
    const majorInput = document.getElementById(`editHauteurMax${wallIndex}`);
    const majorUnitSelect = document.getElementById(`editHauteurMaxUnit${wallIndex}`);
    const minorInput = document.getElementById(`editHauteurMaxMinor${wallIndex}`);
    const minorUnitSelect = document.getElementById(`editHauteurMaxMinorUnit${wallIndex}`);
    const preview = document.getElementById(`editHauteurPreview${wallIndex}`);
    
    if (!majorInput || !majorUnitSelect || !minorInput || !minorUnitSelect || !preview) {
        return;
    }
    
    function updateEditPreview() {
        const major = majorInput.value || '0';
        const majorUnit = majorUnitSelect.value || 'ft';
        const minor = minorInput.value || '0';
        const minorUnit = minorUnitSelect.value || 'in';
        
        if (major === '0' && minor === '0') {
            preview.textContent = 'Preview: --';
            preview.style.color = '#666';
        } else {
            const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
            preview.textContent = `Preview: ${formatted}`;
            preview.style.color = '#2c5aa0';
        }
    }
    
    // AUTO-PAIRING: ft with in, m with mm
    majorUnitSelect.addEventListener('change', function() {
        const majorUnit = this.value;
        
        if (majorUnit === 'ft') {
            minorUnitSelect.value = 'in';
        } else if (majorUnit === 'm') {
            minorUnitSelect.value = 'mm';
        }
        
        updateEditPreview();
    });
    
    minorUnitSelect.addEventListener('change', updateEditPreview);
    majorInput.addEventListener('input', updateEditPreview);
    minorInput.addEventListener('input', updateEditPreview);
    
    // Initial preview
    updateEditPreview();
}

// Setup montant change handler for edit mode
function setupEditMontantChangeHandler(wallIndex) {
    const montantSelect = document.getElementById(`editMontantMetallique${wallIndex}`);
    const lisseSuperieureInput = document.getElementById(`editLisseSuperieure${wallIndex}`);
    const lisseInferieureInput = document.getElementById(`editLisseInferieure${wallIndex}`);
    
    const montantSelect2 = document.getElementById(`editMontantMetallique2_${wallIndex}`);
    const lisseSuperieureInput2 = document.getElementById(`editLisseSuperieure2_${wallIndex}`);
    const lisseInferieureInput2 = document.getElementById(`editLisseInferieure2_${wallIndex}`);

    // Set 1 handler
    if (montantSelect && lisseSuperieureInput && lisseInferieureInput) {
        montantSelect.addEventListener('change', function() {
            const selectedMontant = this.value;
            
            if (selectedMontant && window.colombageData && window.colombageData[selectedMontant]) {
                const data = window.colombageData[selectedMontant];
                lisseSuperieureInput.value = data.lisseSuperieur;
                lisseInferieureInput.value = data.lisseInferieure;
                
                lisseSuperieureInput.classList.add('auto-filled');
                lisseInferieureInput.classList.add('auto-filled');
                
                [lisseSuperieureInput, lisseInferieureInput].forEach(input => {
                    input.addEventListener('input', function() {
                        this.classList.remove('auto-filled');
                    }, { once: true });
                });
            } else {
                lisseSuperieureInput.value = '';
                lisseInferieureInput.value = '';
                lisseSuperieureInput.classList.remove('auto-filled');
                lisseInferieureInput.classList.remove('auto-filled');
            }
        });
    }

    // Set 2 handler
    if (montantSelect2 && lisseSuperieureInput2 && lisseInferieureInput2) {
        montantSelect2.addEventListener('change', function() {
            const selectedMontant = this.value;
            
            if (selectedMontant && window.colombageData && window.colombageData[selectedMontant]) {
                const data = window.colombageData[selectedMontant];
                lisseSuperieureInput2.value = data.lisseSuperieur;
                lisseInferieureInput2.value = data.lisseInferieure;
                
                lisseSuperieureInput2.classList.add('auto-filled');
                lisseInferieureInput2.classList.add('auto-filled');
                
                [lisseSuperieureInput2, lisseInferieureInput2].forEach(input => {
                    input.addEventListener('input', function() {
                        this.classList.remove('auto-filled');
                    }, { once: true });
                });
            } else {
                lisseSuperieureInput2.value = '';
                lisseInferieureInput2.value = '';
                lisseSuperieureInput2.classList.remove('auto-filled');
                lisseInferieureInput2.classList.remove('auto-filled');
            }
        });
    }
}

// Function to cancel wall edit
function cancelEquipmentEdit(index) {
    // Clean up edit mode images
    clearEditModeImages(index);
    
    // Switch back to view mode
    document.getElementById(`equipmentView${index}`).style.display = 'block';
    document.getElementById(`equipmentEdit${index}`).style.display = 'none';
    
    console.log(`Cancelled edit mode for wall ${index}`);
}

// Function to save wall edit
async function saveEquipmentEdit(index, event) {
    event.preventDefault();
    
    if (!canModifyProject()) {
        alert('You do not have permission to edit walls in this project.');
        return;
    }

    try {
        const currentWall = projectEquipment[index];
        
        const updatedWall = {
            ...currentWall,
            equipment: document.getElementById(`editEquipment${index}`).value,
            floor: document.getElementById(`editFloor${index}`).value,
            hauteurMax: document.getElementById(`editHauteurMax${index}`).value,
            hauteurMaxUnit: (() => { const combined = document.getElementById(`editHauteurMaxUnit${index}`).value; return combined.split('-')[0] || 'ft'; })(),
            hauteurMaxMinor: document.getElementById(`editHauteurMaxMinor${index}`).value,
            hauteurMaxMinorUnit: (() => { const combined = document.getElementById(`editHauteurMaxUnit${index}`).value; return combined.split('-')[1] || 'in'; })(),
            deflexionMax: document.getElementById(`editDeflexionMax${index}`).value,
            montantMetallique: document.getElementById(`editMontantMetallique${index}`).value,
            lisseSuperieure: document.getElementById(`editLisseSuperieure${index}`).value,
            lisseInferieure: document.getElementById(`editLisseInferieure${index}`).value,
            entremise: document.getElementById(`editEntremise${index}`).value,
            espacement: document.getElementById(`editEspacement${index}`).value,
            note: document.getElementById(`editNote${index}`).value,
            lastModified: new Date().toISOString(),
            modifiedBy: currentUser?.email || 'unknown'
        };

        // Validation
        if (!updatedWall.equipment) {
            alert('Please enter a wall name.');
            return;
        }

        if (!updatedWall.floor) {
            alert('Please enter a floor.');
            return;
        }

        if (!updatedWall.hauteurMax && !updatedWall.hauteurMaxMinor) {
            alert('Please enter at least one height value.');
            return;
        }

        if (updatedWall.hauteurMax && (!updatedWall.hauteurMaxUnit || !updatedWall.hauteurMaxMinorUnit)) {
            alert('Please select units.');
            return;
        }

        if (!updatedWall.deflexionMax) {
            alert('Please select a déflexion max.');
            return;
        }

        if (!updatedWall.espacement) {
            alert('Please select an espacement.');
            return;
        }

        // Handle images - get current edit mode images
        const editImages = getEditModeImages(index);
        updatedWall.images = editImages;
        
        console.log('Saving wall with images:', {
            wallName: updatedWall.equipment,
            imageCount: editImages.length,
            images: editImages.map(img => ({ key: img.key, filename: img.filename }))
        });

        // Update the project equipment array
        projectEquipment[index] = updatedWall;
        
        // Save to database
        await saveEquipmentToProject();
        
        // Clean up edit mode
        clearEditModeImages(index);
        
        // Re-render the equipment list to show updated data
        renderEquipmentList();
        
        alert('Wall updated successfully!');
        
    } catch (error) {
        console.error('Error saving wall edit:', error);
        alert('Error saving wall changes: ' + error.message);
    }
}

// Function to delete wall
async function deleteEquipment(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to delete walls from this project.');
        return;
    }

    if (confirm('Are you sure you want to delete this wall and all its images?')) {
        const wall = projectEquipment[index];
        
        // Delete associated images from S3
        if (wall.images && wall.images.length > 0) {
            try {
                for (const image of wall.images) {
                    await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/delete`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ key: image.key })
                    });
                }
                console.log('Wall images deleted from S3');
            } catch (error) {
                console.error('Error deleting wall images:', error);
                // Continue with wall deletion even if image deletion fails
            }
        }
        
        projectEquipment.splice(index, 1);
        saveEquipmentToProject();
        renderEquipmentList();
    }
}

// Function to save walls to project
async function saveEquipmentToProject(options = {}) {
    const { silent = false } = options;
    try {
        console.log('=== SAVE WALLS TO CFSS PROJECT START ===');
        console.log('Current project ID:', currentProjectId);
        console.log('Walls to save:', projectEquipment);
        
        // Debug: Log image data for each wall
        projectEquipment.forEach((wall, index) => {
            console.log(`Wall ${index} (${wall.equipment}): ${wall.images?.length || 0} images`);
            if (wall.images) {
                wall.images.forEach((img, imgIndex) => {
                    console.log(`  Image ${imgIndex}: key=${img.key}, filename=${img.filename}`);
                });
            }
        });
        
        const apiUrl = `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/equipment`;
        console.log('API URL:', apiUrl);
        
        const requestBody = { equipment: projectEquipment };
        
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });

        if (handleAuthError(response)) {
            return;
        }

        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`Failed to save walls: ${response.status} - ${errorText}`);
        }
        
        const responseData = await response.json();
        console.log('Response data:', responseData);
        console.log('Walls saved successfully to database');
        
    } catch (error) {
        console.error('Error saving walls:', error);
        console.error('Error stack:', error.stack);
        if (!silent) alert('Error saving walls: ' + error.message);
    }
}

// Setup form handlers
function setupEquipmentFormHandlerWithRevisions() {
    const equipmentForm = document.getElementById('equipmentFormElement');
    const calculateButton = document.getElementById('calculateEquipment');
    
    if (!equipmentForm) return;
    
    // Calculate button (for CFSS, just shows placeholder message) - unchanged
    if (calculateButton) {
        calculateButton.addEventListener('click', handleCalculateEquipment);
    }
    
    // UPDATED: Form submission now uses revision-aware handler
    equipmentForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        await handleSaveEquipmentWithRevisions(e);
    });
}

// Handle Calculate button (no calculations for CFSS)
function handleCalculateEquipment() {
    console.log('Calculate button clicked for CFSS - displaying wall details');
    
    try {
        // Get form data and validate
        const wallData = getWallFormData();
        if (!wallData) {
            return; // Validation failed, errors already shown
        }
        
        // Display wall details in the results section
        displayWallDetails(wallData);
        
    } catch (error) {
        console.error('Error displaying wall details:', error);
        alert('Error displaying wall details: ' + error.message);
    }
}

// Function to display wall details
function displayWallDetails(wallData) {
    console.log('Displaying wall details for:', wallData);

    // Generate the wall details HTML
    const wallDetailsHTML = generateWallDetailsHTML(wallData);

    // Show the results section and hide placeholder
    const calculationResults = document.getElementById('calculationResults');
    const calculationPlaceholder = document.getElementById('calculationPlaceholder');
    const calculationResultsContent = document.getElementById('calculationResultsContent');

    if (calculationPlaceholder) calculationPlaceholder.style.display = 'none';
    if (calculationResults) calculationResults.style.display = 'block';
    if (calculationResultsContent) calculationResultsContent.innerHTML = wallDetailsHTML;

    console.log('Wall details displayed successfully');
}

// Function to generate wall details HTML
function generateWallDetailsHTML(wallData) {
    const hauteurMaxDisplay = wallData.hauteurMaxUnit ? 
        `${wallData.hauteurMax} ${wallData.hauteurMaxUnit}` : 
        wallData.hauteurMax;

    let html = `
        <div class="calculation-equipment-info">
            <h3 style="color: #333; margin-bottom: 15px;">Wall Information</h3>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff;">
                <p><strong>Wall Name:</strong> ${wallData.equipment}</p>
                <p><strong>Floor:</strong> ${wallData.floor}</p>
                <p><strong>Hauteur Max:</strong> ${hauteurMaxDisplay}</p>
                <p><strong>Déflexion Max:</strong> ${wallData.deflexionMax}</p>
                <p><strong>Montant Métallique:</strong> ${wallData.montantMetallique}</p>
                <p><strong>Lisse Supérieure:</strong> ${wallData.lisseSuperieure}</p>
                <p><strong>Lisse Inférieure:</strong> ${wallData.lisseInferieure}</p>
                <p><strong>Entremise:</strong> ${wallData.entremise}</p>
                ${wallData.note ? `<p><strong>Note:</strong> ${wallData.note}</p>` : ''}
            </div>
            
            <div style="margin-top: 15px; padding: 10px; background: #e8f5e8; border-radius: 6px; text-align: center;">
                <i class="fas fa-info-circle" style="color: #28a745; margin-right: 8px;"></i>
                <span style="color: #155724; font-size: 14px;">Wall details ready for review. Click Save to add to project.</span>
            </div>
        </div>
    `;

    return html;
}

// Handle Save button
async function handleSaveEquipment(e) {
    if (!canModifyProject()) {
        alert('You do not have permission to add walls to this project.');
        return;
    }
    
    console.log('Save button clicked for CFSS wall!');
    
    try {
        const wallData = getWallFormData();
        if (!wallData) {
            return;
        }

        console.log('Wall data to save:', wallData);

        projectEquipment.push(wallData);
        
        console.log('Current projectEquipment array:', projectEquipment);
        
        await saveEquipmentToProject();
        renderEquipmentList();
        
        const newWallIndex = projectEquipment.length - 1;
        clearWallForm();
        
        const equipmentForm = document.getElementById('equipmentForm');
        const newCalcButton = document.getElementById('newCalculationButton');
        equipmentForm.classList.remove('show');
        if (newCalcButton) {
            newCalcButton.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';
        }
        
        setTimeout(() => {
            const newWallCard = document.querySelector(`#equipmentDetails${newWallIndex}`);
            if (newWallCard) {
                toggleEquipmentDetails(newWallIndex);
                newWallCard.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                const wallCard = newWallCard.closest('.equipment-card');
                if (wallCard) {
                    wallCard.classList.add('highlighted');
                    setTimeout(() => {
                        wallCard.classList.remove('highlighted');
                    }, 3000);
                }
            }
        }, 100);
            
        alert('Wall saved successfully!');
        
    } catch (error) {
        console.error('Error saving wall:', error);
        alert('Error saving wall: ' + error.message);
    }
}

// Get wall form data
function getWallFormData() {
return getWallFormDataWithImages();
}

// Clear wall form
function clearWallForm() {
clearWallFormWithImages();
}

// Setup new calculation button handler
function setupNewCalculationButton() {
    setupCFSSDataButton();
    const newCalcButton = document.getElementById('newCalculationButton');
    const equipmentForm = document.getElementById('equipmentForm');
    
    if (newCalcButton && equipmentForm) {
        newCalcButton.addEventListener('click', function() {
            if (!canModifyProject()) {
                alert('You do not have permission to add walls to this project.');
                return;
            }
            
            if (equipmentForm.classList.contains('show')) {
                equipmentForm.classList.remove('show');
                newCalcButton.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';
            } else {
                // Close all expanded details and other forms before showing form
                closeAllExpandedDetails();
                hideAllForms();
                
                equipmentForm.classList.add('show');
                newCalcButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
                
                // Setup floor listener
                setupFloorInputListener();
                
                equipmentForm.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }
        });
    }
}

// Setup floor input listener for ULS/SLS display
function setupFloorInputListener() {
    const floorInput = document.getElementById('floor');
    const ulsDisplay = document.getElementById('floorULSDisplay');
    const slsDisplay = document.getElementById('floorSLSDisplay');
    
    if (!floorInput || !ulsDisplay || !slsDisplay) return;
    
    floorInput.addEventListener('input', function() {
        updateFloorULSSLS(floorInput.value, ulsDisplay, slsDisplay);
    });
    
    // Also update on form show
    floorInput.addEventListener('focus', function() {
        updateFloorULSSLS(floorInput.value, ulsDisplay, slsDisplay);
    });
}

function updateFloorULSSLS(floorValue, ulsDisplay, slsDisplay) {
    if (!floorValue || !projectData || !projectData.cfssWindData) {
        ulsDisplay.textContent = '--';
        slsDisplay.textContent = '--';
        return;
    }
    
    const cfssData = projectData.cfssWindData;
    if (!cfssData.storeys || cfssData.storeys.length === 0) {
        ulsDisplay.textContent = '--';
        slsDisplay.textContent = '--';
        return;
    }
    
    // Parse floor input - could be "NV1", "NV2-6", "NV1-NV3", etc.
    const floorInput = floorValue.trim().toUpperCase();
    
    // Try to find matching floor(s)
    let matchedIndices = [];
    
    // FIRST: Try exact match with a single floor label
    cfssData.storeys.forEach((storey, index) => {
        if (storey.label.toUpperCase() === floorInput) {
            matchedIndices.push(index);
        }
    });
    
    // If exact match found, use it
    if (matchedIndices.length > 0) {
        const firstFloor = cfssData.storeys[matchedIndices[0]];
        
        // Check if this floor is in a group
        const floorGroups = cfssData.floorGroups || [];
        let groupInfo = null;
        
        for (const group of floorGroups) {
            if (matchedIndices[0] >= group.firstIndex && matchedIndices[0] <= group.lastIndex) {
                groupInfo = group;
                break;
            }
        }
        
        if (groupInfo) {
            ulsDisplay.textContent = groupInfo.uls.toFixed(1);
            slsDisplay.textContent = groupInfo.sls.toFixed(1);
        } else {
            ulsDisplay.textContent = firstFloor.uls.toFixed(1);
            slsDisplay.textContent = firstFloor.sls.toFixed(1);
        }
        return;
    }
    
    // SECOND: If no exact match, try to interpret as a range (only if it contains "-")
    if (floorInput.includes('-')) {
        const parts = floorInput.split('-').map(p => p.trim());
        if (parts.length === 2) {
            const startFloor = parts[0];
            const endFloor = parts[1];
            
            let startIndex = -1;
            let endIndex = -1;
            
            cfssData.storeys.forEach((storey, index) => {
                const label = storey.label.toUpperCase();
                if (label === startFloor) startIndex = index;
                if (label === endFloor) endIndex = index;
            });
            
            if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
                for (let i = startIndex; i <= endIndex; i++) {
                    matchedIndices.push(i);
                }
                
                // Check if these floors are in a group
                const floorGroups = cfssData.floorGroups || [];
                let groupInfo = null;
                
                // Check if all matched indices are in the same group
                for (const group of floorGroups) {
                    const allInGroup = matchedIndices.every(idx => 
                        idx >= group.firstIndex && idx <= group.lastIndex
                    );
                    if (allInGroup) {
                        groupInfo = group;
                        break;
                    }
                }
                
                // If in a group, use group's values, otherwise use the first matched floor's values
                if (groupInfo) {
                    ulsDisplay.textContent = groupInfo.uls.toFixed(1);
                    slsDisplay.textContent = groupInfo.sls.toFixed(1);
                } else {
                    const firstFloor = cfssData.storeys[matchedIndices[0]];
                    ulsDisplay.textContent = firstFloor.uls.toFixed(1);
                    slsDisplay.textContent = firstFloor.sls.toFixed(1);
                }
                return;
            }
        }
    }
    
    // No match found
    ulsDisplay.textContent = '--';
    slsDisplay.textContent = '--';
}

function setupCFSSDataButton() {
    const cfssButton = document.getElementById('cfssDataButton');
    
    if (cfssButton) {
        cfssButton.addEventListener('click', function() {
            if (!canModifyProject()) {
                alert('You do not have permission to add CFSS data to this project.');
                return;
            }
            
            const cfssForm = document.getElementById('cfssForm');
            const isCurrentlyVisible = cfssForm && !cfssForm.classList.contains('hidden');
            
            if (isCurrentlyVisible) {
                // Hide the CFSS form
                cfssForm.classList.add('hidden');
                cfssButton.classList.remove('expanded');
                const buttonText = cfssWindData && cfssWindData.length > 0 ? 'Edit CFSS Data' : 'Add CFSS Data';
                cfssButton.innerHTML = `<i class="fas fa-wind"></i> ${buttonText}`;
            } else {
                // Close all expanded details and other forms before showing CFSS form
                closeAllExpandedDetails();
                hideAllForms();
                
                // Show CFSS form
                if (cfssForm) {
                    cfssForm.classList.remove('hidden');
                    cfssButton.classList.add('expanded');
                    cfssButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
                }
            }
        });
    }
}

async function saveProjectStatus(newStatus) {
    try {
        const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id: currentProjectId,
                status: newStatus
            })
        });
        
        if (response.ok) {
            console.log('Status saved');
        }
    } catch (error) {
        console.error('Save failed:', error);
    }
}

function toggleCFSSForm() {
    const form = document.getElementById('cfss-form');
    const btn = document.querySelector('.cfss-btn');
    const btnText = document.getElementById('cfss-btn-text');
    
    if (form.classList.contains('hidden')) {
        // Close all other forms and details before opening CFSS form
        closeAllExpandedDetails();
        
        // Close other forms
        const windowForm = document.getElementById('windowForm');
        const equipmentForm = document.getElementById('equipmentForm');
        if (windowForm) windowForm.classList.remove('show');
        if (equipmentForm) equipmentForm.classList.remove('show');
        
        // Reset other button texts
        const addWindowButton = document.getElementById('addWindowButton');
        if (addWindowButton) {
            addWindowButton.innerHTML = '<i class="fas fa-window-maximize"></i> Add Window';
        }
        const newCalcButton = document.getElementById('newCalculationButton');
        if (newCalcButton) {
            newCalcButton.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';
        }
        
        // Show CFSS form
        form.classList.remove('hidden');
        btn.classList.add('expanded');
        
        // Check if we have existing CFSS data and populate form
        if (cfssWindData && (Array.isArray(cfssWindData) ? cfssWindData.length > 0 : cfssWindData.storeys)) {
            populateCFSSForm(cfssWindData);
            btn.innerHTML = '<i class="fas fa-times"></i> <span id="cfss-btn-text">Hide CFSS Data</span>';
        } else {
            setDefaultCFSSValues();
            btn.innerHTML = '<i class="fas fa-times"></i> <span id="cfss-btn-text">Hide CFSS Data</span>';
        }
    } else {
        form.classList.add('hidden');
        btn.classList.remove('expanded');
        
        // Update button text based on whether data exists
        updateCFSSButtonText();
    }
}

function setDefaultCFSSValues() {
    // Clear wind parameters
    document.getElementById('q50').value = '';
    document.getElementById('importanceFactor').value = '';
    document.getElementById('terrainType').value = '';
    document.getElementById('category').value = '';
    
    // Set default specification values
    const defaults = {
        maxDeflection: 'L/360',
        maxSpacing: '48" c./c. (1200mm c./c)',
        framingAssembly: 'Vis Auto-perÃ§ante #8-1/2"',
        concreteAnchor: 'clous Ã  fixation directe (fixateur pistoscellé) Hilti X-P 20 ou équivalent approuvé Ã  12" c./c.',
        steelAnchor: 'clous Ã  fixation directe (fixateur pistoscellé) Hilti X-P 14 ou équivalent approuvé Ã  12" c./c.'
    };
    
    // Apply defaults to form fields
    Object.keys(defaults).forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = defaults[fieldId];
        }
    });
    
    // Initialize storey table with one empty row
    const tbody = document.getElementById('storeyTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        storeyCounter = 0;
        addStoreyRow();
    }
    
    console.log('âœ… Default CFSS values set');
}

function updateCFSSButtonText() {
    const btn = document.querySelector('.cfss-btn');
    const btnText = document.getElementById('cfss-btn-text');
    const icon = btn.querySelector('i');
    
    if (!btnText) return;
    
    // Restore the original plus icon
    icon.className = 'fas fa-plus';
    
    // Check if cfssWindData exists and determine structure
    const hasData = cfssWindData && (
        (Array.isArray(cfssWindData) && cfssWindData.length > 0) ||
        (!Array.isArray(cfssWindData) && cfssWindData.storeys)
    );
    
    if (hasData) {
        // Check if new structure
        const isNewStructure = !Array.isArray(cfssWindData) && cfssWindData.storeys;
        
        if (isNewStructure) {
            const storeyCount = cfssWindData.storeys?.length || 0;
            btnText.textContent = `Edit CFSS data (${storeyCount} floors)`;
        } else {
            // Old structure
            const floorCount = cfssWindData.length;
            const projectData = cfssWindData[0] || {};
            const specifications = [
                projectData.maxDeflection,
                projectData.maxSpacing,
                projectData.framingAssembly,
                projectData.concreteAnchor,
                projectData.steelAnchor,
            ];
            const filledSpecs = specifications.filter(spec => spec && spec.trim() !== '').length;
            
            if (filledSpecs > 0) {
                btnText.textContent = `Edit CFSS Data (${floorCount} floors, ${filledSpecs} specs)`;
            } else {
                btnText.textContent = `Edit CFSS Data (${floorCount} floors)`;
            }
        }
    } else {
        btnText.textContent = 'Add CFSS Data';
    }
}

function addCFSSFloorSection() {
    const container = document.getElementById('floor-sections');
    const newSection = document.createElement('div');
    newSection.className = 'floor-section';
    newSection.innerHTML = `
        <div class="main-fields-row">
            <div class="field-group floor-range">
                <label>Floor Range:</label>
                <input type="text" class="floor-input" placeholder="e.g., 5-8">
            </div>
            
            <div class="field-group resistance">
                <label>Resistance:</label>
                <div class="field-with-unit">
                    <input type="number" class="value-input" placeholder="0.0" step="0.1">
                    <span class="unit-label">psf</span>
                </div>
            </div>
            
            <div class="field-group deflection">
                <label>Deflection:</label>
                <div class="field-with-unit">
                    <input type="number" class="value-input" placeholder="0.0" step="0.1">
                    <span class="unit-label">psf</span>
                </div>
            </div>
            
            <button class="remove-btn" onclick="removeCFSSSection(this)">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    container.appendChild(newSection);
}

// Function to display CFSS data in the basic info section
function displayCFSSData(cfssData) {
    const displayDiv = document.getElementById('cfssDataDisplay');
    const contentDiv = document.getElementById('cfssDataContent');
    
    // Handle both old and new data structures
    if (!cfssData || (Array.isArray(cfssData) && cfssData.length === 0) || (!Array.isArray(cfssData) && !cfssData.storeys)) {
        displayDiv.style.display = 'none';
        return;
    }
    
    displayDiv.style.display = 'block';
    let html = '';
    
    // Check if this is new structure or old structure
    const isNewStructure = !Array.isArray(cfssData) && cfssData.windParams && cfssData.storeys;
    
    if (isNewStructure) {
        // NEW STRUCTURE: Display wind parameters
        if (cfssData.windParams) {
            html += `
                <div class="cfss-wind-params-display">
                    <h4 style="margin: 0 0 10px 0; color: #17a2b8; font-size: 14px; border-bottom: 1px solid #17a2b8; padding-bottom: 5px;">
                        Paramètres de calcul du vent
                    </h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
                        <div style="font-size: 12px;"><strong>q50:</strong> ${cfssData.windParams.q50} kPa</div>
                        <div style="font-size: 12px;"><strong>Facteur d'importance:</strong> ${cfssData.windParams.importanceFactor}</div>
                        <div style="font-size: 12px;"><strong>Type de terrain:</strong> ${cfssData.windParams.terrainType}</div>
                        <div style="font-size: 12px;"><strong>Catégorie:</strong> ${cfssData.windParams.category}</div>
                    </div>
                </div>
            `;
        }
        
        // Display specifications
        if (cfssData.specifications) {
            const specs = cfssData.specifications;
            const specFields = [
                { label: 'Max Deflection', value: specs.maxDeflection },
                { label: 'Max Spacing Between Braces', value: specs.maxSpacing },
                { label: 'Framing Assembly', value: specs.framingAssembly },
                { label: 'Concrete Anchor', value: specs.concreteAnchor },
                { label: 'Steel Anchor', value: specs.steelAnchor }
            ];
            
            const filledSpecs = specFields.filter(field => field.value && field.value.trim() !== '');
            
            if (filledSpecs.length > 0) {
                html += `
                    <div class="cfss-specifications-display">
                        <h4 style="margin: 0 0 10px 0; color: #28a745; font-size: 14px; border-bottom: 1px solid #28a745; padding-bottom: 5px;">
                            Spécifications du projet
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
                `;
                
                filledSpecs.forEach(field => {
                    html += `<div style="font-size: 12px;"><strong>${field.label}:</strong> ${field.value}</div>`;
                });
                
                html += `</div></div>`;
            }
        }
        
        // Display storey calculations table WITH GROUPING FEATURE
        if (cfssData.storeys && cfssData.storeys.length > 0) {
            // Initialize floor groups if not exist
            if (!cfssData.floorGroups) {
                cfssData.floorGroups = [];
            }
            
            html += `
    <div class="cfss-storeys-display">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #17a2b8; padding-bottom: 5px;">
            <h4 style="margin: 0; color: #17a2b8; font-size: 14px;">
                Calculs par étage
            </h4>
            <div id="grouping-instruction" style="font-size: 12px; color: #0c5460; display: none;">
                <span id="selection-count">0</span> floor(s) selected. Press <strong>Enter</strong> to group them.
            </div>
        </div>
        <table id="cfss-storeys-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background: #17a2b8; color: white;">
                                <th style="padding: 8px; text-align: left;">Étage</th>
                                <th style="padding: 8px; text-align: center;">H (m)</th>
                                <th style="padding: 8px; text-align: center;">A (mÂ²)</th>
                                <th style="padding: 8px; text-align: center;">ULS (psf)</th>
                                <th style="padding: 8px; text-align: center;">SLS (psf)</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            cfssData.storeys.forEach((storey, index) => {
    const groupInfo = findGroupForFloor(cfssData.floorGroups, index);
    const isGrouped = groupInfo !== null;
    const isFirstInGroup = isGrouped && groupInfo.firstIndex === index;
    const isLastInGroup = isGrouped && groupInfo.lastIndex === index;
    
    const bgColor = index % 2 === 0 ? '#f8f9fa' : 'white';
    const borderLeft = isGrouped ? 'border-left: 3px solid #17a2b8;' : '';
    
    let floorLabel = storey.label;
    let arrowHtml = '';
    if (isFirstInGroup) {
        arrowHtml = ' <span class="group-arrow" data-floor-index="' + index + '" style="color: #17a2b8; font-weight: bold; margin-left: 8px; cursor: pointer; font-size: 14px;">â–¼</span>';
    }
    if (isLastInGroup) {
        arrowHtml = ' <span class="group-arrow" data-floor-index="' + index + '" style="color: #17a2b8; font-weight: bold; margin-left: 8px; cursor: pointer; font-size: 14px;">â–²</span>';
    }
    
    html += `
        <tr class="floor-row ${isGrouped ? 'grouped-floor' : ''}" 
            data-floor-index="${index}" 
            style="background: ${bgColor}; ${borderLeft} cursor: ${isGrouped ? 'default' : 'pointer'}; transition: background 0.2s ease;">
            <td style="padding: 8px;">
                ${floorLabel}${arrowHtml}
            </td>
            <td style="padding: 8px; text-align: center;">${storey.height}</td>
            <td style="padding: 8px; text-align: center;">${storey.area}</td>
            <td style="padding: 8px; text-align: center; font-weight: 600; color: #28a745;">${storey.uls.toFixed(1)}</td>
            <td style="padding: 8px; text-align: center; font-weight: 600; color: #17a2b8;">${storey.sls.toFixed(1)}</td>
        </tr>
    `;
});
            
            html += `</tbody></table></div>`;
        }
        
        // Update button text
        const btnText = document.getElementById('cfss-btn-text');
        if (btnText) {
            const storeyCount = cfssData.storeys?.length || 0;
            btnText.textContent = `Données CFSS (${storeyCount} étages)`;
        }
        
    } else {
        // OLD STRUCTURE: Display legacy format (for backward compatibility)
        const projectData = Array.isArray(cfssData) ? cfssData[0] : cfssData;
        
        if (projectData) {
            const projectFields = [
                { label: 'Max Deflection', value: projectData.maxDeflection },
                { label: 'Max Spacing Between Braces', value: projectData.maxSpacing },
                { label: 'Framing Assembly', value: projectData.framingAssembly },
                { label: 'Concrete Anchor', value: projectData.concreteAnchor },
                { label: 'Steel Anchor', value: projectData.steelAnchor }
            ];
            
            const filledProjectFields = projectFields.filter(field => field.value && field.value.trim() !== '');
            
            if (filledProjectFields.length > 0) {
                html += `<div class="cfss-project-data"><h4 style="margin: 0 0 10px 0; color: #28a745; font-size: 14px;">Project Specifications</h4><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">`;
                filledProjectFields.forEach(field => {
                    html += `<div style="font-size: 12px;"><strong>${field.label}:</strong> ${field.value}</div>`;
                });
                html += `</div></div>`;
            }
        }
        
        if (Array.isArray(cfssData) && cfssData.length > 0) {
            html += `<div class="cfss-wind-data"><h4 style="margin: 10px 0; color: #17a2b8; font-size: 14px;">Wind Data by Floor</h4>`;
            cfssData.forEach(item => {
                html += `<div style="font-size: 12px; padding: 5px 0;">Floor ${item.floorRange}: Resistance: ${item.resistance} psf, Deflection: ${item.deflection} psf</div>`;
            });
            html += `</div>`;
        }
    }
    
    contentDiv.innerHTML = html;
    
    // Initialize floor grouping feature
    setTimeout(() => initializeFloorGrouping(), 0);
}

// Update the saveCFSSData function to refresh the display
async function saveCFSSData() {
    if (!canModifyProject()) {
        alert('You do not have permission to modify CFSS data for this project.');
        return;
    }
    
    try {
        // First, calculate all wind loads
        const calculationSuccess = calculateAllStoreyWindLoads();
        if (!calculationSuccess) {
            alert('Fill in all required fields for all floors.');
            return;
        }
        
        // Get global wind parameters
        const windParams = {
            q50: parseFloat(document.getElementById('q50')?.value) || 0,
            importanceFactor: document.getElementById('importanceFactor')?.value || '',
            terrainType: document.getElementById('terrainType')?.value || '',
            category: document.getElementById('category')?.value || ''
        };
        
        // Get project-wide specification fields
        const specifications = {
            maxDeflection: document.getElementById('maxDeflection')?.value.trim() || '',
            maxSpacing: document.getElementById('maxSpacing')?.value.trim() || '',
            framingAssembly: document.getElementById('framingAssembly')?.value.trim() || '',
            concreteAnchor: document.getElementById('concreteAnchor')?.value.trim() || '',
            steelAnchor: document.getElementById('steelAnchor')?.value.trim() || ''
        };
        
        // Collect storey calculation data
        const storeys = [];
        const rows = document.querySelectorAll('#storeyTableBody tr');
        
        rows.forEach(row => {
            const label = row.querySelector('.storey-label')?.value || '';
            const H = parseFloat(row.querySelector('.storey-height')?.value) || 0;
            const A = parseFloat(row.querySelector('.storey-area')?.value) || 0;
            const ULS = parseFloat(row.querySelector('.storey-uls')?.textContent) || 0;
            const SLS = parseFloat(row.querySelector('.storey-sls')?.textContent) || 0;
            
            if (label && H > 0 && A > 0) {
                storeys.push({
                    label: label,
                    height: H,
                    area: A,
                    uls: ULS,
                    sls: SLS
                });
            }
        });
        
        if (storeys.length === 0) {
            alert('Add at least one floor with valid data.');
            return;
        }
        
        // Create the complete CFSS data object
        const cfssData = {
        windParams: windParams,
        specifications: specifications,
        storeys: storeys,
        floorGroups: projectData.cfssWindData?.floorGroups || [],
        dateAdded: new Date().toISOString(),
        addedBy: currentUser.email
    };
        
        console.log('Saving CFSS data:', cfssData);
        
        // Save to database
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/cfss-data`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ cfssWindData: cfssData })
        });

        if (!response.ok) {
            throw new Error(`Failed to save CFSS data: ${response.status}`);
        }
        
        cfssWindData = cfssData;
        projectData.cfssWindData = cfssData;
        
        // Update the display
        displayCFSSData(cfssData);
        
        alert('CFSS Data Saved Successfully!');
        
        // Hide the form after saving
        toggleCFSSForm();
        
    } catch (error) {
        console.error('Error saving CFSS data:', error);
        alert('Error saving CFSS data: ' + error.message);
    }
}

function removeCFSSSection(button) {
    const section = button.closest('.floor-section');
    if (section) {
        section.remove();
    }
}

// Load existing CFSS data when page loads
function loadCFSSData(project) {
    const cfssDisplay = document.getElementById('cfssDataDisplay');
    
    // Check if cfssWindData exists (both old array format and new object format)
    const hasCFSSData = project.cfssWindData && (
        (Array.isArray(project.cfssWindData) && project.cfssWindData.length > 0) ||
        (!Array.isArray(project.cfssWindData) && project.cfssWindData.storeys)
    );
    
    if (hasCFSSData) {
        cfssWindData = project.cfssWindData;
        
        // Use displayCFSSData which handles both formats
        displayCFSSData(project.cfssWindData);
        
        // Update button text to show "Edit" instead of "Add"
        updateCFSSButtonText();
        
        console.log('CFSS data loaded:', project.cfssWindData);
    } else {
        // Hide the display section if no data
        if (cfssDisplay) {
            cfssDisplay.style.display = 'none';
        }
        
        // Reset global variable
        cfssWindData = null;
        
        // Ensure button shows "Add"
        updateCFSSButtonText();
    }
}

function updateCFSSDataDisplay(windData) {
    const cfssDisplay = document.getElementById('cfssDataDisplay');
    const cfssContent = document.getElementById('cfssDataContent');
    
    if (!windData || windData.length === 0) {
        cfssDisplay.style.display = 'none';
        updateCFSSButtonText(); // Update button when no data
        return;
    }
    
    cfssDisplay.style.display = 'block';
    
    // Get project-wide fields from first entry
    const projectData = windData[0] || {};
    
    let html = `
        <!-- Wind Data Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
                <tr>
                    <th style="background: #f8f9fa; padding: 8px 12px; text-align: left; font-weight: 500; font-size: 13px; border-bottom: 1px solid #dee2e6;">Floor Range</th>
                    <th style="background: #f8f9fa; padding: 8px 12px; text-align: left; font-weight: 500; font-size: 13px; border-bottom: 1px solid #dee2e6;">Resistance</th>
                    <th style="background: #f8f9fa; padding: 8px 12px; text-align: left; font-weight: 500; font-size: 13px; border-bottom: 1px solid #dee2e6;">Deflection</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add wind data rows
    windData.forEach(data => {
        html += `
            <tr>
                <td style="padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f1f3f4;">${data.floorRange}</td>
                <td style="padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f1f3f4;">${data.resistance} psf</td>
                <td style="padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f1f3f4;">${data.deflection} psf</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
        
        <!-- Project Specifications -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 15px;">
    `;
    
    // Define all specifications with their labels
    const specifications = [
        { label: 'Max Deflection', value: projectData.maxDeflection },
        { label: 'Max Spacing Between Braces', value: projectData.maxSpacing },
        { label: 'Framing Assembly', value: projectData.framingAssembly },
        { label: 'Concrete Anchor', value: projectData.concreteAnchor },
        { label: 'Steel Anchor', value: projectData.steelAnchor }
    ];
    
    // Only show specifications that have values
    const filledSpecs = specifications.filter(spec => spec.value && spec.value.trim() !== '');
    
    filledSpecs.forEach(spec => {
        html += `
            <div style="font-size: 13px; padding: 4px 0;">
                <div style="color: #666; font-weight: 500;">${spec.label}:</div>
                <div style="color: #333;">${spec.value}</div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    cfssContent.innerHTML = html;
    
    // Update button text based on data
    updateCFSSButtonText();
}
function populateCFSSForm(windData) {
    const container = document.getElementById('floor-sections');
    container.innerHTML = '';
    
    // Populate project-wide fields from the first entry (since they're the same for all)
    if (windData.length > 0) {
        const firstEntry = windData[0];
        const projectFields = [
            { id: 'maxDeflection', value: firstEntry.maxDeflection },
            { id: 'maxSpacing', value: firstEntry.maxSpacing },
            { id: 'framingAssembly', value: firstEntry.framingAssembly },
            { id: 'concreteAnchor', value: firstEntry.concreteAnchor },
            { id: 'steelAnchor', value: firstEntry.steelAnchor },
        ];
        
        projectFields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element) {
                element.value = field.value || '';
            }
        });
    }
    
    // Populate floor-specific sections
    windData.forEach(data => {
        const section = document.createElement('div');
        section.className = 'floor-section';
        section.innerHTML = `
            <div class="main-fields-row">
                <div class="field-group floor-range">
                    <label>Floor Range:</label>
                    <input type="text" class="floor-input" value="${data.floorRange || ''}">
                </div>
                
                <div class="field-group resistance">
                    <label>Resistance:</label>
                    <div class="field-with-unit">
                        <input type="number" class="value-input" value="${data.resistance || ''}" step="0.1">
                        <span class="unit-label">psf</span>
                    </div>
                </div>
                
                <div class="field-group deflection">
                    <label>Deflection:</label>
                    <div class="field-with-unit">
                        <input type="number" class="value-input" value="${data.deflection || ''}" step="0.1">
                        <span class="unit-label">psf</span>
                    </div>
                </div>
                
                <button class="remove-btn" onclick="removeCFSSSection(this)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(section);
    });
}

    // Add image upload section to the form
    const formSection = document.querySelector('.equipment-form-section');
    const calculationSections = document.querySelector('.calculation-sections');
    
    if (formSection && calculationSections) {
        // Create image upload section
        const imageSection = document.createElement('div');
        imageSection.className = 'image-upload-section';
        imageSection.innerHTML = `
            <div class="image-upload-box" id="imageUploadBox">
                <i class="fas fa-camera upload-icon"></i>
                <div class="upload-text">
                    Click to upload<br>
                    or drag & drop images<br>
                    <small>Paste screenshots with Ctrl+V</small>
                </div>
                <input type="file" id="imageFileInput" multiple accept="image/*" style="display: none;">
            </div>
            <div class="image-preview-container" id="imagePreviewContainer"></div>
        `;
        
        // Add to the calculation sections container
        calculationSections.appendChild(imageSection);
        
        setupImageUploadHandlers();
    }

function setupImageUploadHandlers() {
    const cameraBtn = document.getElementById('cameraBtn');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('imageFileInput');
    
    // Add better error handling and retry logic
    if (!cameraBtn || !dropZone || !fileInput) {
        console.warn('Image upload elements not found, retrying in 500ms...');
        console.log('Looking for elements:', {
            cameraBtn: !!cameraBtn,
            dropZone: !!dropZone, 
            fileInput: !!fileInput
        });
        
        // Retry after a short delay in case elements are still being created
        setTimeout(() => {
            const retryBtn = document.getElementById('cameraBtn');
            const retryZone = document.getElementById('dropZone');
            const retryInput = document.getElementById('imageFileInput');
            
            if (!retryBtn || !retryZone || !retryInput) {
                console.error('Image upload elements still not found after retry');
                return;
            }
            
            setupImageHandlersInternal(retryBtn, retryZone, retryInput);
        }, 500);
        return;
    }
    
    setupImageHandlersInternal(cameraBtn, dropZone, fileInput);
}

function setupImageHandlersInternal(cameraBtn, dropZone, fileInput) {
    // Camera button click - prevent form submission
    cameraBtn.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent form submission
        event.stopPropagation();
        fileInput.click();
    });
    
    // Rest of the handlers remain the same
    fileInput.addEventListener('change', handleFileSelect);
    dropZone.addEventListener('paste', handlePaste);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    
    dropZone.addEventListener('focus', () => {
        dropZone.style.borderColor = '#007bff';
        dropZone.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.25)';
    });
    
    dropZone.addEventListener('blur', () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    });
    
    console.log('Image upload handlers setup successfully');
}

// Array to store current wall images
let currentWallImages = [];

function initializeImageUpload() {
    // FIX: Initialize global variable
    if (!window.currentWallImages) {
        window.currentWallImages = [];
    }
    
    // Find the equipment-form-section (the container that holds form-fields)
    const equipmentFormSection = document.querySelector('.equipment-form-section');
    
    if (equipmentFormSection) {
        // Check if image upload section already exists
        let imageSection = equipmentFormSection.querySelector('.image-upload-section');
        
        if (!imageSection) {
            // Create image upload section with new compact design
            imageSection = document.createElement('div');
            imageSection.className = 'image-upload-section';
            imageSection.innerHTML = `
            <div class="upload-controls">
                <button type="button" class="camera-btn" id="cameraBtn" title="Upload Images">
                    <i class="fas fa-camera"></i>
                    Browse
                </button>
                
                <input 
                    class="drop-zone" 
                    id="dropZone" 
                    placeholder="Drop or paste images here (Ctrl+V)"
                    readonly
                    tabindex="0">
            </div>
            
            <div class="image-preview-container" id="imagePreviewContainer"></div>
        `;
            
            // Add the image upload section to the equipment-form-section
            // Insert it before the hidden file input
            const fileInput = equipmentFormSection.querySelector('#imageFileInput');
            if (fileInput) {
                equipmentFormSection.insertBefore(imageSection, fileInput);
            } else {
                equipmentFormSection.appendChild(imageSection);
            }
        }
        
        setupImageUploadHandlers();
        console.log('Image upload initialized, current count:', window.currentWallImages.length);
    } else {
        console.error('Equipment form section not found');
    }
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
        event.target.value = ''; // Clear the input
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
    
    // NEW: Check current image count and limit to 2 max
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
    
    // Show loading state
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.placeholder = `Uploading ${validFiles.length} image(s)...`;
    }
    
    // Initialize window.currentWallImages if it doesn't exist
    if (!window.currentWallImages) {
        window.currentWallImages = [];
    }
    
    for (const file of validFiles) {
        try {
            // Upload to S3 and get URL
            const imageData = await uploadImageToS3(file);
            
            // Add to current images array
            window.currentWallImages.push(imageData);
            
            // Show preview
            addImagePreview(imageData);
            
        } catch (error) {
            console.error('Error uploading image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    // Reset placeholder and update state
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

async function uploadImageToS3(file) {
    try {
        // Get upload URL from backend
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/image-upload-url`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                filename: file.name,
                contentType: file.type
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to get upload URL');
        }
        
        const uploadData = await response.json();
        
        // Upload file directly to S3
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
        
    } catch (error) {
        console.error('Error in uploadImageToS3:', error);
        throw error;
    }
}

// Fix 3: Update the main image upload section (non-edit mode) to also prevent form issues
function addImagePreview(imageData) {
    const container = document.getElementById('imagePreviewContainer');
    
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename}">
        <button type="button" class="image-remove" title="Remove image">×</button>
    `;
    
    container.appendChild(preview);
    
    // Add event listener instead of inline onclick
    const removeButton = preview.querySelector('.image-remove');
    removeButton.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        removeImage(imageData.key);
    });
    
    // Update layout and drop zone state
    updateImagePreviewLayout();
    updateDropZoneState();
    
    // Load the actual image
    loadImagePreview(preview.querySelector('img'), imageData.key);
}

async function loadImagePreview(imgElement, imageKey) {
    try {
        // Get signed URL for viewing
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/sign?key=${encodeURIComponent(imageKey)}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            imgElement.src = data.url;
        }
    } catch (error) {
        console.error('Error loading image preview:', error);
        imgElement.alt = 'Failed to load';
    }
}

function removeImage(imageKey) {
    // Remove from window global array
    if (!window.currentWallImages) {
        window.currentWallImages = [];
    }
    window.currentWallImages = window.currentWallImages.filter(img => img.key !== imageKey);
    
    // Remove preview element
    const container = document.getElementById('imagePreviewContainer');
    const previews = container.querySelectorAll('.image-preview');
    previews.forEach(preview => {
        const removeBtn = preview.querySelector('.image-remove');
        if (removeBtn && removeBtn.getAttribute('onclick')?.includes(imageKey)) {
            preview.remove();
        }
    });
    
    // Update layout and drop zone state
    updateImagePreviewLayout();
    updateDropZoneState();
    
    console.log('Image removed, remaining count:', window.currentWallImages.length);
}

function updateImagePreviewLayout() {
    const container = document.getElementById('imagePreviewContainer');
    if (!container) return;
    
    const imageCount = window.currentWallImages?.length || 0;
    
    // Remove existing classes
    container.classList.remove('one-image', 'two-images');
    
    // Add appropriate class based on count
    if (imageCount === 1) {
        container.classList.add('one-image');
    } else if (imageCount === 2) {
        container.classList.add('two-images');
    }
}

function formatHauteurDisplay(wall) {
    const major = wall.hauteurMax || '0';
    const majorUnit = wall.hauteurMaxUnit || '';
    const minor = wall.hauteurMinor || wall.hauteurMaxMinor || '0';
    const minorUnit = wall.hauteurMinorUnit || wall.hauteurMaxMinorUnit || '';
    
    // If both values are 0 or empty, show N/A
    if ((major === '0' || major === '') && (minor === '0' || minor === '')) {
        return 'N/A';
    }
    
    // If major is 0 or empty, show only minor
    if (major === '0' || major === '') {
        return `${minor} ${minorUnit}`;
    }
    
    // If unit is mm, show only major value (no minor)
    if (majorUnit === 'mm' || majorUnit === 'm') {
        return `${major} mm`;
    }
    
    // For ft-in, show both with dash
    return `${major} ${majorUnit} - ${minor} ${minorUnit}`;
}

function getWallFormDataWithImages() {
    console.log('=== DEBUG: Starting form validation with dual sets ===');
    
    // Get Set 1 elements
    const equipmentEl = document.getElementById('equipment');
    const floorEl = document.getElementById('floor');
    const hauteurMaxEl = document.getElementById('hauteurMax');
    const hauteurMaxUnitEl = document.getElementById('hauteurMaxUnit');
    const hauteurMaxMinorEl = document.getElementById('hauteurMaxMinor');
    const deflexionMaxEl = document.getElementById('deflexionMax');
    const montantMetalliqueEl = document.getElementById('montantMetallique');
    const lisseSuperieureEl = document.getElementById('lisseSuperieure');
    const lisseInferieureEl = document.getElementById('lisseInferieure');
    const entremiseEl = document.getElementById('entremise');
    const espacementEl = document.getElementById('espacement');
    const noteEl = document.getElementById('note');
    
    // Get Set 2 elements
    const montantMetallique2El = document.getElementById('montantMetallique2');
    const deflexionMax2El = document.getElementById('deflexionMax2');
    const lisseSuperieure2El = document.getElementById('lisseSuperieure2');
    const lisseInferieure2El = document.getElementById('lisseInferieure2');
    const entremise2El = document.getElementById('entremise2');
    const espacement2El = document.getElementById('espacement2');

    // Get Set 1 values
    const equipment = equipmentEl ? equipmentEl.value.trim() : '';
    const floor = floorEl ? floorEl.value.trim() : '';
    const hauteurMax = hauteurMaxEl ? hauteurMaxEl.value.trim() : '';
    const hauteurMaxCombined = hauteurMaxUnitEl ? hauteurMaxUnitEl.value.trim() : '';
    const [hauteurMaxUnit, hauteurMaxMinorUnit] = hauteurMaxCombined.split('-');
    const hauteurMaxMinor = hauteurMaxMinorEl ? hauteurMaxMinorEl.value.trim() : '';
    const deflexionMax = deflexionMaxEl ? deflexionMaxEl.value.trim() : '';
    const montantMetallique = montantMetalliqueEl ? montantMetalliqueEl.value.trim() : '';
    const lisseSuperieure = lisseSuperieureEl ? lisseSuperieureEl.value.trim() : '';
    const lisseInferieure = lisseInferieureEl ? lisseInferieureEl.value.trim() : '';
    
        // Get entremise parts
    const entremisePart1El = document.getElementById('entremisePart1');
    const entremisePart2El = document.getElementById('entremisePart2');
    const entremisePart1 = entremisePart1El ? entremisePart1El.value.trim() : '';
    const entremisePart2 = entremisePart2El ? entremisePart2El.value.trim() : '';
    
    // Concatenate entremise
    let entremise = '';
    if (entremisePart1 === 'N/A') {
        entremise = 'N/A';
    } else if (entremisePart1 && entremisePart2) {
        entremise = `${entremisePart1} @${entremisePart2}`;
    } else if (entremisePart1) {
        entremise = entremisePart1;
    }

    const espacement = espacementEl ? espacementEl.value.trim() : '';
    const note = noteEl ? noteEl.value.trim() : '';
    
    // Get Set 2 values (optional)
    const set2Visible = document.getElementById('set2').style.display !== 'none';
    const montantMetallique2 = set2Visible && montantMetallique2El ? montantMetallique2El.value.trim() : '';
    const deflexionMax2 = set2Visible && deflexionMax2El ? deflexionMax2El.value.trim() : '';
    const lisseSuperieure2 = set2Visible && lisseSuperieure2El ? lisseSuperieure2El.value.trim() : '';
    const lisseInferieure2 = set2Visible && lisseInferieure2El ? lisseInferieure2El.value.trim() : '';
    
        // Get Set 2 entremise parts
    const entremise2Part1El = document.getElementById('entremise2Part1');
    const entremise2Part2El = document.getElementById('entremise2Part2');
    const entremise2Part1 = set2Visible && entremise2Part1El ? entremise2Part1El.value.trim() : '';
    const entremise2Part2 = set2Visible && entremise2Part2El ? entremise2Part2El.value.trim() : '';
    
    // Concatenate entremise2
    let entremise2 = '';
    if (set2Visible) {
        if (entremise2Part1 === 'N/A') {
            entremise2 = 'N/A';
        } else if (entremise2Part1 && entremise2Part2) {
            entremise2 = `${entremise2Part1} @${entremise2Part2}`;
        } else if (entremise2Part1) {
            entremise2 = entremise2Part1;
        }
    }

    const espacement2 = set2Visible && espacement2El ? espacement2El.value.trim() : '';

    // Validation for Set 1 (required)
    if (!equipment) {
        alert('Please enter a wall name.');
        return null;
    }

    if (!floor) {
        alert('Please enter a floor.');
        return null;
    }

    if (!hauteurMax && !hauteurMaxMinor) {
        alert('Please enter at least one height value.');
        return null;
    }

    if (hauteurMax && !hauteurMaxCombined) {
        alert('Please select units.');
        return null;
    }

    if (!deflexionMax) {
        alert('Please select a déflexion max.');
        return null;
    }

    if (!montantMetallique) {
        alert('Please select montant métallique.');
        return null;
    }

    if (!lisseSuperieure) {
        alert('Please enter lisse Supérieure.');
        return null;
    }

    if (!lisseInferieure) {
        alert('Please enter lisse Inférieure.');
        return null;
    }

    if (!entremisePart1) {
        alert('Please select entremise.');
        return null;
    }
    
    if (entremisePart1 !== 'N/A' && !entremisePart2) {
        alert('Please select entremise spacing.');
        return null;
    }

    if (!espacement) {
        alert('Please select an espacement.');
        return null;
    }

    // Validation for Set 2 (if visible, all fields required)
    if (set2Visible) {
        if (!montantMetallique2) {
            alert('Please select montant métallique 2.');
            return null;
        }
        if (!lisseSuperieure2) {
            alert('Please enter lisse Supérieure 2.');
            return null;
        }
        if (!lisseInferieure2) {
            alert('Please enter lisse Inférieure 2.');
            return null;
        }
        if (!entremise2) {
            alert('Please select entremise 2.');
            return null;
        }
        if (!espacement2) {
            alert('Please select espacement 2.');
            return null;
        }
    }

    const wallData = {
        equipment: equipment,
        floor: floor,
        hauteurMax: hauteurMax || '0',
        hauteurMaxUnit: hauteurMaxUnit || 'ft',
        hauteurMaxMinor: hauteurMaxMinor || '0',
        hauteurMaxMinorUnit: hauteurMaxMinorUnit || 'in',
        deflexionMax: deflexionMax,
        montantMetallique: montantMetallique,
        dosADos: document.getElementById('dosADos')?.checked || false,
        lisseSuperieure: lisseSuperieure,
        lisseInferieure: lisseInferieure,
        entremise: entremise,
        espacement: espacement,
        note: note,
        images: [...(window.currentWallImages || [])],
        dateAdded: new Date().toISOString(),
        addedBy: window.currentUser?.email || 'unknown'
    };

    // Add Set 2 data if it exists
    if (set2Visible && montantMetallique2) {
        wallData.montantMetallique2 = montantMetallique2;
        wallData.deflexionMax2 = deflexionMax2;
        wallData.dosADos2 = document.getElementById('dosADos2')?.checked || false;
        wallData.lisseSuperieure2 = lisseSuperieure2;
        wallData.lisseInferieure2 = lisseInferieure2;
        wallData.entremise2 = entremise2;
        wallData.espacement2 = espacement2;
    }

    console.log('Final wall data with images:', wallData);
    return wallData;
}

// Update clearWallForm to also clear images
function clearWallFormWithImages() {
    const form = document.getElementById('equipmentFormElement');
    if (form) {
        form.reset();
    }
    
    window.currentWallImages = [];
    
    const previewContainer = document.getElementById('imagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
    }
    
    // Hide Set 2 and clear its values
    toggleSet2(false);
    
    console.log('Wall form and images cleared, image count:', window.currentWallImages.length);
}

// Update the wall rendering to show images
function renderWallImages(wall, index) {
    if (!wall.images || wall.images.length === 0) {
        return '<p style="color: #666; font-style: italic;">No images</p>';
    }
    
    console.log(`Rendering ${wall.images.length} images for wall ${wall.equipment}`);
    
    // Limit to first 2 images
    const imagesToShow = wall.images.slice(0, 2);
    
    let imagesHTML = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; max-width: 200px;">';
    
    imagesToShow.forEach((image, imgIndex) => {
        const imageId = `wall-image-${index}-${imgIndex}`;
        const imageWidth = imagesToShow.length === 1 ? '100px' : '90px';
        
        imagesHTML += `
            <div style="position: relative; width: ${imageWidth}; height: 80px; border-radius: 4px; overflow: hidden; border: 1px solid #ddd; background: #f5f5f5; flex: ${imagesToShow.length === 1 ? '0 0 100px' : '1'};">
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
            const imageId = `wall-image-${index}-${imgIndex}`;
            const imgElement = document.getElementById(imageId);
            if (imgElement) {
                loadWallImage(imgElement, image.key);
            }
        });
    }, 100);
    
    return imagesHTML;
}

// Function to load wall images in the details view with better error handling
async function loadWallImage(imgElement, imageKey) {
    if (!imgElement || !imageKey) {
        console.error('Missing image element or key');
        return;
    }
    
    try {
        console.log(`Loading image with key: ${imageKey}`);
        
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/sign?key=${encodeURIComponent(imageKey)}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.url) {
                imgElement.src = data.url;
                console.log(`Image loaded successfully: ${imageKey}`);
            } else {
                throw new Error('No URL in response');
            }
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error loading wall image:', error);
        imgElement.alt = 'Failed to load image';
        imgElement.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23f0f0f0"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EError%3C/text%3E%3C/svg%3E';
    }
}

// Function to open image in modal for full view
function openImageModal(imageKey, filename) {
    // Create modal
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
                    onclick="this.closest('.modal').remove()">×</button>
        </div>
    `;
    
    modal.className = 'modal';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    document.body.appendChild(modal);
    
    // Load the full-size image
    loadWallImage(modal.querySelector('img'), imageKey);
}

document.addEventListener('DOMContentLoaded', function() {
    // Setup hauteur max preview (for walls)
    setupHauteurMaxPreview();
    
    // Setup window dimension previews
    setupWindowLargeurPreview();
    setupWindowHauteurPreview();
});

// Setup L1 preview
    const l1Major = document.getElementById('windowL1');
    const l1Minor = document.getElementById('windowL1Minor');
    const l1Unit = document.getElementById('windowL1Unit');
    const l1Preview = document.getElementById('l1Preview');
    
    if (l1Major && l1Minor && l1Unit && l1Preview) {
        function updateL1Preview() {
            const major = l1Major.value || '0';
            const minor = l1Minor.value || '0';
            const unit = l1Unit.value || 'ft-in';
            
            if (unit === 'mm') {
                if (major === '0') {
                    l1Preview.textContent = 'Preview: --';
                    l1Preview.style.color = '#666';
                } else {
                    l1Preview.textContent = `Preview: ${major}mm`;
                    l1Preview.style.color = '#2c5aa0';
                }
                return;
            }
            
            const [majorUnit, minorUnit] = unit.split('-');
            if (major === '0' && minor === '0') {
                l1Preview.textContent = 'Preview: --';
                l1Preview.style.color = '#666';
            } else {
                const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
                l1Preview.textContent = `Preview: ${formatted}`;
                l1Preview.style.color = '#2c5aa0';
            }
        }
        
        l1Major.addEventListener('input', updateL1Preview);
        l1Minor.addEventListener('input', updateL1Preview);
        l1Unit.addEventListener('change', updateL1Preview);
        updateL1Preview();
    }
    
    // Setup L2 preview
    const l2Major = document.getElementById('windowL2');
    const l2Minor = document.getElementById('windowL2Minor');
    const l2Unit = document.getElementById('windowL2Unit');
    const l2Preview = document.getElementById('l2Preview');
    
    if (l2Major && l2Minor && l2Unit && l2Preview) {
        function updateL2Preview() {
            const major = l2Major.value || '0';
            const minor = l2Minor.value || '0';
            const unit = l2Unit.value || 'ft-in';
            
            if (unit === 'mm') {
                if (major === '0') {
                    l2Preview.textContent = 'Preview: --';
                    l2Preview.style.color = '#666';
                } else {
                    l2Preview.textContent = `Preview: ${major}mm`;
                    l2Preview.style.color = '#2c5aa0';
                }
                return;
            }
            
            const [majorUnit, minorUnit] = unit.split('-');
            if (major === '0' && minor === '0') {
                l2Preview.textContent = 'Preview: --';
                l2Preview.style.color = '#666';
            } else {
                const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
                l2Preview.textContent = `Preview: ${formatted}`;
                l2Preview.style.color = '#2c5aa0';
            }
        }
        
        l2Major.addEventListener('input', updateL2Preview);
        l2Minor.addEventListener('input', updateL2Preview);
        l2Unit.addEventListener('change', updateL2Preview);
        updateL2Preview();
    }

// ====================
// PARAPET IMAGE UPLOAD FUNCTIONS
// ====================

// Array to store current parapet images
let currentParapetImages = [];

function initializeParapetImageUpload() {
    // Initialize global variable
    if (!window.currentParapetImages) {
        window.currentParapetImages = [];
    }
    
    setupParapetImageUploadHandlers();
    console.log('Parapet image upload initialized, current count:', window.currentParapetImages.length);
}

function setupParapetImageUploadHandlers() {
    const cameraBtn = document.getElementById('parapetCameraBtn');
    const dropZone = document.getElementById('parapetDropZone');
    const fileInput = document.getElementById('parapetImageFileInput');
    
    if (!cameraBtn || !dropZone || !fileInput) {
        console.warn('Parapet image upload elements not found');
        return;
    }
    
    // Camera button click - prevent form submission
    cameraBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        fileInput.click();
    });
    
    // File input change
    fileInput.addEventListener('change', handleParapetFileSelect);
    
    // Drop zone events - NO CLICK HANDLER (only button triggers file selection)
    dropZone.addEventListener('paste', handleParapetPaste);
    dropZone.addEventListener('dragover', handleParapetDragOver);
    dropZone.addEventListener('dragleave', handleParapetDragLeave);
    dropZone.addEventListener('drop', handleParapetDrop);
    
    // Focus/blur for visual feedback
    dropZone.addEventListener('focus', () => {
        dropZone.style.borderColor = '#007bff';
        dropZone.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.25)';
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
        event.target.value = '';
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
    
    // Check current image count and limit to 1 max for parapets
    const currentImageCount = window.currentParapetImages?.length || 0;
    const remainingSlots = 1 - currentImageCount;
    
    if (remainingSlots <= 0) {
        alert('Maximum 1 image allowed per parapet. Please remove existing image to add a new one.');
        return;
    }
    
    if (validFiles.length > remainingSlots) {
        alert('Maximum 1 image allowed per parapet.');
        return;
    }
    
    // Show loading state
    const dropZone = document.getElementById('parapetDropZone');
    if (dropZone) {
        dropZone.placeholder = 'Uploading image...';
    }
    
    // Initialize window.currentParapetImages if it doesn't exist
    if (!window.currentParapetImages) {
        window.currentParapetImages = [];
    }
    
    for (const file of validFiles) {
        try {
            // Upload to S3 and get URL
            const imageData = await uploadImageToS3(file);
            
            // Add to current images array
            window.currentParapetImages.push(imageData);
            
            // Show preview
            addParapetImagePreview(imageData);
            
        } catch (error) {
            console.error('Error uploading parapet image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    // Reset placeholder and update state
    updateParapetDropZoneState();
}

function updateParapetDropZoneState() {
    const dropZone = document.getElementById('parapetDropZone');
    if (!dropZone) return;
    
    const currentCount = window.currentParapetImages?.length || 0;
    
    if (currentCount >= 1) {
        dropZone.placeholder = 'Maximum 1 image reached. Remove image to add new one.';
        dropZone.style.background = '#fff5f5';
        dropZone.style.borderColor = '#ffc107';
    } else {
        dropZone.placeholder = 'Drop or paste image here (Ctrl+V)';
        dropZone.style.background = 'white';
        dropZone.style.borderColor = '#ccc';
    }
}

function addParapetImagePreview(imageData) {
    const container = document.getElementById('parapetImagePreviewContainer');
    
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename}">
        <button type="button" class="image-remove" title="Remove image">×</button>
    `;
    
    container.appendChild(preview);
    
    // Add event listener
    const removeButton = preview.querySelector('.image-remove');
    removeButton.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        removeParapetImage(imageData.key);
    });
    
    // Update drop zone state
    updateParapetDropZoneState();
    
    // Load the actual image
    loadImagePreview(preview.querySelector('img'), imageData.key);
}

function removeParapetImage(imageKey) {
    // Remove from window global array
    if (!window.currentParapetImages) {
        window.currentParapetImages = [];
    }
    window.currentParapetImages = window.currentParapetImages.filter(img => img.key !== imageKey);
    
    // Remove preview element
    const container = document.getElementById('parapetImagePreviewContainer');
    const previews = container.querySelectorAll('.image-preview');
    previews.forEach(preview => {
        const img = preview.querySelector('img');
        if (img && img.src.includes(imageKey)) {
            preview.remove();
        }
    });
    
    // Update drop zone state
    updateParapetDropZoneState();
    
    console.log('Parapet image removed, remaining count:', window.currentParapetImages.length);
}

// Function to clear parapet images
function clearParapetImages() {
    window.currentParapetImages = [];
    const container = document.getElementById('parapetImagePreviewContainer');
    if (container) {
        container.innerHTML = '';
    }
    updateParapetDropZoneState();
}

// Function to load parapet images for editing
function loadParapetImagesForEdit(images) {
    clearParapetImages();
    
    if (!images || images.length === 0) return;
    
    window.currentParapetImages = [...images];
    
    images.forEach(image => {
        addParapetImagePreview(image);
    });
}

function setupHauteurMaxPreview() {
    const majorInput = document.getElementById('hauteurMax');
    const combinedUnitSelect = document.getElementById('hauteurMaxUnit');
    const minorInput = document.getElementById('hauteurMaxMinor');
    const preview = document.getElementById('hauteurPreview');
    
    if (!majorInput || !combinedUnitSelect || !minorInput || !preview) {
        return;
    }
    
    function updatePreview() {
        const major = majorInput.value || '0';
        const minorRaw = minorInput.value || '0';
        const unit = combinedUnitSelect.value || 'ft-in';
        
        // Handle mm unit (single value)
        if (unit === 'mm') {
            if (major === '0') {
                preview.textContent = 'Preview: --';
                preview.style.color = '#666';
            } else {
                preview.textContent = `Preview: ${major}mm`;
                preview.style.color = '#2c5aa0';
            }
            return;
        }
        
        // Handle ft-in unit (two values)
        const [majorUnit, minorUnit] = unit.split('-');
        
        // Parse minor value - only for inches
        let minor = minorRaw;
        if (minorUnit === 'in' && minorRaw !== '0') {
            const parsed = parseInchInput(minorRaw);
            if (parsed !== null) {
                minor = parsed.toString();
            } else {
                preview.textContent = 'Preview: Invalid inch format';
                preview.style.color = '#dc3545';
                return;
            }
        }
        
        if (major === '0' && minor === '0') {
            preview.textContent = 'Preview: --';
            preview.style.color = '#666';
        } else {
            const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
            preview.textContent = `Preview: ${formatted}`;
            preview.style.color = '#2c5aa0';
        }
    }
    
    // Add event listeners for input changes
    majorInput.addEventListener('input', updatePreview);
    minorInput.addEventListener('input', updatePreview);
    combinedUnitSelect.addEventListener('change', () => {
        toggleMinorField('hauteur');
        updatePreview();
    });
    
    // Initial setup
    toggleMinorField('hauteur');
    updatePreview();
}

function setupWindowLargeurPreview() {
    const majorInput = document.getElementById('windowLargeurMax');
    const minorInput = document.getElementById('windowLargeurMaxMinor');
    const combinedUnitSelect = document.getElementById('windowLargeurMaxUnit');
    const preview = document.getElementById('largeurPreview');
    
    if (!majorInput || !combinedUnitSelect || !minorInput || !preview) {
        return;
    }
    
    function updatePreview() {
        const major = majorInput.value || '0';
        const minorRaw = minorInput.value || '0';
        const unit = combinedUnitSelect.value || 'ft-in';
        
        // Handle mm unit (single value)
        if (unit === 'mm') {
            if (major === '0') {
                preview.textContent = 'Preview: --';
                preview.style.color = '#666';
            } else {
                preview.textContent = `Preview: ${major}mm`;
                preview.style.color = '#2c5aa0';
            }
            return;
        }
        
        // Handle ft-in unit (two values)
        const [majorUnit, minorUnit] = unit.split('-');
        
        // Parse minor value - only for inches
        let minor = minorRaw;
        if (minorUnit === 'in' && minorRaw !== '0') {
            const parsed = parseInchInput(minorRaw);
            if (parsed !== null) {
                minor = parsed.toString();
            } else {
                preview.textContent = 'Preview: Invalid inch format';
                preview.style.color = '#dc3545';
                return;
            }
        }
        
        if (major === '0' && minor === '0') {
            preview.textContent = 'Preview: --';
            preview.style.color = '#666';
        } else {
            const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
            preview.textContent = `Preview: ${formatted}`;
            preview.style.color = '#2c5aa0';
        }
    }
    
    // Sync with Hauteur unit
    combinedUnitSelect.addEventListener('change', function() {
        toggleMinorField('windowLargeur');
        
        const hauteurUnitSelect = document.getElementById('windowHauteurMaxUnit');
        if (hauteurUnitSelect) {
            hauteurUnitSelect.value = this.value;
            // Trigger hauteur preview update and toggle
            toggleMinorField('windowHauteur');
            const event = new Event('change');
            hauteurUnitSelect.dispatchEvent(event);
        }
        updatePreview();
    });
    
    majorInput.addEventListener('input', updatePreview);
    minorInput.addEventListener('input', updatePreview);
    
    // Initial setup
    toggleMinorField('windowLargeur');
    updatePreview();
}

function setupWindowHauteurPreview() {
    const majorInput = document.getElementById('windowHauteurMax');
    const minorInput = document.getElementById('windowHauteurMaxMinor');
    const combinedUnitSelect = document.getElementById('windowHauteurMaxUnit');
    const preview = document.getElementById('hauteurWindowPreview');
    
    if (!majorInput || !combinedUnitSelect || !minorInput || !preview) {
        return;
    }
    
    function updatePreview() {
        const major = majorInput.value || '0';
        const minorRaw = minorInput.value || '0';
        const unit = combinedUnitSelect.value || 'ft-in';
        
        // Handle mm unit (single value)
        if (unit === 'mm') {
            if (major === '0') {
                preview.textContent = 'Preview: --';
                preview.style.color = '#666';
            } else {
                preview.textContent = `Preview: ${major}mm`;
                preview.style.color = '#2c5aa0';
            }
            return;
        }
        
        // Handle ft-in unit (two values)
        const [majorUnit, minorUnit] = unit.split('-');
        
        // Parse minor value - only for inches
        let minor = minorRaw;
        if (minorUnit === 'in' && minorRaw !== '0') {
            const parsed = parseInchInput(minorRaw);
            if (parsed !== null) {
                minor = parsed.toString();
            } else {
                preview.textContent = 'Preview: Invalid inch format';
                preview.style.color = '#dc3545';
                return;
            }
        }
        
        if (major === '0' && minor === '0') {
            preview.textContent = 'Preview: --';
            preview.style.color = '#666';
        } else {
            const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
            preview.textContent = `Preview: ${formatted}`;
            preview.style.color = '#2c5aa0';
        }
    }
    
    majorInput.addEventListener('input', updatePreview);
    minorInput.addEventListener('input', updatePreview);
    combinedUnitSelect.addEventListener('change', () => {
        toggleMinorField('windowHauteur');
        updatePreview();
    });
    
    // Initial setup
    toggleMinorField('windowHauteur');
    updatePreview();
}

function formatWindowDimension(major, minor, unit) {
    const majorVal = parseFloat(major) || 0;
    // Convert minor to string if it's a number
    const minorStr = (minor !== null && minor !== undefined) ? String(minor) : '';
    const minorVal = parseInchInput(minorStr) || 0;
    const minorDisplay = minorStr || '0';
    
    if (!unit) return 'N/A';
    
    if (unit === 'ft-in') {
        // Imperial format: 5'-6" (preserve original format)
        if (majorVal === 0 && minorVal === 0) return '0"';
        if (majorVal > 0 && minorVal > 0) return `${majorVal}'-${minorDisplay}"`;
        if (majorVal > 0) return `${majorVal}'-0"`;
        return `${minorDisplay}"`;
    } else if (unit === 'mm') {
        // Metric format: 1234mm (single value)
        if (majorVal === 0) return '0mm';
        return `${Math.round(majorVal)}mm`;
    } else if (unit === 'm-mm') {
        // Legacy format support: convert m-mm to mm
        const meters = parseFloat(major) || 0;
        const mm = parseFloat(minor) || 0;
        const totalMm = (meters * 1000) + mm;
        return `${Math.round(totalMm)}mm`;
    }
    
    return 'N/A';
}

// Helper function for preview formatting
function formatPreviewDisplay(major, majorUnit, minor, minorUnit) {
    const majorVal = parseFloat(major) || 0;
    const minorVal = parseFloat(minor) || 0;
    
    if (majorUnit === 'ft' && minorUnit === 'in') {
        // Imperial: 5'-6"
        if (majorVal === 0 && minorVal === 0) return '0"';
        if (majorVal > 0 && minorVal > 0) return `${majorVal}'-${minorVal}"`;
        if (majorVal > 0) return `${majorVal}'-0"`;
        return `${minorVal}"`;
    } else if (majorUnit === 'mm') {
        // Metric single value: 1234mm
        if (majorVal === 0) return '0mm';
        return `${Math.round(majorVal)}mm`;
    } else if (majorUnit === 'm' && minorUnit === 'mm') {
        // Legacy metric format: convert to mm
        const totalMm = (majorVal * 1000) + minorVal;
        return `${Math.round(totalMm)}mm`;
    }
    
    return `${majorVal} ${majorUnit}`;
}

// CFSS Report Generation Function
async function generateCFSSProjectReport() {
    if (!currentProjectId) {
        alert('Error: No project selected');
        return;
    }

    const generateButton = document.getElementById('generateCFSSReportButton');
    
    try {
        generateButton.disabled = true;
        generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating CFSS PDF... (up to 30 seconds)';
        
        // Prepare CFSS project data including walls and wind data
        const cfssProjectData = {
            ...projectData,
            walls: projectEquipment, // CFSS uses walls instead of equipment
            cfssWindData: cfssWindData,
            parapets: projectParapets,
            windows: projectWindows
        };
        
        console.log('ðŸ“Š CFSS Project data being sent:', {
            name: cfssProjectData.name,
            wallsCount: cfssProjectData.walls?.length || 0,
            windDataCount: cfssProjectData.cfssWindData?.length || 0
        });
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/cfss-report`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectData: cfssProjectData
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 504) {
                throw new Error('CFSS PDF generation timed out. Please try again.');
            }
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'CFSS PDF generation failed');
        }

        if (!result.downloadUrl) {
            throw new Error('No download URL received from server');
        }

        console.log('âœ… Opening CFSS download URL:', result.downloadUrl);

         await sendReportToMakeWebhook(result.downloadUrl);

        window.location.href = result.downloadUrl;
        
        console.log('âœ… CFSS PDF download completed successfully');
        
    } catch (error) {
        console.error('âŒ CFSS PDF generation error:', error);
        if (error.name === 'AbortError' || error.message.includes('504')) {
            alert('CFSS PDF generation timed out. Please try again in a few minutes.');
        } else {
            alert('Error generating CFSS report: ' + error.message);
        }
    } finally {
        generateButton.disabled = false;
        generateButton.innerHTML = '<i class="fas fa-file-pdf"></i> Generate CFSS Report';
    }
}

async function sendReportToMakeWebhook(downloadUrl) {
    // Check for both specific users
    const allowedEmails = ['hoangminhduc.ite@gmail.com', 'anhquan1212004@gmail.com'];
    
    if (!allowedEmails.includes(currentUser?.email)) {
        console.log('Skipping webhook - not target user');
        return;
    }
    
    const webhookUrl = 'https://hook.us1.make.com/eto1idfk8idlmtk7ncamulepeefcmh84';
    
    try {
        console.log('ðŸ“¤ Sending report URL to Make.com webhook...');

            // Get projectNumber safely from the UI or in-memory projectData
    let projectNumber = '';
    try {
      projectNumber = (typeof getFreshProjectMeta === 'function'
        ? getFreshProjectMeta().projectNumber
        : '') || (window.projectData?.projectNumber || '');
    } catch {
      projectNumber = window.projectData?.projectNumber || '';
    }
        
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: downloadUrl,
                projectNumber
        });

        console.log('âœ… Report URL sent to Google Drive successfully');
    } catch (error) {
        console.error('âŒ Error sending to webhook:', error);
    }
}

// Function to show signature confirmation popup
function showSignaturePopup() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 8px; max-width: 500px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h3 style="margin: 0 0 20px 0; color: #333; font-size: 20px;">
                    ðŸ–Šï¸ Sign Document
                </h3>
                <p style="margin: 0 0 25px 0; color: #666; font-size: 15px; line-height: 1.5;">
                    Do you want to sign and flatten this document?
                </p>
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    <button id="signatureNo" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 15px; font-weight: 500;">
                        No
                    </button>
                    <button id="signatureYes" style="background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 15px; font-weight: 500;">
                        Yes
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('#signatureYes').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });
        
        modal.querySelector('#signatureNo').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });
    });
}

// Function to show Google Drive confirmation popup
function showGoogleDrivePopup() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 8px; max-width: 500px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h3 style="margin: 0 0 20px 0; color: #333; font-size: 20px;">
                    ðŸ’¾ Save to Google Drive
                </h3>
                <p style="margin: 0 0 25px 0; color: #666; font-size: 15px; line-height: 1.5;">
                    Do you want to save this document to Google Drive?
                </p>
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    <button id="driveNo" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 15px; font-weight: 500;">
                        No
                    </button>
                    <button id="driveYes" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 15px; font-weight: 500;">
                        Yes
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('#driveYes').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });
        
        modal.querySelector('#driveNo').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });
    });
}

// Trigger parapet edit image upload
function triggerParapetEditImageUpload(parapetId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const fileInput = document.getElementById(`editParapetImageFileInput${parapetId}`);
    if (fileInput) {
        fileInput.click();
    }
}

// Setup function for CFSS Report button
function setupCFSSReportButton() {
    const generateButton = document.getElementById('generateCFSSReportButton');
    if (generateButton) {
        generateButton.addEventListener('click', generateCFSSProjectReport);
        console.log('âœ… CFSS Report button setup completed');
    } else {
        console.warn('âš ï¸ CFSS Report button not found');
    }
}

// Add these functions to cfss-project-details.js

// Global variable to track edit mode images
let editModeImages = {};

// Fix 5: Update triggerEditImageUpload to prevent form submission
function triggerEditImageUpload(wallIndex, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const fileInput = document.getElementById(`editImageFileInput${wallIndex}`);
    if (fileInput) {
        fileInput.click();
    }
}

// Function to setup edit mode image handlers
function setupEditImageHandlers(wallIndex) {
    const fileInput = document.getElementById(`editImageFileInput${wallIndex}`);
    const dropZone = document.getElementById(`editDropZone${wallIndex}`);
    
    if (!fileInput || !dropZone) {
        console.error(`Edit image elements not found for wall ${wallIndex}`);
        return;
    }
    
    // File input change
    fileInput.addEventListener('change', (event) => handleEditFileSelect(event, wallIndex));
    
    // Drop zone events - NO CLICK HANDLER for file upload
    dropZone.addEventListener('dragover', (event) => handleEditDragOver(event, wallIndex));
    dropZone.addEventListener('dragleave', (event) => handleEditDragLeave(event, wallIndex));
    dropZone.addEventListener('drop', (event) => handleEditDrop(event, wallIndex));
    dropZone.addEventListener('paste', (event) => handleEditPaste(event, wallIndex));
    
    // Focus/blur for better UX
    dropZone.addEventListener('focus', () => {
        dropZone.style.borderColor = '#007bff';
        dropZone.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.25)';
    });
    
    dropZone.addEventListener('blur', () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    });
    
    console.log(`Edit mode image handlers setup for wall ${wallIndex}`);
}

// Handle file selection in edit mode
function handleEditFileSelect(event, wallIndex) {
    const files = Array.from(event.target.files);
    processEditFiles(files, wallIndex);
}

// Handle paste in edit mode
function handleEditPaste(event, wallIndex) {
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
        processEditFiles(files, wallIndex);
        event.target.value = ''; // Clear the input
        event.target.placeholder = 'Images pasted successfully!';
        setTimeout(() => {
            event.target.placeholder = 'Drop, paste, or browse images';
        }, 2000);
    }
}

// Handle drag over in edit mode
function handleEditDragOver(event, wallIndex) {
    event.preventDefault();
    const dropZone = document.getElementById(`editDropZone${wallIndex}`);
    if (dropZone) {
        dropZone.style.borderColor = '#007bff';
        dropZone.style.backgroundColor = '#f0f8ff';
    }
}

// Handle drag leave in edit mode
function handleEditDragLeave(event, wallIndex) {
    const dropZone = document.getElementById(`editDropZone${wallIndex}`);
    if (dropZone) {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.backgroundColor = 'white';
    }
}

// Handle drop in edit mode
function handleEditDrop(event, wallIndex) {
    event.preventDefault();
    const dropZone = document.getElementById(`editDropZone${wallIndex}`);
    if (dropZone) {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.backgroundColor = 'white';
    }
    
    const files = Array.from(event.dataTransfer.files);
    processEditFiles(files, wallIndex);
}

// Process files in edit mode
async function processEditFiles(files, wallIndex) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
        alert('Please select valid image files.');
        return;
    }
    
    // NEW: Check current image count in edit mode and limit to 2 max
    const currentEditImages = editModeImages[wallIndex] || [];
    const remainingSlots = 2 - currentEditImages.length;
    
    if (remainingSlots <= 0) {
        alert('Maximum 2 images allowed per wall. Please remove existing images to add new ones.');
        return;
    }
    
    if (validFiles.length > remainingSlots) {
        alert(`You can only add ${remainingSlots} more image(s). Maximum 2 images allowed per wall.`);
        return;
    }
    
    // Show loading state
    const dropZone = document.getElementById(`editDropZone${wallIndex}`);
    if (dropZone) {
        dropZone.placeholder = `Uploading ${validFiles.length} image(s)...`;
    }
    
    for (const file of validFiles) {
        try {
            // Upload to S3 and get URL
            const imageData = await uploadImageToS3(file);
            
            // Add to edit mode images for this wall
            if (!editModeImages[wallIndex]) {
                editModeImages[wallIndex] = [];
            }
            editModeImages[wallIndex].push(imageData);
            
            // Show preview
            addEditImagePreview(imageData, wallIndex);
            
        } catch (error) {
            console.error('Error uploading image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
    }
    
    // Reset placeholder and update based on image count
    if (dropZone) {
        const newCount = editModeImages[wallIndex]?.length || 0;
        if (newCount >= 2) {
            dropZone.placeholder = 'Maximum 2 images reached. Remove images to add new ones.';
            dropZone.style.background = '#fff5f5';
            dropZone.style.borderColor = '#ffc107';
        } else {
            dropZone.placeholder = 'Drop, paste, or browse images';
            dropZone.style.background = 'white';
            dropZone.style.borderColor = '#ccc';
        }
    }
}

// Add image preview in edit mode
function addEditImagePreview(imageData, wallIndex) {
    const container = document.getElementById(`editImagePreviewContainer${wallIndex}`);
    if (!container) return;
    
    const preview = document.createElement('div');
    preview.className = 'edit-image-preview';
    preview.style.cssText = `
        position: relative; 
        width: 80px; 
        height: 80px; 
        border-radius: 4px; 
        overflow: hidden; 
        border: 1px solid #ddd;
        background: #f5f5f5;
    `;
    
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" 
            alt="${imageData.filename}"
            style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
            onclick="openImageModal('${imageData.key}', '${imageData.filename}')"
            data-image-key="${imageData.key}">
        <button type="button" class="edit-image-remove" 
                title="Remove image"
                style="position: absolute; top: 2px; right: 2px; background: rgba(255,0,0,0.8); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            ×
        </button>
    `;
    
    container.appendChild(preview);
    
    // IMPORTANT: Add event listener instead of onclick to properly handle the event
    const removeButton = preview.querySelector('.edit-image-remove');
    removeButton.addEventListener('click', function(event) {
        removeEditImage(imageData.key, wallIndex, event);
    });
    
    // Load the actual image
    const imgElement = preview.querySelector('img');
    loadImagePreview(imgElement, imageData.key);
}

// Remove image in edit mode
function removeEditImage(imageKey, wallIndex, event) {
    // CRITICAL: Prevent form submission and event bubbling
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Remove from edit mode images array
    if (editModeImages[wallIndex]) {
        editModeImages[wallIndex] = editModeImages[wallIndex].filter(img => img.key !== imageKey);
    }
    
    // Remove preview element
    const container = document.getElementById(`editImagePreviewContainer${wallIndex}`);
    if (container) {
        const previews = container.querySelectorAll('.edit-image-preview');
        previews.forEach(preview => {
            const img = preview.querySelector('img');
            if (img && img.getAttribute('data-image-key') === imageKey) {
                preview.remove();
            }
        });
    }
    
    console.log(`Removed image ${imageKey} from edit mode`);
}

// Load existing images in edit mode
function loadExistingImagesInEdit(wall, wallIndex) {
    const container = document.getElementById(`editImagePreviewContainer${wallIndex}`);
    if (!container) return;
    
    // Initialize edit mode images for this wall
    editModeImages[wallIndex] = wall.images ? [...wall.images] : [];
    
    // Clear container
    container.innerHTML = '';
    
    // Add existing images
    if (wall.images && wall.images.length > 0) {
        wall.images.forEach(image => {
            addEditImagePreview(image, wallIndex);
        });
        console.log(`Loaded ${wall.images.length} existing images for editing`);
    } 
}

// Get edit mode images for saving
function getEditModeImages(wallIndex) {
    return editModeImages[wallIndex] || [];
}

// Clear edit mode images
function clearEditModeImages(wallIndex) {
    if (editModeImages[wallIndex]) {
        delete editModeImages[wallIndex];
    }
}

// Global variable to store selected options
let selectedCFSSOptions = [];

// Initialize the tab system
function initializeTabSystem() {
    console.log('ðŸ”„ Initializing CFSS tab system...');
    
    // Get tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabSections = document.querySelectorAll('.tab-content-section');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
    
    console.log('âœ… Tab system initialized');
}

function setupWindowHandlers() {
    // Add Window button with proper toggle
    const addWindowButton = document.getElementById('addWindowButton');
    if (addWindowButton) {
        addWindowButton.addEventListener('click', function() {
            const windowForm = document.getElementById('windowForm');
            const isCurrentlyVisible = windowForm.classList.contains('show');
            
            if (isCurrentlyVisible) {
                // Hide the form
                windowForm.classList.remove('show');
                this.innerHTML = '<i class="fas fa-window-maximize"></i> Add Window';
            } else {
                // Close all expanded details before showing form
                closeAllExpandedDetails();
                
                // Hide other forms first
                hideAllForms();
                // Show window form
                windowForm.classList.add('show');
                this.innerHTML = '<i class="fas fa-times"></i> Hide Form';
            }
        });
    }

    // Window form handlers
    const windowForm = document.getElementById('windowDataForm');
    if (windowForm) {
        windowForm.addEventListener('submit', handleWindowSubmit);
    }
    
    const cancelButton = document.getElementById('cancelWindow');
    if (cancelButton) {
        cancelButton.addEventListener('click', function() {
            hideAllForms();
        });
    }
}

// Update your existing toggleForm function to handle windows
function toggleForm(formType) {
    hideAllForms();
    
    if (formType === 'wall') {
        const form = document.getElementById('equipmentForm');
        form.classList.add('show');
        document.getElementById('newCalculationButton').innerHTML = '<i class="fas fa-th-large"></i> Cancel';
    } else if (formType === 'window') {
        const form = document.getElementById('windowForm');
        form.classList.add('show');
        document.getElementById('addWindowButton').textContent = 'Cancel';
    }
}

// Close all expanded wall details
function closeAllExpandedDetails() {
    const allDetails = document.querySelectorAll('.equipment-details.show');
    allDetails.forEach(detailsDiv => {
        detailsDiv.classList.remove('show');
        const wallCard = detailsDiv.closest('.equipment-card');
        const detailsButton = wallCard?.querySelector('.details-btn');
        if (detailsButton) {
            detailsButton.textContent = 'Details';
        }
    });
}

function hideAllForms() {
    // Hide window form
    const windowForm = document.getElementById('windowForm');
    if (windowForm) {
        windowForm.classList.remove('show');
    }
    
    // Hide equipment form
    const equipmentForm = document.getElementById('equipmentForm');
    if (equipmentForm) {
        equipmentForm.classList.remove('show');
    }
    
    // Hide parapet form
    const parapetForm = document.getElementById('parapetForm');
    if (parapetForm) {
        parapetForm.style.display = 'none';
    }
    
    // Hide CFSS form
    const cfssForm = document.getElementById('cfss-form');
    const cfssBtn = document.querySelector('.cfss-btn');
    if (cfssForm && !cfssForm.classList.contains('hidden')) {
        cfssForm.classList.add('hidden');
        if (cfssBtn) {
            cfssBtn.classList.remove('expanded');
        }
    }
    
    // Reset button texts
    const addWindowButton = document.getElementById('addWindowButton');
    if (addWindowButton) {
        addWindowButton.innerHTML = '<i class="fas fa-window-maximize"></i> Add Window';
    }
    
    const newCalcButton = document.getElementById('newCalculationButton');
    if (newCalcButton) {
        newCalcButton.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';
    }
    
    const addParapetButton = document.getElementById('addParapetButton');
    if (addParapetButton) {
        addParapetButton.innerHTML = '<i class="fas fa-building"></i> Add Parapet';
    }
    
    // Reset CFSS button text
    updateCFSSButtonText();
}

// Window form submission handler
function handleWindowSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    
    // FIXED: Parse composition JSON strings to arrays
    const parseComposition = (compositionStr) => {
        if (!compositionStr) return [];
        try {
            const parsed = JSON.parse(compositionStr);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('Failed to parse composition:', compositionStr);
            return [];
        }
    };
    
    const windowData = {
    id: Date.now(),
    type: formData.get('windowType'),
    floor: formData.get('windowFloor') || '',
    largeurMax: parseFloat(formData.get('windowLargeurMax')) || 0,
    largeurMaxMinor: formData.get('windowLargeurMaxMinor') || '',
    largeurMaxUnit: formData.get('windowLargeurMaxUnit'),
    hauteurMax: parseFloat(formData.get('windowHauteurMax')) || 0,
    hauteurMaxMinor: formData.get('windowHauteurMaxMinor') || '',
    hauteurMaxUnit: formData.get('windowHauteurMaxUnit'),
    l1: formData.get('windowL1') || '',
    l1Minor: formData.get('windowL1Minor') || '',
    l1Unit: formData.get('windowL1Unit') || 'ft-in',
    l2: formData.get('windowL2') || '',
    l2Minor: formData.get('windowL2Minor') || '',
    l2Unit: formData.get('windowL2Unit') || 'ft-in',
    jambage: {
        type: formData.get('jambageType'),
        compositions: parseComposition(formData.get('jambageComposition'))
    },
    linteau: {
        type: formData.get('linteauType'),
        compositions: parseComposition(formData.get('linteauComposition'))
    },
    seuil: {
        type: formData.get('seuilType'),
        compositions: parseComposition(formData.get('seuilComposition'))
    },
    createdAt: new Date().toISOString()
};

    projectWindows.push(windowData);
    renderWindowList();
    updateWindowSummary();
    saveWindowsToDatabase();
    
    // Reset form and hide it
    e.target.reset();
    hideAllForms();
    
    alert('Window saved successfully!');
}

// Function to render window list with edit capability
function renderWindowList() {
  const container = document.getElementById('windowList');

  // Guard: no windows
  const validWindows = (projectWindows || []).filter(w => w && (w.windowName || w.name || w.type));
  if (validWindows.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;color:#6c757d;padding:40px;">
        <i class="fas fa-window-maximize" style="font-size:48px;margin-bottom:10px;"></i>
        <p>No windows added yet. Click "Add Window" to get started.</p>
      </div>`;
    return;
  }

  container.innerHTML = validWindows.map((win, idx) => {
    const id    = win.id;
    const title = win.windowName || win.name || win.type || `Window ${idx + 1}`;
    const largeurDisplay = formatWindowDimension(win.largeurMax, win.largeurMaxMinor, win.largeurMaxUnit);
    const hauteurDisplay = formatWindowDimension(win.hauteurMax, win.hauteurMaxMinor, win.hauteurMaxUnit);
    const dims = `${largeurDisplay} × ${hauteurDisplay}`;

    return `
    <div class="equipment-card" id="windowCard${id}">
      <!-- Collapsed header -->
      <div id="windowView${id}">
        <div class="equipment-header" onclick="toggleWindowDetails(${id})">
          <div class="equipment-info-compact">
            <h4>${title}</h4>
            <div class="equipment-meta-compact"><span>${dims}</span></div>
          </div>
          <div class="equipment-actions-compact">
            <button class="details-btn" onclick="event.stopPropagation(); toggleWindowDetails(${id})">Details</button>
            <button class="duplicate-btn" onclick="event.stopPropagation(); duplicateWindow(${id})" style="background:#17a2b8;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:13px;">
              <i class="fas fa-copy"></i> Duplicate
            </button>
            <button class="delete-btn" onclick="event.stopPropagation(); deleteWindow(${id})">Delete</button>
          </div>
        </div>

        <!-- Expanded details (read-only summary) -->
        <div class="equipment-details" id="windowDetails${id}">
          <div class="equipment-details-container">
            <div class="equipment-info-section" style="font-size:13px;color:#495057;">
                <p><strong>Type:</strong> ${win.type || 'N/A'}</p>
                ${win.floor ? `<p><strong>Floor:</strong> ${win.floor}</p>` : ''}
                <p><strong>Dimensions:</strong> ${dims}</p>
                ${win.l1 || win.l1Minor ? `<p><strong>L1:</strong> ${formatWindowDimension(win.l1, win.l1Minor, win.l1Unit)}</p>` : ''}
                ${win.l2 || win.l2Minor ? `<p><strong>L2:</strong> ${formatWindowDimension(win.l2, win.l2Minor, win.l2Unit)}</p>` : ''}

              <p><strong>Jambage:</strong> ${win.jambage?.type || 'N/A'}</p>
              ${win.jambage?.compositions?.length ? `<div style="margin:6px 0 10px 12px;color:#6c757d;">• ${win.jambage.compositions.join('<br>• ')}</div>` : ''}

              <p><strong>Linteau:</strong> ${win.linteau?.type || 'N/A'}</p>
              ${win.linteau?.compositions?.length ? `<div style="margin:6px 0 10px 12px;color:#6c757d;">• ${win.linteau.compositions.join('<br>• ')}</div>` : ''}

              <p><strong>Seuil:</strong> ${win.seuil?.type || 'N/A'}</p>
              ${win.seuil?.compositions?.length ? `<div style="margin:6px 0 10px 12px;color:#6c757d;">• ${win.seuil.compositions.join('<br>• ')}</div>` : ''}

              <div style="margin-top:12px;">
                <button class="button primary" onclick="editWindow(${id})">
                  <i class="fas fa-edit"></i> Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Mode (complete form; IDs match saveWindowEdit()) -->
      <div id="windowEdit${id}" class="equipment-form" style="display:none; padding:20px; background:#f8f9fa; border-radius:8px;">
        <h3 style="margin-top:0;">Edit Window</h3>
        <form onsubmit="saveWindowEdit(${id}, event); return false;">

          <!-- Basic -->
          <div class="form-group" style="max-width:420px;">
            <label for="editWindowType${id}">Window Type</label>
            <input type="text" id="editWindowType${id}" value="${win.type || ''}" required>
          </div>

          <!-- Floor -->
          <div class="form-group" style="max-width:420px;">
            <label for="editWindowFloor${id}">Floor</label>
            <input type="text" id="editWindowFloor${id}" value="${win.floor || ''}" placeholder="e.g., NV2 - NV3">
          </div>

          <!-- Largeur Max - Dual Input with Unit Toggle -->
        <div class="form-group">
        <label for="editLargeurMax${id}">Largeur Max</label>
        <div style="display:flex; gap:10px; align-items:center;">
            <input type="number" id="editLargeurMax${id}" value="${win.largeurMax ?? ''}" min="0" step="1" required
                style="flex:2; padding:8px 12px; border:1px solid #ddd; border-radius:4px; font-size:14px;">
            <input type="text" id="editLargeurMaxMinor${id}" value="${win.largeurMaxMinor ?? ''}" placeholder=""
    style="flex:2; padding:8px 12px; border:1px solid #ddd; border-radius:4px; font-size:14px; display:${(win.largeurMaxUnit === 'mm' || win.largeurMaxUnit === 'm-mm') ? 'none' : 'block'};">
            <select id="editLargeurMaxUnit${id}" required
                    onchange="toggleEditWindowMinorField(${id}, 'Largeur')"
                    style="flex:1; padding:8px 8px; border:1px solid #ddd; border-radius:4px; font-size:14px;">
            <option value="ft-in" ${(!win.largeurMaxUnit || win.largeurMaxUnit === 'ft-in') ? 'selected' : ''}>ft-in</option>
            <option value="mm" ${win.largeurMaxUnit === 'mm' || win.largeurMaxUnit === 'm-mm' ? 'selected' : ''}>mm</option>
            </select>
        </div>
        <div id="editLargeurPreview${id}" style="margin-top:5px; font-size:12px; color:#666; font-style:italic;">
            Preview: --
        </div>
        </div>

        <!-- Hauteur Max - Dual Input with Unit Toggle -->
        <div class="form-group">
        <label for="editHauteurMax${id}">Hauteur Max</label>
        <div style="display:flex; gap:10px; align-items:center;">
            <input type="number" id="editHauteurMax${id}" value="${win.hauteurMax ?? ''}" min="0" step="1" required
                style="flex:2; padding:8px 12px; border:1px solid #ddd; border-radius:4px; font-size:14px;">
            <input type="text" id="editHauteurMaxMinor${id}" value="${win.hauteurMaxMinor ?? ''}" placeholder=""
    style="flex:2; padding:8px 12px; border:1px solid #ddd; border-radius:4px; font-size:14px; display:${(win.hauteurMaxUnit === 'mm' || win.hauteurMaxUnit === 'm-mm') ? 'none' : 'block'};">
            <select id="editHauteurMaxUnit${id}" required
                    onchange="toggleEditWindowMinorField(${id}, 'Hauteur')"
                    style="flex:1; padding:8px 8px; border:1px solid #ddd; border-radius:4px; font-size:14px;">
            <option value="ft-in" ${(!win.hauteurMaxUnit || win.hauteurMaxUnit === 'ft-in') ? 'selected' : ''}>ft-in</option>
            <option value="mm" ${win.hauteurMaxUnit === 'mm' || win.hauteurMaxUnit === 'm-mm' ? 'selected' : ''}>mm</option>
            </select>
        </div>
        <div id="editHauteurWindowPreview${id}" style="margin-top:5px; font-size:12px; color:#666; font-style:italic;">
            Preview: --
        </div>
        </div>

          <!-- Jambage -->
          <div style="border-top:1px solid #e9ecef; margin:15px 0 10px; padding-top:12px;">
            <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:10px; max-width:520px;">
              <div class="form-group" style="width:220px; margin-bottom:0;">
                <label for="editJambageType${id}">Jambage Type</label>
                <select id="editJambageType${id}" required onchange="setEditCompositionDisabled(${id}, 'jambage', this.value)">
                    <option value="">Select Jambage Type</option>
                    <option value="JA1" ${win.jambage?.type === 'JA1' ? 'selected' : ''}>JA1</option>
                    <option value="JA2a" ${win.jambage?.type === 'JA2a' ? 'selected' : ''}>JA2a</option>
                    <option value="JA2b" ${win.jambage?.type === 'JA2b' ? 'selected' : ''}>JA2b</option>
                    <option value="JA3a" ${win.jambage?.type === 'JA3a' ? 'selected' : ''}>JA3a</option>
                    <option value="JA4a" ${win.jambage?.type === 'JA4a' ? 'selected' : ''}>JA4a</option>
                    <option value="NA" ${win.jambage?.type === 'NA' ? 'selected' : ''}>N/A</option>
                  </select>
              </div>
              <div class="form-group" style="width:260px; margin-bottom:0;">
                <label for="editJambageComposition${id}">Jambage Composition</label>
                <div id="editJambageCompositionBuilder${id}"></div>
                <input type="hidden" id="editJambageComposition${id}" value="${win.jambage?.composition || ''}">
              </div>
            </div>
          </div>

          <!-- Linteau -->
          <div style="border-top:1px solid #e9ecef; margin:15px 0 10px; padding-top:12px;">
            <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:10px; max-width:520px;">
              <div class="form-group" style="width:220px; margin-bottom:0;">
                <label for="editLinteauType${id}">Linteau Type</label>
                <select id="editLinteauType${id}" required onchange="setEditCompositionDisabled(${id}, 'linteau', this.value)">
                    <option value="">Select Linteau Type</option>
                    <option value="LT1" ${win.linteau?.type === 'LT1' ? 'selected' : ''}>LT1</option>
                    <option value="LT2" ${win.linteau?.type === 'LT2' ? 'selected' : ''}>LT2</option>
                    <option value="LT3" ${win.linteau?.type === 'LT3' ? 'selected' : ''}>LT3</option>
                    <option value="LT4" ${win.linteau?.type === 'LT4' ? 'selected' : ''}>LT4</option>
                    <option value="LT5" ${win.linteau?.type === 'LT5' ? 'selected' : ''}>LT5</option>
                    <option value="NA" ${win.linteau?.type === 'NA' ? 'selected' : ''}>N/A</option>
                  </select>
              </div>
              <div class="form-group" style="width:260px; margin-bottom:0;">
                <label for="editLinteauComposition${id}">Linteau Composition</label>
                <div id="editLinteauCompositionBuilder${id}"></div>
                <input type="hidden" id="editLinteauComposition${id}" value="${win.linteau?.composition || ''}">
              </div>
            </div>
          </div>

          <!-- Seuil -->
          <div style="border-top:1px solid #e9ecef; margin:15px 0 10px; padding-top:12px;">
            <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:10px; max-width:520px;">
              <div class="form-group" style="width:220px; margin-bottom:0;">
                <label for="editSeuilType${id}">Seuil Type</label>
                <select id="editSeuilType${id}" required onchange="setEditCompositionDisabled(${id}, 'seuil', this.value)">
                    <option value="">Select Seuil Type</option>
                    <option value="SE1" ${win.seuil?.type === 'SE1' ? 'selected' : ''}>SE1</option>
                    <option value="SE2" ${win.seuil?.type === 'SE2' ? 'selected' : ''}>SE2</option>
                    <option value="SE3" ${win.seuil?.type === 'SE3' ? 'selected' : ''}>SE3</option>
                    <option value="SE4" ${win.seuil?.type === 'SE4' ? 'selected' : ''}>SE4</option>
                    <option value="SE5" ${win.seuil?.type === 'SE5' ? 'selected' : ''}>SE5</option>
                    <option value="NA" ${win.seuil?.type === 'NA' ? 'selected' : ''}>N/A</option>
                  </select>
              </div>
              <div class="form-group" style="width:260px; margin-bottom:0;">
                <label for="editSeuilComposition${id}">Seuil Composition</label>
                <div id="editSeuilCompositionBuilder${id}"></div>
                <input type="hidden" id="editSeuilComposition${id}" value="${win.seuil?.composition || ''}">
              </div>
            </div>
          </div>

          <!-- L1 Field -->
          <div class="form-group">
            <label for="editWindowL1${id}">L1:</label>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="number" id="editWindowL1${id}" value="${win.l1 || ''}" min="0" step="1"
                    style="flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px;">
                <input type="text" id="editWindowL1Minor${id}" value="${win.l1Minor || ''}" placeholder=""
                    style="flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; display: ${(win.l1Unit === 'mm') ? 'none' : 'block'};">
                <select id="editWindowL1Unit${id}"
                    onchange="toggleEditWindowMinorField(${id}, 'L1')"
                    style="flex: 1; padding: 8px 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="ft-in" ${(!win.l1Unit || win.l1Unit === 'ft-in') ? 'selected' : ''}>ft-in</option>
                    <option value="mm" ${win.l1Unit === 'mm' ? 'selected' : ''}>mm</option>
                </select>
            </div>
            <div id="editL1Preview${id}" style="margin-top: 5px; font-size: 12px; color: #666; font-style: italic;">
                Preview: --
            </div>
          </div>

          <!-- L2 Field -->
          <div class="form-group">
            <label for="editWindowL2${id}">L2:</label>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="number" id="editWindowL2${id}" value="${win.l2 || ''}" min="0" step="1"
                    style="flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px;">
                <input type="text" id="editWindowL2Minor${id}" value="${win.l2Minor || ''}" placeholder=""
                    style="flex: 2; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; display: ${(win.l2Unit === 'mm') ? 'none' : 'block'};">
                <select id="editWindowL2Unit${id}"
                    onchange="toggleEditWindowMinorField(${id}, 'L2')"
                    style="flex: 1; padding: 8px 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="ft-in" ${(!win.l2Unit || win.l2Unit === 'ft-in') ? 'selected' : ''}>ft-in</option>
                    <option value="mm" ${win.l2Unit === 'mm' ? 'selected' : ''}>mm</option>
                </select>
            </div>
            <div id="editL2Preview${id}" style="margin-top: 5px; font-size: 12px; color: #666; font-style: italic;">
                Preview: --
            </div>
          </div>

          <!-- Form actions -->
          <div class="form-actions" style="display:flex; gap:10px; margin-top:20px;">
            <button type="submit" class="save-btn"><i class="fas fa-save"></i> Save Changes</button>
            <button type="button" class="button secondary" onclick="cancelWindowEdit(${id})"><i class="fas fa-times"></i> Cancel</button>
          </div>
        </form>
      </div>
    </div>`;
  }).join('');
}

function setupEditWindowDimensionPreviews(id, win) {
    // Setup Largeur preview
    const largeurMajor = document.getElementById(`editLargeurMax${id}`);
    const largeurMinor = document.getElementById(`editLargeurMaxMinor${id}`);
    const largeurUnit = document.getElementById(`editLargeurMaxUnit${id}`);
    const largeurPreview = document.getElementById(`editLargeurPreview${id}`);
    
    if (largeurMajor && largeurMinor && largeurUnit && largeurPreview) {
        function updateLargeurPreview() {
            const major = largeurMajor.value || '0';
            const minor = largeurMinor.value || '0';
            const unit = largeurUnit.value || 'ft-in';
            
            // Handle mm unit (single value)
            if (unit === 'mm') {
                if (major === '0') {
                    largeurPreview.textContent = 'Preview: --';
                    largeurPreview.style.color = '#666';
                } else {
                    largeurPreview.textContent = `Preview: ${major}mm`;
                    largeurPreview.style.color = '#2c5aa0';
                }
                return;
            }
            
            // Handle ft-in unit
            const [majorUnit, minorUnit] = unit.split('-');
            
            if (major === '0' && minor === '0') {
                largeurPreview.textContent = 'Preview: --';
                largeurPreview.style.color = '#666';
            } else {
                const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
                largeurPreview.textContent = `Preview: ${formatted}`;
                largeurPreview.style.color = '#2c5aa0';
            }
        }
        
        // Sync with Hauteur unit
        largeurUnit.addEventListener('change', function() {
            toggleEditWindowMinorField(id, 'Largeur');
            const hauteurUnit = document.getElementById(`editHauteurMaxUnit${id}`);
            if (hauteurUnit) {
                hauteurUnit.value = this.value;
                toggleEditWindowMinorField(id, 'Hauteur');
                hauteurUnit.dispatchEvent(new Event('change'));
            }
            updateLargeurPreview();
        });
        
        largeurMajor.addEventListener('input', updateLargeurPreview);
        largeurMinor.addEventListener('input', updateLargeurPreview);
        
        // Initial setup - force hide if mm
        console.log(`Setting up Largeur for window ${id}, unit: ${largeurUnit.value}`);
        if (largeurUnit.value === 'mm') {
            console.log('Largeur is mm, hiding minor field');
            largeurMinor.style.display = 'none';
            largeurMinor.value = '';
        }
        updateLargeurPreview();
    }
    
    // Setup Hauteur preview
    const hauteurMajor = document.getElementById(`editHauteurMax${id}`);
    const hauteurMinor = document.getElementById(`editHauteurMaxMinor${id}`);
    const hauteurUnit = document.getElementById(`editHauteurMaxUnit${id}`);
    const hauteurPreview = document.getElementById(`editHauteurWindowPreview${id}`);

    if (hauteurMajor && hauteurMinor && hauteurUnit && hauteurPreview) {
        function updateHauteurPreview() {
            const major = hauteurMajor.value || '0';
            const minor = hauteurMinor.value || '0';
            const unit = hauteurUnit.value || 'ft-in';
            
            // Handle mm unit (single value)
            if (unit === 'mm') {
                if (major === '0') {
                    hauteurPreview.textContent = 'Preview: --';
                    hauteurPreview.style.color = '#666';
                } else {
                    hauteurPreview.textContent = `Preview: ${major}mm`;
                    hauteurPreview.style.color = '#2c5aa0';
                }
                return;
            }
            
            // Handle ft-in unit
            const [majorUnit, minorUnit] = unit.split('-');
            
            if (major === '0' && minor === '0') {
                hauteurPreview.textContent = 'Preview: --';
                hauteurPreview.style.color = '#666';
            } else {
                const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
                hauteurPreview.textContent = `Preview: ${formatted}`;
                hauteurPreview.style.color = '#2c5aa0';
            }
        }
        
        hauteurMajor.addEventListener('input', updateHauteurPreview);
        hauteurMinor.addEventListener('input', updateHauteurPreview);
        hauteurUnit.addEventListener('change', () => {
            toggleEditWindowMinorField(id, 'Hauteur');
            updateHauteurPreview();
        });
        
        // Initial setup - force hide if mm
        console.log(`Setting up Hauteur for window ${id}, unit: ${hauteurUnit.value}`);
        if (hauteurUnit.value === 'mm') {
            console.log('Hauteur is mm, hiding minor field');
            hauteurMinor.style.display = 'none';
            hauteurMinor.value = '';
        }
        updateHauteurPreview();
    }

    // Setup L1 preview
    const l1Major = document.getElementById(`editWindowL1${id}`);
    const l1Minor = document.getElementById(`editWindowL1Minor${id}`);
    const l1Unit = document.getElementById(`editWindowL1Unit${id}`);
    const l1Preview = document.getElementById(`editL1Preview${id}`);
    
    if (l1Major && l1Minor && l1Unit && l1Preview) {
        function updateL1Preview() {
            const major = l1Major.value || '0';
            const minor = l1Minor.value || '0';
            const unit = l1Unit.value || 'ft-in';
            
            if (unit === 'mm') {
                if (major === '0') {
                    l1Preview.textContent = 'Preview: --';
                    l1Preview.style.color = '#666';
                } else {
                    l1Preview.textContent = `Preview: ${major}mm`;
                    l1Preview.style.color = '#2c5aa0';
                }
                return;
            }
            
            const [majorUnit, minorUnit] = unit.split('-');
            if (major === '0' && minor === '0') {
                l1Preview.textContent = 'Preview: --';
                l1Preview.style.color = '#666';
            } else {
                const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
                l1Preview.textContent = `Preview: ${formatted}`;
                l1Preview.style.color = '#2c5aa0';
            }
        }
        
        l1Unit.addEventListener('change', () => {
            toggleEditWindowMinorField(id, 'L1');
            updateL1Preview();
        });
        l1Major.addEventListener('input', updateL1Preview);
        l1Minor.addEventListener('input', updateL1Preview);
        
        if (l1Unit.value === 'mm') {
            l1Minor.style.display = 'none';
            l1Minor.value = '';
        }
        updateL1Preview();
    }
    
    // Setup L2 preview
    const l2Major = document.getElementById(`editWindowL2${id}`);
    const l2Minor = document.getElementById(`editWindowL2Minor${id}`);
    const l2Unit = document.getElementById(`editWindowL2Unit${id}`);
    const l2Preview = document.getElementById(`editL2Preview${id}`);
    
    if (l2Major && l2Minor && l2Unit && l2Preview) {
        function updateL2Preview() {
            const major = l2Major.value || '0';
            const minor = l2Minor.value || '0';
            const unit = l2Unit.value || 'ft-in';
            
            if (unit === 'mm') {
                if (major === '0') {
                    l2Preview.textContent = 'Preview: --';
                    l2Preview.style.color = '#666';
                } else {
                    l2Preview.textContent = `Preview: ${major}mm`;
                    l2Preview.style.color = '#2c5aa0';
                }
                return;
            }
            
            const [majorUnit, minorUnit] = unit.split('-');
            if (major === '0' && minor === '0') {
                l2Preview.textContent = 'Preview: --';
                l2Preview.style.color = '#666';
            } else {
                const formatted = formatPreviewDisplay(major, majorUnit, minor, minorUnit);
                l2Preview.textContent = `Preview: ${formatted}`;
                l2Preview.style.color = '#2c5aa0';
            }
        }
        
        l2Unit.addEventListener('change', () => {
            toggleEditWindowMinorField(id, 'L2');
            updateL2Preview();
        });
        l2Major.addEventListener('input', updateL2Preview);
        l2Minor.addEventListener('input', updateL2Preview);
        
        if (l2Unit.value === 'mm') {
            l2Minor.style.display = 'none';
            l2Minor.value = '';
        }
        updateL2Preview();
    }
}

// Function to enter edit mode for a window
function editWindow(windowId) {
    if (!canModifyProject()) {
        alert('You do not have permission to edit windows in this project.');
        return;
    }

    const window = projectWindows.find(w => w.id === windowId);
    if (!window) {
        console.error('Window not found:', windowId);
        return;
    }

    console.log(`Entering edit mode for window ID: ${windowId}`);
    
    // Hide view mode and show edit mode
    document.getElementById(`windowView${windowId}`).style.display = 'none';
    document.getElementById(`windowEdit${windowId}`).style.display = 'block';

    // Setup dimension previews after browser renders the display change
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setupEditWindowDimensionPreviews(windowId, window);
            
            // Initialize minor field visibility based on current unit selection
            toggleEditWindowMinorField(windowId, 'Largeur');
            toggleEditWindowMinorField(windowId, 'Hauteur');
        });
    });
}

// Function to cancel window edit
function cancelWindowEdit(windowId) {
    console.log(`Cancelling edit for window ID: ${windowId}`);
    
    // Show view mode and hide edit mode
    document.getElementById(`windowView${windowId}`).style.display = 'block';
    document.getElementById(`windowEdit${windowId}`).style.display = 'none';
}

// Function to save window edit
async function saveWindowEdit(windowId, event) {
    event.preventDefault();
    
    if (!canModifyProject()) {
        alert('You do not have permission to edit windows in this project.');
        return;
    }

    try {
        // Find the window to update
        const windowIndex = projectWindows.findIndex(w => w.id === windowId);
        if (windowIndex === -1) {
            throw new Error('Window not found');
        }

        // FIXED: Parse composition JSON strings to arrays
        const parseComposition = (compositionStr) => {
            if (!compositionStr) return [];
            try {
                const parsed = JSON.parse(compositionStr);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                console.warn('Failed to parse composition:', compositionStr);
                return [];
            }
        };

        // Get updated values from form
        const updatedWindow = {
            ...projectWindows[windowIndex],
            type: document.getElementById(`editWindowType${windowId}`).value,
            floor: document.getElementById(`editWindowFloor${windowId}`).value || '',
            largeurMax: parseFloat(document.getElementById(`editLargeurMax${windowId}`).value) || 0,
            largeurMaxMinor: document.getElementById(`editLargeurMaxMinor${windowId}`).value || '',
            largeurMaxUnit: document.getElementById(`editLargeurMaxUnit${windowId}`).value,
            hauteurMax: parseFloat(document.getElementById(`editHauteurMax${windowId}`).value) || 0,
            hauteurMaxMinor: document.getElementById(`editHauteurMaxMinor${windowId}`).value || '',
            hauteurMaxUnit: document.getElementById(`editHauteurMaxUnit${windowId}`).value,
            l1: document.getElementById(`editWindowL1${windowId}`)?.value || '',
            l1Minor: document.getElementById(`editWindowL1Minor${windowId}`)?.value || '',
            l1Unit: document.getElementById(`editWindowL1Unit${windowId}`)?.value || 'ft-in',
            l2: document.getElementById(`editWindowL2${windowId}`)?.value || '',
            l2Minor: document.getElementById(`editWindowL2Minor${windowId}`)?.value || '',
            l2Unit: document.getElementById(`editWindowL2Unit${windowId}`)?.value || 'ft-in',
            jambage: {
                type: document.getElementById(`editJambageType${windowId}`).value,
                compositions: parseComposition(document.getElementById(`editJambageComposition${windowId}`).value)
            },
            linteau: {
                type: document.getElementById(`editLinteauType${windowId}`).value,
                compositions: parseComposition(document.getElementById(`editLinteauComposition${windowId}`).value)
            },
            seuil: {
                type: document.getElementById(`editSeuilType${windowId}`).value,
                compositions: parseComposition(document.getElementById(`editSeuilComposition${windowId}`).value)
            },
            lastModified: new Date().toISOString(),
            modifiedBy: currentUser?.email || 'unknown'
        };

        // Validation
        if (!updatedWindow.type) {
            alert('Please select a window type.');
            return;
        }

        if (!updatedWindow.largeurMax || !updatedWindow.hauteurMax) {
            alert('Please enter valid dimensions.');
            return;
        }

        console.log('Saving updated window:', updatedWindow);

        // Update the window in the array
        projectWindows[windowIndex] = updatedWindow;

        // Save to database
        await saveWindowsToDatabase();

        // Re-render the window list
        renderWindowList();
        updateWindowSummary();

        alert('Window updated successfully!');

    } catch (error) {
        console.error('Error updating window:', error);
        alert('Error updating window: ' + error.message);
    }
}

async function saveWindowsToDatabase() {
    if (!currentProjectId) {
        console.error('No project ID found');
        return;
    }

    try {
        // Update the project document with the new windows array
        await firebase.firestore().collection('projects').doc(currentProjectId).update({
            windows: projectWindows,
            lastModified: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Windows saved to database successfully');
    } catch (error) {
        console.error('Error saving windows to database:', error);
        throw error;
    }
}


// Update window summary counter
function updateWindowSummary() {
    const summary = document.getElementById('windowSelectionSummary');
    const count = projectWindows.length;
    summary.innerHTML = `<i class="fas fa-window-maximize"></i> ${count} window${count !== 1 ? 's' : ''} added`;
}

function duplicateWindow(id) {
    console.log(`Duplicating window with id: ${id}`);
    
    // Find the window to duplicate
    const windowToDuplicate = projectWindows.find(w => w.id === id);
    
    if (!windowToDuplicate) {
        alert('Window not found.');
        return;
    }
    
    // Hide any open forms first
    hideAllForms();
    
    // Get the window form
    const windowForm = document.getElementById('windowForm');
    const addWindowButton = document.getElementById('addWindowButton');
    
    if (!windowForm) {
        alert('Window form not found.');
        return;
    }
    
    // Clear the form first (to reset any previous data)
    const form = document.getElementById('windowDataForm');
    if (form) {
        form.reset();
    }
    
    // Populate basic window information
    document.getElementById('windowType').value = windowToDuplicate.type || '';
    document.getElementById('windowFloor').value = windowToDuplicate.floor || '';
    document.getElementById('windowLargeurMax').value = windowToDuplicate.largeurMax || '';
document.getElementById('windowLargeurMaxMinor').value = windowToDuplicate.largeurMaxMinor || '0';
document.getElementById('windowLargeurMaxUnit').value = 
    (windowToDuplicate.largeurMaxUnit === 'm' || windowToDuplicate.largeurMaxUnit === 'mm' || windowToDuplicate.largeurMaxUnit === 'm-mm') 
    ? 'm-mm' 
    : 'ft-in';
document.getElementById('windowHauteurMax').value = windowToDuplicate.hauteurMax || '';
document.getElementById('windowHauteurMaxMinor').value = windowToDuplicate.hauteurMaxMinor || '0';
document.getElementById('windowHauteurMaxUnit').value = 
    (windowToDuplicate.hauteurMaxUnit === 'm' || windowToDuplicate.hauteurMaxUnit === 'mm' || windowToDuplicate.hauteurMaxUnit === 'm-mm') 
    ? 'm-mm' 
    : 'ft-in';

    // Populate L1 and L2 data
    document.getElementById('windowL1').value = windowToDuplicate.l1 || '';
    document.getElementById('windowL1Minor').value = windowToDuplicate.l1Minor || '';
    document.getElementById('windowL1Unit').value = windowToDuplicate.l1Unit || 'ft-in';
    document.getElementById('windowL2').value = windowToDuplicate.l2 || '';
    document.getElementById('windowL2Minor').value = windowToDuplicate.l2Minor || '';
    document.getElementById('windowL2Unit').value = windowToDuplicate.l2Unit || 'ft-in';
    
    // Populate Jambage data
    if (windowToDuplicate.jambage) {
        document.getElementById('jambageType').value = windowToDuplicate.jambage.type || '';
        
        // Set compositions using composition builder
        setTimeout(() => {
            if (windowToDuplicate.jambage.compositions && windowToDuplicate.jambage.compositions.length > 0) {
                createCompositionBuilder(
                    'jambageCompositionBuilder',
                    'jambageComposition',
                    windowToDuplicate.jambage.compositions
                );
            }
        }, 100);
    }
    
    // Populate Linteau data
    if (windowToDuplicate.linteau) {
        document.getElementById('linteauType').value = windowToDuplicate.linteau.type || '';
        
        // Set compositions using composition builder
        setTimeout(() => {
            if (windowToDuplicate.linteau.compositions && windowToDuplicate.linteau.compositions.length > 0) {
                createCompositionBuilder(
                    'linteauCompositionBuilder',
                    'linteauComposition',
                    windowToDuplicate.linteau.compositions
                );
            }
        }, 100);
    }
    
    // Populate Seuil data
    if (windowToDuplicate.seuil) {
        document.getElementById('seuilType').value = windowToDuplicate.seuil.type || '';
        
        // Set compositions using composition builder
        setTimeout(() => {
            if (windowToDuplicate.seuil.compositions && windowToDuplicate.seuil.compositions.length > 0) {
                createCompositionBuilder(
                    'seuilCompositionBuilder',
                    'seuilComposition',
                    windowToDuplicate.seuil.compositions
                );
            }
        }, 100);
    }
    
    // Show the form
    windowForm.classList.add('show');
    if (addWindowButton) {
        addWindowButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';
    }
    
    // Scroll to the form
    windowForm.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });
    
    // Focus on window type field for user to modify
    setTimeout(() => {
        const windowTypeField = document.getElementById('windowType');
        if (windowTypeField) {
            windowTypeField.focus();
            windowTypeField.select();
        }
    }, 300);
    
    console.log('Window form populated with duplicate data');
}

// Delete window function
function deleteWindow(id) {
    if (confirm('Are you sure you want to delete this window?')) {
        projectWindows = projectWindows.filter(window => window.id !== id);
        renderWindowList();
        updateWindowSummary();
        saveWindowsToDatabase();
    }
}

// Call preload when options tab is first opened
function switchTab(tabId) {
    console.log(`Switching to tab: ${tabId}`);
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    // Update tab content sections
    document.querySelectorAll('.tab-content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${tabId}-content`).classList.add('active');
    
    // Show/hide save options button based on tab
    const saveButtonContainer = document.getElementById('saveOptionsBtnContainer');
    if (saveButtonContainer) {
        saveButtonContainer.style.display = (tabId === 'option-list') ? 'block' : 'none';
    }
    
    // Render lists when switching tabs
    if (tabId === 'window-list') {
        renderWindowList();
        updateWindowSummary();
    } else if (tabId === 'parapet-list') {
        renderParapetList();
        updateParapetSummary();
    } else if (tabId === 'option-list') {
        setTimeout(() => {
            preloadOptionImages();
        }, 200);
    } else if (tabId === 'review') {
        // NEW: Render review tab when switched to
        renderReviewTab();
    }
}

// Initialize the options system
function initializeOptionsSystem() {
    console.log('ðŸ”§ Initializing CFSS options system...');
    
    // Populate options by category
    populateOptionsCategories();
    
    // Setup save options button
    const saveOptionsBtn = document.getElementById('saveOptionsBtn');
    if (saveOptionsBtn) {
        saveOptionsBtn.addEventListener('click', saveCFSSOptions);
    }
    
    console.log('âœ… Options system initialized');
}

// Populate options by categories
function populateOptionsCategories() {
    // Define option categories and their corresponding options
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

    // Populate each category
    Object.entries(optionCategories).forEach(([categoryKey, categoryData]) => {
        const container = document.getElementById(categoryData.container);
        if (!container) {
            console.warn(`Container not found: ${categoryData.container}`);
            return;
        }

        categoryData.options.forEach(option => {
            const optionElement = createOptionElement(option);
            container.appendChild(optionElement);
        });
    });

    console.log('âœ… Option categories populated');
}

// Updated createOptionElement function with actual image loading
function createOptionElement(optionName) {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-item';
    optionDiv.setAttribute('data-option', optionName);

    const displayName = formatOptionDisplayName(optionName);
    
    optionDiv.innerHTML = `
        <input type="checkbox" class="option-checkbox" id="option-${optionName}" value="${optionName}">
        <div class="option-thumbnail" id="thumbnail-${optionName}">
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='40'%3E%3Crect width='50' height='40' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='8'%3ELoading...%3C/text%3E%3C/svg%3E" 
                alt="${displayName}" 
                style="width: 100%; height: 100%; object-fit: cover; border-radius: 3px;"
                id="img-${optionName}">
        </div>
        <div class="option-name">${displayName}</div>
    `;

    // Add event listeners
    const checkbox = optionDiv.querySelector('.option-checkbox');
    checkbox.addEventListener('change', function() {
        handleOptionToggle(optionName, this.checked);
    });

    // Make the entire row clickable
    optionDiv.addEventListener('click', function(e) {
        if (e.target.type !== 'checkbox') {
            checkbox.click();
        }
    });

    // Load the actual image after the element is created
    setTimeout(() => {
        loadOptionThumbnail(optionName);
    }, 100);

    return optionDiv;
}

// Function to load option thumbnail images
async function loadOptionThumbnail(optionName) {
    const imgElement = document.getElementById(`img-${optionName}`);
    
    if (!imgElement) {
        console.warn(`Image element not found for ${optionName}`);
        return;
    }

    console.log(`Loading thumbnail for option: ${optionName}`);
    
    // Direct image loading - no CORS issues
    const pngUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionName}.png`;
    const jpgUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionName}.jpg`;
    
    imgElement.onload = () => {
        console.log(`Thumbnail loaded successfully: ${optionName}`);
    };
    
    imgElement.onerror = () => {
        console.log(`PNG failed for ${optionName}, trying JPG...`);
        // Try JPG as fallback
        imgElement.onerror = () => {
            console.log(`Both formats failed for ${optionName}, showing placeholder`);
            showThumbnailPlaceholder(optionName, 'No Image');
        };
        imgElement.src = jpgUrl;
    };
    
    // Start with PNG
    imgElement.src = pngUrl;
}

// Function to get option image URL from S3
async function getOptionImageUrl(optionName) {
    try {
        // First, check if the image exists in S3 by trying to get a signed URL
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/sign?key=${encodeURIComponent(`cfss-options/${optionName}.png`)}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.url;
        } else {
            // Try JPG format as fallback
            const jpgResponse = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/images/sign?key=${encodeURIComponent(`cfss-options/${optionName}.jpg`)}`, {
                headers: getAuthHeaders()
            });
            
            if (jpgResponse.ok) {
                const jpgData = await jpgResponse.json();
                return jpgData.url;
            }
        }
        
        return null;
    } catch (error) {
        console.error(`Error getting image URL for ${optionName}:`, error);
        return null;
    }
}

// Function to show placeholder when image can't be loaded
function showThumbnailPlaceholder(optionName, message = 'IMG') {
    const imgElement = document.getElementById(`img-${optionName}`);
    if (imgElement) {
        imgElement.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='40'%3E%3Crect width='50' height='40' fill='%23f5f5f5' stroke='%23ddd'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='8'%3E${encodeURIComponent(message)}%3C/text%3E%3C/svg%3E`;
    }
}

// Alternative: If you want to load images directly from a public URL without signed URLs
async function getOptionImageUrlDirect(optionName) {
    try {
        // Try PNG first
        let imageUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionName}.png`;
        
        // Check if the image exists by trying to fetch it
        const response = await fetch(imageUrl, { method: 'HEAD' });
        if (response.ok) {
            return imageUrl;
        }
        
        // Try JPG as fallback
        imageUrl = `https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com/cfss-options/${optionName}.jpg`;
        const jpgResponse = await fetch(imageUrl, { method: 'HEAD' });
        if (jpgResponse.ok) {
            return imageUrl;
        }
        
        return null;
    } catch (error) {
        console.error(`Error checking image existence for ${optionName}:`, error);
        return null;
    }
}

// Function to preload all option images when the tab is opened
async function preloadOptionImages() {
    console.log('Preloading CFSS option images...');
    
    const allOptions = [
        // Lisse Trouée options
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
        'linteau-1', 'linteau-2', 'linteau-3', 'linteau-4', 'linteau-5',
        'linteau-6', 'linteau-7', 'linteau-8',
        
        // Seuils
        'seuil-1', 'seuil-2', 'seuil-3'
    ];
    
    // Load images in batches to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < allOptions.length; i += batchSize) {
        const batch = allOptions.slice(i, i + batchSize);
        await Promise.allSettled(
            batch.map(option => loadOptionThumbnail(option))
        );
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('Option image preloading completed');
}

// Format option display name
function formatOptionDisplayName(optionName) {
    return optionName
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .replace(/Dacier/g, "D'acier")
        .replace(/Tabiler/g, 'Tablier');
}

// Handle option toggle
function handleOptionToggle(optionName, isSelected) {
    console.log(`ðŸ”§ Option ${optionName} ${isSelected ? 'selected' : 'deselected'}`);
    
    const optionItem = document.querySelector(`[data-option="${optionName}"]`);
    
    if (isSelected) {
        // Add to selected options
        if (!selectedCFSSOptions.includes(optionName)) {
            selectedCFSSOptions.push(optionName);
        }
        optionItem.classList.add('selected');
    } else {
        // Remove from selected options
        selectedCFSSOptions = selectedCFSSOptions.filter(opt => opt !== optionName);
        optionItem.classList.remove('selected');
    }
    
    updateSelectionSummary();
}

// Update selection summary
function updateSelectionSummary() {
    const summaryElement = document.getElementById('selectionSummary');
    if (summaryElement) {
        const count = selectedCFSSOptions.length;
        summaryElement.innerHTML = `
            <i class="fas fa-check-circle"></i> ${count} option${count !== 1 ? 's' : ''} selected
        `;
    }
}

// Save CFSS options to database
async function saveCFSSOptions() {
    if (!canModifyProject()) {
        alert('You do not have permission to modify options for this project.');
        return;
    }

    console.log('ðŸ’¾ Saving CFSS options to database:', selectedCFSSOptions);

    try {
        const saveButton = document.getElementById('saveOptionsBtn');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Options...';
        }

        // Save options as part of the project data
        const response = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                id: currentProjectId,
                selectedCFSSOptions: [...selectedCFSSOptions]  // Save the selected options array
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Update local project data
        if (window.projectData) {
            window.projectData.selectedCFSSOptions = [...selectedCFSSOptions];
        }

        // Show success message
        alert(`Successfully saved ${selectedCFSSOptions.length} CFSS construction options!`);
        console.log('âœ… CFSS options saved successfully to database');

        // NEW: Automatically switch back to wall list tab after successful save
        switchTab('wall-list');

        // Refresh parapet type dropdown to reflect new selections
        populateParapetTypeDropdown();
        
    } catch (error) {
        console.error('âŒ Error saving CFSS options:', error);
        alert('Error saving CFSS options: ' + error.message);
    } finally {
        const saveButton = document.getElementById('saveOptionsBtn');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save"></i> Save Options';
        }
    }
}

// Load saved options (call this when initializing the page)
function loadSavedCFSSOptions() {
    console.log('ðŸ”„ Loading saved CFSS options...');
    
    if (window.projectData && window.projectData.selectedCFSSOptions) {
        selectedCFSSOptions = [...window.projectData.selectedCFSSOptions];
        
        // Update checkboxes and UI to reflect saved selections
        selectedCFSSOptions.forEach(optionName => {
            const checkbox = document.getElementById(`option-${optionName}`);
            const optionItem = document.querySelector(`[data-option="${optionName}"]`);
            
            if (checkbox) {
                checkbox.checked = true;
            }
            if (optionItem) {
                optionItem.classList.add('selected');
            }
        });
        
        updateSelectionSummary();
        console.log(`âœ… Loaded ${selectedCFSSOptions.length} saved CFSS options`);
    } else {
        console.log('â„¹ï¸ No saved CFSS options found, starting with empty selection');
        selectedCFSSOptions = [];
        updateSelectionSummary();
    }
}

// Utility functions for option management
function selectAllOptions() {
    console.log('ðŸ”§ Selecting all CFSS options...');
    
    // Get all option checkboxes
    const checkboxes = document.querySelectorAll('.option-checkbox');
    checkboxes.forEach(checkbox => {
        if (!checkbox.checked) {
            checkbox.click(); // This will trigger the change event and update our arrays
        }
    });
}

function clearAllOptions() {
    console.log('ðŸ”§ Clearing all CFSS options...');
    
    // Get all checked option checkboxes
    const checkboxes = document.querySelectorAll('.option-checkbox:checked');
    checkboxes.forEach(checkbox => {
        checkbox.click(); // This will trigger the change event and update our arrays
    });
}

// Integration with existing report generation
// Update your existing generateCFSSReportWithOptions function to use the tab-based selections
function getSelectedOptionsFromTabs() {
    return [...selectedCFSSOptions];
}

// Replace the modal-based report generation with tab-based
async function generateCFSSReportFromTabs() {
    // Check if we have revisions
    if (!projectRevisions || projectRevisions.length === 0) {
        alert('No revisions found. Please add walls to create revisions first.');
        return;
    }

    // For simplicity, use the current/latest revision
    const latestRevision = projectRevisions[projectRevisions.length - 1];
    const selectedOptions = getSelectedOptionsFromTabs();
    
    console.log('Generating report with:', {
        revision: latestRevision.number,
        optionsCount: selectedOptions.length
    });

    try {
        await generateCFSSReportForRevisionWithOptions(latestRevision, selectedOptions);
    } catch (error) {
        console.error('Error generating report from tabs:', error);
        alert('Error generating CFSS report: ' + error.message);
    }
}

async function saveWindowsToDatabase(immediate = false) {
  if (!canModifyProject() || !currentProjectId) return;

  const doSave = async () => {
    try {
      const resp = await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: currentProjectId,
          windows: projectWindows, // persist
        })
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${t}`);
      }
      // keep local cache in sync
      if (window.projectData) window.projectData.windows = [...projectWindows];
      console.log(`âœ… Saved ${projectWindows.length} windows to database`);
    } catch (err) {
      console.error('âŒ Error saving windows:', err);
      alert('Error saving windows: ' + err.message);
    }
  };

  if (immediate) {
    clearTimeout(windowsSaveTimer);
    await doSave();
  } else {
    clearTimeout(windowsSaveTimer);
    windowsSaveTimer = setTimeout(doSave, 400); // debounce
  }
}

function loadWindowsFromProject(project) {
    // Filter out undefined/null values and ensure each window has required properties
    projectWindows = project.windows && Array.isArray(project.windows) 
        ? project.windows.filter(window => window && typeof window === 'object' && window.type)
        : [];
    
    renderWindowList();
    updateWindowSummary();
}

// Render Review Tab
function renderReviewTab() {
    console.log('ðŸ“‹ Rendering Review tab...');
    
    // Update summary
    const wallCount = projectEquipment?.length || 0;
    const parapetCount = projectParapets?.length || 0;
    const optionCount = selectedCFSSOptions?.length || 0;
    const windowCount = projectWindows?.length || 0;
    const customPageCount = projectCustomPages?.length || 0;
    
    const summaryEl = document.getElementById('reviewSummary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <i class="fas fa-clipboard-check"></i>
            <span>Total: ${wallCount} walls • ${parapetCount} parapets • ${optionCount} options • ${windowCount} windows • ${customPageCount} custom pages</span>
        `;
    }
    
    // Render each section
    renderReviewWalls();
    renderReviewParapets();
    renderReviewOptions();
    renderReviewWindows();
    renderReviewCustomPages();
}

function renderReviewWalls() {
    const container = document.getElementById('reviewWallsTable');
    const header = document.getElementById('reviewWallsHeader');
    
    if (!container) return;
    
    const walls = projectEquipment || [];
    header.textContent = `Walls (${walls.length})`;
    
    if (walls.length === 0) {
        container.innerHTML = '<div class="review-empty-state"><i class="fas fa-th-large"></i><p>No walls added yet.</p></div>';
        return;
    }
    
    const rows = walls.map((wall, index) => {
        const name = wall.equipment || 'Unnamed Wall';
        const floor = wall.floor || 'N/A';
        const deflexion = wall.deflexionMax || 'N/A';
        
        // Format height using existing helper
        const hauteur = formatHeight(wall);
        
        // Check if wall has Set 2
        const hasSet2 = wall.montantMetallique2 && wall.montantMetallique2.trim() !== '';

        // Format montant metallique info
        const montantInfo = hasSet2 
            ? `• Montant 1: ${wall.montantMetallique || 'N/A'} @${wall.espacement || 'N/A'} &nbsp;&nbsp;• Montant 2: ${wall.montantMetallique2 || 'N/A'} @${wall.espacement2 || 'N/A'}`
            : `Montant: ${wall.montantMetallique || 'N/A'} @${wall.espacement || 'N/A'}`;
        
        return `
            <div class="accordion-item">
                <div class="accordion-header" onclick="toggleReviewAccordion(this)">
                    <div class="main-info">
                        <span class="item-name">${name}</span>
                        <div class="item-meta">
                            <span>Floor: ${floor}</span>
                            <span>Hauteur: ${hauteur}</span>
                            <span>Déflexion: ${deflexion}</span>
                            <span>${montantInfo}</span>
                        </div>
                    </div>
                    <span class="expand-icon">â–¼</span>
                </div>
                <div class="accordion-details">
                    ${hasSet2 ? `
                        <!-- Set 1 -->
                        <div class="set-container">
                            <div class="set-header">Set 1</div>
                            <div class="detail-grid">
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-columns"></i>
                                        Montant Métallique
                                    </div>
                                    <div class="section-content">
                                        ${wall.montantMetallique || 'N/A'}
                                    </div>
                                </div>
                                
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-ruler-horizontal"></i>
                                        Espacement
                                    </div>
                                    <div class="section-content">
                                        ${wall.espacement || 'N/A'}
                                    </div>
                                </div>
                                
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-grip-lines"></i>
                                        Lisse Supérieure
                                    </div>
                                    <div class="section-content">
                                        ${wall.lisseSuperieure || 'N/A'}
                                    </div>
                                </div>
                                
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-grip-lines"></i>
                                        Lisse Inférieure
                                    </div>
                                    <div class="section-content">
                                        ${wall.lisseInferieure || 'N/A'}
                                    </div>
                                </div>
                                
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-equals"></i>
                                        Entremise
                                    </div>
                                    <div class="section-content">
                                        ${wall.entremise || 'N/A'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Set 2 -->
                        <div class="set-container">
                            <div class="set-header">Set 2</div>
                            <div class="detail-grid">
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-columns"></i>
                                        Montant Métallique
                                    </div>
                                    <div class="section-content">
                                        ${wall.montantMetallique2 || 'N/A'}
                                    </div>
                                </div>
                                
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-ruler-horizontal"></i>
                                        Espacement
                                    </div>
                                    <div class="section-content">
                                        ${wall.espacement2 || 'N/A'}
                                    </div>
                                </div>
                                
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-grip-lines"></i>
                                        Lisse Supérieure
                                    </div>
                                    <div class="section-content">
                                        ${wall.lisseSuperieure2 || 'N/A'}
                                    </div>
                                </div>
                                
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-grip-lines"></i>
                                        Lisse Inférieure
                                    </div>
                                    <div class="section-content">
                                        ${wall.lisseInferieure2 || 'N/A'}
                                    </div>
                                </div>
                                
                                <div class="detail-section">
                                    <div class="section-title">
                                        <i class="fas fa-equals"></i>
                                        Entremise
                                    </div>
                                    <div class="section-content">
                                        ${wall.entremise2 || 'N/A'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <!-- Single Set -->
                        <div class="detail-grid">
                            <div class="detail-section">
                                <div class="section-title">
                                    <i class="fas fa-columns"></i>
                                    Montant Métallique
                                </div>
                                <div class="section-content">
                                    ${wall.montantMetallique || 'N/A'}
                                </div>
                            </div>
                            
                            <div class="detail-section">
                                <div class="section-title">
                                    <i class="fas fa-ruler-horizontal"></i>
                                    Espacement
                                </div>
                                <div class="section-content">
                                    ${wall.espacement || 'N/A'}
                                </div>
                            </div>
                            
                            <div class="detail-section">
                                <div class="section-title">
                                    <i class="fas fa-grip-lines"></i>
                                    Lisse Supérieure
                                </div>
                                <div class="section-content">
                                    ${wall.lisseSuperieure || 'N/A'}
                                </div>
                            </div>
                            
                            <div class="detail-section">
                                <div class="section-title">
                                    <i class="fas fa-grip-lines"></i>
                                    Lisse Inférieure
                                </div>
                                <div class="section-content">
                                    ${wall.lisseInferieure || 'N/A'}
                                </div>
                            </div>
                            
                            <div class="detail-section">
                                <div class="section-title">
                                    <i class="fas fa-equals"></i>
                                    Entremise
                                </div>
                                <div class="section-content">
                                    ${wall.entremise || 'N/A'}
                                </div>
                            </div>
                        </div>
                    `}
                    
                    ${wall.note ? `
                    <!-- Note -->
                    <div class="detail-grid" style="margin-top: 10px;">
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-sticky-note"></i>
                                Note
                            </div>
                            <div class="section-content">
                                ${wall.note}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="accordion-container">
            ${rows}
        </div>
    `;
}

    // Format height display helper
    function formatHeight(parapet) {
        const major = parapet.hauteurMax;
        const majorUnit = parapet.hauteurMaxUnit;
        const minor = parapet.hauteurMaxMinor;
        const minorUnit = parapet.hauteurMaxMinorUnit;
        
        if ((major === '0' || !major) && (minor === '0' || !minor)) {
            return 'N/A';
        } else if (major === '0' || !major) {
            return `${minor} ${minorUnit}`;
        } else if (minor === '0' || !minor) {
            return `${major} ${majorUnit}`;
        } else {
            return `${major} ${majorUnit} - ${minor} ${minorUnit}`;
        }
    }

function renderReviewParapets() {
    const container = document.getElementById('reviewParapetsTable');
    const header = document.getElementById('reviewParapetsHeader');
    
    if (!container) return;
    
    const parapets = projectParapets || [];
    header.textContent = `Parapets (${parapets.length})`;
    
    if (parapets.length === 0) {
        container.innerHTML = '<div class="review-empty-state"><i class="fas fa-building"></i><p>No parapets added yet.</p></div>';
        return;
    }
    
    const rows = parapets.map((parapet, index) => {
        const name = parapet.parapetName || 'Unnamed Parapet';
        const type = parapet.parapetType || 'N/A';
        
        // Format height display - show both metric and imperial
        const heightDisplay = formatHeight(parapet);
        
        return `
            <div class="accordion-item">
                <div class="accordion-header" onclick="toggleReviewAccordion(this)">
                    <div class="main-info">
                        <span class="item-name">${name}</span>
                        <div class="item-meta">
                            <span><span class="badge">${type}</span></span>
                            <span><i class="fas fa-arrows-alt-v"></i> ${heightDisplay}</span>
                        </div>
                    </div>
                    <span class="expand-icon">â–¼</span>
                </div>
                <div class="accordion-details">
                    <div class="detail-grid">
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-columns"></i>
                                Montant Métallique
                            </div>
                            <div class="section-content">
                                ${parapet.montantMetallique || 'N/A'}
                            </div>
                        </div>
                        
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-ruler-horizontal"></i>
                                Espacement
                            </div>
                            <div class="section-content">
                                ${parapet.espacement || 'N/A'}
                            </div>
                        </div>
                        
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-grip-lines"></i>
                                Lisse Supérieure
                            </div>
                            <div class="section-content">
                                ${parapet.lisseSuperieure || 'N/A'}
                            </div>
                        </div>
                        
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-grip-lines"></i>
                                Lisse Inférieure
                            </div>
                            <div class="section-content">
                                ${parapet.lisseInferieure || 'N/A'}
                            </div>
                        </div>
                        
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-equals"></i>
                                Entremise
                            </div>
                            <div class="section-content">
                                ${parapet.entremise || 'N/A'}
                            </div>
                        </div>
                        
                        ${parapet.note ? `
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-sticky-note"></i>
                                Note
                            </div>
                            <div class="section-content">
                                ${parapet.note}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="accordion-container">
            ${rows}
        </div>
    `;
}

function renderReviewOptions() {
    const container = document.getElementById('reviewOptionsTable');
    const header = document.getElementById('reviewOptionsHeader');
    
    if (!container) return;
    
    const options = selectedCFSSOptions || [];
    header.textContent = `Selected Options (${options.length})`;
    
    if (options.length === 0) {
        container.innerHTML = '<div class="review-empty-state"><i class="fas fa-cogs"></i><p>No options selected yet.</p></div>';
        return;
    }
    
    const rows = options.map(option => {
        const displayName = option.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        return `
            <div class="simple-review-item">
                <div class="simple-item-content">
                    <span>${displayName}</span>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="simple-review-container">
            ${rows}
        </div>
    `;
}

function renderReviewWindows() {
    const container = document.getElementById('reviewWindowsTable');
    const header = document.getElementById('reviewWindowsHeader');
    
    if (!container) return;
    
    const windows = projectWindows || [];
    header.textContent = `Windows (${windows.length})`;
    
    if (windows.length === 0) {
        container.innerHTML = '<div class="review-empty-state"><i class="fas fa-window-maximize"></i><p>No windows added yet.</p></div>';
        return;
    }
    
    const rows = windows.map((window, index) => {
        const type = window.type || 'Unknown Type';
        const size = `${window.largeurMax || 0}${window.largeurMaxUnit === 'm' ? 'mm' : (window.largeurMaxUnit || 'mm')} × ${window.hauteurMax || 0}${window.hauteurMaxUnit === 'm' ? 'mm' : (window.hauteurMaxUnit || 'mm')}`;
        
        // Get composition lists
        const jambageCompositions = window.jambage?.compositions || [];
        const linteauCompositions = window.linteau?.compositions || [];
        const seuilCompositions = window.seuil?.compositions || [];
        
        return `
            <div class="accordion-item">
                <div class="accordion-header" onclick="toggleReviewAccordion(this)">
                    <div class="main-info">
                        <span class="item-name">${type}</span>
                        <div class="item-meta">
                            <span><i class="fas fa-expand"></i> ${size}</span>
                        </div>
                    </div>
                    <span class="expand-icon">â–¼</span>
                </div>
                <div class="accordion-details">
                    <div class="detail-grid">
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-border-style"></i>
                                Jambage${window.jambage?.type ? ' (' + window.jambage.type + ')' : ''}
                            </div>
                            ${jambageCompositions.length > 0 ? `
                                <ul class="composition-list">
                                    ${jambageCompositions.map(comp => `<li>${comp}</li>`).join('')}
                                </ul>
                            ` : '<div class="section-content">N/A</div>'}
                        </div>
                        
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-horizontal-rule"></i>
                                Linteau${window.linteau?.type ? ' (' + window.linteau.type + ')' : ''}
                            </div>
                            ${linteauCompositions.length > 0 ? `
                                <ul class="composition-list">
                                    ${linteauCompositions.map(comp => `<li>${comp}</li>`).join('')}
                                </ul>
                            ` : '<div class="section-content">N/A</div>'}
                        </div>
                        
                        <div class="detail-section">
                            <div class="section-title">
                                <i class="fas fa-window-minimize"></i>
                                Seuil${window.seuil?.type ? ' (' + window.seuil.type + ')' : ''}
                            </div>
                            ${seuilCompositions.length > 0 ? `
                                <ul class="composition-list">
                                    ${seuilCompositions.map(comp => `<li>${comp}</li>`).join('')}
                                </ul>
                            ` : '<div class="section-content">N/A</div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="accordion-container">
            ${rows}
        </div>
    `;
}

function toggleReviewAccordion(header) {
    const details = header.nextElementSibling;
    const isExpanded = header.classList.contains('expanded');
    
    if (isExpanded) {
        header.classList.remove('expanded');
        details.classList.remove('show');
    } else {
        header.classList.add('expanded');
        details.classList.add('show');
    }
}

function renderReviewCustomPages() {
    const container = document.getElementById('reviewCustomPagesTable');
    const header = document.getElementById('reviewCustomPagesHeader');
    
    if (!container) return;
    
    const pages = projectCustomPages || [];
    header.textContent = `Custom Pages (${pages.length})`;
    
    if (pages.length === 0) {
        container.innerHTML = '<div class="review-empty-state"><i class="fas fa-file-alt"></i><p>No custom pages added yet.</p></div>';
        return;
    }
    
    const rows = pages.map(page => {
        const title = page.title || 'Untitled Page';
        const elements = page.elements || [];
        
        // Count element types
        const headings = elements.filter(e => e.type === 'heading').length;
        const texts = elements.filter(e => e.type === 'text').length;
        const images = elements.filter(e => e.type === 'image').length;
        
        const elementParts = [];
        if (headings > 0) elementParts.push(`${headings} heading${headings !== 1 ? 's' : ''}`);
        if (texts > 0) elementParts.push(`${texts} text block${texts !== 1 ? 's' : ''}`);
        if (images > 0) elementParts.push(`${images} image${images !== 1 ? 's' : ''}`);
        
        const elementSummary = elementParts.length > 0 
            ? elementParts.join(', ')
            : 'Empty page';
        
        return `
            <div class="simple-review-item">
                <div class="simple-item-content">
                    <i class="fas fa-file-alt" style="color: #3498db;"></i>
                    <div class="simple-item-details">
                        <div class="simple-item-title">${title}</div>
                        <div class="simple-item-subtitle">${elementSummary}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="simple-review-container">
            ${rows}
        </div>
    `;
}

// Update type image preview based on selection
function updateTypeImage(type, value) {
    const previewId = `${type}ImagePreview`;
    const preview = document.getElementById(previewId);

    if (!preview) {
        console.error(`Preview element not found: ${previewId}`);
        return;
    }

    // Enable/disable the composition builder for the main Add New Window form
    setCompositionDisabledForType(type, value);

    if (!value) {
        preview.className = 'type-image-preview empty';
        preview.innerHTML = 'Select a type';
        return;
    }

    // Treat N/A (or NA or # just in case) as "no image"
    const isNA = value === 'N/A' || value === 'NA' || value === '#';
    if (isNA) {
        preview.className = 'type-image-preview empty';
        preview.innerHTML = 'N/A';
        return;
    }

    // Construct S3 URL based on type and value
    const bucketUrl = 'https://protection-sismique-equipment-images.s3.us-east-1.amazonaws.com';

    // Map type to lowercase filename prefix
    const typeMap = {
        jambage: 'jambage',
        linteau: 'linteau',
        seuil: 'seuil'
    };

    const filename = typeMap[type];
    if (!filename) {
        console.error(`Unknown type: ${type}`);
        return;
    }

    // Use full value for filename (e.g., JA2a -> jambage-JA2a.png)
    const imageUrl = `${bucketUrl}/cfss-options/${filename}-${value}.png`;

    // Update preview with image
    preview.className = 'type-image-preview';
    preview.innerHTML = `<img src="${imageUrl}" alt="${value}" onerror="handleImageError(this, '${value}')">`;
}

function setCompositionDisabledForType(type, value) {
    // Only handle the main "Add New Window" form types
    let section = null;

    if (type === 'jambage' || type === 'linteau' || type === 'seuil') {
        section = type;
    } else {
        // Skip edit forms for now
        return;
    }

    const builderId = `${section}CompositionBuilder`;
    const inputId = `${section}Composition`;

    const builderEl = document.getElementById(builderId);
    const inputEl = document.getElementById(inputId);

    if (!builderEl || !inputEl) return;

    const isNA = value === 'N/A' || value === 'NA' || value === '#';

    if (isNA) {
        // Grey out + make read-only
        builderEl.style.opacity = '0.5';
        builderEl.style.pointerEvents = 'none';
        builderEl.style.backgroundColor = '#f1f3f5';

        // Clear any previous composition value
        inputEl.value = '';
    } else {
        // Re-enable
        builderEl.style.opacity = '';
        builderEl.style.pointerEvents = '';
        builderEl.style.backgroundColor = '';
    }
}

// Handle image load error
function handleImageError(img, typeValue) {
    const preview = img.parentElement;
    preview.className = 'type-image-preview empty';
    preview.innerHTML = `<div style="text-align: center; font-size: 12px; color: #999;">
        <div style="font-size: 18px; margin-bottom: 4px;">ðŸ“·</div>
        <div>${typeValue}</div>
        <div style="font-size: 10px;">(Image not found)</div>
    </div>`;
}

function handleCompositionFieldsForNA(selectEl, section) {
  let builderId = '';
  let inputId = '';

  const isEdit = selectEl.id.startsWith('edit');
  if (isEdit) {
    const match = selectEl.id.match(/(\d+)$/);
    const windowId = match ? match[1] : '';
    if (section === 'jambage') {
      builderId = `editJambageCompositionBuilder${windowId}`;
      inputId = `editJambageComposition${windowId}`;
    } else if (section === 'linteau') {
      builderId = `editLinteauCompositionBuilder${windowId}`;
      inputId = `editLinteauComposition${windowId}`;
    } else if (section === 'seuil') {
      builderId = `editSeuilCompositionBuilder${windowId}`;
      inputId = `editSeuilComposition${windowId}`;
    }
  } else {
    if (section === 'jambage') {
      builderId = 'jambageCompositionBuilder';
      inputId = 'jambageComposition';
    } else if (section === 'linteau') {
      builderId = 'linteauCompositionBuilder';
      inputId = 'linteauComposition';
    } else if (section === 'seuil') {
      builderId = 'seuilCompositionBuilder';
      inputId = 'seuilComposition';
    }
  }

  const builderEl = document.getElementById(builderId);
  const inputEl = document.getElementById(inputId);
  if (!builderEl || !inputEl) return;

  if (selectEl.value === 'NA') {
    builderEl.style.opacity = '0.5';
    builderEl.style.pointerEvents = 'none';
    builderEl.style.backgroundColor = '#f1f3f5';
    inputEl.value = ''; // clear composition JSON
  } else {
    builderEl.style.opacity = '';
    builderEl.style.pointerEvents = '';
    builderEl.style.backgroundColor = '';
  }
}

function handleWindowTypeChange(selectEl, section) {
  const value = selectEl.value;

  // Determine image prefix for preview
  let imagePrefix = '';
  if (selectEl.id.startsWith('edit')) {
    const match = selectEl.id.match(/edit([A-Za-z]+)Type(\d+)/);
    if (match) {
      const namePart = match[1]; // Jambage / Linteau / Seuil
      const idPart = match[2];
      imagePrefix = `edit${namePart}${idPart}`;
    }
  } else {
    imagePrefix = section; // jambage / linteau / seuil
  }

  if (imagePrefix) {
    const previewId = `${imagePrefix}ImagePreview`;
    const previewElement = document.getElementById(previewId);

    if (!value || value === 'NA') {
      if (previewElement) {
        previewElement.classList.add('empty');
        previewElement.innerHTML = 'Select a type';
      }
    } else {
      updateTypeImage(imagePrefix, value);
    }
  }

  // Apply N/A composition behaviour
  handleCompositionFieldsForNA(selectEl, section);
}


// Make functions globally available
window.logout = logout;
window.deleteEquipment = deleteEquipment;
window.toggleEquipmentDetails = toggleEquipmentDetails;
window.editEquipment = editEquipment;
window.saveEquipmentEdit = saveEquipmentEdit;
window.cancelEquipmentEdit = cancelEquipmentEdit;
window.removeImage = removeImage;
window.loadWallImage = loadWallImage;
window.openImageModal = openImageModal;
window.generateCFSSProjectReport = generateCFSSProjectReport;
window.duplicateEquipment = duplicateEquipment;
window.triggerEditImageUpload = triggerEditImageUpload;
window.removeEditImage = removeEditImage;
window.setupEditImageHandlers = setupEditImageHandlers;
window.loadExistingImagesInEdit = loadExistingImagesInEdit;
window.getEditModeImages = getEditModeImages;
window.clearEditModeImages = clearEditModeImages;
window.showRevisionPopup = showRevisionPopup;
window.closeRevisionModal = closeRevisionModal;
window.processRevisionChoice = processRevisionChoice;
window.createNewRevision = createNewRevision;
window.updateCurrentRevision = updateCurrentRevision;
window.initializeRevisionSystem = initializeRevisionSystem;
window.handleSaveEquipmentWithRevisions = handleSaveEquipmentWithRevisions;
window.saveEquipmentEditWithRevisions = saveEquipmentEditWithRevisions;
window.deleteEquipmentWithRevisions = deleteEquipmentWithRevisions;
window.debugCurrentState = debugCurrentState;
window.reloadProjectData = reloadProjectData;
window.forceSaveCurrentState = forceSaveCurrentState;
window.debugWallState = debugWallState;
window.showRevisionSelectionModal = showRevisionSelectionModal;
window.closeRevisionSelectionModal = closeRevisionSelectionModal;
window.generateSelectedRevisionReport = generateSelectedRevisionReport;
window.generateCFSSReportForRevision = generateCFSSReportForRevision;
window.setupCFSSReportButtonWithRevisionModal = setupCFSSReportButtonWithRevisionModal;
window.proceedToOptionsSelection = proceedToOptionsSelection;
window.showCFSSOptionsSelectionModal = showCFSSOptionsSelectionModal;
window.selectAllCFSSOptions = selectAllCFSSOptions;
window.clearAllCFSSOptions = clearAllCFSSOptions;
window.backToRevisionSelection = backToRevisionSelection;
window.closeCFSSOptionsSelectionModal = closeCFSSOptionsSelectionModal;
window.generateCFSSReportWithOptions = generateCFSSReportWithOptions;
window.generateCFSSReportForRevisionWithOptions = generateCFSSReportForRevisionWithOptions;

window.initializeTabSystem = initializeTabSystem;
window.initializeOptionsSystem = initializeOptionsSystem;
window.switchTab = switchTab;
window.handleOptionToggle = handleOptionToggle;
window.saveCFSSOptions = saveCFSSOptions;
window.loadSavedCFSSOptions = loadSavedCFSSOptions;
window.selectAllOptions = selectAllOptions;
window.clearAllOptions = clearAllOptions;
window.getSelectedOptionsFromTabs = getSelectedOptionsFromTabs;
window.generateCFSSReportFromTabs = generateCFSSReportFromTabs;
window.selectedCFSSOptions = selectedCFSSOptions;
window.generateCFSSReportDirectlyWithTabOptions = generateCFSSReportDirectlyWithTabOptions;

window.loadOptionThumbnail = loadOptionThumbnail;
window.getOptionImageUrl = getOptionImageUrl;
window.getOptionImageUrlDirect = getOptionImageUrlDirect;
window.showThumbnailPlaceholder = showThumbnailPlaceholder;
window.preloadOptionImages = preloadOptionImages;

window.initializeSortable = initializeSortable;
window.saveWallDisplayOrder = saveWallDisplayOrder;
window.getWallDisplayOrder = getWallDisplayOrder;
window.generateWallDetailsContent = generateWallDetailsContent;
window.generateEditForm = generateEditForm;

window.generateEditForm = generateEditForm;
window.generateMontantOptions = generateMontantOptions;
window.setupEditHauteurPreview = setupEditHauteurPreview;
window.setupEditMontantChangeHandler = setupEditMontantChangeHandler;

window.editWindow = editWindow;
window.cancelWindowEdit = cancelWindowEdit;
window.saveWindowEdit = saveWindowEdit;
window.deleteWindow = deleteWindow;

window.addCompositionItem = addCompositionItem;
window.deleteCompositionItem = deleteCompositionItem;
window.updateAllCompositions = updateAllCompositions;

window.editParapet = editParapet;
window.cancelParapetEdit = cancelParapetEdit;
window.saveParapetEdit = saveParapetEdit;
window.populateParapetEditMontant = populateParapetEditMontant;
window.setupParapetEditAutoFill = setupParapetEditAutoFill;

window.setupParapetUnitAutoUpdate = setupParapetUnitAutoUpdate;

window.toggleEditProjectDetails = toggleEditProjectDetails;
window.saveProjectDetails = saveProjectDetails;
window.initializeProjectDetailsEditButton = initializeProjectDetailsEditButton;

window.renderReviewTab = renderReviewTab;
window.renderReviewWalls = renderReviewWalls;
window.renderReviewParapets = renderReviewParapets;
window.renderReviewOptions = renderReviewOptions;
window.renderReviewWindows = renderReviewWindows;
window.renderReviewCustomPages = renderReviewCustomPages;

window.updateDimensionOptions = updateDimensionOptions;

// ==================== CFSS WIND LOAD CALCULATIONS ====================

/**
 * Calculate wind load for a single storey row
 */
function calculateSingleStorey(row) {
    const ulsSpan = row.querySelector('.storey-uls');
    const slsSpan = row.querySelector('.storey-sls');

    // Get global parameters
    const q50 = parseFloat(document.getElementById('q50')?.value);
    const importanceFactor = document.getElementById('importanceFactor')?.value;
    const terrainType = document.getElementById('terrainType')?.value;
    const category = document.getElementById('category')?.value;
    
    // Get storey-specific values
    const H = parseFloat(row.querySelector('.storey-height')?.value);
    const A = parseFloat(row.querySelector('.storey-area')?.value);
    
    // Check if all required values are present
    if (!q50 || !importanceFactor || !terrainType || !category || !H || !A || H <= 0 || A <= 0) {
        if (ulsSpan) {
            ulsSpan.textContent = '--';
            ulsSpan.classList.remove('clickable');
        }
        if (slsSpan) {
            slsSpan.textContent = '--';
            slsSpan.classList.remove('clickable');
        }
        row.windBreakdown = null;
        return false;
    }
    
    // Calculate wind load
    const result = calculateStoreyWindLoad({
        q50, importanceFactor, terrainType, category, H, A
    });
    
    // Update display
    if (result.ULS !== null && result.SLS !== null) {
        if (ulsSpan) {
            ulsSpan.textContent = result.ULS.toFixed(1);
            ulsSpan.classList.toggle('clickable', !!result.breakdown);
        }
        if (slsSpan) {
            slsSpan.textContent = result.SLS.toFixed(1);
            slsSpan.classList.toggle('clickable', !!result.breakdown);
        }
        row.windBreakdown = result.breakdown || null;
        return true;
    } else {
        if (ulsSpan) {
            ulsSpan.textContent = '--';
            ulsSpan.classList.remove('clickable');
        }
        if (slsSpan) {
            slsSpan.textContent = '--';
            slsSpan.classList.remove('clickable');
        }
        row.windBreakdown = null;
        return false;
    }
}

/**
 * Display a modal with the detailed wind load breakdown for the selected storey value.
 */
function showWindBreakdownModal(row, type) {
    const breakdown = row?.windBreakdown;
    if (!breakdown) {
        alert('No breakdown available. Please ensure the calculation inputs are complete.');
        return;
    }
    
    const typeKey = type === 'SLS' ? 'SLS' : 'ULS';
    const isULS = typeKey === 'ULS';
    const labelInput = row.querySelector('.storey-label');
    const storeyLabel = labelInput ? labelInput.value : 'Storey';
    
    const escapeHtml = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    
    const formatValue = (value, decimals = 2) => (typeof value === 'number' && isFinite(value) ? value.toFixed(decimals) : '--');
    const formatZone = (zone) => {
        const map = { eMinus: 'e-', ePlus: 'e+', wMinus: 'w-', wPlus: 'w+' };
        return map[zone] || zone;
    };
    
    const inputs = breakdown.inputs || {};
    const cpCg = breakdown.cpCg || {};
    const exterior = breakdown.exteriorPressures || {};
    const interior = breakdown.interiorPressures || {};
    const combinations = breakdown.combinations || [];
    const governing = breakdown.governing ? breakdown.governing[typeKey] : null;
    
    const iwFactor = inputs.Iw ? inputs.Iw[typeKey] : null;
    const q50Val = inputs.q50;
    const CeVal = inputs.Ce;
    const CgiVal = inputs.Cgi;
    const zoneLabel = governing ? formatZone(governing.zone) : null;
    const cpCgZone = governing ? cpCg[governing.zone] : null;
    const exteriorZone = governing && exterior[governing.zone] ? exterior[governing.zone][typeKey] : null;
    const cpiVal = governing && inputs.Cpi ? inputs.Cpi[governing.interior] : null;
    const interiorVal = governing && interior[governing.interior] ? interior[governing.interior][typeKey] : null;
    const kPaResult = governing ? governing.kPa : null;
    const psfResult = governing ? governing.psf : null;
    const summaryValue = governing ? `${formatValue(psfResult, 2)} psf` : '--';
    
    const cpCgSummary = ['eMinus', 'wMinus', 'ePlus', 'wPlus']
        .filter(zone => typeof cpCg[zone] === 'number')
        .map(zone => `${formatZone(zone)} ${formatValue(cpCg[zone], 3)}`)
        .join(', ');
    
    const keyInputsItems = [
        `Importance = ${inputs.importanceFactor || '--'}`,
        `Terrain = ${inputs.terrainType || '--'}`,
        `Category = ${inputs.category || '--'}`,
        `q50 = ${formatValue(q50Val, 2)} kPa`,
        `Iw_${typeKey} = ${formatValue(iwFactor, 3)}`,
        `Ce = ${formatValue(CeVal, 3)}`,
        `Cgi = ${formatValue(CgiVal, 2)}`,
        `Height H = ${formatValue(inputs.height, 2)} m`,
        `Area A = ${formatValue(inputs.area, 2)} m^2`,
        `Cpi min = ${inputs.Cpi ? formatValue(inputs.Cpi.min, 2) : '--'}, max = ${inputs.Cpi ? formatValue(inputs.Cpi.max, 2) : '--'}`
    ];
    
    if (cpCgSummary) {
        keyInputsItems.push(`CpCg values: ${cpCgSummary}`);
    }
    
    const keyInputsHtml = keyInputsItems.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    
    const kPaKey = isULS ? 'ULS_kPa' : 'SLS_kPa';
    const psfKey = isULS ? 'ULS_psf' : 'SLS_psf';
    
    const combinationsHtml = combinations.length > 0
        ? combinations.map(combo => {
            const isGov = governing && combo.zone === governing.zone && combo.interior === governing.interior;
            const zoneText = escapeHtml(formatZone(combo.zone));
            const cpiText = escapeHtml(combo.interior);
            const kPaText = escapeHtml(formatValue(combo[kPaKey], 3));
            const psfText = escapeHtml(formatValue(combo[psfKey], 2));
            const suffix = isGov ? ' (governing)' : '';
            return `<li>${zoneText} with Cpi ${cpiText}: ${kPaText} kPa (${psfText} psf)${suffix}</li>`;
        }).join('')
        : '<li>No pressure combinations available.</li>';
    
    const formulaLines = governing ? [
        `Pe = Iw_${typeKey} * q50 * Ce * CpCg(${zoneLabel})`,
        `Pe = ${formatValue(iwFactor, 3)} * ${formatValue(q50Val, 2)} * ${formatValue(CeVal, 3)} * ${formatValue(cpCgZone, 3)} = ${formatValue(exteriorZone, 3)} kPa`,
        `Pi = Iw_${typeKey} * q50 * Ce * Cgi * Cpi(${governing.interior})`,
        `Pi = ${formatValue(iwFactor, 3)} * ${formatValue(q50Val, 2)} * ${formatValue(CeVal, 3)} * ${formatValue(CgiVal, 2)} * ${formatValue(cpiVal, 2)} = ${formatValue(interiorVal, 3)} kPa`,
        `P = Pe - Pi = ${formatValue(exteriorZone, 3)} - ${formatValue(interiorVal, 3)} = ${formatValue(kPaResult, 3)} kPa`,
        `P_psf = P * 20.885 = ${formatValue(kPaResult, 3)} * 20.885 = ${formatValue(psfResult, 2)} psf`
    ] : ['No governing combination found.'];
    
    const formulaHtml = formulaLines.map(line => escapeHtml(line)).join('\n');
    
    const overlay = document.createElement('div');
    overlay.className = 'wind-breakdown-modal';
    overlay.innerHTML = `
        <div class="wind-breakdown-content">
            <button type="button" class="wind-breakdown-close" aria-label="Close breakdown">&times;</button>
            <h3>${escapeHtml(typeKey)} Breakdown - ${escapeHtml(storeyLabel)}</h3>
            <p class="wind-breakdown-result">Result: <strong>${escapeHtml(summaryValue)}</strong></p>
            <div class="wind-breakdown-section">
                <h4>Key Inputs</h4>
                <ul class="wind-breakdown-list">
                    ${keyInputsHtml}
                </ul>
            </div>
            <div class="wind-breakdown-section">
                <h4>Governing Combination${governing ? ` (${escapeHtml(zoneLabel)}, Cpi ${escapeHtml(governing.interior)})` : ''}</h4>
                <pre class="wind-breakdown-formula">${formulaHtml}</pre>
            </div>
            <div class="wind-breakdown-section">
                <h4>All Combinations (${escapeHtml(typeKey)})</h4>
                <ul class="wind-breakdown-list">
                    ${combinationsHtml}
                </ul>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    const cleanup = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
    };
    
    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            cleanup();
        }
    };
    
    const closeButton = overlay.querySelector('.wind-breakdown-close');
    if (closeButton) {
        closeButton.addEventListener('click', cleanup);
    }
    
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            cleanup();
        }
    });
    
    document.addEventListener('keydown', onKeyDown);
}


/**
 * Recalculate all storeys (called when global parameters change)
 */
function recalculateAllStoreys() {
    const rows = document.querySelectorAll('#storeyTableBody tr');
    rows.forEach(row => calculateSingleStorey(row));
}

/**
 * Generate French storey label based on index
 */
function getStoreyLabel(index) {
    if (index === 0) return 'RDC'; // Rez-de-chaussée (Ground floor)
    return `NV${index+1}`; // Niveau 2, 3, 4...
}

/**
 * Add a new storey row to the table
 */
function addStoreyRow() {
    const tbody = document.getElementById('storeyTableBody');
    const row = document.createElement('tr');
    const label = getStoreyLabel(storeyCounter);
    storeyCounter++;
    
    row.innerHTML = `
        <td><input type="text" class="storey-label" value="${label}" style="background: white;"></td>
        <td><input type="number" class="storey-height" placeholder="0" step="0.1" min="0"></td>
        <td><input type="number" class="storey-area" value="1" step="0.1" min="0"></td>
        <td><span class="output-value storey-uls">--</span></td>
        <td><span class="output-value storey-sls">--</span></td>
        <td><button class="remove-storey-btn" onclick="removeStoreyRow(this)"><i class="fas fa-trash"></i></button></td>
    `;
    
    tbody.appendChild(row);
    attachWindBreakdownHandlers(row);
    
    // Add event listeners for real-time calculation
    const heightInput = row.querySelector('.storey-height');
    const areaInput = row.querySelector('.storey-area');
    
    heightInput.addEventListener('input', () => calculateSingleStorey(row));
    areaInput.addEventListener('input', () => calculateSingleStorey(row));

    // Ensure initial state reflects current inputs (and clears breakdown if needed)
    calculateSingleStorey(row);
}

/**
 * Attach click handlers that show the wind breakdown modal for a row.
 */
function attachWindBreakdownHandlers(row) {
    const ulsSpan = row.querySelector('.storey-uls');
    const slsSpan = row.querySelector('.storey-sls');
    
    if (ulsSpan && !ulsSpan.dataset.breakdownBound) {
        ulsSpan.dataset.breakdownBound = 'true';
        ulsSpan.addEventListener('click', () => showWindBreakdownModal(row, 'ULS'));
    }
    
    if (slsSpan && !slsSpan.dataset.breakdownBound) {
        slsSpan.dataset.breakdownBound = 'true';
        slsSpan.addEventListener('click', () => showWindBreakdownModal(row, 'SLS'));
    }
}

// Setup entremise dropdown logic
function setupEntremiseDropdowns() {
    const part1 = document.getElementById('entremisePart1');
    const part2 = document.getElementById('entremisePart2');
    const part1Set2 = document.getElementById('entremise2Part1');
    const part2Set2 = document.getElementById('entremise2Part2');
    
    if (part1 && part2) {
        part1.addEventListener('change', function() {
            if (this.value === 'N/A') {
                part2.style.display = 'none';
                part2.required = false;
                part2.value = '';
            } else {
                part2.style.display = '';
                part2.required = true;
            }
        });
        // Trigger on load
        if (part1.value === 'N/A') {
            part2.style.display = 'none';
            part2.required = false;
        }
    }
    
    if (part1Set2 && part2Set2) {
        part1Set2.addEventListener('change', function() {
            if (this.value === 'N/A') {
                part2Set2.style.display = 'none';
                part2Set2.required = false;
                part2Set2.value = '';
            } else {
                part2Set2.style.display = '';
                part2Set2.required = false; // Set 2 is optional
            }
        });
        // Trigger on load
        if (part1Set2.value === 'N/A') {
            part2Set2.style.display = 'none';
            part2Set2.required = false;
        }
    }
}

// Call this in DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    setupHauteurMaxPreview();
    setupEntremiseDropdowns();
});

/**
 * Remove a storey row
 */
function removeStoreyRow(button) {
    const row = button.closest('tr');
    row.remove();
    
    // Re-label all storeys
    const rows = document.querySelectorAll('#storeyTableBody tr');
    rows.forEach((row, index) => {
        const labelInput = row.querySelector('.storey-label');
        if (labelInput) {
            labelInput.value = getStoreyLabel(index);
        }
    });
    
    storeyCounter = rows.length;
}

/**
 * Calculate exposure factor Ce based on terrain type and height
 */
function calculateCe(terrainType, H) {
    if (terrainType === 'Open terrain') {
        return Math.max(Math.pow(H / 10, 0.2), 0.9);
    } else if (terrainType === 'Rough terrain') {
        return Math.max(0.7 * Math.pow(H / 12, 0.3), 0.7);
    }
    return 1.0; // Default fallback
}

/**
 * Calculate CpCg for different zones based on area A
 */
function calculateCpCg(A) {
    const zones = {};
    
    // e- zone
    if (A <= 1) {
        zones.eMinus = -2.09;
    } else if (A > 1 && A < 50) {
        zones.eMinus = 0.35 * Math.log10(A) - 2.1;
    } else {
        zones.eMinus = -1.5;
    }
    
    // w- zone
    if (A <= 1) {
        zones.wMinus = -1.8;
    } else if (A > 1 && A < 50) {
        zones.wMinus = 0.17658 * Math.log10(A) - 1.8;
    } else {
        zones.wMinus = -1.5;
    }
    
    // w+ zone (e+ uses same value as w+)
    if (A <= 1) {
        zones.wPlus = 1.75;
    } else if (A > 1 && A < 50) {
        zones.wPlus = 1.75 - 0.264866 * Math.log10(A);
    } else {
        zones.wPlus = 1.3;
    }
    
    zones.ePlus = zones.wPlus;
    
    return zones;
}

/**
 * Calculate wind load for a single storey
 */
function calculateStoreyWindLoad(params) {
    const { q50, importanceFactor, terrainType, category, H, A } = params;

    const roundTo = (value, decimals = 2) => {
        if (typeof value !== 'number' || !isFinite(value)) return null;
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    };
    
    // Validate inputs
    if (!q50 || !importanceFactor || !terrainType || !category || !H || !A) {
        return { ULS: null, SLS: null, breakdown: null };
    }
    
    // Get Iw values
    const Iw = IW_VALUES[importanceFactor];
    if (!Iw) return { ULS: null, SLS: null, breakdown: null };
    
    // Calculate Ce
    const Ce = calculateCe(terrainType, H);
    
    // Get Cpi values
    const Cpi = CPI_VALUES[category];
    if (!Cpi) return { ULS: null, SLS: null, breakdown: null };
    
    const Cgi = 2; // Constant from Excel
    const Ct = 1;  // Topographic factor (always 1)
    
    // Declare Pe and Pi
    let Pe, Pi;
    
    if (H <= 20) {
        // H â‰¤ 20m: Use CpCg (area-dependent), no separate Cg factor
        const cpCg = calculateCpCg(A);
        
        Pe = {
            eMinus: { ULS: Iw.ULS * q50 * Ce * cpCg.eMinus, SLS: Iw.SLS * q50 * Ce * cpCg.eMinus },
            wMinus: { ULS: Iw.ULS * q50 * Ce * cpCg.wMinus, SLS: Iw.SLS * q50 * Ce * cpCg.wMinus },
            ePlus:  { ULS: Iw.ULS * q50 * Ce * cpCg.ePlus,  SLS: Iw.SLS * q50 * Ce * cpCg.ePlus },
            wPlus:  { ULS: Iw.ULS * q50 * Ce * cpCg.wPlus,  SLS: Iw.SLS * q50 * Ce * cpCg.wPlus }
        };
        
        Pi = {
            min: {
                ULS: Iw.ULS * q50 * Ce * Cgi * Cpi.min,
                SLS: Iw.SLS * q50 * Ce * Cgi * Cpi.min
            },
            max: {
                ULS: Iw.ULS * q50 * Ce * Cgi * Cpi.max,
                SLS: Iw.SLS * q50 * Ce * Cgi * Cpi.max
            }
        };
    } else {
        // H > 21m: Use fixed Cp values + Cg factor of 2.5
        const Cg = 2.5;
        const Cp = { eMinus: -1.2, wMinus: -0.9, ePlus: 0.9, wPlus: 0.9 };
        
        // For H>21m: Ce uses full H (already calculated above)
        // Cei uses Hei = max(H/2, 6)
        const Hei = Math.max(H / 2, 6);
        const Cei = calculateCe(terrainType, Hei);
        
        Pe = {
            eMinus: { ULS: Iw.ULS * q50 * Ce * Ct * Cg * Cp.eMinus, SLS: Iw.SLS * q50 * Ce * Ct * Cg * Cp.eMinus },
            wMinus: { ULS: Iw.ULS * q50 * Ce * Ct * Cg * Cp.wMinus, SLS: Iw.SLS * q50 * Ce * Ct * Cg * Cp.wMinus },
            ePlus:  { ULS: Iw.ULS * q50 * Ce * Ct * Cg * Cp.ePlus,  SLS: Iw.SLS * q50 * Ce * Ct * Cg * Cp.ePlus },
            wPlus:  { ULS: Iw.ULS * q50 * Ce * Ct * Cg * Cp.wPlus,  SLS: Iw.SLS * q50 * Ce * Ct * Cg * Cp.wPlus }
        };
        
        Pi = {
            min: {
                ULS: Iw.ULS * q50 * Cei * Cgi * Cpi.min,  // Use Cei, no Ct/Cg
                SLS: Iw.SLS * q50 * Cei * Cgi * Cpi.min
            },
            max: {
                ULS: Iw.ULS * q50 * Cei * Cgi * Cpi.max,  // Use Cei, no Ct/Cg
                SLS: Iw.SLS * q50 * Cei * Cgi * Cpi.max
            }
        };
    }
    
    // Build all pressure combinations P = Pe - Pi (kPa)
    const combinations = [];
    Object.keys(Pe).forEach(zone => {
        ['min', 'max'].forEach(piType => {
            combinations.push({
                zone,
                interior: piType,
                ULS_kPa: Pe[zone].ULS - Pi[piType].ULS,
                SLS_kPa: Pe[zone].SLS - Pi[piType].SLS
            });
        });
    });
    
    if (combinations.length === 0) {
        return { ULS: null, SLS: null, breakdown: null };
    }
    
    const ULSValues = combinations.map(combo => combo.ULS_kPa);
    const SLSValues = combinations.map(combo => combo.SLS_kPa);
    
    const ULS_Pmax = Math.max(...ULSValues);
    const ULS_Pmin = Math.min(...ULSValues);
    const SLS_Pmax = Math.max(...SLSValues);
    const SLS_Pmin = Math.min(...SLSValues);
    
    const ULS_kPa = Math.abs(ULS_Pmax) > Math.abs(ULS_Pmin) ? ULS_Pmax : ULS_Pmin;
    const SLS_kPa = Math.abs(SLS_Pmax) > Math.abs(SLS_Pmin) ? SLS_Pmax : SLS_Pmin;
    
    const governingULSCombo = combinations.find(c => c.ULS_kPa === ULS_kPa);
    const governingSLSCombo = combinations.find(c => c.SLS_kPa === SLS_kPa);
    
    const ULS_psf = ULS_kPa * 20.885;
    const SLS_psf = SLS_kPa * 20.885;

    const breakdown = {
        inputs: {
            q50,
            importanceFactor,
            terrainType,
            category,
            height: H,
            area: A,
            Iw,
            Ce,
            Cpi,
            Cgi,
            Ct,
            Cg: H > 21 ? 2.5 : undefined,
            Cp: H > 21 ? { eMinus: -1.2, wMinus: -0.9, ePlus: 0.9, wPlus: 0.9 } : undefined,
            Hei: H > 21 ? Math.max(H / 2, 6) : undefined,
            Cei: H > 21 ? calculateCe(terrainType, Math.max(H / 2, 6)) : undefined
        },
        cpCg: H <= 21 ? calculateCpCg(A) : undefined,
        exteriorPressures: Pe,
        interiorPressures: Pi,
        combinations: combinations.map(combo => ({
            zone: combo.zone,
            interior: combo.interior,
            ULS_kPa: roundTo(combo.ULS_kPa, 4),
            SLS_kPa: roundTo(combo.SLS_kPa, 4),
            ULS_psf: roundTo(combo.ULS_kPa * 20.885, 1),
            SLS_psf: roundTo(combo.SLS_kPa * 20.885, 1)
        })),
        governing: {
            ULS: governingULSCombo ? {
                zone: governingULSCombo.zone,
                interior: governingULSCombo.interior,
                direction: governingULSCombo.ULS_kPa === ULS_Pmax ? 'max' : 'min',
                kPa: roundTo(ULS_kPa, 4),
                psf: roundTo(ULS_psf, 1)
            } : null,
            SLS: governingSLSCombo ? {
                zone: governingSLSCombo.zone,
                interior: governingSLSCombo.interior,
                direction: governingSLSCombo.SLS_kPa === SLS_Pmax ? 'max' : 'min',
                kPa: roundTo(SLS_kPa, 4),
                psf: roundTo(SLS_psf, 1)
            } : null
        }
    };
    
    return {
        ULS: roundTo(Math.abs(ULS_psf), 1),
        SLS: roundTo(Math.abs(SLS_psf), 1),
        breakdown
    };
}

/**
 * Calculate wind loads for all storeys and update the table
 */
function calculateAllStoreyWindLoads() {
    // Get global parameters
    const q50 = parseFloat(document.getElementById('q50')?.value);
    const importanceFactor = document.getElementById('importanceFactor')?.value;
    const terrainType = document.getElementById('terrainType')?.value;
    const category = document.getElementById('category')?.value;
    
    // Validate global parameters
    if (!q50 || !importanceFactor || !terrainType || !category) {
        alert('Fill in all wind calculation fields.');
        return false;
    }
    
    // Calculate for each storey
    const rows = document.querySelectorAll('#storeyTableBody tr');
    let allValid = true;
    
    rows.forEach(row => {
        const isRowValid = calculateSingleStorey(row);
        if (!isRowValid) {
            allValid = false;
        }
    });
    
    return allValid;
}


/**
 * Populate the CFSS form with existing data for editing
 */
function populateCFSSForm(cfssData) {
    if (!cfssData) return;
    
    // Check if new structure
    const isNewStructure = !Array.isArray(cfssData) && cfssData.windParams && cfssData.storeys;
    
    if (isNewStructure) {
        // Populate wind parameters
        if (cfssData.windParams) {
            document.getElementById('q50').value = cfssData.windParams.q50 || '';
            document.getElementById('importanceFactor').value = cfssData.windParams.importanceFactor || '';
            document.getElementById('terrainType').value = cfssData.windParams.terrainType || '';
            document.getElementById('category').value = cfssData.windParams.category || '';
        }
        
        // Populate specifications
        if (cfssData.specifications) {
            document.getElementById('maxDeflection').value = cfssData.specifications.maxDeflection || '';
            document.getElementById('maxSpacing').value = cfssData.specifications.maxSpacing || '';
            document.getElementById('framingAssembly').value = cfssData.specifications.framingAssembly || '';
            document.getElementById('concreteAnchor').value = cfssData.specifications.concreteAnchor || '';
            document.getElementById('steelAnchor').value = cfssData.specifications.steelAnchor || '';
        }
        
        // Clear existing storey rows
        const tbody = document.getElementById('storeyTableBody');
        tbody.innerHTML = '';
        storeyCounter = 0;
        
        // Add storey rows
        if (cfssData.storeys && cfssData.storeys.length > 0) {
            cfssData.storeys.forEach((storey, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="text" class="storey-label" value="${storey.label}" style="background: white;"></td>
                    <td><input type="number" class="storey-height" value="${storey.height}" step="0.1" min="0"></td>
                    <td><input type="number" class="storey-area" value="${storey.area}" step="0.1" min="0"></td>
                    <td><span class="output-value storey-uls">${parseFloat(storey.uls.toFixed(1))}</span></td>
                    <td><span class="output-value storey-sls">${parseFloat(storey.sls.toFixed(1))}</span></td>
                    <td><button class="remove-storey-btn" onclick="removeStoreyRow(this)"><i class="fas fa-trash"></i></button></td>
                `;
                tbody.appendChild(row);
                
                // Add event listeners for real-time calculation
                const heightInput = row.querySelector('.storey-height');
                const areaInput = row.querySelector('.storey-area');
                heightInput.addEventListener('input', () => calculateSingleStorey(row));
                areaInput.addEventListener('input', () => calculateSingleStorey(row));
                attachWindBreakdownHandlers(row);
                
                // Re-run calculation to refresh breakdown data
                calculateSingleStorey(row);
                
                storeyCounter++;
            });
        }
    } else {
        // Handle old structure - populate with default empty storeys
        if (Array.isArray(cfssData) && cfssData.length > 0) {
            const firstItem = cfssData[0];
            document.getElementById('maxDeflection').value = firstItem.maxDeflection || '';
            document.getElementById('maxSpacing').value = firstItem.maxSpacing || '';
            document.getElementById('framingAssembly').value = firstItem.framingAssembly || '';
            document.getElementById('concreteAnchor').value = firstItem.concreteAnchor || '';
            document.getElementById('steelAnchor').value = firstItem.steelAnchor || '';
        }
        
        // Clear storeys and add one empty row
        const tbody = document.getElementById('storeyTableBody');
        tbody.innerHTML = '';
        storeyCounter = 0;
        addStoreyRow();
    }
}