// Project Details Page Initialization
// Initialization code for project details page
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
                throw new Error('Failed to fetch project details');
            }

            const projectResponse = await response.json();

            if (projectResponse.length > 0) {
                const project = projectResponse[0];
                window.projectData = project;
                projectData = project;

                if (!isAdmin && project.createdBy !== currentUser.email) {
                    document.getElementById('loadingProject').style.display = 'none';
                    document.getElementById('accessDenied').style.display = 'block';
                    return;
                }

                document.getElementById('loadingProject').style.display = 'none';
                document.getElementById('projectContainer').style.display = 'block';

                // Populate project details
                document.getElementById("projectName").textContent = project.name;
                document.getElementById("projectDescription").textContent = project.description;
                document.getElementById("projectType").textContent = project.type;
                document.getElementById("projectDomain").textContent = project.domain || "N/A";
                document.getElementById("projectStatusDropdown").value = project.status;
                document.getElementById("projectFloors").textContent = project.numberOfFloors || "N/A";
                document.getElementById("projectStatusDropdown").addEventListener('change', function() {
                    if (canModifyProject()) {
                        saveProjectStatus(this.value);
                    }
                });
                document.getElementById("projectLatitude").textContent = project.latitude || "N/A";
                document.getElementById("projectLongitude").textContent = project.longitude || "N/A";
                document.getElementById("projectMaxSa0_2").textContent = project.maxSa0_2 || "N/A";
                document.getElementById("projectMaxSa1_0").textContent = project.maxSa1_0 || "N/A";
                document.getElementById("projectMaxVGA").textContent = project.maxPGA || "N/A";
                document.getElementById("projectPGAref").textContent = project.PGAref || "N/A";
                document.getElementById("projectF10").textContent = project.F10 || "N/A";
                document.getElementById("projectF02").textContent = project.F02 || "N/A";
                document.getElementById("projectSMS").textContent = project.S_MS || "N/A";
                document.getElementById("projectSDS").textContent = project.S_DS || "N/A";
                document.getElementById("projectSM1").textContent = project.S_M1 || "N/A";
                document.getElementById("projectSD1").textContent = project.S_D1 || "N/A";
                document.getElementById("projectRiskSDS").textContent = project.RiskS_DS || "N/A";
                document.getElementById("projectRiskSD1").textContent = project.RiskS_D1 || "N/A";
                document.getElementById("projectFinalRiskCategory").textContent = project.FinalRiskCategory || "N/A";

                if (isAdmin && project.createdBy) {
                    const ownerInfo = document.getElementById('projectOwnerInfo');
                    ownerInfo.innerHTML = `
                        <p><strong>Created by:</strong> ${project.createdBy}</p>
                        <p><strong>Created on:</strong> ${project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>Last updated:</strong> ${project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'N/A'}</p>
                    `;
                }

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
                        console.log('No existing equipment found or error fetching equipment:', error);
                        projectEquipment = [];
                    }
                }

                if (project.domain) {
                    populateEquipmentOptions(project.domain);
                } else {
                    console.error("Domain not found in project data.");
                }

                setupImageEventListeners();
                setupNewCalculationButton();
                setupReportButton();
                setupEquipmentFormHandler();
                
                // Hide form tabs for admin users (default to "with calculation")
                if (isAdmin) {
                    const formTabs = document.querySelector('.form-tabs');
                    if (formTabs) {
                        formTabs.style.display = 'none';
                    }
                    currentFormTab = 'with-calc';
                }

                setTimeout(() => {
                    updateEquipmentImage();
                }, 100);
                
                renderEquipmentList();

                const newCalcButton = document.getElementById('newCalculationButton');
                newCalcButton.style.display = 'block';
                console.log('✅ New Calculation button shown');

            } else {
                console.error("Project not found.");
                document.getElementById('loadingProject').style.display = 'none';
                document.getElementById('accessDenied').style.display = 'block';
            }
        } catch (error) {
            console.error("Error fetching project details:", error);
            document.getElementById('loadingProject').style.display = 'none';
            alert('Error loading project: ' + error.message);
        }
    } else {
        console.error("No project ID specified in URL.");
        document.getElementById('loadingProject').style.display = 'none';
        alert('No project ID specified');
        window.location.href = 'dashboard.html';
    }
});

// Setup Generate Report button
function setupReportButton() {
    const generateReportButton = document.getElementById('generateReportButton');
    if (generateReportButton) {
        generateReportButton.addEventListener('click', generateProjectReport);
    }
}