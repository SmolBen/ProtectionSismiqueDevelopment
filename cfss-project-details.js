// CFSS Project Details Page JavaScript
let currentProjectId = null;
let projectEquipment = []; // For CFSS, this will store walls
let currentUser = null;
let isAdmin = false;
let projectData = null;
let cfssWindData = []; // Store wind data

// Function to check authentication
async function checkAuthentication() {
    try {
        console.log('🔍 Checking authentication using authHelper...');
        
        if (!window.authHelper) {
            window.authHelper = new AuthHelper();
        }
        authHelper = window.authHelper;
        
        const userData = await authHelper.checkAuthentication();
        
        if (!userData) {
            console.log('❌ No user authenticated');
            document.getElementById('loadingProject').style.display = 'none';
            document.getElementById('authError').style.display = 'block';
            return false;
        }

        console.log('✅ User authenticated:', userData.email);
        currentUser = userData;
        isAdmin = userData.isAdmin;
        
        authHelper.updateUserInterface();
        
        return true;

    } catch (error) {
        console.error('❌ Authentication error:', error);
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

// Function to render wall list (similar to equipment list)
function renderEquipmentList() {
    try {
        console.log('=== renderEquipmentList() for CFSS walls START ===');
        
        const equipmentListDiv = document.getElementById('equipmentList');
        
        if (!equipmentListDiv) {
            console.error('equipmentList div not found!');
            return;
        }
        
        equipmentListDiv.innerHTML = '';

        const listHeader = document.createElement('div');
        listHeader.className = 'equipment-list-header';
        listHeader.textContent = `Walls (${projectEquipment.length})`;
        equipmentListDiv.appendChild(listHeader);

        if (projectEquipment.length === 0) {
            equipmentListDiv.innerHTML = '<p>No walls added yet.</p>';
            return;
        }

        projectEquipment.forEach((wall, index) => {
            const wallCard = document.createElement('div');
            wallCard.className = 'equipment-card';
            
            wallCard.innerHTML = `
                <div class="equipment-header">
                    <div class="equipment-info-compact">
                        <h4 title="Click to toggle details">
                            ${wall.equipment}
                        </h4>
                        <div class="equipment-meta-compact">
                            <span>Floor: ${wall.floor || 'N/A'}</span>
                            <span class="meta-separator">•</span>
                            <span>Hauteur: ${wall.hauteurMax || 'N/A'}</span>
                            <span class="meta-separator">•</span>
                            <span>Déflexion: ${wall.deflexionMax || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="equipment-actions-compact">
                        <button class="details-btn" onclick="event.stopPropagation(); toggleEquipmentDetails(${index})">Details</button>
                        ${canModifyProject() ? `
                            <button class="delete-btn" onclick="event.stopPropagation(); deleteEquipment(${index})">Delete</button>
                        ` : ''}
                    </div>
                </div>

                <div class="equipment-details" id="equipmentDetails${index}">
                    <div id="equipmentView${index}">
                        <div class="equipment-details-container">
                            <div class="equipment-info-section">
                                <p><strong>Wall Name:</strong> ${wall.equipment}</p>
                                <p><strong>Floor:</strong> ${wall.floor || 'N/A'}</p>
                                <p><strong>Hauteur Max:</strong> ${wall.hauteurMax || 'N/A'}</p>
                                <p><strong>Déflexion Max:</strong> ${wall.deflexionMax || 'N/A'}</p>
                                <p><strong>Montant Métallique:</strong> ${wall.montantMetallique || 'N/A'}</p>
                                <p><strong>Lisse Supérieure:</strong> ${wall.lisseSuperieure || 'N/A'}</p>
                                <p><strong>Lisse Inférieure:</strong> ${wall.lisseInferieure || 'N/A'}</p>
                                <p><strong>Entremise:</strong> ${wall.entremise || 'N/A'}</p>
                                
                                ${canModifyProject() ? `
                                    <div style="margin-top: 15px;">
                                        <button class="edit-btn" onclick="editEquipment(${index})" style="background: #ffc107; color: #212529; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                            <i class="fas fa-edit"></i> Edit Wall
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div id="equipmentEdit${index}" style="display: none;">
                        <form id="equipmentEditForm${index}" onsubmit="saveEquipmentEdit(${index}, event)">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div>
                                    <label><strong>Wall Name:</strong></label>
                                    <input type="text" id="editEquipment${index}" value="${wall.equipment || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Floor:</strong></label>
                                    <input type="text" id="editFloor${index}" value="${wall.floor || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Hauteur Max:</strong></label>
                                    <input type="number" id="editHauteurMax${index}" value="${wall.hauteurMax || ''}" step="0.01" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Déflexion Max:</strong></label>
                                    <select id="editDeflexionMax${index}" style="width: 100%; padding: 5px;">
                                        <option value="L/360" ${wall.deflexionMax === 'L/360' ? 'selected' : ''}>L/360</option>
                                        <option value="L/480" ${wall.deflexionMax === 'L/480' ? 'selected' : ''}>L/480</option>
                                        <option value="L/600" ${wall.deflexionMax === 'L/600' ? 'selected' : ''}>L/600</option>
                                        <option value="L/720" ${wall.deflexionMax === 'L/720' ? 'selected' : ''}>L/720</option>
                                    </select>
                                </div>
                                <div>
                                    <label><strong>Montant Métallique:</strong></label>
                                    <input type="text" id="editMontantMetallique${index}" value="${wall.montantMetallique || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Lisse Supérieure:</strong></label>
                                    <input type="text" id="editLisseSuperieure${index}" value="${wall.lisseSuperieure || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Lisse Inférieure:</strong></label>
                                    <input type="text" id="editLisseInferieure${index}" value="${wall.lisseInferieure || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Entremise:</strong></label>
                                    <input type="text" id="editEntremise${index}" value="${wall.entremise || ''}" style="width: 100%; padding: 5px;">
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 10px; margin-top: 15px;">
                                <button type="submit" style="background: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-save"></i> Save Changes
                                </button>
                                <button type="button" onclick="cancelEquipmentEdit(${index})" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            
            equipmentListDiv.appendChild(wallCard);

            // Add click event to entire card for toggling details
            wallCard.addEventListener('click', (e) => {
                if (e.target.closest('.equipment-actions-compact') || 
                    e.target.closest('.equipment-details')) {
                    return;
                }
                toggleEquipmentDetails(index);
            });
        });
        
    } catch (error) {
        console.error('Error in renderEquipmentList():', error);
    }
}

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
        detailsDiv.classList.add('show');
        if (detailsButton) {
            detailsButton.textContent = 'Hide Details';
        }
    }
}

