#!/usr/bin/env python3
"""Replace hardcoded English strings with t() calls in cfss-project-details.js"""

import re

# Read the file
with open(r'c:\stuff\Protection Seismic\practice\projects\test-real-thing\stable\ps2000\frontend\cfss-project-details.js', 'r', encoding='utf-8') as f:
    content = f.read()

original = content

# ============================================================
# ALERT replacements - simple string alerts
# ============================================================
alert_replacements = {
    # Floor grouping
    "alert('Please select at least 2 floors to group.');": "alert(t('cfss.selectAtLeast2Floors'));",
    "alert('Please select consecutive floors only.');": "alert(t('cfss.selectConsecutiveFloors'));",
    "alert('One or more selected floors are already in a group. Please ungroup them first.');": "alert(t('cfss.floorsAlreadyGrouped'));",
    "alert('Failed to save floor grouping. Please try again.');": "alert(t('cfss.failedSaveGrouping'));",

    # Permission errors
    "alert('You do not have permission to edit this project.');": "alert(t('project.noEditPermission'));",
    "alert('You do not have permission to add parapets to this project.');": "alert(t('cfss.noPermissionAddParapets'));",
    "alert('You do not have permission to add walls to this project.');": "alert(t('cfss.noPermissionAddWalls'));",
    "alert('You do not have permission to edit walls in this project.');": "alert(t('cfss.noPermissionEditWalls'));",
    "alert('You do not have permission to delete walls from this project.');": "alert(t('cfss.noPermissionDeleteWalls'));",
    "alert('You do not have permission to add CFSS data to this project.');": "alert(t('cfss.noPermissionAddCFSSData'));",
    "alert('You do not have permission to modify CFSS data for this project.');": "alert(t('cfss.noPermissionModifyCFSSData'));",
    "alert('You do not have permission to edit windows in this project.');": "alert(t('cfss.noPermissionEditWindows'));",
    "alert('You do not have permission to modify options for this project.');": "alert(t('cfss.noPermissionModifyOptions'));",

    # Project details
    "alert('Please fill in all required fields.');": "alert(t('common.fillRequiredFields'));",
    "alert('Project details updated successfully!');": "alert(t('project.detailsUpdated'));",

    # Compositions
    "alert('You must have at least one composition');": "alert(t('cfss.mustHaveOneComposition'));",

    # Parapet validation
    "alert('Please enter a parapet name.');": "alert(t('cfss.enterParapetName'));",
    "alert('Please select a parapet type.');": "alert(t('cfss.selectParapetType'));",
    "alert('Please enter hauteur max.');": "alert(t('cfss.enterHauteurMax'));",
    "alert('Please select a unit for hauteur max.');": "alert(t('cfss.selectHauteurMaxUnit'));",
    "alert('Please select montant métallique.');": "alert(t('cfss.selectMontantMetallique'));",
    "alert('Please select espacement.');": "alert(t('cfss.selectEspacement'));",
    "alert('Please enter lisse Inférieure.');": "alert(t('cfss.enterLisseInferieure'));",
    "alert('Please enter lisse Supérieure.');": "alert(t('cfss.enterLisseSuperieure'));",
    "alert('Please select entremise.');": "alert(t('cfss.selectEntremise'));",

    # Parapet CRUD
    "alert('Parapet saved successfully!');": "alert(t('cfss.parapetSaved'));",
    "alert('Parapet updated successfully!');": "alert(t('cfss.parapetUpdated'));",
    "alert('Parapet not found.');": "alert(t('cfss.parapetNotFound'));",
    "alert('Parapet deleted successfully!');": "alert(t('cfss.parapetDeleted'));",

    # Image upload
    "alert('Please select valid image files.');": "alert(t('cfss.selectValidImages'));",
    "alert('Maximum 1 image allowed per parapet. Please remove existing image to add a new one.');": "alert(t('cfss.maxOneImageParapet'));",
    "alert('Maximum 1 image allowed per parapet.');": "alert(t('cfss.maxOneImageParapetShort'));",
    "alert('Maximum 2 images allowed per wall. Please remove existing images to add new ones.');": "alert(t('cfss.maxTwoImagesWall'));",

    # Soffite
    "alert('Please enter a soffite name.');": "alert(t('cfss.enterSoffiteName'));",

    # File operations
    "alert('Please enter a file name');": "alert(t('cfss.enterFileName'));",
    "alert('Please enter a link URL');": "alert(t('cfss.enterLinkUrl'));",
    "alert('Please select a file');": "alert(t('cfss.selectFile'));",
    "alert('File uploaded successfully!');": "alert(t('cfss.fileUploaded'));",
    "alert('File not found');": "alert(t('cfss.fileNotFound'));",
    "alert('File deleted successfully');": "alert(t('cfss.fileDeleted'));",

    # Revisions
    "alert('Maximum of 5 revisions allowed. Please delete an old revision first.');": "alert(t('cfss.maxRevisionsReached'));",
    "alert('Failed to save wall. Please try again.');": "alert(t('cfss.failedSaveWall'));",
    "alert('No revisions found. Please add walls to create revisions first.');": "alert(t('cfss.noRevisionsFound'));",

    # Report generation
    "alert('Please select a revision.');": "alert(t('cfss.selectRevision'));",
    "alert('Selected revision not found.');": "alert(t('cfss.revisionNotFound'));",
    "alert('Error: No project selected');": "alert(t('cfss.noProjectSelected'));",
    "alert('Report sent to Google Drive successfully!');": "alert(t('cfss.reportSentToDrive'));",
    "alert('CFSS PDF generation timed out. Please try again in a few minutes.');": "alert(t('cfss.pdfTimedOut'));",
    "alert('Please select a revision to generate the report for.');": "alert(t('cfss.selectRevisionForReport'));",
    "alert('No walls found to include in the report. Please add walls first.');": "alert(t('cfss.noWallsForReport'));",

    # Project data
    "alert('Current state saved successfully');": "alert(t('cfss.stateSaved'));",

    # Wall validation
    "alert('Please enter a wall name.');": "alert(t('cfss.enterWallName'));",
    "alert('Please enter a floor.');": "alert(t('cfss.enterFloor'));",
    "alert('Please enter at least one height value.');": "alert(t('cfss.enterHeightValue'));",
    "alert('Please select units.');": "alert(t('cfss.selectUnits'));",
    "alert('Please select a déflexion max.');": "alert(t('cfss.selectDeflexionMax'));",
    "alert('Please select montant métallique 2.');": "alert(t('cfss.selectMontantMetallique2'));",
    "alert('Please select espacement 2.');": "alert(t('cfss.selectEspacement2'));",
    "alert('Please enter lisse Supérieure 2.');": "alert(t('cfss.enterLisseSuperieure2'));",
    "alert('Please enter lisse Inférieure 2.');": "alert(t('cfss.enterLisseInferieure2'));",
    "alert('Please select entremise 2.');": "alert(t('cfss.selectEntremise2'));",
    "alert('Please select an espacement.');": "alert(t('cfss.selectAnEspacement'));",
    "alert('Please select entremise spacing.');": "alert(t('cfss.selectEntremiseSpacing'));",
    "alert('Please select montant métallique.');": "alert(t('cfss.selectMontantMetallique'));",

    # Wall CRUD
    "alert('Wall updated successfully!');": "alert(t('cfss.wallUpdated'));",
    "alert('Wall saved successfully!');": "alert(t('cfss.wallSaved'));",

    # CFSS data
    "alert('CFSS Data Saved Successfully!');": "alert(t('cfss.dataSaved'));",
    "alert('Add at least one floor with valid data (either calculated with H > 0, or manual ULS/SLS values).');": "alert(t('cfss.addValidFloorData'));",

    # Window validation
    "alert('Please select a window type.');": "alert(t('cfss.selectWindowType'));",
    "alert('Please enter valid dimensions.');": "alert(t('cfss.enterValidDimensions'));",
    "alert('Window updated successfully!');": "alert(t('cfss.windowUpdated'));",
    "alert('Window not found.');": "alert(t('cfss.windowNotFound'));",
    "alert('Window form not found.');": "alert(t('cfss.windowFormNotFound'));",
    "alert('Window saved successfully!');": "alert(t('cfss.windowSaved'));",

    # Options
    "alert('No breakdown available. Please ensure the calculation inputs are complete.');": "alert(t('cfss.noBreakdownAvailable'));",
    "alert('Fill in all wind calculation fields.');": "alert(t('cfss.fillWindCalcFields'));",
    "alert('No walls found in the current revision.');": "alert(t('cfss.noWallsInRevision'));",
}

