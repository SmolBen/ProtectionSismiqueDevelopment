// ============================================================================
// CFSS PROJECT DETAILS INITIALIZATION UPDATES FOR REVISION SYSTEM
// Replace the existing cfss-project-details-init.js content with this updated version:
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

                // INITIALIZE REVISION SYSTEM FIRST
                console.log('🔄 Initializing CFSS revision system...');
                initializeRevisionSystem(project);

                // Load CFSS data
                console.log('🔍 Checking for CFSS data in project:', project.cfssWindData);
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

                // Load equipment data ONLY if no revisions exist (legacy projects)
                if (!project.wallRevisions || project.wallRevisions.length === 0) {
                    console.log('🔋 No wall revisions found, loading legacy equipment data...');
                    
                    if (project.equipment && project.equipment.length > 0) {
                        projectEquipment = project.equipment;
                    } else {
                        try {
                            const equipmentResponse = await fetch(`https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/projects/${projectId}/equipment`, {
                                headers: getAuthHeaders()
                            });
                            if (equipmentResponse.ok) {
                                const equipmentData = await equipmentResponse.json();
                                projectEquipment = equipmentData || [];
                            }
                        } catch (error) {
                            console.log('No existing walls found or error fetching walls:', error);
                            projectEquipment = [];
                        }
                    }
                } else {
                    console.log('✅ Wall revisions exist, equipment loaded from revision system');
                }

                // Setup form handlers and render equipment list with revision support
                setupNewCalculationButton();
                setupEquipmentFormHandlerWithRevisions(); // Use revision-aware handler
                
                // FIXED: Use the revision-aware report setup function
                setupCFSSReportButtonWithRevisions(); // This ensures revisions are included in report
                
                renderEquipmentList();
                initializeImageUpload();

                const newCalcButton = document.getElementById('newCalculationButton');
                newCalcButton.style.display = 'block';
                console.log('✅ Add Wall button shown');

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

async function generateCFSSProjectReportWithRevisions() {
    if (!currentProjectId) {
        alert('Error: No project selected');
        return;
    }

    const generateButton = document.getElementById('generateCFSSReportButton');
    
    try {
        generateButton.disabled = true;
        generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating CFSS PDF... (up to 30 seconds)';
        
        // FIXED: Get current revision data for the report
        let cfssProjectData;
        
        if (projectRevisions && projectRevisions.length > 0) {
            // Use current revision data
            const currentRevision = projectRevisions.find(rev => rev.id === currentRevisionId);
            
            console.log('🔍 Current revision info:', {
                currentRevisionId,
                totalRevisions: projectRevisions.length,
                currentRevision: currentRevision ? `Revision ${currentRevision.number}` : 'None found'
            });
            
            cfssProjectData = {
                ...projectData,
                // FIXED: Use walls from current revision, not old projectEquipment
                walls: currentRevision ? currentRevision.walls : projectEquipment,
                wallRevisions: projectRevisions, // Include ALL revision history for PDF
                currentWallRevisionId: currentRevisionId,
                cfssWindData: cfssWindData
            };
            
            console.log('📊 Using revision data for report:', {
                name: cfssProjectData.name,
                currentRevision: currentRevision?.number || 'None',
                wallsCount: cfssProjectData.walls?.length || 0,
                totalRevisions: projectRevisions.length,
                windDataCount: cfssProjectData.cfssWindData?.length || 0
            });
        } else {
            // Legacy project without revisions
            cfssProjectData = {
                ...projectData,
                walls: projectEquipment,
                wallRevisions: [], // No revisions
                currentWallRevisionId: null,
                cfssWindData: cfssWindData
            };
            
            console.log('📊 Using legacy data for report (no revisions):', {
                name: cfssProjectData.name,
                wallsCount: cfssProjectData.walls?.length || 0,
                windDataCount: cfssProjectData.cfssWindData?.length || 0
            });
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
                projectData: cfssProjectData // Send the correct revision data
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

// Setup function for CFSS Report button with revision support
function setupCFSSReportButtonWithRevisions() {
    const generateButton = document.getElementById('generateCFSSReportButton');
    if (generateButton) {
        // Remove any existing listeners first
        generateButton.removeEventListener('click', generateCFSSProjectReport);
        
        // Add the revision-aware listener
        generateButton.addEventListener('click', generateCFSSProjectReportWithRevisions);
        console.log('✅ CFSS Report button setup completed with revision support');
    } else {
        console.warn('⚠️ CFSS Report button not found');
    }
}

// Make functions globally available
window.setupCFSSReportButtonWithRevisions = setupCFSSReportButtonWithRevisions;
window.generateCFSSProjectReportWithRevisions = generateCFSSProjectReportWithRevisions;
window.setupEquipmentFormHandlerWithRevisions = setupEquipmentFormHandlerWithRevisions;