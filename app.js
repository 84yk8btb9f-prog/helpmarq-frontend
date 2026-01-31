// Main application logic
import { getCurrentUser, signOut } from './lib/auth.js';
import { getCached, setCache, clearCache } from './lib/cache.js';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : 'https://helpmarq-backend.onrender.com/api';

console.log('🔗 API URL:', API_URL);

// ✅ ADD: Helper function for null-safe descriptions
function safeDescription(description, maxLength = 120) {
    if (!description) return 'No description available';
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength) + '...';
}

// Global state
let currentUser = null;
let userRole = null;
let currentReviewerId = null;

// Initialize
async function initialize() {
    console.log('=== APP INITIALIZATION START ===');

    try {
        // 1. Check authentication
        currentUser = await getCurrentUser();
        if (!currentUser) {
            console.log('❌ No user - redirecting to login');
            window.location.href = 'login.html';
            return;
        }
        console.log('✓ User authenticated:', currentUser.id);

        // 2. Load and verify role
        await loadAndVerifyRole();
        
        // ✅ FIX: Check if we were redirected
        if (!userRole) {
            console.log('No role set, stopping initialization');
            return;
        }

        // 3. Update UI
        updateUIForRole();

        // 4. Setup event listeners
        setupEventListeners();

        // 5. Load initial tab
        loadInitialTab();

        console.log('=== APP INITIALIZATION COMPLETE ===');

    } catch (error) {
        console.error('❌ Initialization error:', error);
        if (!error.message?.includes('redirect')) {
            showError('Failed to initialize. Please refresh the page.');
        }
    }
}

// Load and verify user role
async function loadAndVerifyRole() {
    console.log('=== LOADING ROLE ===');

    try {
        // First check: Backend (source of truth)
        const response = await fetch(`${API_URL}/user/me`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log('Backend role response:', result);

        if (result.success) {
            if (result.role === 'reviewer') {
                userRole = 'reviewer';
                currentReviewerId = result.data._id;
                localStorage.setItem('userRole', 'reviewer');
                localStorage.setItem('reviewerId', result.data._id);
                console.log('✓ REVIEWER role from backend');
                return;
                
            } else if (result.role === 'owner') {
                userRole = 'owner';
                localStorage.setItem('userRole', 'owner');
                console.log('✓ OWNER role from backend');
                return;
                
            } else if (result.role === null) {
                // ✅ FIX: User verified email but hasn't chosen role yet
                console.log('→ User verified but no role chosen yet');
                
                // Check if we just came from email verification
                const justVerified = sessionStorage.getItem('justVerified');
                if (justVerified) {
                    sessionStorage.removeItem('justVerified');
                    window.location.href = 'role-select.html';
                    return;
                }
                
                // Check localStorage as fallback
                const storedRole = localStorage.getItem('userRole');
                if (storedRole) {
                    console.log('Using stored role:', storedRole);
                    userRole = storedRole;
                    if (storedRole === 'reviewer') {
                        currentReviewerId = localStorage.getItem('reviewerId');
                    }
                    return;
                }
                
                // No role anywhere - go to role selection
                console.log('Redirecting to role-select');
                window.location.href = 'role-select.html';
                return;
            }
        }
        
    } catch (error) {
        console.error('Role load error:', error);
        
        // ✅ FIX: Better fallback logic
        const storedRole = localStorage.getItem('userRole');
        if (storedRole) {
            console.log('Backend failed, using stored role:', storedRole);
            userRole = storedRole;
            if (storedRole === 'reviewer') {
                currentReviewerId = localStorage.getItem('reviewerId');
            }
            return;
        }
        
        // No role, no localStorage - send to role selection
        console.log('No role found anywhere, redirecting to role-select');
        window.location.href = 'role-select.html';
    }
}

// Update UI based on role
function updateUIForRole() {
    console.log('=== UPDATING UI FOR ROLE:', userRole, '===');

    const uploadTabBtn = document.getElementById('uploadTabBtn');
    const applyTabBtn = document.getElementById('applyTabBtn');

    if (userRole === 'reviewer') {
        if (uploadTabBtn) uploadTabBtn.style.display = 'none';
        if (applyTabBtn) applyTabBtn.style.display = 'inline-block';
    } else if (userRole === 'owner') {
        if (applyTabBtn) applyTabBtn.style.display = 'none';
        if (uploadTabBtn) uploadTabBtn.style.display = 'inline-block';
    }

    console.log('✓ UI updated for role');
}

// Setup event listeners
function setupEventListeners() {
    console.log('=== SETTING UP EVENT LISTENERS ===');
    
    // Sign out button
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('Signing out...');
            await signOut();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'login.html';
        });
    }

    // Tab navigation
    const tabBtns = document.querySelectorAll('.tab-btn');
    console.log('Found tab buttons:', tabBtns.length);
    
    tabBtns.forEach((btn, index) => {
        console.log(`Tab ${index}:`, btn.dataset.tab, btn.textContent.trim());
        
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const targetTab = this.dataset.tab;
            console.log('🖱️ TAB CLICKED:', targetTab);
            
            if (!targetTab) {
                console.error('No data-tab attribute found');
                return;
            }
            
            switchTab(targetTab);
        });
    });

    // Upload form
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUploadProject);
    }
    const editProjectForm = document.getElementById('editProjectForm');
if (editProjectForm) {
    editProjectForm.addEventListener('submit', handleEditProjectSubmit);
}

    // Filters
    const filterType = document.getElementById('filterType');
    const sortProjects = document.getElementById('sortProjects');
    const searchProjects = document.getElementById('searchProjects');
    const refreshBtn = document.getElementById('refreshBtn');

    if (filterType) filterType.addEventListener('change', () => loadProjects());
    if (sortProjects) sortProjects.addEventListener('change', () => loadProjects());
    if (searchProjects) {
        let searchTimeout;
        searchProjects.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => loadProjects(), 300);
        });
    }
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            clearCache();
            loadProjects();
            loadReviewers();
            updateStats();
        });
    }

    // Modals
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModals();
        }
    });
    
    console.log('✓ Event listeners set up successfully');
}