for old, new in alert_replacements.items():
    content = content.replace(old, new)

# ============================================================
# Alert replacements with dynamic content (template literals or concatenation)
# ============================================================
# alert('Error saving project details: ' + error.message)
content = content.replace(
    "alert('Error saving project details: ' + error.message)",
    "alert(t('project.errorSavingDetails') + ': ' + error.message)"
)

# alert('Error saving parapet: ' + error.message)
content = content.replace(
    "alert('Error saving parapet: ' + error.message)",
    "alert(t('cfss.errorSavingParapet') + ': ' + error.message)"
)

# alert('Error updating parapet: ' + error.message)
content = content.replace(
    "alert('Error updating parapet: ' + error.message)",
    "alert(t('cfss.errorUpdatingParapet') + ': ' + error.message)"
)

# alert('Error saving soffites: ' + error.message)
content = content.replace(
    "alert('Error saving soffites: ' + error.message)",
    "alert(t('cfss.errorSavingSoffites') + ': ' + error.message)"
)

# alert('Error uploading file: ' + error.message)
content = content.replace(
    "alert('Error uploading file: ' + error.message)",
    "alert(t('cfss.errorUploadingFile') + ': ' + error.message)"
)

# alert('Error downloading file: ' + error.message)
content = content.replace(
    "alert('Error downloading file: ' + error.message)",
    "alert(t('cfss.errorDownloadingFile') + ': ' + error.message)"
)

