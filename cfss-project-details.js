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

        // SORT WALLS BY NAME BEFORE RENDERING
        const sortedWalls = [...projectEquipment].sort((a, b) => {
            const nameA = (a.equipment || '').toLowerCase();
            const nameB = (b.equipment || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        sortedWalls.forEach((wall, index) => {
            // Find the original index in projectEquipment array for operations
            const originalIndex = projectEquipment.findIndex(w => 
                w.equipment === wall.equipment && 
                w.floor === wall.floor &&
                w.dateAdded === wall.dateAdded
            );
            
            // Format hauteur max display with unit
            const hauteurMaxDisplay = formatHauteurDisplay(wall);
            
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
                            <button class="duplicate-btn" onclick="event.stopPropagation(); duplicateEquipment(${originalIndex})" style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 5px;">
                                <i class="fas fa-copy"></i> Duplicate
                            </button>
                            <button class="delete-btn" onclick="event.stopPropagation(); deleteEquipment(${originalIndex})">Delete</button>
                        ` : ''}
                    </div>
                </div>

                <div class="equipment-details" id="equipmentDetails${originalIndex}">
                    <div id="equipmentView${originalIndex}">
                        <div class="equipment-details-container">
                            <div class="equipment-info-section">
                                <p><strong>Wall Name:</strong> ${wall.equipment}</p>
                                <p><strong>Floor:</strong> ${wall.floor || 'N/A'}</p>
                                <p><strong>Hauteur Max:</strong> ${hauteurMaxDisplay}</p>
                                <p><strong>Déflexion Max:</strong> ${wall.deflexionMax || 'N/A'}</p>
                                <p><strong>Montant Métallique:</strong> ${wall.montantMetallique || 'N/A'}</p>
                                <p><strong>Lisse Supérieure:</strong> ${wall.lisseSuperieure || 'N/A'}</p>
                                <p><strong>Lisse Inférieure:</strong> ${wall.lisseInferieure || 'N/A'}</p>
                                <p><strong>Entremise:</strong> ${wall.entremise || 'N/A'}</p>
                                <p><strong>Espacement:</strong> ${wall.espacement || 'N/A'}</p>
                                ${wall.note ? `<p><strong>Note:</strong> ${wall.note}</p>` : ''}
                                
                                <div style="margin-top: 15px;">
                                    <strong>Images:</strong>
                                    ${renderWallImages(wall, originalIndex)}
                                </div>
                                
                                ${canModifyProject() ? `
                                    <div style="margin-top: 15px;">
                                        <button class="edit-btn" onclick="editEquipment(${originalIndex})" style="background: #ffc107; color: #212529; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                            <i class="fas fa-edit"></i> Edit Wall
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div id="equipmentEdit${originalIndex}" style="display: none;">
                        <form id="equipmentEditForm${originalIndex}" onsubmit="saveEquipmentEdit(${originalIndex}, event)">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div>
                                    <label><strong>Wall Name:</strong></label>
                                    <input type="text" id="editEquipment${originalIndex}" value="${wall.equipment || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Floor:</strong></label>
                                    <input type="text" id="editFloor${originalIndex}" value="${wall.floor || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Hauteur Max:</strong></label>
                                    <div style="display: flex; gap: 8px; align-items: center;">
                                        <input type="number" id="editHauteurMax${originalIndex}" value="${wall.hauteurMax || ''}" placeholder="Main" style="flex: 1; padding: 5px;">
                                        <select id="editHauteurMaxUnit${originalIndex}" style="flex: 1; padding: 5px;">
                                            <option value="">Unit</option>
                                            <option value="ft" ${wall.hauteurMaxUnit === 'ft' ? 'selected' : ''}>ft</option>
                                            <option value="m" ${wall.hauteurMaxUnit === 'm' ? 'selected' : ''}>m</option>
                                        </select>
                                        <input type="number" id="editHauteurMaxMinor${originalIndex}" value="${wall.hauteurMaxMinor || ''}" placeholder="Minor" style="flex: 1; padding: 5px;">
                                        <select id="editHauteurMaxMinorUnit${originalIndex}" style="flex: 1; padding: 5px;">
                                            <option value="">Unit</option>
                                            <option value="in" ${wall.hauteurMaxMinorUnit === 'in' ? 'selected' : ''}>in</option>
                                            <option value="mm" ${wall.hauteurMaxMinorUnit === 'mm' ? 'selected' : ''}>mm</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label><strong>Déflexion Max:</strong></label>
                                    <select id="editDeflexionMax${originalIndex}" style="width: 100%; padding: 5px;">
                                        <option value="L/360" ${wall.deflexionMax === 'L/360' ? 'selected' : ''}>L/360</option>
                                        <option value="L/480" ${wall.deflexionMax === 'L/480' ? 'selected' : ''}>L/480</option>
                                        <option value="L/600" ${wall.deflexionMax === 'L/600' ? 'selected' : ''}>L/600</option>
                                        <option value="L/720" ${wall.deflexionMax === 'L/720' ? 'selected' : ''}>L/720</option>
                                    </select>
                                </div>
                                <div>
                                    <label><strong>Montant Métallique:</strong></label>
                                    <input type="text" id="editMontantMetallique${originalIndex}" value="${wall.montantMetallique || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Lisse Supérieure:</strong></label>
                                    <input type="text" id="editLisseSuperieure${originalIndex}" value="${wall.lisseSuperieure || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Lisse Inférieure:</strong></label>
                                    <input type="text" id="editLisseInferieure${originalIndex}" value="${wall.lisseInferieure || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Entremise:</strong></label>
                                    <input type="text" id="editEntremise${originalIndex}" value="${wall.entremise || ''}" style="width: 100%; padding: 5px;">
                                </div>
                                <div>
                                    <label><strong>Espacement:</strong></label>
                                    <select id="editEspacement${originalIndex}" style="width: 100%; padding: 5px;">
                                        <option value="">Select espacement...</option>
                                        <option value="8&quot;c/c" ${wall.espacement === '8"c/c' ? 'selected' : ''}>8"c/c</option>
                                        <option value="12&quot;c/c" ${wall.espacement === '12"c/c' ? 'selected' : ''}>12"c/c</option>
                                        <option value="16&quot;c/c" ${wall.espacement === '16"c/c' ? 'selected' : ''}>16"c/c</option>
                                        <option value="24&quot;c/c" ${wall.espacement === '24"c/c' ? 'selected' : ''}>24"c/c</option>
                                    </select>
                                </div>
                                <div>
                                <label><strong>Note:</strong></label>
                                <input type="text" id="editNote${originalIndex}" value="${wall.note || ''}" maxlength="100" placeholder="Optional note (max 100 characters)" style="width: 100%; padding: 5px;">
                                <div style="font-size: 11px; color: #666; margin-top: 2px;">Maximum 100 characters</div>
                            </div>
                            </div>
                            
                            <!-- Image Upload Section for Edit Mode -->
                            <div style="margin: 15px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
                                <label style="display: block; margin-bottom: 10px; font-weight: bold;">Wall Images:</label>
                                
                                <!-- Image Upload Controls -->
                                <!-- Image Upload Controls -->
                            <div class="edit-upload-controls" style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
                                <button type="button" class="edit-camera-btn" onclick="triggerEditImageUpload(${originalIndex})" 
                                        style="background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                    <i class="fas fa-camera"></i> Add Images
                                </button>
                                
                                <input type="text" class="edit-drop-zone" id="editDropZone${originalIndex}" 
                                    placeholder="Drop or paste images here (Ctrl+V)" 
                                    readonly
                                    tabindex="0"
                                    style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: text;">
                                
                                <input type="file" id="editImageFileInput${originalIndex}" multiple accept="image/*" style="display: none;">
                            </div>
                                
                                <!-- Image Preview Container -->
                                <div class="edit-image-preview-container" id="editImagePreviewContainer${originalIndex}" 
                                    style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 40px; padding: 10px; border: 2px dashed #ccc; border-radius: 4px; background: white;">
                                    <!-- Images will be populated here -->
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 10px; margin-top: 15px;">
                                <button type="submit" style="background: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-save"></i> Save Changes
                                </button>
                                <button type="button" onclick="cancelEquipmentEdit(${originalIndex})" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            
            equipmentListDiv.appendChild(wallCard);

            setTimeout(() => {
                const editMajorUnit = document.getElementById(`editHauteurMaxUnit${originalIndex}`);
                const editMinorUnit = document.getElementById(`editHauteurMaxMinorUnit${originalIndex}`);
                
                if (editMajorUnit && editMinorUnit) {
                    editMajorUnit.addEventListener('change', function() {
                        const majorUnit = this.value;
                        
                        // Auto-pair ft with in, m with mm
                        if (majorUnit === 'ft') {
                            editMinorUnit.value = 'in';
                        } else if (majorUnit === 'm') {
                            editMinorUnit.value = 'mm';
                        }
                    });
                }
            }, 100);

            // Add click event to entire card for toggling details
            wallCard.addEventListener('click', (e) => {
                if (e.target.closest('.equipment-actions-compact') || 
                    e.target.closest('.equipment-details')) {
                    return;
                }
                toggleEquipmentDetails(originalIndex);
            });
        });
        
    } catch (error) {
        console.error('Error in renderEquipmentList():', error);
    }
}

function duplicateEquipment(index) {
    if (!canModifyProject()) {
        alert('You do not have permission to add walls to this project.');
        return;
    }

    const wallToDuplicate = projectEquipment[index];
    
    // Clear any existing form data and images
    clearWallForm();
    currentWallImages = [];
    
    // Populate form with wall data (except images)
    document.getElementById('equipment').value = wallToDuplicate.equipment;
    document.getElementById('floor').value = wallToDuplicate.floor || '';
    document.getElementById('hauteurMax').value = wallToDuplicate.hauteurMax || '';
    document.getElementById('hauteurMaxUnit').value = wallToDuplicate.hauteurMaxUnit || '';
    document.getElementById('deflexionMax').value = wallToDuplicate.deflexionMax || '';
    document.getElementById('montantMetallique').value = wallToDuplicate.montantMetallique || '';
    document.getElementById('lisseSuperieure').value = wallToDuplicate.lisseSuperieure || '';
    document.getElementById('lisseInferieure').value = wallToDuplicate.lisseInferieure || '';
    document.getElementById('entremise').value = wallToDuplicate.entremise || '';
    document.getElementById('note').value = wallToDuplicate.note || '';
    
    // Show the form
    const equipmentForm = document.getElementById('equipmentForm');
    const newCalcButton = document.getElementById('newCalculationButton');
    
    if (equipmentForm && newCalcButton) {
        equipmentForm.classList.add('show');
        newCalcButton.textContent = 'Hide Form';
        
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
                floorField.select(); // Select the text so user can easily change it
            }
        }, 100);

    }
    
    console.log(`Duplicated wall: ${wallToDuplicate.equipment}`);
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
    
    // Setup image upload handlers for this edit form (with slight delay to ensure DOM is ready)
    setTimeout(() => {
        setupEditImageHandlers(index);
        
        // Load existing images into edit mode
        loadExistingImagesInEdit(wall, index);
        
        console.log(`Edit mode setup complete for wall ${index}`);
    }, 100);
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
            hauteurMaxUnit: document.getElementById(`editHauteurMaxUnit${index}`).value,
            hauteurMaxMinor: document.getElementById(`editHauteurMaxMinor${index}`).value,
            hauteurMaxMinorUnit: document.getElementById(`editHauteurMaxMinorUnit${index}`).value,
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

        if (updatedWall.hauteurMax && !updatedWall.hauteurMaxUnit) {
            alert('Please select a unit for the main height value.');
            return;
        }

        if (updatedWall.hauteurMaxMinor && !updatedWall.hauteurMaxMinorUnit) {
            alert('Please select a unit for the minor height value.');
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
        
        // Check if we have existing CFSS data and populate form
        if (cfssWindData && cfssWindData.length > 0) {
            populateCFSSForm(cfssWindData);
            btnText.textContent = 'Hide CFSS Data';
        } else {
            btnText.textContent = 'Hide CFSS Data';
        }
    } else {
        form.classList.add('hidden');
        btn.classList.remove('expanded');
        
        // Update button text based on whether data exists
        updateCFSSButtonText();
    }
}

