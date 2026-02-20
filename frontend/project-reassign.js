// project-reassign.js — Shared project assignment modal for dashboard and cfss-dashboard
(function () {
    const API_BASE = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev';
    let cachedUsers = null;
    let cacheTimestamp = 0;
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    let currentModal = null;
    let debounceTimer = null;
    let selectedUsers = new Map(); // email -> user object

    async function fetchUsers(authHelper) {
        const now = Date.now();
        if (cachedUsers && (now - cacheTimestamp) < CACHE_TTL) {
            return cachedUsers;
        }

        const response = await fetch(`${API_BASE}/users`, {
            method: 'GET',
            headers: authHelper.getAuthHeaders()
        });

        if (!response.ok) throw new Error(`Failed to fetch users: ${response.status}`);
        cachedUsers = await response.json();
        cacheTimestamp = now;
        return cachedUsers;
    }

    function findUserByEmail(users, email) {
        return users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    }

    function filterUsers(users, searchTerm, excludeEmail) {
        const term = searchTerm.toLowerCase().trim();
        return users
            .filter(u => u.email && u.email.toLowerCase() !== excludeEmail.toLowerCase())
            .filter(u => u.approvalStatus === 'approved')
            .filter(u => {
                if (!term) return true;
                const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
                const email = (u.email || '').toLowerCase();
                const company = (u.companyName || '').toLowerCase();
                const domain = (u.domain || '').toLowerCase();
                const emailDomain = email.split('@')[1] || '';
                return fullName.includes(term) ||
                    email.includes(term) ||
                    company.includes(term) ||
                    domain.includes(term) ||
                    emailDomain.includes(term);
            });
    }

    function getEmailDomain(email) {
        return (email || '').split('@')[1] || '';
    }

    function closeModal() {
        if (currentModal) {
            currentModal.remove();
            currentModal = null;
        }
        selectedUsers.clear();
    }

    function updateSelectedChips() {
        const chipsContainer = currentModal && currentModal.querySelector('#reassignSelectedChips');
        const confirmBtn = currentModal && currentModal.querySelector('#reassignConfirmBtn');
        if (!chipsContainer || !confirmBtn) return;

        if (selectedUsers.size === 0) {
            chipsContainer.style.display = 'none';
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
            return;
        }

        chipsContainer.style.display = 'flex';
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';

        chipsContainer.innerHTML = Array.from(selectedUsers.values()).map(user => `
            <span class="reassign-chip" data-email="${user.email}"
                style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#dbeafe;color:#1e40af;border-radius:6px;font-size:11px;cursor:default;">
                ${user.firstName || ''} ${user.lastName || ''}
                <span class="reassign-chip-remove" data-email="${user.email}"
                    style="cursor:pointer;font-size:14px;line-height:1;margin-left:2px;color:#3b82f6;">&times;</span>
            </span>
        `).join('');

        chipsContainer.querySelectorAll('.reassign-chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedUsers.delete(btn.dataset.email);
                updateSelectedChips();
                updateCheckboxStates();
            });
        });
    }

    function updateCheckboxStates() {
        if (!currentModal) return;
        currentModal.querySelectorAll('.reassign-user-checkbox').forEach(cb => {
            cb.checked = selectedUsers.has(cb.dataset.email);
        });
    }

    function renderUserList(users, container) {
        if (users.length === 0) {
            container.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">${t('reassign.noUsersFound')}</div>`;
            return;
        }

        container.innerHTML = users.map(user => `
            <label class="reassign-user-row" data-email="${user.email}"
                style="display:block;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all 0.15s;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" class="reassign-user-checkbox" data-email="${user.email}"
                        ${selectedUsers.has(user.email) ? 'checked' : ''}
                        style="width:16px;height:16px;cursor:pointer;flex-shrink:0;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:500;color:#0f172a;">${user.firstName || ''} ${user.lastName || ''}</div>
                        <div style="font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;">${user.email} &bull; ${user.companyName || t('reassign.noCompany')}</div>
                    </div>
                    ${user.userRole === 'admin' ? '<span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;flex-shrink:0;">Admin</span>' : ''}
                </div>
            </label>
        `).join('');

        container.querySelectorAll('.reassign-user-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const email = cb.dataset.email;
                const user = users.find(u => u.email === email);
                if (cb.checked && user) {
                    selectedUsers.set(email, user);
                } else {
                    selectedUsers.delete(email);
                }
                updateSelectedChips();
            });
        });
    }

    async function doReassign(projectId, users, authHelper) {
        const response = await fetch(`${API_BASE}/projects/${projectId}/reassign`, {
            method: 'PUT',
            headers: authHelper.getAuthHeaders(),
            body: JSON.stringify({
                assignedUsers: users.map(u => ({
                    email: u.email,
                    userId: u.username,
                    name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
                    company: u.companyName || ''
                }))
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
        }
        return response.json();
    }

    window.openReassignModal = async function (projectId, currentOwnerEmail, authHelper, onSuccess) {
        selectedUsers.clear();

        const modal = document.createElement('div');
        modal.className = 'reassign-modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;';

        modal.innerHTML = `
            <div class="reassign-modal-content" style="background:white;border-radius:12px;width:480px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-size:16px;color:#0f172a;">${t('reassign.title')}</h3>
                    <button class="reassign-close-btn" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;padding:4px;line-height:1;">&times;</button>
                </div>
                <div style="padding:16px 24px;">
                    <div style="margin-bottom:12px;">
                        <label style="font-size:12px;color:#64748b;display:block;margin-bottom:4px;">${t('reassign.currentOwner')}</label>
                        <div id="reassignCurrentOwner" style="font-size:13px;color:#0f172a;padding:8px 12px;background:#f8fafc;border-radius:6px;">
                            ${currentOwnerEmail}
                        </div>
                    </div>
                    <div id="reassignSelectedChips" style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:8px 0;"></div>
                    <div style="position:relative;">
                        <input type="text" id="reassignUserSearch" placeholder="${t('reassign.searchPlaceholder')}"
                            style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;">
                    </div>
                </div>
                <div id="reassignUserList" style="flex:1;overflow-y:auto;padding:0 24px 0;max-height:300px;">
                    <div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">${t('reassign.loading')}</div>
                </div>
                <div style="padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;">
                    <button id="reassignConfirmBtn" disabled
                        style="background:#007bff;color:white;border:none;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;opacity:0.5;transition:opacity 0.15s;">
                        ${t('reassign.assignBtn')}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        currentModal = modal;

        // Close handlers
        modal.querySelector('.reassign-close-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        const searchInput = modal.querySelector('#reassignUserSearch');
        const userListContainer = modal.querySelector('#reassignUserList');
        const confirmBtn = modal.querySelector('#reassignConfirmBtn');

        try {
            const users = await fetchUsers(authHelper);

            // Find current owner info
            const currentOwner = findUserByEmail(users, currentOwnerEmail);
            const ownerDisplay = modal.querySelector('#reassignCurrentOwner');
            if (currentOwner) {
                ownerDisplay.textContent = `${currentOwner.firstName || ''} ${currentOwner.lastName || ''} (${currentOwner.email}) \u2014 ${currentOwner.companyName || t('reassign.noCompany')}`;
            }

            // Show initial prompt
            userListContainer.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">${t('reassign.searchPrompt')}</div>`;

            // Search handler
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    const term = searchInput.value.trim();
                    if (!term) {
                        userListContainer.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">${t('reassign.searchPrompt')}</div>`;
                        return;
                    }

                    const filtered = filterUsers(users, term, currentOwnerEmail);
                    renderUserList(filtered, userListContainer);
                }, 250);
            });

            // Confirm button
            confirmBtn.addEventListener('click', () => {
                handleConfirmAssign(projectId, currentOwner, currentOwnerEmail, authHelper, onSuccess);
            });

            searchInput.focus();
        } catch (err) {
            console.error('Failed to load users:', err);
            userListContainer.innerHTML = `<div style="text-align:center;color:#ef4444;padding:20px;font-size:13px;">${t('reassign.error').replace('{error}', err.message)}</div>`;
        }
    };

    async function handleConfirmAssign(projectId, currentOwner, currentOwnerEmail, authHelper, onSuccess) {
        if (selectedUsers.size === 0) return;

        const usersArray = Array.from(selectedUsers.values());
        const names = usersArray.map(u => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email);

        // Cross-company warning check
        const currentOwnerIsAdmin = currentOwner && currentOwner.userRole === 'admin';

        if (!currentOwnerIsAdmin) {
            const currentCompany = currentOwner ? (currentOwner.companyName || '') : '';
            const currentDomain = getEmailDomain(currentOwnerEmail);

            const hasDifferentCompany = usersArray.some(user => {
                const newCompany = user.companyName || '';
                if (currentCompany && newCompany) {
                    return currentCompany.toLowerCase() !== newCompany.toLowerCase();
                }
                return currentDomain !== getEmailDomain(user.email);
            });

            if (hasDifferentCompany) {
                if (!confirm(t('reassign.differentCompanyWarning'))) {
                    return;
                }
            }
        }

        const confirmBtn = currentModal && currentModal.querySelector('#reassignConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = t('reassign.assigning');
        }

        try {
            await doReassign(projectId, usersArray, authHelper);
            alert(t('reassign.success'));
            closeModal();
            if (onSuccess) onSuccess();
        } catch (err) {
            console.error('Assignment failed:', err);
            alert(t('reassign.error').replace('{error}', err.message));
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = t('reassign.assignBtn');
            }
        }
    }
})();
