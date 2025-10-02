// ============================================================================
// CFSS PROJECT DETAILS INITIALIZATION - CORRECTED VERSION
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        return;
    }

    const projectId = new URLSearchParams(window.location.search).get("id");
    currentProjectId = projectId;

    if (projectId) {
        try {
            const response = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects?id=${projectId}`, {
                headers: getAuthHeaders()
            });

            if (handleAuthError(response)) {
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to fetch CFSS project details');
            }

            const projectResponse = await response.json();

            if (projectResponse.length > 0) {
                const project = projectResponse[0];
                window.projectData = project;
                projectData = project;
                window.currentProject = project;

                // Check if this is actually a CFSS project (no domain field)
                if (project.domain) {
                    alert('This appears to be a seismic project, not a CFSS project. Redirecting to seismic project details.');
                    window.location.href = `project-details.html?id=${projectId}`;
                    return;
                }

                if (!isAdmin && project.createdBy !== currentUser.email) {
                    document.getElementById('loadingProject').style.display = 'none';
                    document.getElementById('accessDenied').style.display = 'block';
                    return;
                }

                document.getElementById('loadingProject').style.display = 'none';
                document.getElementById('projectContainer').style.display = 'block';

                // Populate CFSS project details
                document.getElementById("projectName").textContent = project.name;
                document.getElementById("projectDescription").textContent = project.description;
                document.getElementById("projectType").textContent = project.type;
                document.getElementById("projectStatusDropdown").value = project.status;
                document.getElementById("projectStatusDropdown").addEventListener('change', function() {
                    if (canModifyProject()) {
                        saveProjectStatus(this.value);
                    }
                });

                // Format address
                const projectAddress = [
                    project.addressLine1,
                    project.addressLine2,
                    project.city,
                    project.province,
                    project.country
                ].filter(Boolean).join(', ');
                document.getElementById("projectAddress").textContent = projectAddress;

                // INITIALIZE WALL DATA - UNIFIED APPROACH
                console.log('🔄 Initializing CFSS wall data...');
                await initializeWallData(project, projectId);

                // Load CFSS wind data
                console.log('🔍 Loading CFSS wind data...');
                if (project.cfssWindData && project.cfssWindData.length > 0) {
                    console.log('✅ CFSS data found, loading display...');
                    cfssWindData = project.cfssWindData;
                    
                    setTimeout(() => {
                        try {
                            updateCFSSDataDisplay(project.cfssWindData);
                            console.log('✅ CFSS data display updated successfully');
                        } catch (error) {
                            console.error('❌ Error updating CFSS data display:', error);
                        }
                    }, 100);
                } else {
                    console.log('⚠️ No CFSS data found in project');
                    const cfssDisplay = document.getElementById('cfssDataDisplay');
                    if (cfssDisplay) {
                        cfssDisplay.style.display = 'none';
                    }
                }

                // Display admin info if admin
                if (isAdmin && project.createdBy) {
                    const ownerInfo = document.getElementById('projectOwnerInfo');
                    ownerInfo.innerHTML = `
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
                            <p><strong>Created by:</strong> ${project.createdBy}</p>
                            <p><strong>Created on:</strong> ${project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}</p>
                            <p><strong>Last updated:</strong> ${project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'N/A'}</p>
                            ${project.wallRevisions && project.wallRevisions.length > 0 ? 
                                `<p><strong>Wall Revisions:</strong> ${project.wallRevisions.length} revision(s)</p>` : 
                                '<p><strong>Wall Revisions:</strong> None</p>'
                            }
                        </div>
                    `;
                }

                // Setup form handlers and render
                setupNewCalculationButton();
                setupEquipmentFormHandlerWithRevisions();
                setupWindowHandlers();
                loadWindowsFromProject(project);
                initializeCustomPages();
                setupCFSSReportButtonWithRevisionModal();
                
                renderEquipmentList();
                initializeImageUpload();

                // Load saved CFSS options after everything is initialized
                setTimeout(() => {
                    loadSavedCFSSOptions();
                }, 500);

                console.log('📄 Initializing custom pages...');
                initializeCustomPagesWithData(project);
                setBlankCFSSBackground();

                const newCalcButton = document.getElementById('newCalculationButton');
                newCalcButton.style.display = 'block';
                console.log('✅ CFSS initialization completed successfully');

            } else {
                console.error("CFSS Project not found.");
                document.getElementById('loadingProject').style.display = 'none';
                document.getElementById('accessDenied').style.display = 'block';
            }
        } catch (error) {
            console.error("Error fetching CFSS project details:", error);
            document.getElementById('loadingProject').style.display = 'none';
            alert('Error loading CFSS project: ' + error.message);
        }
    } else {
        console.error("No project ID specified in URL.");
        document.getElementById('loadingProject').style.display = 'none';
        alert('No project ID specified');
        window.location.href = 'cfss-dashboard.html';
    }
});

async function initializeWallData(project, projectId) {
    console.log('📋 Starting wall data initialization...');
    
    // Check if project has revision system
    if (project.wallRevisions && project.wallRevisions.length > 0) {
        console.log('✅ Project has revision system - initializing revisions');
        initializeRevisionSystem(project);
        
        if (projectEquipment && projectEquipment.length > 0) {
            console.log(`✅ Loaded ${projectEquipment.length} walls from revision system`);
            return;
        } else {
            console.warn('⚠️ Revision system initialized but no walls loaded');
        }
    } else {
        console.log('📋 No revision system found - checking for legacy data to migrate');
        
        // Try to migrate legacy data if it exists
        if (project.equipment && project.equipment.length > 0) {
            console.log('📋 Found legacy walls, creating initial revision...');
            
            // Create first revision from legacy data
            const firstRevision = {
                id: `rev_${Date.now()}`,
                number: 1,
                description: 'Migrated from legacy data',
                createdAt: new Date().toISOString(),
                createdBy: 'system-migration',
                walls: [...project.equipment]
            };
            
            projectRevisions = [firstRevision];
            currentRevisionId = firstRevision.id;
            projectEquipment = [...project.equipment];
            
            // Save the migration to database
            try {
                await saveRevisionsToDatabase();
                console.log('✅ Legacy data migrated to revision system');
            } catch (error) {
                console.error('❌ Failed to migrate legacy data:', error);
                // Continue with local data even if save failed
            }
            
            return;
        }
    }
    
    // Initialize empty state
    console.log('📋 No wall data found - initializing empty state');
    projectEquipment = [];
    projectRevisions = [];
    currentRevisionId = null;
    
    console.log('✅ Wall data initialization completed');
}

function initializeCustomPagesWithData(project) {
    console.log('🎨 Initializing Custom Pages with project data...');
    
    // Initialize the UI
    initializeCustomPages();
    
    // Load the pages
    loadCustomPagesFromProject(project);
    
    console.log('✅ Custom pages initialization complete');
}

// FIXED: Report generation uses ONLY revision system
async function generateCFSSProjectReportWithRevisions() {
    if (!currentProjectId) {
        alert('Error: No project selected');
        return;
    }

    const generateButton = document.getElementById('generateCFSSReportButton');
    
    try {
        generateButton.disabled = true;
        generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating CFSS PDF... (up to 30 seconds)';
        
        // ALWAYS use current projectEquipment array for report
        // This ensures the report reflects the current UI state
        const cfssProjectData = {
            ...projectData,
            walls: [...projectEquipment], // Current walls from UI
            wallRevisions: [...projectRevisions], // Current revisions
            currentWallRevisionId: currentRevisionId,
            cfssWindData: cfssWindData,
            customPages: (typeof projectCustomPages !== 'undefined' && Array.isArray(projectCustomPages))
            ? projectCustomPages
            : (projectData.customPages || [])
        };
        
        console.log('📊 Report data being sent:', {
            name: cfssProjectData.name,
            wallsCount: cfssProjectData.walls?.length || 0,
            revisionsCount: cfssProjectData.wallRevisions?.length || 0,
            currentRevisionId: cfssProjectData.currentWallRevisionId,
            windDataCount: cfssProjectData.cfssWindData?.length || 0
        });
        
        // Validate we have walls to report on
        if (!cfssProjectData.walls || cfssProjectData.walls.length === 0) {
            alert('No walls found to include in the report. Please add walls first.');
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

        console.log('✅ Opening CFSS download URL:', result.downloadUrl);
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

// Setup function for CFSS Report button
function setupCFSSReportButtonWithRevisionModal() {
    const generateButton = document.getElementById('generateCFSSReportButton');
    if (generateButton) {
        // Remove any existing listeners
        generateButton.removeEventListener('click', generateCFSSProjectReportWithRevisions);
        generateButton.removeEventListener('click', generateCFSSProjectReport);
        
        // Add modal-based listener
        generateButton.addEventListener('click', (e) => {
            e.preventDefault();
            showRevisionSelectionModal();
        });
        
        console.log('✅ CFSS Report button setup completed with revision selection modal');
    } else {
        console.warn('⚠️ CFSS Report button not found');
    }
}

// Make functions globally available
window.initializeWallData = initializeWallData;
window.setupCFSSReportButtonWithRevisionModal = setupCFSSReportButtonWithRevisionModal;
window.generateCFSSProjectReportWithRevisions = generateCFSSProjectReportWithRevisions;