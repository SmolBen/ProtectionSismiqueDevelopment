// CFSS Project Details Page JavaScript
let currentProjectId = null;
let projectEquipment = []; // For CFSS, this will store walls
let currentUser = null;
let isAdmin = false;
let projectData = null;
let cfssWindData = []; // Store wind data
let projectRevisions = [];
let currentRevisionId = null;

let sortableInstance = null;

// Available CFSS options in logical order
const CFSS_OPTIONS = [
    // Page S-2: Lisse trouée options
    'fixe-beton-lisse-trouee',
    'fixe-structure-dacier-lisse-trouee', 
    'fixe-tabiler-metallique-lisse-trouee',
    'fixe-bois-lisse-trouee',
    'detail-lisse-trouee',
    'detail-entremise',
    
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
    console.log('💾 Saving wall display order...', newOrder);
    
    try {
        // Update current revision with new display order
        const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
        if (currentRevision) {
            currentRevision.displayOrder = newOrder;
            currentRevision.lastModified = new Date().toISOString();
            currentRevision.lastModifiedBy = currentUser?.email || 'unknown';
            
            // Save to database
            await saveRevisionsToDatabase();
            console.log('✅ Wall display order saved successfully');
        } else {
            console.warn('⚠️ No current revision found to save display order');
        }
    } catch (error) {
        console.error('❌ Error saving wall display order:', error);
    }
}