// Switch tab
function switchTab(targetTab) {
    console.log('===> SWITCHING TO TAB:', targetTab);

    const allBtns = document.querySelectorAll('.tab-btn');
    allBtns.forEach(btn => {
        btn.classList.remove('active');
    });

    const targetBtn = document.querySelector(`[data-tab="${targetTab}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    const allContent = document.querySelectorAll('.tab-content');
    allContent.forEach(content => {
        content.classList.remove('active');
    });

    const targetContent = document.getElementById(`${targetTab}-tab`);
    if (targetContent) {
        targetContent.classList.add('active');
    }

    console.log('Loading data for tab:', targetTab);
    switch(targetTab) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'projects':
            loadProjects();
            break;
        case 'reviewers':
            loadReviewers();
            break;
        case 'apply':
            loadProjectsForApplication();
            break;
        case 'upload':
            console.log('Upload tab - static content');
            break;
        default:
            console.warn('Unknown tab:', targetTab);
    }
    
    console.log('✓ Tab switch complete');
}

// Load initial tab
function loadInitialTab() {
    console.log('=== LOADING INITIAL TAB ===');
    switchTab('projects');
    updateStats();
    loadReviewers();
}

// Load dashboard
async function loadDashboard() {
    console.log('Loading dashboard for role:', userRole);
    
    if (userRole === 'owner') {
        document.getElementById('ownerDashboard').style.display = 'block';
        document.getElementById('reviewerDashboard').style.display = 'none';
        await loadOwnerDashboard();
    } else if (userRole === 'reviewer') {
        document.getElementById('ownerDashboard').style.display = 'none';
        document.getElementById('reviewerDashboard').style.display = 'block';
        await loadReviewerDashboard();
    }
}

// Load owner dashboard
async function loadOwnerDashboard() {
    console.log('=== LOADING OWNER DASHBOARD ===');
    
    try {
        const ownerDash = document.getElementById('ownerDashboard');
        const reviewerDash = document.getElementById('reviewerDashboard');
        
        if (ownerDash) ownerDash.style.display = 'block';
        if (reviewerDash) reviewerDash.style.display = 'none';
        
        const response = await fetch(`${API_URL}/projects`, { 
            credentials: 'include' 
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        console.log('All projects:', result.data?.length || 0);

        if (!result.success) throw new Error(result.error);

        const userProjects = (result.data || []).filter(p => p.ownerId === currentUser.id);
        console.log('User projects:', userProjects.length);

        const stats = {
            totalProjects: userProjects.length,
            totalApplicants: userProjects.reduce((sum, p) => sum + (p.applicantsCount || 0), 0),
            totalFeedback: userProjects.reduce((sum, p) => sum + (p.reviewsCount || 0), 0)
        };
        
        console.log('Stats:', stats);

        const updateStat = (id, value) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        };
        
        updateStat('ownerTotalProjects', stats.totalProjects);
        updateStat('ownerTotalApplicants', stats.totalApplicants);
        updateStat('ownerTotalFeedback', stats.totalFeedback);

        const projectsList = document.getElementById('ownerProjectsList');
        if (projectsList) {
            if (userProjects.length === 0) {
                projectsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📦</div>
                        <div class="empty-title">No projects yet</div>
                        <div class="empty-message">Upload your first project to get started!</div>
                    </div>
                `;
            } else {
                displayProjects(userProjects, 'ownerProjectsList');
            }
        }
        
        console.log('✓ Owner dashboard loaded');
        
    } catch (error) {
        console.error('❌ Load owner dashboard error:', error);
        showError('Failed to load dashboard: ' + error.message);
    }
}