# alert('Error deleting file: ' + error.message)
content = content.replace(
    "alert('Error deleting file: ' + error.message)",
    "alert(t('cfss.errorDeletingFile') + ': ' + error.message)"
)

# alert('Error saving description: ' + error.message)
content = content.replace(
    "alert('Error saving description: ' + error.message)",
    "alert(t('cfss.errorSavingDescription') + ': ' + error.message)"
)

# alert('Error generating CFSS report: ' + error.message)
content = content.replace(
    "alert('Error generating CFSS report: ' + error.message)",
    "alert(t('cfss.errorGeneratingReport') + ': ' + error.message)"
)

# alert('Error creating first revision: ' + error.message)
content = content.replace(
    "alert('Error creating first revision: ' + error.message)",
    "alert(t('cfss.errorCreatingRevision') + ': ' + error.message)"
)

# alert('Error reloading project data: ' + error.message)
content = content.replace(
    "alert('Error reloading project data: ' + error.message)",
    "alert(t('cfss.errorReloadingData') + ': ' + error.message)"
)

# alert('Error saving current state: ' + error.message)
content = content.replace(
    "alert('Error saving current state: ' + error.message)",
    "alert(t('cfss.errorSavingState') + ': ' + error.message)"
)

# alert('Error saving wall: ' + error.message)
content = content.replace(
    "alert('Error saving wall: ' + error.message)",
    "alert(t('cfss.errorSavingWall') + ': ' + error.message)"
)

# alert('Error saving wall changes: ' + error.message)
content = content.replace(
    "alert('Error saving wall changes: ' + error.message)",
    "alert(t('cfss.errorSavingWallChanges') + ': ' + error.message)"
)

# alert('Error saving walls: ' + error.message)
content = content.replace(
    "alert('Error saving walls: ' + error.message)",
    "alert(t('cfss.errorSavingWalls') + ': ' + error.message)"
)

# alert('Error displaying wall details: ' + error.message)
content = content.replace(
    "alert('Error displaying wall details: ' + error.message)",
    "alert(t('cfss.errorDisplayingWallDetails') + ': ' + error.message)"
)

# alert('Error saving wall: ' + error.message)  - duplicate is fine, replace_all
content = content.replace(
    "alert('Error saving CFSS data: ' + error.message)",
    "alert(t('cfss.errorSavingCFSSData') + ': ' + error.message)"
)

# alert('Error updating window: ' + error.message)
content = content.replace(
    "alert('Error updating window: ' + error.message)",
    "alert(t('cfss.errorUpdatingWindow') + ': ' + error.message)"
)

# alert('Error saving CFSS options: ' + error.message)
content = content.replace(
    "alert('Error saving CFSS options: ' + error.message)",
    "alert(t('cfss.errorSavingOptions') + ': ' + error.message)"
)

# alert('Error saving windows: ' + err.message)
content = content.replace(
    "alert('Error saving windows: ' + err.message)",
    "alert(t('cfss.errorSavingWindows') + ': ' + err.message)"
)