// Initialize revision system when project loads
function initializeRevisionSystem(project) {
    console.log('🔄 Initializing revision system...');
    
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
    console.log(`✅ Revision system initialized with ${projectRevisions.length} revisions`);
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
                        <strong>This will create:</strong> Revision 1
                    </div>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button onclick="closeRevisionModal()" 
                            style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                        Cancel
                    </button>
                    <button onclick="processRevisionChoice()" 
                            style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                        Create Revision 1
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
    console.log('📄 Creating first revision with description:', description);
    
    try {
        const firstRevision = {
            id: `rev_${Date.now()}`,
            number: 1,
            description: description || '',
            createdAt: new Date().toISOString(),
            createdBy: currentUser?.email || 'unknown',
            walls: [...projectEquipment] // Current walls state
        };
        
        projectRevisions.push(firstRevision);
        currentRevisionId = firstRevision.id;
        
        console.log('📄 Saving first revision to database...', {
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
        
        console.log('✅ First revision created successfully');
        
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
async function generateCFSSReportForRevisionWithOptions(selectedRevision, selectedOptions) {
    if (!currentProjectId) {
        alert('Error: No project selected');
        return;
    }

    try {
        // Get all revisions up to and including the selected revision
        const revisionsUpToSelected = projectRevisions
            .filter(rev => rev.number <= selectedRevision.number)
            .sort((a, b) => a.number - b.number);
        
        // Prepare CFSS project data with selected revision and options
        const cfssProjectData = {
            ...projectData,
            walls: [...selectedRevision.walls],
            wallRevisions: [...revisionsUpToSelected],
            currentWallRevisionId: selectedRevision.id,
            selectedRevisionNumber: selectedRevision.number,
            cfssWindData: cfssWindData,
            selectedOptions: selectedOptions // NEW: Include selected options
        };
        
        console.log('CFSS Report data with options:', {
            name: cfssProjectData.name,
            selectedRevision: selectedRevision.number,
            wallsCount: cfssProjectData.walls?.length || 0,
            revisionsIncluded: revisionsUpToSelected.map(r => `Rev ${r.number}`).join(', '),
            windDataCount: cfssProjectData.cfssWindData?.length || 0,
            selectedOptionsCount: selectedOptions.length
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

        console.log(`Opening CFSS download URL for Revision ${selectedRevision.number} with ${selectedOptions.length} options:`, result.downloadUrl);
        window.location.href = result.downloadUrl;
        
    } catch (error) {
        console.error('CFSS PDF generation error with options:', error);
        if (error.name === 'AbortError' || error.message.includes('504')) {
            alert('CFSS PDF generation timed out. Please try again in a few minutes.');
        } else {
            alert('Error generating CFSS report: ' + error.message);
        }
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
        
        console.log('📊 Report data for revision', selectedRevision.number, ':', {
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

        console.log(`✅ Opening CFSS download URL for Revision ${selectedRevision.number}:`, result.downloadUrl);
        window.location.href = result.downloadUrl;
        
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

// Create new revision
async function createNewRevision(description, callback) {
    console.log('📝 Creating new revision with description:', description);
    
    const newRevisionNumber = projectRevisions.length + 1;
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
    
    console.log(`✅ Created revision ${newRevisionNumber}: ${description || '(no description)'}`);
    
    if (callback) callback();
}

// Update current revision
async function updateCurrentRevision(callback) {
    console.log('📝 Updating current revision');
    
    const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
    if (currentRevision) {
        currentRevision.walls = [...projectEquipment];
        currentRevision.lastModified = new Date().toISOString();
        currentRevision.lastModifiedBy = currentUser?.email || 'unknown';
        
        await saveRevisionsToDatabase();
        console.log(`✅ Updated revision ${currentRevision.number}`);
    }
    
    if (callback) callback();
}

async function saveRevisionsToDatabase() {
    try {
        console.log('💾 Saving revisions to database...', {
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
        
        console.log('📤 Sending revision data:', {
            revisionsCount: projectRevisions.length,
            currentRevisionId: currentRevisionId,
            wallsInCurrentRevision: currentRevision?.walls?.length || 0
        });
        
        const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${currentProjectId}/wall-revisions`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });
        
        console.log('📥 Server response:', {
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
                console.error('❌ Server error details:', errorData);
            } catch (parseError) {
                try {
                    const errorText = await response.text();
                    console.error('❌ Server error text:', errorText);
                    if (errorText) {
                        errorMessage += ` - ${errorText}`;
                    }
                } catch (textError) {
                    console.error('❌ Could not parse error response:', parseError);
                }
            }
            throw new Error(errorMessage);
        }
        
        // Try to parse success response
        let responseData;
        try {
            responseData = await response.json();
            console.log('✅ Save response data:', responseData);
        } catch (parseError) {
            console.warn('⚠️ Could not parse success response as JSON, but save appears successful');
        }
        
        console.log('✅ Revisions saved successfully to database');
        return true;
        
    } catch (error) {
        console.error('❌ Error saving revisions:', error);
        
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
        console.log('🔄 Manually reloading project data...');
        
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
            
            console.log('📊 Reloaded project data:', {
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
            if (project.cfssWindData && project.cfssWindData.length > 0) {
                cfssWindData = project.cfssWindData;
                updateCFSSDataDisplay(project.cfssWindData);
            }
            
            console.log('✅ Project data reloaded successfully');
            alert('Project data reloaded successfully');
        }
        
    } catch (error) {
        console.error('❌ Error reloading project data:', error);
        alert('Error reloading project data: ' + error.message);
    }
}

// Function to force save current state
async function forceSaveCurrentState() {
    try {
        console.log('💾 Force saving current state...');
        
        // Save both revisions and equipment
        const revisionSaveResult = await saveRevisionsToDatabase();
        const equipmentSaveResult = await saveEquipmentToProject({ silent: true });
        
        if (revisionSaveResult && equipmentSaveResult !== false) {
            console.log('✅ Force save completed successfully');
            alert('Current state saved successfully');
        } else {
            throw new Error('One or more save operations failed');
        }
        
    } catch (error) {
        console.error('❌ Error force saving:', error);
        alert('Error saving current state: ' + error.message);
    }
}

async function handleSaveEquipmentWithRevisions(e) {
    if (!canModifyProject()) {
        alert('You do not have permission to add walls to this project.');
        return;
    }
    
    console.log('💾 Save button clicked for CFSS wall with revisions!');
    
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
            console.log('📄 First wall - showing revision popup for Revision 1');
            
            // Show revision popup for first wall
            showRevisionPopup('add', wallData.equipment, async () => {
                console.log('📄 Creating first revision...');
                
                // This will be handled by processRevisionChoice
                // No additional logic needed here since the callback handles success
            }, true); // Pass true to indicate this is the first revision
            
        } else {
            // Show revision popup for subsequent saves
            showRevisionPopup('add', wallData.equipment, async () => {
                console.log('📄 Saving wall to existing revision system...');
                
                // SINGLE SAVE OPERATION - revisions only
                const saveResult = await saveRevisionsToDatabase();
                if (saveResult === false) {
                    // Save failed, revert changes
                    projectEquipment.pop();
                    alert('Failed to save wall. Please try again.');
                    return;
                }
                
                console.log('✅ Wall saved to revision successfully');
                
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
        
        // Get updated wall data (existing validation code)
        const updatedWall = {
            ...currentWall,
            equipment: document.getElementById(`editEquipment${index}`).value,
            floor: document.getElementById(`editFloor${index}`).value,
            // ... other fields same as before
            lastModified: new Date().toISOString(),
            modifiedBy: currentUser?.email || 'unknown'
        };

        // Validation (existing code)
        if (!updatedWall.equipment) {
            alert('Please enter a wall name.');
            return;
        }
        // ... rest of validation

        // Show revision popup
        showRevisionPopup('edit', wallName, async () => {
            // Handle images
            const editImages = getEditModeImages(index);
            updatedWall.images = editImages;
            
            // Update the project equipment array
            projectEquipment[index] = updatedWall;
            
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
        newCalcButton.textContent = 'Add Wall';
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

        const listHeader = document.createElement('div');
        listHeader.className = 'equipment-list-header';
        listHeader.textContent = `Walls (${projectEquipment.length})`;
        equipmentListDiv.appendChild(listHeader);

        if (projectEquipment.length === 0) {
            equipmentListDiv.innerHTML += '<p>No walls added yet.</p>';
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
            console.log('📋 Using custom display order:', displayOrder);
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
            console.log('📋 Using alphabetical order (default)');
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
        });
        
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
    return `
        <div id="equipmentView${originalIndex}">
            <div class="equipment-details-container">
                <div class="equipment-info-section">
                    <p><strong>Wall Name:</strong> ${wall.equipment}</p>
                    <p><strong>Floor:</strong> ${wall.floor || 'N/A'}</p>
                    <p><strong>Hauteur Max:</strong> ${formatHauteurDisplay(wall)}</p>
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
        
        ${generateEditForm(wall, originalIndex)}
    `;
}

// Add this function to generate the edit form
function generateEditForm(wall, originalIndex) {
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
                        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
                            <input type="number" id="editHauteurMax${originalIndex}" 
                                   value="${wall.hauteurMax || ''}" min="0" step="1"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;"
                                   placeholder="Main height">
                            <select id="editHauteurMaxUnit${originalIndex}" 
                                    style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                <option value="ft" ${wall.hauteurMaxUnit === 'ft' ? 'selected' : ''}>ft</option>
                                <option value="m" ${wall.hauteurMaxUnit === 'm' ? 'selected' : ''}>m</option>
                            </select>
                            <input type="number" id="editHauteurMaxMinor${originalIndex}" 
                                   value="${wall.hauteurMaxMinor || ''}" min="0" step="1"
                                   style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;"
                                   placeholder="Minor height">
                            <select id="editHauteurMaxMinorUnit${originalIndex}"
                                    style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                <option value="in" ${wall.hauteurMaxMinorUnit === 'in' ? 'selected' : ''}>in</option>
                                <option value="mm" ${wall.hauteurMaxMinorUnit === 'mm' ? 'selected' : ''}>mm</option>
                            </select>
                        </div>
                        <div id="editHauteurPreview${originalIndex}" style="font-size: 12px; color: #666; font-style: italic;">
                            Preview: ${formatHauteurDisplay(wall)}
                        </div>
                    </div>

                    <!-- Déflexion Max -->
                    <div class="form-group">
                        <label for="editDeflexionMax${originalIndex}"><strong>Déflexion Max:</strong></label>
                        <select id="editDeflexionMax${originalIndex}" required 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                            <option value="">Select déflexion max...</option>
                            <option value="L/360" ${wall.deflexionMax === 'L/360' ? 'selected' : ''}>L/360</option>
                            <option value="L/480" ${wall.deflexionMax === 'L/480' ? 'selected' : ''}>L/480</option>
                            <option value="L/600" ${wall.deflexionMax === 'L/600' ? 'selected' : ''}>L/600</option>
                            <option value="L/720" ${wall.deflexionMax === 'L/720' ? 'selected' : ''}>L/720</option>
                        </select>
                    </div>

                    <!-- Montant Métallique -->
                    <div class="form-group">
                        <label for="editMontantMetallique${originalIndex}"><strong>Montant Métallique:</strong></label>
                        <select id="editMontantMetallique${originalIndex}" required 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                            <option value="">Select montant métallique...</option>
                            ${generateMontantOptions(wall.montantMetallique)}
                        </select>
                    </div>
                </div>

                <!-- Right Column -->
                <div>
                    <!-- Lisse Supérieure -->
                    <div class="form-group">
                        <label for="editLisseSuperieure${originalIndex}"><strong>Lisse Supérieure:</strong></label>
                        <input type="text" id="editLisseSuperieure${originalIndex}" value="${wall.lisseSuperieure || ''}" 
                               required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                    </div>

                    <!-- Lisse Inférieure -->
                    <div class="form-group">
                        <label for="editLisseInferieure${originalIndex}"><strong>Lisse Inférieure:</strong></label>
                        <input type="text" id="editLisseInferieure${originalIndex}" value="${wall.lisseInferieure || ''}" 
                               required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                    </div>

                    <!-- Espacement -->
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

                    <!-- Entremise -->
                    <div class="form-group">
                        <label for="editEntremise${originalIndex}"><strong>Entremise:</strong></label>
                        <select id="editEntremise${originalIndex}" required 
                                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                            <option value="">Select entremise...</option>
                            <option value="150U75-43" ${wall.entremise === '150U75-43' ? 'selected' : ''}>150U75-43</option>
                            <option value="N/A" ${wall.entremise === 'N/A' ? 'selected' : ''}>N/A</option>
                        </select>
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
            </div>

            <!-- Image Upload Section for Edit Mode -->
            <div class="edit-image-section" style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0; color: #333; font-size: 16px;">Wall Images</h4>
                    <button type="button" class="camera-btn" onclick="triggerEditImageUpload(${originalIndex}, event)"
                            style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-camera"></i> Add Images
                    </button>
                </div>
                
                <input 
                    class="drop-zone" 
                    id="editDropZone${originalIndex}"
                    placeholder="Drop, paste, or browse images (Ctrl+V to paste)"
                    readonly
                    tabindex="0"
                    style="width: 100%; height: 60px; border: 2px dashed #ccc; border-radius: 4px; background: white; 
                           text-align: center; padding: 20px; cursor: pointer; font-size: 13px; color: #666;
                           box-sizing: border-box; outline: none;">
                
                <div class="edit-image-preview-container" id="editImagePreviewContainer${originalIndex}" 
                     style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 10px; margin-top: 15px;">
                    <!-- Image previews will be populated here -->
                </div>
                
                <input type="file" id="editImageFileInput${originalIndex}" multiple accept="image/*" style="display: none;">
            </div>

            <!-- Form Actions -->
            <div style="display: flex; gap: 15px; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                <button type="submit" 
                        style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button type="button" onclick="cancelEquipmentEdit(${originalIndex})" 
                        style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-times"></i> Cancel
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
            console.log('🎯 Started dragging wall:', evt.item.querySelector('h4').textContent);
        },
        
        onEnd: async function(evt) {
            console.log('✋ Dropped wall at new position');
            
            // Get the new order of wall IDs
            const newOrder = Array.from(container.children).map(card => 
                card.getAttribute('data-wall-id')
            );
            
            console.log('📋 New wall order:', newOrder);
            
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
    
    console.log('✅ SortableJS initialized for wall cards');
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
    // FIX: Add the missing minor height values
    document.getElementById('hauteurMaxMinor').value = wallToDuplicate.hauteurMaxMinor || '';
    document.getElementById('hauteurMaxMinorUnit').value = wallToDuplicate.hauteurMaxMinorUnit || '';
    document.getElementById('deflexionMax').value = wallToDuplicate.deflexionMax || '';
    document.getElementById('montantMetallique').value = wallToDuplicate.montantMetallique || '';
    document.getElementById('lisseSuperieure').value = wallToDuplicate.lisseSuperieure || '';
    document.getElementById('lisseInferieure').value = wallToDuplicate.lisseInferieure || '';
    document.getElementById('entremise').value = wallToDuplicate.entremise || '';
    // FIX: Add the missing espacement value
    document.getElementById('espacement').value = wallToDuplicate.espacement || '';
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

    if (!montantSelect || !lisseSuperieureInput || !lisseInferieureInput) {
        return;
    }

    montantSelect.addEventListener('change', function() {
        const selectedMontant = this.value;
        
        if (selectedMontant && window.colombageData && window.colombageData[selectedMontant]) {
            const data = window.colombageData[selectedMontant];
            
            // Auto-fill the lisse fields
            lisseSuperieureInput.value = data.lisseSuperieur;
            lisseInferieureInput.value = data.lisseInferieure;
            
            // Add visual indication that these fields were auto-filled
            lisseSuperieureInput.style.backgroundColor = '#e3f2fd';
            lisseInferieureInput.style.backgroundColor = '#e3f2fd';
            
            console.log(`Auto-filled lisse fields for ${selectedMontant} in edit mode`);
            
            // Remove auto-filled styling when user starts typing
            [lisseSuperieureInput, lisseInferieureInput].forEach(input => {
                input.addEventListener('input', function() {
                    this.style.backgroundColor = '';
                }, { once: true });
            });
        } else if (!selectedMontant) {
            // Clear the fields if no valid selection
            lisseSuperieureInput.value = '';
            lisseInferieureInput.value = '';
            lisseSuperieureInput.style.backgroundColor = '';
            lisseInferieureInput.style.backgroundColor = '';
        }
    });
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
    
    // Initialize window.currentWallImages if it doesn't exist
    if (!window.currentWallImages) {
        window.currentWallImages = [];
    }
    
    for (const file of validFiles) {
        try {
            // Upload to S3 and get URL
            const imageData = await uploadImageToS3(file);
            
            // FIX: Add to WINDOW global array, not local array
            window.currentWallImages.push(imageData);
            
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

// Fix 3: Update the main image upload section (non-edit mode) to also prevent form issues
function addImagePreview(imageData) {
    const container = document.getElementById('imagePreviewContainer');
    
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.innerHTML = `
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELoading...%3C/text%3E%3C/svg%3E" alt="${imageData.filename}">
        <button type="button" class="image-remove" title="Remove image">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(preview);
    
    // Add event listener instead of inline onclick
    const removeButton = preview.querySelector('.image-remove');
    removeButton.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        removeImage(imageData.key);
    });
    
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
    // FIX: Remove from window global array
    if (!window.currentWallImages) {
        window.currentWallImages = [];
    }
    window.currentWallImages = window.currentWallImages.filter(img => img.key !== imageKey);
    
    // Remove preview element
    const container = document.getElementById('imagePreviewContainer');
    const previews = container.querySelectorAll('.image-preview');
    previews.forEach(preview => {
        const removeBtn = preview.querySelector('.image-remove');
        if (removeBtn && removeBtn.getAttribute('onclick').includes(imageKey)) {
            preview.remove();
        }
    });
    
    console.log('Image removed, remaining count:', window.currentWallImages.length);
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
    
    console.log('DEBUG: window.currentWallImages:', window.currentWallImages);
    console.log('DEBUG: window.currentWallImages length:', window.currentWallImages?.length || 0);
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
        images: [...(window.currentWallImages || [])], // This should now work correctly
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
    
    // FIX: Initialize window.currentWallImages properly
    window.currentWallImages = [];
    
    const previewContainer = document.getElementById('imagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
    }
    
    console.log('Wall form and images cleared, image count:', window.currentWallImages.length);
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
    console.log('🔄 Initializing CFSS tab system...');
    
    // Get tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabSections = document.querySelectorAll('.tab-content-section');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
    
    console.log('✅ Tab system initialized');
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
    
    // Preload images when switching to options tab
    if (tabId === 'option-list') {
        setTimeout(() => {
            preloadOptionImages();
        }, 200);
    }
    
    console.log(`Switched to ${tabId} tab`);
}

// Initialize the options system
function initializeOptionsSystem() {
    console.log('🔧 Initializing CFSS options system...');
    
    // Populate options by category
    populateOptionsCategories();
    
    // Setup save options button
    const saveOptionsBtn = document.getElementById('saveOptionsBtn');
    if (saveOptionsBtn) {
        saveOptionsBtn.addEventListener('click', saveCFSSOptions);
    }
    
    console.log('✅ Options system initialized');
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
                'detail-entremise'
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
                'detail-lisse-basse',
                'identification'
            ]
        },
        'parapet': {
            container: 'parapet-options',
            options: [
                'parapet-1', 'parapet-2', 'parapet-3', 'parapet-4', 'parapet-5',
                'parapet-6', 'parapet-7', 'parapet-8', 'parapet-9', 'parapet-10'
            ]
        },
        'detail-structure': {
            container: 'detail-structure-options',
            options: [
                'detail-structure'
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

    console.log('✅ Option categories populated');
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
        // Lisse trouée options
        'fixe-beton-lisse-trouee',
        'fixe-structure-dacier-lisse-trouee', 
        'fixe-tabiler-metallique-lisse-trouee',
        'fixe-bois-lisse-trouee',
        'detail-lisse-trouee',
        'detail-entremise',
        
        // Double lisse options
        'fixe-beton-double-lisse',
        'fixe-structure-dacier-double-lisse',
        'fixe-tabiler-metallique-double-lisse',
        'detail-double-lisse',
        
        // Lisse basse options
        'fixe-beton-lisse-basse',
        'fixe-structure-dacier-lisse-basse',
        'fixe-bois-lisse-basse',
        'detail-lisse-basse',
        'identification',
        
        // Parapet options
        'parapet-1', 'parapet-2', 'parapet-3', 'parapet-4', 'parapet-5',
        'parapet-6', 'parapet-7', 'parapet-8', 'parapet-9', 'parapet-10',
        
        // Detail structure
        'detail-structure'
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
    console.log(`🔧 Option ${optionName} ${isSelected ? 'selected' : 'deselected'}`);
    
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

    console.log('💾 Saving CFSS options to database:', selectedCFSSOptions);

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
        console.log('✅ CFSS options saved successfully to database');

        // NEW: Automatically switch back to wall list tab after successful save
        switchTab('wall-list');
        
    } catch (error) {
        console.error('❌ Error saving CFSS options:', error);
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
    console.log('🔄 Loading saved CFSS options...');
    
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
        console.log(`✅ Loaded ${selectedCFSSOptions.length} saved CFSS options`);
    } else {
        console.log('ℹ️ No saved CFSS options found, starting with empty selection');
        selectedCFSSOptions = [];
        updateSelectionSummary();
    }
}

// Utility functions for option management
function selectAllOptions() {
    console.log('🔧 Selecting all CFSS options...');
    
    // Get all option checkboxes
    const checkboxes = document.querySelectorAll('.option-checkbox');
    checkboxes.forEach(checkbox => {
        if (!checkbox.checked) {
            checkbox.click(); // This will trigger the change event and update our arrays
        }
    });
}

function clearAllOptions() {
    console.log('🔧 Clearing all CFSS options...');
    
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