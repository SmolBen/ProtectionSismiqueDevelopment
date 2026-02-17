// Project Details Page Initialization
// Initialization code for project details page
const formatSeismicValue = (value, precision = 2) => {
    if (value === null || value === undefined || value === '') {
        return 'N/A';
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return typeof value === 'string' && value.trim() !== '' ? value : 'N/A';
    }
    return Number(num.toFixed(precision)).toString();
};

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
                
                // Build full address from address components
                const addressParts = [
                    project.addressLine1,
                    project.addressLine2,
                    project.city,
                    project.province,
                    project.country
                ].filter(part => part && part.trim() !== '');
                document.getElementById("projectAddress").textContent = addressParts.length > 0 ? addressParts.join(', ') : 'N/A';
                document.getElementById("projectStatusDropdown").addEventListener('change', function() {
                    if (canModifyProject()) {
                        saveProjectStatus(this.value);
                    }
                });
                const seismicFields = [
                    { id: "projectLatitude", value: project.latitude, precision: 4 },
                    { id: "projectLongitude", value: project.longitude, precision: 4 },
                    { id: "projectMaxSa0_2", value: project.maxSa0_2 },
                    { id: "projectMaxSa1_0", value: project.maxSa1_0 },
                    { id: "projectMaxVGA", value: project.maxPGA },
                    { id: "projectPGAref", value: project.PGAref },
                    { id: "projectF10", value: project.F10 },
                    { id: "projectF02", value: project.F02 },
                    { id: "projectSMS", value: project.S_MS },
                    { id: "projectSDS", value: project.S_DS },
                    { id: "projectSM1", value: project.S_M1 },
                    { id: "projectSD1", value: project.S_D1 }
                ];

                seismicFields.forEach(({ id, value, precision = 2 }) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.textContent = formatSeismicValue(value, precision);
                    }
                });

                const seismicHeading = document.getElementById('seismicParametersHeading');
                if (seismicHeading) {
                    seismicHeading.style.display = isAdmin ? '' : 'none';
                }

                document.getElementById("projectRiskSDS").textContent = project.RiskS_DS || "N/A";
                document.getElementById("projectRiskSD1").textContent = project.RiskS_D1 || "N/A";
                document.getElementById("projectFinalRiskCategory").textContent = project.FinalRiskCategory || "N/A";

                if (isAdmin && project.createdBy) {
                    const ownerInfo = document.getElementById('projectOwnerInfo');
                    ownerInfo.innerHTML = `
                        <p><strong>${t('project.createdBy')}:</strong> ${project.createdBy}</p>
                        <p><strong>${t('project.createdOn')}:</strong> ${project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>${t('project.lastUpdated')}:</strong> ${project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'N/A'}</p>
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
                VoiceInputManager.initFieldListeners();

                // Initialize equipment mode as null (user must select)
                currentEquipmentMode = null;

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
            alert(t('project.errorLoadingProject') + ': ' + error.message);
        }
    } else {
        console.error("No project ID specified in URL.");
        document.getElementById('loadingProject').style.display = 'none';
        alert(t('project.noProjectIdSpecified'));
        window.location.href = 'dashboard.html';
    }
});

// Setup Generate Report button
function setupReportButton() {
    const generateReportButton = document.getElementById('generateReportButton');
    if (generateReportButton) {
        generateReportButton.addEventListener('click', generateProjectReport);
        if (authHelper.isAdmin()) {
            generateReportButton.style.display = '';
        }
    }
}