// Function to edit wall
function editEquipment(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to edit walls in this project.');
        return;
    }

    document.getElementById(`equipmentView${index}`).style.display = 'none';
    document.getElementById(`equipmentEdit${index}`).style.display = 'block';
    
    const detailsDiv = document.getElementById(`equipmentDetails${index}`);
    const detailsButton = detailsDiv.closest('.equipment-card').querySelector('.details-btn');
    
    if (!detailsDiv.classList.contains('show')) {
        detailsDiv.classList.add('show');
        if (detailsButton) {
            detailsButton.textContent = 'Hide Details';
        }
    }
}

// Function to cancel wall edit
function cancelEquipmentEdit(index) {
    document.getElementById(`equipmentView${index}`).style.display = 'block';
    document.getElementById(`equipmentEdit${index}`).style.display = 'none';
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
            hauteurMax: parseFloat(document.getElementById(`editHauteurMax${index}`).value) || 0,
            deflexionMax: document.getElementById(`editDeflexionMax${index}`).value,
            montantMetallique: document.getElementById(`editMontantMetallique${index}`).value,
            lisseSuperieure: document.getElementById(`editLisseSuperieure${index}`).value,
            lisseInferieure: document.getElementById(`editLisseInferieure${index}`).value,
            entremise: document.getElementById(`editEntremise${index}`).value,
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

        if (!updatedWall.deflexionMax) {
            alert('Please select a déflexion max.');
            return;
        }

        console.log('📄 Updating wall:', updatedWall);

        projectEquipment[index] = updatedWall;
        
        await saveEquipmentToProject();
        renderEquipmentList();
        
        alert('Wall updated successfully!');
        
    } catch (error) {
        console.error('Error saving wall edit:', error);
        alert('Error saving wall changes: ' + error.message);
    }
}