function updateCFSSButtonText() {
    const btnText = document.getElementById('cfss-btn-text');
    if (!btnText) return;
    
    if (cfssWindData && cfssWindData.length > 0) {
        const floorCount = cfssWindData.length;
        
        // Count filled specifications
        const projectData = cfssWindData[0] || {};
        const specifications = [
            projectData.maxDeflection,
            projectData.maxSpacing,
            projectData.framingAssembly,
            projectData.concreteAnchor,
            projectData.steelAnchor,
            projectData.minMetalThickness,
            projectData.lisseInferieure,
            projectData.lisseSuperieure
        ];
        const filledSpecs = specifications.filter(spec => spec && spec.trim() !== '').length;
        
        if (filledSpecs > 0) {
            btnText.textContent = `Edit CFSS Data (${floorCount} floors, ${filledSpecs} specs)`;
        } else {
            btnText.textContent = `Edit CFSS Data (${floorCount} floors)`;
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
                    <span class="cfss-values">Resistance: ${item.resistance} psf, Deflection: ${item.deflection} psf</span>
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
        const lisseInferieure = document.getElementById('cfssLisseInferieure')?.value.trim() || '';
        const lisseSuperieure = document.getElementById('cfssLisseSuperieure')?.value.trim() || '';
        
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
        
        // Update the display with simplified version
        updateCFSSDataDisplay(newCfssData);
        
        // Update button text to reflect new data
        updateCFSSButtonText();
        
        alert('CFSS data saved successfully!');
        
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
    
    if (project.cfssWindData && project.cfssWindData.length > 0) {
        cfssWindData = project.cfssWindData;
        
        // Update the display with simplified version
        updateCFSSDataDisplay(project.cfssWindData);
        
        // Update button text to show "Edit" instead of "Add"
        updateCFSSButtonText();
        
        console.log('CFSS data loaded:', project.cfssWindData);
    } else {
        // Hide the display section if no data
        if (cfssDisplay) {
            cfssDisplay.style.display = 'none';
        }
        
        // Reset global variable
        cfssWindData = [];
        
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
        { label: 'Steel Anchor', value: projectData.steelAnchor },
        { label: 'Min Metal Framing Thickness', value: projectData.minMetalThickness },
        { label: 'Lisse Inférieure', value: projectData.lisseInferieure },
        { label: 'Lisse Supérieure', value: projectData.lisseSuperieure }
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
            { id: 'minMetalThickness', value: firstEntry.minMetalThickness },
            { id: 'cfssLisseInferieure', value: firstEntry.lisseInferieure },
            { id: 'cfssLisseSuperieure', value: firstEntry.lisseSuperieure }
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
    
    if (!cameraBtn || !dropZone || !fileInput) {
        console.error('Image upload elements not found');
        return;
    }
    
    // Camera button click - opens file dialog
    cameraBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drop zone - ONLY handle paste, drag/drop, and focus
    // Remove the click handler that was triggering file upload
    dropZone.addEventListener('paste', handlePaste);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    
    // Add focus behavior for better UX
    dropZone.addEventListener('focus', () => {
        dropZone.style.borderColor = '#007bff';
        dropZone.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.25)';
    });
    
    dropZone.addEventListener('blur', () => {
        dropZone.style.borderColor = '#ccc';
        dropZone.style.boxShadow = 'none';
    });
}

// Array to store current wall images
let currentWallImages = [];

function initializeImageUpload() {
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
    
    for (const file of validFiles) {
        try {
            // Upload to S3 and get URL
            const imageData = await uploadImageToS3(file);
            
            // Add to current images array
            currentWallImages.push(imageData);
            
            // Show preview
            addImagePreview(imageData);
            
        } catch (error) {
            console.error('Error uploading image:', error);
            alert(`Error uploading ${file.name}: ${error.message}`);
        }
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

function addImagePreview(imageData) {
    const container = document.getElementById('imagePreviewContainer');
    
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename}">
        <button class="image-remove" onclick="removeImage('${imageData.key}')" title="Remove image">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(preview);
    
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
    // Remove from current images array
    currentWallImages = currentWallImages.filter(img => img.key !== imageKey);
    
    // Remove preview element
    const container = document.getElementById('imagePreviewContainer');
    const previews = container.querySelectorAll('.image-preview');
    previews.forEach(preview => {
        const removeBtn = preview.querySelector('.image-remove');
        if (removeBtn && removeBtn.getAttribute('onclick').includes(imageKey)) {
            preview.remove();
        }
    });
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
    
    // If there's a major value, always show both with dash (even if minor is 0)
    return `${major} ${majorUnit} - ${minor} ${minorUnit}`;
}

function getWallFormDataWithImages() {
    console.log('=== DEBUG: Starting form validation with structured hauteur max ===');
    
    // Get elements (keeping existing names + new ones)
    const equipmentEl = document.getElementById('equipment');
    const floorEl = document.getElementById('floor');
    const hauteurMaxEl = document.getElementById('hauteurMax');
    const hauteurMaxUnitEl = document.getElementById('hauteurMaxUnit');
    const hauteurMaxMinorEl = document.getElementById('hauteurMaxMinor'); // NEW
    const hauteurMaxMinorUnitEl = document.getElementById('hauteurMaxMinorUnit'); // NEW
    const deflexionMaxEl = document.getElementById('deflexionMax');
    const montantMetalliqueEl = document.getElementById('montantMetallique');
    const lisseSuperieureEl = document.getElementById('lisseSuperieure');
    const lisseInferieureEl = document.getElementById('lisseInferieure');
    const entremiseEl = document.getElementById('entremise');
    const espacementEl = document.getElementById('espacement');
    const noteEl = document.getElementById('note'); 

    // Get values
    const equipment = equipmentEl ? equipmentEl.value.trim() : '';
    const floor = floorEl ? floorEl.value.trim() : '';
    const hauteurMax = hauteurMaxEl ? hauteurMaxEl.value.trim() : '';
    const hauteurMaxUnit = hauteurMaxUnitEl ? hauteurMaxUnitEl.value.trim() : '';
    const hauteurMaxMinor = hauteurMaxMinorEl ? hauteurMaxMinorEl.value.trim() : ''; // NEW
    const hauteurMaxMinorUnit = hauteurMaxMinorUnitEl ? hauteurMaxMinorUnitEl.value.trim() : ''; // NEW
    const deflexionMax = deflexionMaxEl ? deflexionMaxEl.value.trim() : '';
    const montantMetallique = montantMetalliqueEl ? montantMetalliqueEl.value.trim() : '';
    const lisseSuperieure = lisseSuperieureEl ? lisseSuperieureEl.value.trim() : '';
    const lisseInferieure = lisseInferieureEl ? lisseInferieureEl.value.trim() : '';
    const entremise = entremiseEl ? entremiseEl.value.trim() : '';
    const espacement = espacementEl ? espacementEl.value.trim() : '';
    const note = noteEl ? noteEl.value.trim() : '';

    // Validation
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

    if (hauteurMax && !hauteurMaxUnit) {
        alert('Please select a unit for the main height value.');
        return null;
    }

    if (hauteurMaxMinor && !hauteurMaxMinorUnit) {
        alert('Please select a unit for the minor height value.');
        return null;
    }

    // Rest of validation remains the same...
    if (!deflexionMax) {
        alert('Please select a déflexion max.');
        return null;
    }

    if (!montantMetallique) {
        alert('Please select montant métallique.');
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
        alert('Please select entremise.');
        return null;
    }

    if (!espacement) {
        alert('Please select an espacement.');
        return null;
    }

    const wallData = {
        equipment: equipment,
        floor: floor,
        hauteurMax: hauteurMax || '0',
        hauteurMaxUnit: hauteurMaxUnit,
        hauteurMaxMinor: hauteurMaxMinor || '0',
        hauteurMaxMinorUnit: hauteurMaxMinorUnit,
        deflexionMax: deflexionMax,
        montantMetallique: montantMetallique,
        lisseSuperieure: lisseSuperieure,
        lisseInferieure: lisseInferieure,
        entremise: entremise,
        espacement: espacement,
        note: note,
        images: [...(window.currentWallImages || [])], // Keep this reference
        dateAdded: new Date().toISOString(),
        addedBy: window.currentUser?.email || 'unknown'
    };

    console.log('Final wall data with images:', wallData);
    console.log('Current images count:', window.currentWallImages?.length || 0);
    return wallData;
}

// Update clearWallForm to also clear images
function clearWallFormWithImages() {
    const form = document.getElementById('equipmentFormElement');
    if (form) {
        form.reset();
    }
    
    // Clear images - use global reference
    window.currentWallImages = [];
    currentWallImages = window.currentWallImages;
    
    const previewContainer = document.getElementById('imagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
    }
    
    console.log('Wall form and images cleared');
}

// Update the wall rendering to show images
function renderWallImages(wall, index) {
    if (!wall.images || wall.images.length === 0) {
        return '<p style="color: #666; font-style: italic;">No images</p>';
    }
    
    console.log(`Rendering ${wall.images.length} images for wall ${wall.equipment}`);
    
    let imagesHTML = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">';
    
    wall.images.forEach((image, imgIndex) => {
        const imageId = `wall-image-${index}-${imgIndex}`;
        imagesHTML += `
            <div style="position: relative; width: 80px; height: 80px; border-radius: 4px; overflow: hidden; border: 1px solid #ddd;">
                <img id="${imageId}"
                    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" 
                    alt="${image.filename || 'Wall image'}" 
                    style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                    onclick="openImageModal('${image.key}', '${image.filename || 'Wall image'}')"
                    data-image-key="${image.key}">
            </div>
        `;
    });
    
    imagesHTML += '</div>';
    
    // Load images after DOM is updated
    setTimeout(() => {
        wall.images.forEach((image, imgIndex) => {
            const imageId = `wall-image-${index}-${imgIndex}`;
            const imgElement = document.getElementById(imageId);
            if (imgElement && image.key) {
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
    // Setup hauteur max preview
    setupHauteurMaxPreview();
});

function setupHauteurMaxPreview() {
    const majorInput = document.getElementById('hauteurMax');
    const majorUnitSelect = document.getElementById('hauteurMaxUnit');
    const minorInput = document.getElementById('hauteurMaxMinor');
    const minorUnitSelect = document.getElementById('hauteurMaxMinorUnit');
    const preview = document.getElementById('hauteurPreview');
    
    if (!majorInput || !majorUnitSelect || !minorInput || !minorUnitSelect || !preview) {
        return;
    }
    
    function updatePreview() {
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
        
        // Auto-pair ft with in, m with mm
        if (majorUnit === 'ft') {
            minorUnitSelect.value = 'in';
        } else if (majorUnit === 'm') {
            minorUnitSelect.value = 'mm';
        }
        
        updatePreview();
    });
    
    // When minor unit changes, don't affect major
    minorUnitSelect.addEventListener('change', updatePreview);
    
    // Add event listeners for input changes
    majorInput.addEventListener('input', updatePreview);
    minorInput.addEventListener('input', updatePreview);
    
    // Initial preview
    updatePreview();
}

// Helper function for preview formatting
function formatPreviewDisplay(major, majorUnit, minor, minorUnit) {
    if ((major === '0' || major === '') && (minor === '0' || minor === '')) {
        return 'N/A';
    }
    
    if (major === '0' || major === '') {
        return `${minor} ${minorUnit}`;
    }
    
    return `${major} ${majorUnit} - ${minor} ${minorUnit}`;
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
            cfssWindData: cfssWindData
        };
        
        console.log('📊 CFSS Project data being sent:', {
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

        console.log('✅ Opening CFSS download URL:', result.downloadUrl);
        window.location.href = result.downloadUrl;
        
        console.log('✅ CFSS PDF download completed successfully');
        
    } catch (error) {
        console.error('❌ CFSS PDF generation error:', error);
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

// Setup function for CFSS Report button
function setupCFSSReportButton() {
    const generateButton = document.getElementById('generateCFSSReportButton');
    if (generateButton) {
        generateButton.addEventListener('click', generateCFSSProjectReport);
        console.log('✅ CFSS Report button setup completed');
    } else {
        console.warn('⚠️ CFSS Report button not found');
    }
}

// Add these functions to cfss-project-details.js

// Global variable to track edit mode images
let editModeImages = {};

// Function to trigger image upload for edit mode
function triggerEditImageUpload(wallIndex) {
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
    
    // Reset placeholder
    if (dropZone) {
        dropZone.placeholder = 'Drop, paste, or browse images';
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
        <button class="edit-image-remove" 
                onclick="removeEditImage('${imageData.key}', ${wallIndex})" 
                title="Remove image"
                style="position: absolute; top: 2px; right: 2px; background: rgba(255,0,0,0.8); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            ×
        </button>
    `;
    
    container.appendChild(preview);
    
    // Load the actual image
    const imgElement = preview.querySelector('img');
    loadImagePreview(imgElement, imageData.key);
}

// Remove image in edit mode
function removeEditImage(imageKey, wallIndex) {
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