# alert(`Error displaying options. Please try again.`)
content = content.replace(
    "alert('Error displaying options. Please try again.');",
    "alert(t('cfss.errorDisplayingOptions'));"
)

# alert with template literals for dynamic content
# alert(`Maximum ${MAX_COMPOSITIONS} compositions reached`)
content = content.replace(
    "alert(`Maximum ${MAX_COMPOSITIONS} compositions reached`)",
    "alert(t('cfss.maxCompositionsReached', { max: MAX_COMPOSITIONS }))"
)

# alert(`Error uploading ${file.name}: ${error.message}`)
content = content.replace(
    "alert(`Error uploading ${file.name}: ${error.message}`)",
    "alert(t('cfss.errorUploadingImage', { name: file.name, error: error.message }))"
)

# alert(`You can only add ${remainingSlots} more image(s). Maximum 2 images allowed per wall.`)
content = content.replace(
    "alert(`You can only add ${remainingSlots} more image(s). Maximum 2 images allowed per wall.`)",
    "alert(t('cfss.remainingImageSlots', { remaining: remainingSlots }))"
)

# alert(`Revision ${selectedRevision.number} contains no walls. Please select a revision with walls.`)
content = content.replace(
    "alert(`Revision ${selectedRevision.number} contains no walls. Please select a revision with walls.`)",
    "alert(t('cfss.revisionNoWalls', { number: selectedRevision.number }))"
)

# alert(`Successfully saved ${selectedCFSSOptions.length} CFSS construction options!`)
content = content.replace(
    "alert(`Successfully saved ${selectedCFSSOptions.length} CFSS construction options!`)",
    "alert(t('cfss.optionsSaved', { count: selectedCFSSOptions.length }))"
)

# alert('Error deleting template: ' + error.message)
content = content.replace(
    "alert('Error deleting template: ' + error.message)",
    "alert(t('cfss.errorDeletingTemplate') + ': ' + error.message)"
)

# ============================================================
# CONFIRM replacements
# ============================================================
content = content.replace(
    "confirm('Are you sure you want to delete this soffite?')",
    "confirm(t('cfss.confirmDeleteSoffite'))"
)
content = content.replace(
    "confirm('Are you sure you want to delete this file?')",
    "confirm(t('cfss.confirmDeleteFile'))"
)
content = content.replace(
    "confirm('Are you sure you want to logout?')",
    "confirm(t('auth.confirmLogout'))"
)
content = content.replace(
    "confirm('Are you sure you want to delete this wall and all its images?')",
    "confirm(t('cfss.confirmDeleteWallAndImages'))"
)
content = content.replace(
    "confirm('Are you sure you want to delete this window?')",
    "confirm(t('cfss.confirmDeleteWindow'))"
)
# confirm with template literal for parapet name
content = content.replace(
    'confirm(`Are you sure you want to delete parapet "${parapet.parapetName}"?`)',
    'confirm(t("cfss.confirmDeleteParapet", { name: parapet.parapetName }))'
)
# confirm with template literal for wall name
content = content.replace(
    'confirm(`Are you sure you want to delete wall "${wallName}" and all its images?`)',
    'confirm(t("cfss.confirmDeleteWallNamed", { name: wallName }))'
)
# confirm('Delete this template?')
content = content.replace(
    "confirm('Delete this template?')",
    "confirm(t('cfss.confirmDeleteTemplate'))"
)

# ============================================================
# innerHTML button labels
# ============================================================

# Edit Project Details button
content = content.replace(
    """editBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Edit';""",
    """editBtn.innerHTML = `<i class="fas fa-times"></i> ${t('common.cancelEdit')}`;"""
)
content = content.replace(
    """editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Project Details';""",
    """editBtn.innerHTML = `<i class="fas fa-edit"></i> ${t('project.editProjectDetails')}`;"""
)

# Save Changes button (spinner)
content = content.replace(
    """saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';""",
    """saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('common.saving')}`;"""
)

# Save Changes button
content = content.replace(
    """saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';""",
    """saveBtn.innerHTML = `<i class="fas fa-save"></i> ${t('common.saveChanges')}`;"""
)