// Function to delete wall
function deleteEquipment(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to delete walls from this project.');
        return;
    }

    if (confirm('Are you sure you want to delete this wall?')) {
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
        
        const apiUrl = `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/equipment`;
        console.log('API URL:', apiUrl);
        
        const requestBody = { equipment: projectEquipment };
        console.log('Request body:', JSON.stringify(requestBody, null, 2));
        
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
function setupEquipmentFormHandler() {
    const equipmentForm = document.getElementById('equipmentFormElement');
    const calculateButton = document.getElementById('calculateEquipment');
    const saveButton = document.getElementById('saveEquipment');
    
    if (!equipmentForm) return;
    
    // Calculate button (for CFSS, just shows placeholder message)
    if (calculateButton) {
        calculateButton.addEventListener('click', handleCalculateEquipment);
    }
    
    // Save button (form submission)
    equipmentForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        await handleSaveEquipment(e);
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
    let html = `
        <div class="calculation-equipment-info">
            <h3 style="color: #333; margin-bottom: 15px;">Wall Information</h3>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff;">
                <p><strong>Wall Name:</strong> ${wallData.equipment}</p>
                <p><strong>Floor:</strong> ${wallData.floor}</p>
                <p><strong>Hauteur Max:</strong> ${wallData.hauteurMax}</p>
                <p><strong>Déflexion Max:</strong> ${wallData.deflexionMax}</p>
                <p><strong>Montant Métallique:</strong> ${wallData.montantMetallique}</p>
                <p><strong>Lisse Supérieure:</strong> ${wallData.lisseSuperieure}</p>
                <p><strong>Lisse Inférieure:</strong> ${wallData.lisseInferieure}</p>
                <p><strong>Entremise:</strong> ${wallData.entremise}</p>
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
            newCalcButton.textContent = 'Add Wall';
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
    const equipment = document.getElementById('equipment').value;
    const floor = document.getElementById('floor').value;
    const hauteurMax = document.getElementById('hauteurMax').value;
    const deflexionMax = document.getElementById('deflexionMax').value;
    const montantMetallique = document.getElementById('montantMetallique').value;
    const lisseSuperieure = document.getElementById('lisseSuperieure').value;
    const lisseInferieure = document.getElementById('lisseInferieure').value;
    const entremise = document.getElementById('entremise').value;

    // Validation
    if (!equipment) {
        alert('Please enter a wall name.');
        return null;
    }

    if (!floor) {
        alert('Please enter a floor.');
        return null;
    }

    if (!hauteurMax || parseFloat(hauteurMax) <= 0) {
        alert('Please enter a valid hauteur max greater than 0.');
        return null;
    }

    if (!deflexionMax) {
        alert('Please select a déflexion max.');
        return null;
    }

    if (!montantMetallique) {
        alert('Please enter montant métallique.');
        return null;
    }

    if (!lisseSuperieure) {
        alert('Please enter lisse supérieure.');
        return null;
    }

    if (!lisseInferieure) {
        alert('Please enter lisse inférieure.');
        return null;
    }

    if (!entremise) {
        alert('Please enter entremise.');
        return null;
    }

    const wallData = {
        equipment: equipment,
        floor: floor,
        hauteurMax: parseFloat(hauteurMax),
        deflexionMax: deflexionMax,
        montantMetallique: montantMetallique,
        lisseSuperieure: lisseSuperieure,
        lisseInferieure: lisseInferieure,
        entremise: entremise,
        dateAdded: new Date().toISOString(),
        addedBy: currentUser.email
    };

    return wallData;
}

// Clear wall form
function clearWallForm() {
    const form = document.getElementById('equipmentFormElement');
    if (form) {
        form.reset();
        console.log('Wall form cleared');
    }
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
                newCalcButton.textContent = 'Add Wall';
            } else {
                equipmentForm.classList.add('show');
                newCalcButton.textContent = 'Hide Form';
                
                equipmentForm.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }
        });
    }
}

function setupCFSSDataButton() {
    const cfssButton = document.getElementById('cfssDataButton');
    
    if (cfssButton) {
        cfssButton.addEventListener('click', function() {
            if (!canModifyProject()) {
                alert('You do not have permission to add CFSS data to this project.');
                return;
            }
            
            toggleCFSSForm();
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
        form.classList.remove('hidden');
        btn.classList.add('expanded');
        btnText.textContent = 'Hide CFSS Data';
    } else {
        form.classList.add('hidden');
        btn.classList.remove('expanded');
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
                    <span class="unit-label">cfs</span>
                </div>
            </div>
            
            <div class="field-group deflection">
                <label>Deflection:</label>
                <div class="field-with-unit">
                    <input type="number" class="value-input" placeholder="0.0" step="0.1">
                    <span class="unit-label">cfs</span>
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
    
    if (!cfssData || cfssData.length === 0) {
        displayDiv.style.display = 'none';
        return;
    }
    
    displayDiv.style.display = 'block';
    
    // Get project-wide fields from first entry (they're the same across all floor sections)
    const projectData = cfssData[0] || {};
    
    let html = '';
    
    // Display project-wide CFSS data first
    const projectFields = [
        { label: 'Max Deflection', value: projectData.maxDeflection },
        { label: 'Max Spacing Between Braces', value: projectData.maxSpacing },
        { label: 'Framing Assembly', value: projectData.framingAssembly },
        { label: 'Concrete Anchor', value: projectData.concreteAnchor },
        { label: 'Steel Anchor', value: projectData.steelAnchor },
        { label: 'Min Metal Framing Thickness', value: projectData.minMetalThickness },
        { label: 'Lisse Inférieure', value: projectData.lisseInferieure },
        { label: 'Lisse Supérieure', value: projectData.lisseSuperieure }
    ];
    
    // Filter out empty project fields
    const filledProjectFields = projectFields.filter(field => field.value && field.value.trim() !== '');
    
    if (filledProjectFields.length > 0) {
        html += `
            <div class="cfss-project-data">
                <h4 style="margin: 0 0 10px 0; color: #28a745; font-size: 14px; border-bottom: 1px solid #28a745; padding-bottom: 5px;">
                    Project Specifications
                </h4>
                <div class="cfss-project-fields" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
        `;
        
        filledProjectFields.forEach(field => {
            html += `
                <div class="cfss-project-item" style="font-size: 12px; padding: 4px 0;">
                    <strong style="color: #495057;">${field.label}:</strong>
                    <span style="color: #6c757d; margin-left: 8px;">${field.value}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Display wind data by floor
    if (cfssData.length > 0) {
        html += `
            <div class="cfss-wind-data">
                <h4 style="margin: 0 0 10px 0; color: #17a2b8; font-size: 14px; border-bottom: 1px solid #17a2b8; padding-bottom: 5px;">
                    Wind Data by Floor
                </h4>
        `;
        
        cfssData.forEach(item => {
            html += `
                <div class="cfss-floor-item">
                    <span class="cfss-floor-range">Floor ${item.floorRange}</span>
                    <span class="cfss-values">Resistance: ${item.resistance} cfs, Deflection: ${item.deflection} cfs</span>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    contentDiv.innerHTML = html;
    
    // Update the button text to show data exists
    const btnText = document.getElementById('cfss-btn-text');
    if (btnText) {
        const floorCount = cfssData.length;
        const projectFieldCount = filledProjectFields.length;
        btnText.textContent = `CFSS Data (${floorCount} floors, ${projectFieldCount} specs)`;
    }
}

// Update the saveCFSSData function to refresh the display
async function saveCFSSData() {
    if (!canModifyProject()) {
        alert('You do not have permission to modify CFSS data for this project.');
        return;
    }
    
    try {
        // Collect all floor section data
        const sections = document.querySelectorAll('.floor-section');
        const newCfssData = [];
        
        // Get project-wide fields (collected once)
        const maxDeflection = document.getElementById('maxDeflection')?.value.trim() || '';
        const maxSpacing = document.getElementById('maxSpacing')?.value.trim() || '';
        const framingAssembly = document.getElementById('framingAssembly')?.value.trim() || '';
        const concreteAnchor = document.getElementById('concreteAnchor')?.value.trim() || '';
        const steelAnchor = document.getElementById('steelAnchor')?.value.trim() || '';
        const minMetalThickness = document.getElementById('minMetalThickness')?.value.trim() || '';
        const lisseInferieure = document.getElementById('lisseInferieure')?.value.trim() || '';
        const lisseSuperieure = document.getElementById('lisseSuperieure')?.value.trim() || '';
        
        sections.forEach(section => {
            const floorRange = section.querySelector('.floor-input').value.trim();
            const resistance = parseFloat(section.querySelectorAll('.value-input')[0].value) || 0;
            const deflection = parseFloat(section.querySelectorAll('.value-input')[1].value) || 0;
            
            if (floorRange) {
                newCfssData.push({
                    floorRange: floorRange,
                    resistance: resistance,
                    deflection: deflection,
                    // Add project-wide fields to each floor section
                    maxDeflection: maxDeflection,
                    maxSpacing: maxSpacing,
                    framingAssembly: framingAssembly,
                    concreteAnchor: concreteAnchor,
                    steelAnchor: steelAnchor,
                    minMetalThickness: minMetalThickness,
                    lisseInferieure: lisseInferieure,
                    lisseSuperieure: lisseSuperieure,
                    dateAdded: new Date().toISOString(),
                    addedBy: currentUser.email
                });
            }
        });
        
        if (newCfssData.length === 0) {
            alert('Please add at least one floor section with data.');
            return;
        }
        
        console.log('Saving CFSS wind data:', newCfssData);
        
        // Save to database using your existing API
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/cfss-data`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ cfssWindData: newCfssData })
        });

        if (!response.ok) {
            throw new Error(`Failed to save CFSS data: ${response.status}`);
        }
        
        cfssWindData = newCfssData;
        
        // Update the display with new comprehensive display function
        updateCFSSDataDisplay(newCfssData);
        
        alert('CFSS data saved successfully!');
        
        // Hide the form after saving
        toggleCFSSForm();
        
    } catch (error) {
        console.error('Error saving CFSS data:', error);
        alert('Error saving CFSS data: ' + error.message);
    }
}