// ✅ FIXED: Load reviewer dashboard with past reviews
async function loadReviewerDashboard() {
    if (!currentReviewerId) {
        console.log('No reviewer ID - loading from backend');
        await loadAndVerifyRole();
        if (!currentReviewerId) {
            document.getElementById('reviewerDashboard').innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-title">Loading...</div></div>';
            return;
        }
    }

    try {
        // Get reviewer stats
        const response = await fetch(`${API_URL}/reviewers/${currentReviewerId}`, { 
            credentials: 'include' 
        });
        const result = await response.json();

        if (result.success) {
            const reviewer = result.data;

            document.getElementById('reviewerLevel').textContent = reviewer.level;
            document.getElementById('reviewerXP').textContent = reviewer.xp;
            document.getElementById('reviewerTotalReviews').textContent = reviewer.totalReviews;
            document.getElementById('reviewerAvgRating').textContent = reviewer.averageRating.toFixed(1);

            const levelThresholds = [0, 500, 1000, 1500, 2000, 2500];
            const currentLevelMin = levelThresholds[reviewer.level - 1] || 0;
            const nextLevelMin = levelThresholds[reviewer.level] || 2500;
            const progressPercent = ((reviewer.xp - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100;

            document.getElementById('xpProgressFill').style.width = `${Math.min(progressPercent, 100)}%`;

            const xpNeeded = nextLevelMin - reviewer.xp;
            document.getElementById('xpProgressText').textContent = xpNeeded > 0 ? `${xpNeeded} XP to Level ${reviewer.level + 1}` : 'Max level!';
        }

        // ✅ NEW: Load past reviews
        const feedbackResponse = await fetch(`${API_URL}/feedback/reviewer/${currentReviewerId}`, {
            credentials: 'include'
        });
        const feedbackResult = await feedbackResponse.json();

        const reviewsList = document.getElementById('reviewerApplicationsList');
        if (reviewsList) {
            if (feedbackResult.success && feedbackResult.data.length > 0) {
                reviewsList.innerHTML = '<h3 style="margin-bottom: 1rem;">Your Past Reviews</h3>';
                
                feedbackResult.data.forEach(feedback => {
                    const card = document.createElement('div');
                    card.className = 'feedback-card';
                    card.style.marginBottom = '1rem';
                    
                    const project = feedback.projectId;
                    const date = new Date(feedback.submittedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    });
                    
                    card.innerHTML = `
                        <h4 style="margin-bottom: 0.5rem;">${escapeHtml(project?.title || 'Project')}</h4>
                        <p style="color: var(--neutral-mid); font-size: 14px; margin-bottom: 1rem;">
                            ${date} • ${project?.type || 'Unknown type'}
                        </p>
                        <div style="background: var(--neutral-light); padding: 12px; border-radius: 8px; margin-bottom: 1rem;">
                            <p style="color: var(--neutral-mid); margin: 0; font-size: 14px;">
                                ${escapeHtml(safeDescription(feedback.feedbackText, 150))}
                            </p>
                        </div>
                        ${feedback.isRated ? `
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: var(--neutral-dark);">Rating:</strong>
                                    <span style="color: #F59E0B; font-size: 18px; margin-left: 8px;">
                                        ${'★'.repeat(feedback.ownerRating)}${'☆'.repeat(5 - feedback.ownerRating)}
                                    </span>
                                </div>
                                <div style="text-align: right;">
                                    <span style="color: var(--success-green); font-weight: 700; font-size: 18px;">
                                        +${feedback.xpAwarded} XP
                                    </span>
                                </div>
                            </div>
                        ` : `
                            <p style="color: var(--warning-orange); font-size: 14px; margin: 0;">
                                ⏳ Awaiting rating from owner
                            </p>
                        `}
                    `;
                    
                    reviewsList.appendChild(card);
                });
            } else {
                reviewsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">💬</div>
                        <div class="empty-title">No reviews yet</div>
                        <div class="empty-message">Apply to projects and submit reviews to build your portfolio!</div>
                    </div>
                `;
            }
        }

    } catch (error) {
        console.error('Load reviewer dashboard error:', error);
    }
}

// Load projects
async function loadProjects() {
    try {
        const projectsGrid = document.getElementById('projectsGrid');
        projectsGrid.innerHTML = '<div class="loading">Loading projects...</div>';

        const filters = {};
        const typeFilter = document.getElementById('filterType');
        if (typeFilter?.value) filters.type = typeFilter.value;

        const sortFilter = document.getElementById('sortProjects');
        if (sortFilter?.value) filters.sort = sortFilter.value;

        const searchInput = document.getElementById('searchProjects');
        if (searchInput?.value) filters.search = searchInput.value;

        const params = new URLSearchParams(filters);
        const response = await fetch(`${API_URL}/projects?${params.toString()}`, { 
            credentials: 'include' 
        });
        const result = await response.json();

        if (!result.success) throw new Error(result.error);

        let projectsToShow = result.data;
        
        if (userRole === 'owner') {
            projectsToShow = result.data.filter(p => p.ownerId === currentUser.id);
        } else if (userRole === 'reviewer') {
            projectsToShow = result.data.filter(p => {
                const isOpen = new Date(p.deadline) > new Date();
                const notOwn = p.ownerId !== currentUser.id;
                return isOpen && notOwn;
            });
        }

        displayProjects(projectsToShow, 'projectsGrid');

    } catch (error) {
        console.error('Load projects error:', error);
        document.getElementById('projectsGrid').innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error loading projects</div></div>';
    }
}

// ✅ FIXED: Open applicants modal with reviewer profile
window.openApplicantsModal = async function(projectId) {
    console.log('Opening applicants modal for project:', projectId);
    
    try {
        const modal = document.getElementById('applicantsModal');
        const applicantsList = document.getElementById('applicantsList');
        
        if (!modal || !applicantsList) {
            console.error('Modal elements not found');
            return;
        }
        
        modal.dataset.projectId = projectId;
        applicantsList.innerHTML = '<div class="loading">Loading applicants...</div>';
        modal.classList.add('active');
        
        const response = await fetch(`${API_URL}/applications/project/${projectId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Applicants response:', result);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        const applications = result.data;
        
        if (applications.length === 0) {
            applicantsList.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No applicants yet</div><div class="empty-message">Reviewers will see your project and can apply to review it.</div></div>';
            return;
        }
        
        applicantsList.innerHTML = '';
        
        applications.forEach(app => {
            const card = document.createElement('div');
            card.className = 'applicant-card';
            
            const reviewerInfo = app.reviewerId || {};
            const reviewerLevel = reviewerInfo.level || '?';
            const reviewerXP = reviewerInfo.xp || 0;
            const reviewerRating = reviewerInfo.averageRating || 0;
            const reviewerReviews = reviewerInfo.totalReviews || 0;
            
            let statusBadge = '';
            let actions = '';
            
            if (app.status === 'pending') {
                statusBadge = '<span class="status-badge pending">⏳ Pending</span>';
                actions = `
                    <div class="applicant-actions">
                        <button class="btn-success btn-small" onclick="window.approveApplication('${app._id}')">
                            ✓ Approve
                        </button>
                        <button class="btn-danger btn-small" onclick="window.rejectApplication('${app._id}')">
                            ✗ Reject
                        </button>
                        <button class="btn-secondary btn-small" onclick="window.viewReviewerProfile('${app.reviewerId._id}')">
                            👤 View Full Profile
                        </button>
                    </div>
                `;
            } else if (app.status === 'approved') {
                statusBadge = '<span class="status-badge approved">✓ Approved</span>';
                actions = `
                    <button class="btn-secondary btn-small" onclick="window.viewReviewerProfile('${app.reviewerId._id}')">
                        👤 View Full Profile
                    </button>
                `;
            } else {
                statusBadge = '<span class="status-badge rejected">✗ Rejected</span>';
            }
            
            card.innerHTML = `
                <div class="applicant-header">
                    <div>
                        <h4 style="cursor: pointer; color: var(--primary-blue);" onclick="window.viewReviewerProfile('${app.reviewerId._id}')">
                            ${escapeHtml(app.reviewerUsername)} ↗
                        </h4>
                        <p style="color: var(--neutral-mid); font-size: 14px; margin: 4px 0;">
                            Level ${reviewerLevel} • ${reviewerXP} XP • ${reviewerReviews} reviews • ${reviewerRating > 0 ? reviewerRating.toFixed(1) + '★' : 'Not rated yet'}
                        </p>
                    </div>
                    ${statusBadge}
                </div>
                
                <div style="background: var(--neutral-light); padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <strong style="display: block; margin-bottom: 8px; color: var(--neutral-dark);">Qualifications:</strong>
                    <p style="color: var(--neutral-mid); margin: 0; line-height: 1.6;">${escapeHtml(app.qualifications)}</p>
                </div>
                
                <div style="background: var(--neutral-light); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <strong style="display: block; margin-bottom: 8px; color: var(--neutral-dark);">Focus Areas:</strong>
                    <p style="color: var(--neutral-mid); margin: 0; line-height: 1.6;">${escapeHtml(app.focusAreas)}</p>
                </div>
                
                <p style="color: var(--neutral-mid); font-size: 13px;">
                    Applied ${new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
                
                ${actions}
            `;
            
            applicantsList.appendChild(card);
        });
        
        console.log('✓ Applicants modal loaded');
        
    } catch (error) {
        console.error('Load applicants error:', error);
        const applicantsList = document.getElementById('applicantsList');
        if (applicantsList) {
            applicantsList.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error loading applicants</div><div class="empty-message">' + escapeHtml(error.message) + '</div></div>';
        }
    }
};

// ✅ FIXED: View reviewer full profile
window.viewReviewerProfile = async function(reviewerId) {
    console.log('Opening profile:', reviewerId);
    
    const modal = document.getElementById('reviewerProfileModal');
    const content = document.getElementById('reviewerProfileContent');
    
    if (!modal || !content) {
        alert('Modal not found');
        return;
    }
    
    // Show modal - inline style
    modal.style.display = 'flex';
    
    content.innerHTML = '<div style="text-align:center;padding:40px;"><p>Loading...</p></div>';
    
    const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000/api'
        : 'https://helpmarq-backend.onrender.com/api';
    
    try {
        const response = await fetch(`${API_URL}/reviewers/${reviewerId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to fetch');
        
        const result = await response.json();
        if (!result.success) throw new Error(result.message || 'Failed');
        
        const r = result.data;
        
        content.innerHTML = `
            <div style="padding:20px;color:#000;">
                <h2 style="margin:0 0 20px;color:#1C1C1E;">${r.firstName || ''} ${r.lastName || ''}</h2>
                <p style="margin:8px 0;"><strong>Rating:</strong> ${(r.averageRating || 0).toFixed(1)}/5</p>
                <p style="margin:8px 0;"><strong>XP:</strong> ${r.xp || 0}</p>
                <p style="margin:8px 0;"><strong>Reviews:</strong> ${r.completedReviews || 0}</p>
                <p style="margin:8px 0;"><strong>Bio:</strong> ${r.bio || 'None'}</p>
                ${r.portfolio ? `<p style="margin:8px 0;"><strong>Portfolio:</strong> <a href="${r.portfolio}" target="_blank" style="color:#2C5EF0;">${r.portfolio}</a></p>` : ''}
                <button onclick="document.getElementById('reviewerProfileModal').style.display='none'" 
                        style="margin-top:20px;padding:12px 24px;background:#2C5EF0;color:white;border:none;border-radius:8px;cursor:pointer;width:100%;">
                    Close
                </button>
            </div>
        `;
        
    } catch (error) {
        console.error('Error:', error);
        content.innerHTML = `
            <div style="padding:40px;text-align:center;">
                <p style="color:red;">Error: ${error.message}</p>
                <button onclick="document.getElementById('reviewerProfileModal').style.display='none'" 
                        style="margin-top:16px;padding:10px 20px;background:#2C5EF0;color:white;border:none;border-radius:8px;cursor:pointer;">
                    Close
                </button>
            </div>
        `;
    }
};

// Close modal handlers
document.addEventListener('DOMContentLoaded', function() {
    console.log('Setting up modal close handlers');
    
    // Close button
    const closeButtons = document.querySelectorAll('.modal-close');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
                modal.style.display = 'none';
            }
        });
    });
    
    // Click outside
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
                this.style.display = 'none';
            }
     });
    });
    
    console.log('Modal handlers ready');
});





// Approve application
window.approveApplication = async function(applicationId) {
    try {
        const response = await fetch(`${API_URL}/applications/${applicationId}/approve`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        showSuccess('Application approved! Reviewer notified.');
        
        const modal = document.getElementById('applicantsModal');
        const projectId = modal.dataset.projectId;
        if (projectId) {
            await openApplicantsModal(projectId);
        }
        
    } catch (error) {
        showError(error.message);
    }
};

// Reject application
window.rejectApplication = async function(applicationId) {
    if (!confirm('Reject this application?')) return;
    
    try {
        const response = await fetch(`${API_URL}/applications/${applicationId}/reject`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        showSuccess('Application rejected.');
        
        const modal = document.getElementById('applicantsModal');
        const projectId = modal.dataset.projectId;
        if (projectId) {
            await openApplicantsModal(projectId);
        }
        
    } catch (error) {
        showError(error.message);
    }
};

function displayProjects(projects, containerId = 'projectsGrid') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No projects found</div></div>';
        return;
    }

    container.innerHTML = '';

    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';

        const deadline = new Date(project.deadline);
        const now = new Date();
        const hoursLeft = Math.floor((deadline - now) / (1000 * 60 * 60));
        const daysLeft = Math.floor(hoursLeft / 24);

        let deadlineText, deadlineColor;
        if (hoursLeft < 0) {
            deadlineText = 'Deadline passed';
            deadlineColor = '#EF4444';
        } else if (hoursLeft < 24) {
            deadlineText = `${hoursLeft}h left`;
            deadlineColor = '#EF4444';
        } else if (daysLeft < 3) {
            deadlineText = `${daysLeft}d left`;
            deadlineColor = '#F59E0B';
        } else {
            deadlineText = `${daysLeft}d left`;
            deadlineColor = '#10B981';
        }

        let actionsHTML = '';
        if (userRole === 'owner' && project.ownerId === currentUser.id) {
            actionsHTML = `
                <div class="project-actions">
                    <button class="btn-secondary btn-small" onclick="window.openApplicantsModal('${project._id}')">
                        📋 Applicants (${project.applicantsCount})
                    </button>
                    <button class="btn-secondary btn-small" onclick="window.openFeedbackListModal('${project._id}'); document.getElementById('feedbackListModal').dataset.projectId='${project._id}'">
                        💬 Feedback (${project.reviewsCount})
                    </button>
                    <button class="btn-secondary btn-small" onclick="window.editProject('${project._id}')">
                        ✏️ Edit
                    </button>
                    <button class="btn-danger btn-small" onclick="window.deleteProject('${project._id}')">
                        🗑️ Delete
                    </button>
                </div>
            `;
        }

        card.innerHTML = `
            <h3>${escapeHtml(project.title)}</h3>
            <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
                <span class="project-badge badge-${project.type}">${project.type}</span>
                <span class="project-badge" style="background: ${deadlineColor}; color: white;">⏰ ${deadlineText}</span>
                ${project.reviewersNeeded ? `<span class="project-badge" style="background: #8B5CF6; color: white;">👥 ${project.reviewersNeeded} reviewers</span>` : ''}
            </div>
            <p class="project-desc">${escapeHtml(safeDescription(project.description, 120))}</p>
            ${(userRole === 'owner' && project.ownerId === currentUser.id) ? `
                <a href="${project.link}" target="_blank" class="project-link">🔗 ${project.link}</a>
            ` : `
                <p class="project-link" style="color: var(--warning-orange);">🔒 Link visible after approval</p>
            `}
            <div class="project-meta">
                <span>By ${escapeHtml(project.ownerName)}</span>
                <span class="project-xp">+${project.xpReward} XP</span>
            </div>
            <p class="project-applicants">📋 ${project.applicantsCount} applicants | ✅ ${project.approvedCount}/${project.reviewersNeeded || 2} approved</p>
            ${actionsHTML}
        `;

        container.appendChild(card);
    });
}

// Upload project
async function handleUploadProject(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    try {
        const deadlineValue = document.getElementById('deadline').value;
        const deadline = new Date(deadlineValue);

        if (deadline <= new Date()) {
            throw new Error('Deadline must be in the future');
        }

        const projectData = {
            title: document.getElementById('title').value.trim(),
            description: document.getElementById('description').value.trim(),
            type: document.getElementById('type').value,
            link: document.getElementById('link').value.trim(),
            ownerId: currentUser.id,
            ownerName: currentUser.name || currentUser.email,
            ownerEmail: currentUser.email,
            xpReward: parseInt(document.getElementById('xpReward').value),
            reviewersNeeded: parseInt(document.getElementById('reviewersNeeded').value),
            deadline: deadline.toISOString()
        };

        const response = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(projectData)
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        showSuccess('Project uploaded successfully!');
        document.getElementById('uploadForm').reset();
        switchTab('projects');

    } catch (error) {
        showError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Project';
    }
}

// Load reviewers
async function loadReviewers() {
    try {
        const response = await fetch(`${API_URL}/reviewers?limit=10`, { credentials: 'include' });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        displayReviewers(result.data);
    } catch (error) {
        console.error('Load reviewers error:', error);
    }
}

// Display reviewers
function displayReviewers(reviewers) {
    const reviewersList = document.getElementById('reviewersList');

    if (reviewers.length === 0) {
        reviewersList.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-title">No reviewers yet</div></div>';
        return;
    }

    reviewersList.innerHTML = '';

    reviewers.forEach(reviewer => {
        const card = document.createElement('div');
        card.className = 'reviewer-card';

        card.innerHTML = `
            <div class="reviewer-info">
                <h3>${escapeHtml(reviewer.username)}</h3>
                <p class="reviewer-level">Level ${reviewer.level}</p>
            </div>
            <div class="reviewer-stats">
                <div>
                    <div class="reviewer-stat-value">${reviewer.xp}</div>
                    <div class="reviewer-stat-label">XP</div>
                </div>
                <div>
                    <div class="reviewer-stat-value">${reviewer.totalReviews}</div>
                    <div class="reviewer-stat-label">Reviews</div>
                </div>
                <div>
                    <div class="reviewer-stat-value">${reviewer.averageRating.toFixed(1)}</div>
                    <div class="reviewer-stat-label">Rating</div>
                </div>
            </div>
        `;

        reviewersList.appendChild(card);
    });
}

// Update stats
async function updateStats() {
    try {
        const response = await fetch(`${API_URL}/stats`, { credentials: 'include' });
        const result = await response.json();

        if (result.success) {
            document.getElementById('totalProjects').textContent = result.data.totals.projects;
            document.getElementById('totalReviewers').textContent = result.data.totals.reviewers;
            document.getElementById('totalApplications').textContent = result.data.totals.applications;
        }
    } catch (error) {
        console.error('Update stats error:', error);
    }
}

// ✅ FIXED: Load projects for application with null-safe descriptions and project access
async function loadProjectsForApplication() {
    const container = document.getElementById('applyProjectsList');
    
    if (!currentReviewerId) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-title">Loading...</div></div>';
        return;
    }

    try {
        container.innerHTML = '<div class="loading">Loading projects...</div>';

        // Get reviewer's applications
        const appsResponse = await fetch(`${API_URL}/applications/reviewer/${currentReviewerId}`, { 
            credentials: 'include' 
        });
        const appsResult = await appsResponse.json();
        
        if (!appsResult.success) throw new Error(appsResult.error);
        
        const applications = appsResult.data;
        const approvedApps = applications.filter(app => app.status === 'approved');
        const pendingApps = applications.filter(app => app.status === 'pending');
        const appliedProjectIds = applications.map(app => app.projectId._id || app.projectId);
        
        // Get reviewer's feedback
        const feedbackResponse = await fetch(`${API_URL}/feedback/reviewer/${currentReviewerId}`, {
            credentials: 'include'
        });
        const feedbackResult = await feedbackResponse.json();
        const submittedProjectIds = feedbackResult.success 
            ? feedbackResult.data.map(f => f.projectId._id || f.projectId)
            : [];
        
        // Get all projects
        const projectsResponse = await fetch(`${API_URL}/projects?sort=newest`, { 
            credentials: 'include' 
        });
        const projectsResult = await projectsResponse.json();
        
        if (!projectsResult.success) throw new Error(projectsResult.error);
        
        // Filter available projects (not applied AND not own)
        const availableProjects = projectsResult.data.filter(p => {
            const notApplied = !appliedProjectIds.includes(p._id);
            const notOwn = p.ownerId !== currentUser.id;
            const isOpen = new Date(p.deadline) > new Date();
            return notApplied && notOwn && isOpen;
        });
        
        container.innerHTML = '';
        
        // ✅ APPROVED PROJECTS SECTION
        if (approvedApps.length > 0) {
            const approvedSection = document.createElement('div');
            approvedSection.innerHTML = '<h3 style="color: var(--success-green); margin-bottom: 1rem;">✅ Approved - Submit Your Feedback</h3>';
            container.appendChild(approvedSection);
            
            for (const app of approvedApps) {
    const project = app.projectId;
    const hasFeedback = submittedProjectIds.includes(project._id);
    
    const card = document.createElement('div');
    card.className = 'apply-project-card';
    card.style.borderColor = 'var(--success-green)';
    
    const deadline = new Date(project.deadline);
    const hoursLeft = Math.floor((deadline - new Date()) / (1000 * 60 * 60));
    const daysLeft = Math.floor(hoursLeft / 24);
    
    card.innerHTML = `
        <div class="apply-project-info">
            <h4>${escapeHtml(project.title)}</h4>
            <p style="color: var(--neutral-mid); margin: 8px 0;">
                <span class="project-badge badge-${project.type}">${project.type}</span>
                <span style="margin-left: 12px;">⏰ ${daysLeft}d ${hoursLeft % 24}h left</span>
            </p>
            <div style="background: var(--neutral-light); padding: 16px; border-radius: 8px; margin: 12px 0;">
                <strong style="display: block; margin-bottom: 8px; color: var(--neutral-dark);">Full Description:</strong>
                <p style="color: var(--neutral-mid); margin: 0; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(project.description || 'No description available')}</p>
            </div>
            <p style="color: var(--primary-blue); margin: 8px 0;">
                🔗 <a href="${project.link}" target="_blank" style="color: var(--primary-blue);">${project.link}</a>
            </p>
            <p style="color: var(--success-green); font-weight: 700; font-size: 18px; margin: 8px 0;">+${project.xpReward} XP</p>
            ${hasFeedback ? `
                <p style="color: var(--success-green); font-weight: 600; margin: 8px 0;">
                    ✅ Feedback submitted!
                </p>
            ` : ''}
        </div>
        ${hasFeedback ? `
            <button class="btn-secondary" disabled>
                ✅ Feedback Submitted
            </button>
        ` : `
            <button class="btn-primary" onclick="window.openFeedbackModal('${project._id}')">
                📝 Submit Feedback
            </button>
        `}
    `;
    
    approvedSection.appendChild(card);
}
        }
        
        // ✅ PENDING APPLICATIONS SECTION
        if (pendingApps.length > 0) {
            const pendingSection = document.createElement('div');
            pendingSection.innerHTML = '<h3 style="color: var(--warning-orange); margin: 2rem 0 1rem 0;">⏳ Pending Approval</h3>';
            container.appendChild(pendingSection);
            
            pendingApps.forEach(app => {
                const project = app.projectId;
                const card = document.createElement('div');
                card.className = 'apply-project-card';
                card.style.borderColor = 'var(--warning-orange)';
                card.style.opacity = '0.7';
                
                card.innerHTML = `
                    <div class="apply-project-info">
                        <h4>${escapeHtml(project.title)}</h4>
                        <p style="color: var(--warning-orange); font-weight: 600;">Waiting for owner approval...</p>
                    </div>
                    <button class="btn-secondary" disabled>
                        ⏳ Pending
                    </button>
                `;
                
                container.appendChild(card);
            });
        }
        
        // ✅ AVAILABLE PROJECTS SECTION
        if (availableProjects.length > 0) {
            const availableSection = document.createElement('div');
            availableSection.innerHTML = '<h3 style="color: var(--primary-blue); margin: 2rem 0 1rem 0;">📦 Available Projects</h3>';
            container.appendChild(availableSection);
            
            availableProjects.forEach(project => {
                const card = document.createElement('div');
                card.className = 'apply-project-card';
                
                const deadline = new Date(project.deadline);
                const hoursLeft = Math.floor((deadline - new Date()) / (1000 * 60 * 60));
                const daysLeft = Math.floor(hoursLeft / 24);
                
                card.innerHTML = `
                    <div class="apply-project-info">
                        <h4>${escapeHtml(project.title)}</h4>
                        <p style="color: var(--neutral-mid); margin: 8px 0;">
                            <span class="project-badge badge-${project.type}">${project.type}</span>
                            <span style="margin-left: 12px;">⏰ ${daysLeft}d ${hoursLeft % 24}h left</span>
                        </p>
                        <p style="color: var(--neutral-mid); margin: 8px 0;">
                            ${escapeHtml(safeDescription(project.description, 80))}
                        </p>
                        <p style="color: var(--warning-orange); font-size: 13px; margin: 8px 0;">
                            🔒 Full details visible after approval
                        </p>
                        <p style="color: var(--success-green); font-weight: 700; font-size: 18px; margin: 8px 0;">+${project.xpReward} XP</p>
                    </div>
                    <button class="btn-primary" onclick="window.openApplicationModal('${project._id}')">
                        Apply to Review
                    </button>
                `;
                
                container.appendChild(card);
            });
        }
        
        if (approvedApps.length === 0 && pendingApps.length === 0 && availableProjects.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No projects available</div><div class="empty-message">Check back later!</div></div>';
        }

    } catch (error) {
        console.error('Load projects for application error:', error);
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error loading projects</div></div>';
    }
}

// Open application modal
window.openApplicationModal = async function(projectId) {
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}`, { credentials: 'include' });
        const result = await response.json();

        if (!result.success) throw new Error(result.error);

        const project = result.data;
        
        const modalInfo = document.getElementById('modalProjectInfo');
        modalInfo.innerHTML = `
            <h3>${escapeHtml(project.title)}</h3>
            <p style="margin: 12px 0;"><span class="project-badge badge-${project.type}">${project.type}</span></p>
            <p style="color: var(--neutral-mid);">${escapeHtml(safeDescription(project.description, 200))}</p>
            <p style="color: var(--success-green); font-weight: 700; margin-top: 12px;">Reward: +${project.xpReward} XP</p>
        `;

        const applicationForm = document.getElementById('applicationForm');
        applicationForm.onsubmit = (e) => handleApplicationSubmit(e, projectId);

        document.getElementById('applicationModal').classList.add('active');

    } catch (error) {
        showError(error.message);
    }
};

// Handle application submit
async function handleApplicationSubmit(e, projectId) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        const qualifications = document.getElementById('qualifications').value.trim();
        const focusAreas = document.getElementById('focusAreas').value.trim();
        const ndaAccept = document.getElementById('ndaAccept').checked;

        if (!ndaAccept) {
            throw new Error('You must accept the NDA to apply');
        }

        const reviewerResponse = await fetch(`${API_URL}/reviewers/${currentReviewerId}`, { credentials: 'include' });
        const reviewerResult = await reviewerResponse.json();
        const reviewer = reviewerResult.data;

        const response = await fetch(`${API_URL}/applications`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId,
                reviewerId: currentReviewerId,
                reviewerUsername: reviewer.username,
                qualifications,
                focusAreas
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        showSuccess('Application submitted successfully!');
        closeModals();
        document.getElementById('applicationForm').reset();
        loadProjectsForApplication();

    } catch (error) {
        showError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Application';
    }
}

// Open feedback list modal
window.openFeedbackListModal = async function(projectId) {
    console.log('Opening feedback list for project:', projectId);
    
    try {
        const modal = document.getElementById('feedbackListModal');
        const feedbackList = document.getElementById('feedbackList');
        
        if (!modal || !feedbackList) {
            console.error('Feedback list modal elements not found');
            return;
        }
        
        feedbackList.innerHTML = '<div class="loading">Loading feedback...</div>';
        modal.classList.add('active');
        
        const response = await fetch(`${API_URL}/feedback/project/${projectId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        console.log('Feedback result:', result);
        
        if (!result.success) throw new Error(result.error);
        
        const feedbackItems = result.data;
        
        if (feedbackItems.length === 0) {
            feedbackList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <div class="empty-title">No feedback yet</div>
                    <div class="empty-message">Approved reviewers will submit feedback here.</div>
                </div>
            `;
            return;
        }
        
        feedbackList.innerHTML = '';
        
        feedbackItems.forEach(feedback => {
            const card = document.createElement('div');
            card.className = 'feedback-card';
            
            const date = new Date(feedback.submittedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
            
            let ratingSection = '';
            if (feedback.isRated) {
                ratingSection = `
                    <div style="background: #D1FAE5; padding: 16px; border-radius: 8px; margin-top: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: #065F46;">Your Rating:</strong>
                                <div style="font-size: 24px; color: #F59E0B; margin-top: 4px;">
                                    ${'★'.repeat(feedback.ownerRating)}${'☆'.repeat(5 - feedback.ownerRating)}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 20px; font-weight: 700; color: #10B981;">+${feedback.xpAwarded} XP</div>
                                <div style="font-size: 12px; color: #065F46;">Awarded</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                ratingSection = `
                    <div style="background: #FEF3C7; padding: 16px; border-radius: 8px; margin-top: 16px;">
                        <strong style="color: #92400E; display: block; margin-bottom: 12px;">Rate This Feedback:</strong>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button class="btn-success btn-small" onclick="window.rateFeedback('${feedback._id}', 5)">★★★★★ Excellent</button>
                            <button class="btn-success btn-small" onclick="window.rateFeedback('${feedback._id}', 4)">★★★★☆ Good</button>
                            <button class="btn-secondary btn-small" onclick="window.rateFeedback('${feedback._id}', 3)">★★★☆☆ Average</button>
                            <button class="btn-secondary btn-small" onclick="window.rateFeedback('${feedback._id}', 2)">★★☆☆☆ Below</button>
                            <button class="btn-danger btn-small" onclick="window.rateFeedback('${feedback._id}', 1)">★☆☆☆☆ Poor</button>
                        </div>
                    </div>
                `;
            }
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                    <div>
                        <h4 style="margin: 0; color: var(--neutral-dark);">${escapeHtml(feedback.reviewerUsername)}</h4>
                        <p style="color: var(--neutral-mid); font-size: 13px; margin: 4px 0 0 0;">${date}</p>
                    </div>
                    ${feedback.projectRating ? `
                        <div style="text-align: right;">
                            <div style="font-size: 20px; color: #F59E0B;">${'★'.repeat(feedback.projectRating)}${'☆'.repeat(5 - feedback.projectRating)}</div>
                            <div style="font-size: 12px; color: var(--neutral-mid);">Project Rating</div>
                        </div>
                    ` : ''}
                </div>
                
                <div style="background: var(--neutral-light); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="color: var(--neutral-mid); line-height: 1.6; margin: 0; white-space: pre-wrap;">${escapeHtml(feedback.feedbackText)}</p>
                </div>
                
                ${ratingSection}
            `;
            
            feedbackList.appendChild(card);
        });
        
        console.log('✓ Feedback list loaded');
        
    } catch (error) {
        console.error('Load feedback list error:', error);
        const feedbackList = document.getElementById('feedbackList');
        if (feedbackList) {
            feedbackList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">❌</div>
                    <div class="empty-title">Error loading feedback</div>
                    <div class="empty-message">${escapeHtml(error.message)}</div>
                </div>
            `;
        }
    }
};

// Rate feedback function
window.rateFeedback = async function(feedbackId, rating) {
    console.log('Rating feedback:', feedbackId, 'with', rating, 'stars');
    
    try {
        const response = await fetch(`${API_URL}/feedback/${feedbackId}/rate`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        console.log('Rate feedback result:', result);
        
        if (!result.success) throw new Error(result.error);
        
        showSuccess(`✅ Rated ${rating} stars! Reviewer earned ${result.data.xpAwarded} XP.`);
        
        const modal = document.getElementById('feedbackListModal');
        const projectId = modal.dataset.projectId;
        if (projectId) {
            await openFeedbackListModal(projectId);
        }
        
    } catch (error) {
        console.error('Rate feedback error:', error);
        showError('Failed to rate: ' + error.message);
    }
};

// Open feedback modal
window.openFeedbackModal = async function(projectId) {
    console.log('Opening feedback modal for project:', projectId);
    
    try {
        const modal = document.getElementById('feedbackModal');
        const feedbackProjectInfo = document.getElementById('feedbackProjectInfo');
        
        if (!modal || !feedbackProjectInfo) {
            console.error('Feedback modal elements not found');
            return;
        }
        
        const response = await fetch(`${API_URL}/projects/${projectId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        const project = result.data;
        
        feedbackProjectInfo.innerHTML = `
            <h3>${escapeHtml(project.title)}</h3>
            <p style="margin: 12px 0;"><span class="project-badge badge-${project.type}">${project.type}</span></p>
            <p style="color: var(--neutral-mid);">${escapeHtml(safeDescription(project.description, 200))}</p>
            <p style="color: var(--success-green); font-weight: 700; margin-top: 12px;">Reward: +${project.xpReward} XP</p>
        `;
        
        const feedbackForm = document.getElementById('feedbackForm');
        feedbackForm.onsubmit = (e) => handleFeedbackSubmit(e, projectId);
        
        const feedbackText = document.getElementById('feedbackText');
        const feedbackCounter = document.getElementById('feedbackCounter');
        
        feedbackText.value = '';
        feedbackCounter.textContent = '0 / 50 characters minimum';
        feedbackCounter.style.color = 'var(--error-red)';
        
        feedbackText.oninput = () => {
            const length = feedbackText.value.length;
            feedbackCounter.textContent = `${length} / 50 characters minimum`;
            feedbackCounter.style.color = length >= 50 ? 'var(--success-green)' : 'var(--error-red)';
        };
        
        modal.classList.add('active');
        
    } catch (error) {
        console.error('Open feedback modal error:', error);
        showError('Failed to open feedback form: ' + error.message);
    }
};
// ✅ EDIT PROJECT FUNCTION
window.editProject = async function(projectId) {
    try {
        console.log('Opening edit modal for project:', projectId);
        
        // Fetch current project data
        const response = await fetch(`${API_URL}/projects/${projectId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to fetch project');
        
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        const project = result.data;
        
        // Open edit modal
        const modal = document.getElementById('editProjectModal');
        if (!modal) {
            console.error('Edit modal not found');
            return;
        }
        
        // Populate form with current data
        document.getElementById('editTitle').value = project.title;
        document.getElementById('editDescription').value = project.description;
        document.getElementById('editType').value = project.type;
        document.getElementById('editLink').value = project.link;
        document.getElementById('editXpReward').value = project.xpReward;
        document.getElementById('editReviewersNeeded').value = project.reviewersNeeded || 2;
        
        // Format deadline for datetime-local input
        const deadlineDate = new Date(project.deadline);
        const formattedDeadline = deadlineDate.toISOString().slice(0, 16);
        document.getElementById('editDeadline').value = formattedDeadline;
        
        // Store project ID in modal dataset
        modal.dataset.projectId = projectId;
        
        // Show modal
        modal.classList.add('active');
        
    } catch (error) {
        console.error('Edit project error:', error);
        showError('Failed to load project for editing: ' + error.message);
    }
};

// ✅ SAVE EDITED PROJECT
async function handleEditProjectSubmit(e) {
    e.preventDefault();
    
    const modal = document.getElementById('editProjectModal');
    const projectId = modal.dataset.projectId;
    
    if (!projectId) {
        showError('No project ID found');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    
    try {
        const deadlineValue = document.getElementById('editDeadline').value;
        const deadline = new Date(deadlineValue);
        
        if (deadline <= new Date()) {
            throw new Error('Deadline must be in the future');
        }
        
        const updateData = {
            title: document.getElementById('editTitle').value.trim(),
            description: document.getElementById('editDescription').value.trim(),
            type: document.getElementById('editType').value,
            link: document.getElementById('editLink').value.trim(),
            xpReward: parseInt(document.getElementById('editXpReward').value),
            reviewersNeeded: parseInt(document.getElementById('editReviewersNeeded').value),
            deadline: deadline.toISOString()
        };
        
        console.log('Updating project:', projectId, updateData);
        
        const response = await fetch(`${API_URL}/projects/${projectId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        showSuccess('✅ Project updated successfully!');
        closeModals();
        
        // Reload dashboard
        if (document.getElementById('dashboard-tab').classList.contains('active')) {
            loadDashboard();
        } else {
            loadProjects();
        }
        
    } catch (error) {
        console.error('Update project error:', error);
        showError('Failed to update project: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
    }
}

// ✅ DELETE PROJECT FUNCTION
window.deleteProject = async function(projectId) {
    if (!confirm('⚠️ Delete this project?\n\nThis action cannot be undone.\n\nNote: Projects with approved reviewers cannot be deleted.')) {
        return;
    }
    
    try {
        console.log('Deleting project:', projectId);
        
        const response = await fetch(`${API_URL}/projects/${projectId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        showSuccess('✅ Project deleted successfully');
        
        // Reload dashboard
        if (document.getElementById('dashboard-tab').classList.contains('active')) {
            loadDashboard();
        } else {
            loadProjects();
        }
        
    } catch (error) {
        console.error('Delete project error:', error);
        
        // Show user-friendly error message
        if (error.message.includes('approved reviewers')) {
            showError('Cannot delete project: It has approved reviewers. Please complete the review process first.');
        } else {
            showError('Failed to delete project: ' + error.message);
        }
    }
};

// Handle feedback submission
async function handleFeedbackSubmit(e, projectId) {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
    try {
        const feedbackText = document.getElementById('feedbackText').value.trim();
        const projectRating = document.getElementById('projectRating').value;
        
        if (feedbackText.length < 50) {
            throw new Error('Feedback must be at least 50 characters');
        }
        
        if (!currentReviewerId) {
            throw new Error('You must be a reviewer to submit feedback');
        }
        
        const reviewerResponse = await fetch(`${API_URL}/reviewers/${currentReviewerId}`, {
            credentials: 'include'
        });
        
        if (!reviewerResponse.ok) throw new Error('Failed to get reviewer data');
        
        const reviewerResult = await reviewerResponse.json();
        const reviewer = reviewerResult.data;
        
        const response = await fetch(`${API_URL}/feedback`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId,
                reviewerId: currentReviewerId,
                reviewerUsername: reviewer.username,
                feedbackText,
                projectRating: projectRating || null
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        console.log('Feedback submit result:', result);
        
        if (!result.success) throw new Error(result.error);
        
        showSuccess('✅ Feedback submitted successfully! You\'ll earn XP when the owner rates it.');
        closeModals();
        document.getElementById('feedbackForm').reset();
        
        if (document.getElementById('dashboard-tab').classList.contains('active')) {
            loadDashboard();
        }
        
    } catch (error) {
        console.error('Submit feedback error:', error);
        showError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Feedback';
    }
}

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

function showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    notification.innerHTML = `<div class="notification-content"><div class="notification-icon">✅</div><div class="notification-message">${escapeHtml(message)}</div></div>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'error-notification';
    notification.innerHTML = `<div class="error-content"><div class="error-icon">⚠️</div><div class="error-message"><strong>Error</strong><p>${escapeHtml(message)}</p></div></div>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Initialize app
document.addEventListener('DOMContentLoaded', initialize);