# Max compositions button
content = content.replace(
    'btn.innerHTML = `<i class="fas fa-check"></i> Max (${MAX_COMPOSITIONS})`;',
    'btn.innerHTML = `<i class="fas fa-check"></i> ${t("cfss.maxComps", { max: MAX_COMPOSITIONS })}`;'
)
content = content.replace(
    """btn.innerHTML = `<i class="fas fa-plus"></i> Add`;""",
    """btn.innerHTML = `<i class="fas fa-plus"></i> ${t('common.add')}`;"""
)

# Add Parapet button
content = content.replace(
    """addParapetButton.innerHTML = '<i class="fas fa-building"></i> Add Parapet';""",
    """addParapetButton.innerHTML = `<i class="fas fa-building"></i> ${t('cfss.addParapet')}`;"""
)

# Hide Form button (parapet)
content = content.replace(
    """addParapetButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';""",
    """addParapetButton.innerHTML = `<i class="fas fa-times"></i> ${t('common.hideForm')}`;"""
)

# Add Parapet button (in getElementById)
content = content.replace(
    """document.getElementById('addParapetButton').innerHTML = '<i class="fas fa-building"></i> Add Parapet';""",
    """document.getElementById('addParapetButton').innerHTML = `<i class="fas fa-building"></i> ${t('cfss.addParapet')}`;"""
)

# Add Soffites button
content = content.replace(
    """addSoffitesButton.innerHTML = '<i class="fas fa-grip-lines-vertical"></i> Add Soffites';""",
    """addSoffitesButton.innerHTML = `<i class="fas fa-grip-lines-vertical"></i> ${t('cfss.addSoffites')}`;"""
)
content = content.replace(
    """document.getElementById('addSoffitesButton').innerHTML = '<i class="fas fa-grip-lines-vertical"></i> Add Soffites';""",
    """document.getElementById('addSoffitesButton').innerHTML = `<i class="fas fa-grip-lines-vertical"></i> ${t('cfss.addSoffites')}`;"""
)

# Hide Form button (soffites)
content = content.replace(
    """addSoffitesButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';""",
    """addSoffitesButton.innerHTML = `<i class="fas fa-times"></i> ${t('common.hideForm')}`;"""
)
content = content.replace(
    """document.getElementById('addSoffitesButton').innerHTML = '<i class="fas fa-times"></i> Hide Form';""",
    """document.getElementById('addSoffitesButton').innerHTML = `<i class="fas fa-times"></i> ${t('common.hideForm')}`;"""
)

# Upload button
content = content.replace(
    """submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';""",
    """submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('common.uploading')}`;"""
)
content = content.replace(
    """submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload';""",
    """submitBtn.innerHTML = `<i class="fas fa-upload"></i> ${t('common.upload')}`;"""
)

# Generate CFSS Report buttons
content = content.replace(
    """generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating CFSS Report...`;""",
    """generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('cfss.generatingReport')}`;"""
)
content = content.replace(
    """generateButton.innerHTML = '<i class="fas fa-file-pdf"></i> Generate CFSS Report';""",
    """generateButton.innerHTML = `<i class="fas fa-file-pdf"></i> ${t('cfss.generateReport')}`;"""
)
content = content.replace(
    """generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating CFSS PDF... (up to 30 seconds)';""",
    """generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('cfss.generatingPDF')}`;"""
)
content = content.replace(
    'generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating Revision ${selectedRevision.number} PDF...`;',
    'generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t("cfss.generatingRevisionPDF", { number: selectedRevision.number })}`;'
)

# Add Wall button
content = content.replace(
    """newCalcButton.innerHTML = '<i class="fas fa-th-large"></i> Add Wall';""",
    """newCalcButton.innerHTML = `<i class="fas fa-th-large"></i> ${t('cfss.addWall')}`;"""
)

# Hide Form button (wall)
content = content.replace(
    """newCalcButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';""",
    """newCalcButton.innerHTML = `<i class="fas fa-times"></i> ${t('common.hideForm')}`;"""
)

# Cancel button for newCalcButton
content = content.replace(
    """document.getElementById('newCalculationButton').innerHTML = '<i class="fas fa-th-large"></i> Cancel';""",
    """document.getElementById('newCalculationButton').innerHTML = `<i class="fas fa-th-large"></i> ${t('common.cancel')}`;"""
)

# CFSS button text
content = content.replace(
    """cfssButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';""",
    """cfssButton.innerHTML = `<i class="fas fa-times"></i> ${t('common.hideForm')}`;"""
)