// Update the loadCFSSData function
function loadCFSSData(project) {
    if (project.cfssWindData && project.cfssWindData.length > 0) {
        cfssWindData = project.cfssWindData;
        updateCFSSDataDisplay(project.cfssWindData);
        populateCFSSForm(cfssWindData);
        
        console.log('CFSS data loaded:', project.cfssWindData);
    } else {
        // Hide the display section if no data
        const cfssDisplay = document.getElementById('cfssDataDisplay');
        if (cfssDisplay) {
            cfssDisplay.style.display = 'none';
        }
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
    const cfssContent = document.getElementById('cfssDataContent');
    
    if (project.cfssWindData && project.cfssWindData.length > 0) {
        cfssWindData = project.cfssWindData;
        
        // Show the display section
        cfssDisplay.style.display = 'block';
        
        // Generate HTML for displaying the data
        let dataHtml = '';
        project.cfssWindData.forEach((data, index) => {
            dataHtml += `
                <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #dee2e6;">
                    <strong>Floor Range:</strong> ${data.floorRange} | 
                    <strong>Resistance:</strong> ${data.resistance} cfs | 
                    <strong>Deflection:</strong> ${data.deflection} cfs
                </div>
            `;
        });
        
        cfssContent.innerHTML = dataHtml;
        
        // Update button text to show data exists
        const btnText = document.getElementById('cfss-btn-text');
        if (btnText) {
            btnText.textContent = `CFSS Data (${project.cfssWindData.length} sections)`;
        }
    } else {
        // Hide the display section if no data
        cfssDisplay.style.display = 'none';
    }
}

function updateCFSSDataDisplay(windData) {
    const cfssDisplay = document.getElementById('cfssDataDisplay');
    const cfssContent = document.getElementById('cfssDataContent');
    
    if (windData && windData.length > 0) {
        cfssDisplay.style.display = 'block';
        
        // Get project-wide fields from first entry
        const projectData = windData[0] || {};
        
        let dataHtml = '';
        
        // Display project-wide data if any exists
        const projectFields = [
            { label: 'Max Deflection', value: projectData.maxDeflection },
            { label: 'Max Spacing Between Braces', value: projectData.maxSpacing },
            { label: 'Framing Assembly', value: projectData.framingAssembly },
            { label: 'Concrete Anchor', value: projectData.concreteAnchor },
            { label: 'Steel Anchor', value: projectData.steelAnchor },
            { label: 'Min Metal Framing Thickness', value: projectData.minMetalThickness },
            { label: 'Lisse Inférieure', value: projectData.lisseInferieure },
            { label: 'Lisse Supérieure', value: projectData.lisseSuperieure }
        ];
        
        const filledProjectFields = projectFields.filter(field => field.value && field.value.trim() !== '');
        
        if (filledProjectFields.length > 0) {
            dataHtml += `
                <div style="margin-bottom: 15px; padding: 12px; background: #e8f5e8; border-radius: 6px; border-left: 4px solid #28a745;">
                    <h4 style="margin: 0 0 10px 0; color: #28a745; font-size: 14px; font-weight: 600;">
                        <i class="fas fa-cogs" style="margin-right: 8px;"></i>Project Specifications
                    </h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            `;
            
            filledProjectFields.forEach(field => {
                dataHtml += `
                    <div style="font-size: 12px; padding: 4px 0;">
                        <strong style="color: #155724;">${field.label}:</strong>
                        <span style="color: #155724; margin-left: 6px;">${field.value}</span>
                    </div>
                `;
            });
            
            dataHtml += `
                    </div>
                </div>
            `;
        }
        
        // Display wind data
        dataHtml += `
            <div>
                <h4 style="margin: 0 0 10px 0; color: #17a2b8; font-size: 14px; font-weight: 600;">
                    <i class="fas fa-wind" style="margin-right: 8px;"></i>Wind Data by Floor
                </h4>
        `;
        
        windData.forEach((data, index) => {
            dataHtml += `
                <div style="margin-bottom: 8px; padding: 10px; background: white; border-radius: 4px; border: 1px solid #dee2e6;">
                    <div style="font-weight: bold; color: #17a2b8; margin-bottom: 6px; font-size: 13px;">
                        <i class="fas fa-building" style="margin-right: 6px;"></i>Floor Range: ${data.floorRange}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
                        <div style="padding: 4px; background: #f8f9fa; border-radius: 3px;">
                            <strong style="color: #495057;">Resistance:</strong> 
                            <span style="color: #6c757d;">${data.resistance} cfs</span>
                        </div>
                        <div style="padding: 4px; background: #f8f9fa; border-radius: 3px;">
                            <strong style="color: #495057;">Deflection:</strong> 
                            <span style="color: #6c757d;">${data.deflection} cfs</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        dataHtml += `</div>`;
        
        cfssContent.innerHTML = dataHtml;
        
        // Update button text
        const btnText = document.getElementById('cfss-btn-text');
        if (btnText) {
            const floorCount = windData.length;
            const projectFieldCount = filledProjectFields.length;
            
            if (projectFieldCount > 0) {
                btnText.textContent = `CFSS Data (${floorCount} floors, ${projectFieldCount} specs)`;
            } else {
                btnText.textContent = `CFSS Data (${floorCount} floors)`;
            }
        }
    } else {
        cfssDisplay.style.display = 'none';
    }
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
            { id: 'minMetalThickness', value: firstEntry.minMetalThickness },
            { id: 'lisseInferieure', value: firstEntry.lisseInferieure },
            { id: 'lisseSuperieure', value: firstEntry.lisseSuperieure }
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
                        <span class="unit-label">cfs</span>
                    </div>
                </div>
                
                <div class="field-group deflection">
                    <label>Deflection:</label>
                    <div class="field-with-unit">
                        <input type="number" class="value-input" value="${data.deflection || ''}" step="0.1">
                        <span class="unit-label">cfs</span>
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

// Make functions globally available
window.logout = logout;
window.deleteEquipment = deleteEquipment;
window.toggleEquipmentDetails = toggleEquipmentDetails;
window.editEquipment = editEquipment;
window.saveEquipmentEdit = saveEquipmentEdit;
window.cancelEquipmentEdit = cancelEquipmentEdit;