# Hide CFSS Data button
content = content.replace(
    """btn.innerHTML = '<i class="fas fa-times"></i> <span id="cfss-btn-text">Hide CFSS Data</span>';""",
    """btn.innerHTML = `<i class="fas fa-times"></i> <span id="cfss-btn-text">${t('cfss.hideCFSSData')}</span>`;"""
)

# Add Window button
content = content.replace(
    """addWindowButton.innerHTML = '<i class="fas fa-window-maximize"></i> Add Window';""",
    """addWindowButton.innerHTML = `<i class="fas fa-window-maximize"></i> ${t('cfss.addWindow')}`;"""
)

# Add Window hide form
content = content.replace(
    """addWindowButton.innerHTML = '<i class="fas fa-times"></i> Hide Form';""",
    """addWindowButton.innerHTML = `<i class="fas fa-times"></i> ${t('common.hideForm')}`;"""
)

# Window button with this.innerHTML
content = content.replace(
    """this.innerHTML = '<i class="fas fa-window-maximize"></i> Add Window';""",
    """this.innerHTML = `<i class="fas fa-window-maximize"></i> ${t('cfss.addWindow')}`;"""
)
content = content.replace(
    """this.innerHTML = '<i class="fas fa-times"></i> Hide Form';""",
    """this.innerHTML = `<i class="fas fa-times"></i> ${t('common.hideForm')}`;"""
)

# Exterior Wall Calculation button
content = content.replace(
    """exteriorWallCalcButton.innerHTML = '<i class="fas fa-calculator"></i> Exterior Wall Calculation';""",
    """exteriorWallCalcButton.innerHTML = `<i class="fas fa-calculator"></i> ${t('cfss.exteriorWallCalc')}`;"""
)

# Saving... spinner for other buttons
content = content.replace(
    """saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }""",
    """saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('common.saving')}`; }"""
)

# Options save button
content = content.replace(
    """saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Options...';""",
    """saveButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('cfss.savingOptions')}`;"""
)
content = content.replace(
    """saveButton.innerHTML = '<i class="fas fa-save"></i> Save Options';""",
    """saveButton.innerHTML = `<i class="fas fa-save"></i> ${t('cfss.saveOptions')}`;"""
)

# Summary labels
content = content.replace(
    'el.innerHTML = `<i class="fas fa-th-large"></i> ${n} wall${n === 1 ? \'\' : \'s\'} added`;',
    'el.innerHTML = `<i class="fas fa-th-large"></i> ${t("cfss.wallsAdded", { count: n })}`;'
)

# Parapet summary
content = content.replace(
    "summary.innerHTML = `<i class=\"fas fa-building\"></i> ${count} parapet${count !== 1 ? 's' : ''} added`;",
    "summary.innerHTML = `<i class=\"fas fa-building\"></i> ${t('cfss.parapetsAdded', { count })}`;",
)

# Custom pages summary
content = content.replace(
    "el.innerHTML = `<i class=\"fas fa-file-alt\"></i> ${count} custom page${count !== 1 ? 's' : ''} added`;",
    "el.innerHTML = `<i class=\"fas fa-file-alt\"></i> ${t('cfss.customPagesAdded', { count })}`;",
)

# Soffites summary
content = content.replace(
    "summary.innerHTML = `<i class=\"fas fa-grip-lines-vertical\"></i> ${projectSoffites.length} soffites added`;",
    "summary.innerHTML = `<i class=\"fas fa-grip-lines-vertical\"></i> ${t('cfss.soffitesAdded', { count: projectSoffites.length })}`;",
)

# Window summary
content = content.replace(
    "summary.innerHTML = `<i class=\"fas fa-window-maximize\"></i> ${count} window${count !== 1 ? 's' : ''} added`;",
    "summary.innerHTML = `<i class=\"fas fa-window-maximize\"></i> ${t('cfss.windowsAdded', { count })}`;",
)

# ============================================================
# Write the file
# ============================================================
with open(r'c:\stuff\Protection Seismic\practice\projects\test-real-thing\stable\ps2000\frontend\cfss-project-details.js', 'w', encoding='utf-8') as f:
    f.write(content)

# Count changes
changes = 0
for i, (a, b) in enumerate(zip(original.split('\n'), content.split('\n'))):
    if a != b:
        changes += 1

print(f"Phase 1 complete: {changes} lines changed in cfss-project-details.js")
