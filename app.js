// === GLOBAL ERROR HANDLING ===

class AppError extends Error {
    constructor(message, type = 'error', retryable = false) {
        super(message);
        this.type = type;
        this.retryable = retryable;
    }
}

function showErrorNotification(message, retryCallback = null) {
    // Remove existing error notifications
    const existing = document.querySelector('.error-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'error-notification';
    
    notification.innerHTML = `
        <div class="error-content">
            <div class="error-icon">⚠️</div>
            <div class="error-message">
                <strong>Oops! Something went wrong</strong>
                <p>${escapeHtml(message)}</p>
            </div>
            <div class="error-actions">
                ${retryCallback ? '<button class="btn-primary btn-small" onclick="retryLastAction()">Retry</button>' : ''}
                <button class="btn-secondary btn-small" onclick="closeErrorNotification()">Dismiss</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Store retry callback
    if (retryCallback) {
        window.lastRetryAction = retryCallback;
    }
    
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 8000);
}

function showSuccessNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">✅</div>
            <div class="notification-message">${escapeHtml(message)}</div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 4000);
}

window.retryLastAction = function() {
    if (window.lastRetryAction) {
        closeErrorNotification();
        window.lastRetryAction();
    }
};

window.closeErrorNotification = function() {
    const notification = document.querySelector('.error-notification');
    if (notification) notification.remove();
};

// Better fetch wrapper with error handling
async function safeFetch(url, options = {}, retryCallback = null) {
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new AppError('Session expired. Please log in again.', 'auth', false);
            } else if (response.status === 403) {
                throw new AppError('You don\'t have permission to do this.', 'permission', false);
            } else if (response.status === 404) {
                throw new AppError('The requested resource was not found.', 'notfound', false);
            } else if (response.status === 500) {
                throw new AppError('Server error. Please try again later.', 'server', true);
            } else if (response.status >= 400) {
                const result = await response.json();
                throw new AppError(result.error || 'Request failed', 'client', true);
            }
        }
        
        return await response.json();
        
    } catch (error) {
        console.error('Fetch error:', error);
        
        if (error instanceof AppError) {
            if (error.type === 'auth') {
                localStorage.removeItem('userRole');
                window.location.href = 'login.html';
                return;
            }
            showErrorNotification(error.message, error.retryable ? retryCallback : null);
            throw error;
        }
        
        // Network errors
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showErrorNotification('Connection lost. Please check your internet and try again.', retryCallback);
        } else {
            showErrorNotification(error.message || 'An unexpected error occurred', retryCallback);
        }
        
        throw error;
    }
}

// Escape HTML helper (if not already defined)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// === AUTHENTICATION SETUP ===
let clerk = null;
let currentUser = null;
let userRole = null;
let currentReviewerId = null;

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://helpmarq-backend.onrender.com/api';
// State
let currentProjectForApplication = null;
// Notifications
let notifications = {
    owner: { newApplicants: 0, newFeedback: 0, unratedFeedback: 0 },
    reviewer: { applicationApproved: 0, applicationRejected: 0, feedbackRated: 0 }
};

async function loadNotifications() {
    try {
        const token = await getAuthToken();
        
        const result = await safeFetch(`${API_URL}/notifications`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => loadNotifications());
        
        if (result.success) {
            notifications = result.data;
            updateNotificationBadges();
        }
        
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function updateNotificationBadges() {
    // Update tab badges
    const projectsTab = document.querySelector('[data-tab="projects"]');
    const applyTab = document.querySelector('[data-tab="apply"]');
    const reviewersTab = document.querySelector('[data-tab="reviewers"]');
    
    // Clear existing badges
    document.querySelectorAll('.notification-badge').forEach(b => b.remove());
    
    if (userRole === 'owner') {
        // Badge for new applicants
        if (notifications.owner.newApplicants > 0 && projectsTab) {
            const badge = createBadge(notifications.owner.newApplicants);
            projectsTab.appendChild(badge);
        }
        
        // Badge for unrated feedback
        if (notifications.owner.unratedFeedback > 0 && projectsTab) {
            const badge = createBadge(notifications.owner.unratedFeedback, 'feedback');
            projectsTab.appendChild(badge);
        }
    }
    
    if (userRole === 'reviewer') {
        // Badge for approved applications
        if (notifications.reviewer.applicationApproved > 0 && applyTab) {
            const badge = createBadge(notifications.reviewer.applicationApproved, 'success');
            applyTab.appendChild(badge);
        }
        
        // Badge for rated feedback
        if (notifications.reviewer.feedbackRated > 0 && applyTab) {
            const badge = createBadge(notifications.reviewer.feedbackRated, 'xp');
            applyTab.appendChild(badge);
        }
    }
}

function createBadge(count, type = 'default') {
    const badge = document.createElement('span');
    badge.className = `notification-badge notification-${type}`;
    badge.textContent = count > 99 ? '99+' : count;
    return badge;
}
// === DASHBOARD FUNCTIONS ===

async function loadOwnerDashboard() {
    try {
        const token = await getAuthToken();
        
        const result = await safeFetch(`${API_URL}/projects`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => loadOwnerDashboard());
        
        if (result.success) {
            const userProjects = result.data.filter(p => p.ownerId === currentUser.id);
            
            // Update stats
            document.getElementById('ownerTotalProjects').textContent = userProjects.length;
            
            const totalApplicants = userProjects.reduce((sum, p) => sum + p.applicantsCount, 0);
            document.getElementById('ownerTotalApplicants').textContent = totalApplicants;
            
            const totalFeedback = userProjects.reduce((sum, p) => sum + p.reviewsCount, 0);
            document.getElementById('ownerTotalFeedback').textContent = totalFeedback;
            
            const pendingActions = notifications.owner.newApplicants + notifications.owner.unratedFeedback;
            document.getElementById('ownerPendingActions').textContent = pendingActions;
            
            // Display projects
            displayOwnerProjects(userProjects);
        }
        
    } catch (error) {
        console.error('Error loading owner dashboard:', error);
    }
}

function displayOwnerProjects(projects) {
    const container = document.getElementById('ownerProjectsList');
    
    if (projects.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No projects yet</div><div class="empty-message">Upload your first project to get started!</div></div>';
        return;
    }
    
    container.innerHTML = '';
    
    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        card.innerHTML = `
            <h3>${escapeHtml(project.title)}</h3>
            <span class="project-badge badge-${project.type}">${project.type}</span>
            <p class="project-desc">${escapeHtml(project.description)}</p>
            
            <div class="project-meta">
                <span style="color: var(--accent-purple);">📋 ${project.applicantsCount} applicants</span>
                <span style="color: var(--success-green);">✅ ${project.approvedCount} approved</span>
                <span style="color: var(--primary-blue);">💬 ${project.reviewsCount} reviews</span>
            </div>
            
            <div class="project-actions">
                <button class="btn-secondary btn-small" onclick="viewApplicants('${project._id}')">
                    View Applicants ${project.applicantsCount > 0 ? `(${project.applicantsCount})` : ''}
                </button>
                <button class="btn-secondary btn-small" onclick="viewFeedbackWithDownload('${project._id}', '${escapeHtml(project.title)}')">
                    View Feedback ${project.reviewsCount > 0 ? `(${project.reviewsCount})` : ''}
                </button>
                <button class="btn-danger btn-small" onclick="deleteProject('${project._id}')">Delete</button>
            </div>
        `;
        
        container.appendChild(card);
    });
}

async function loadReviewerDashboard() {
    try {
        if (!currentReviewerId) {
            console.error('No reviewer ID found');
            return;
        }
        
        const token = await getAuthToken();
        
        // Get reviewer info
        const reviewerResult = await safeFetch(`${API_URL}/reviewers/${currentReviewerId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => loadReviewerDashboard());
        
        if (reviewerResult.success) {
            const reviewer = reviewerResult.data;
            
            // Update stats
            document.getElementById('reviewerLevel').textContent = reviewer.level;
            document.getElementById('reviewerXP').textContent = reviewer.xp;
            document.getElementById('reviewerTotalReviews').textContent = reviewer.totalReviews;
            document.getElementById('reviewerAvgRating').textContent = reviewer.averageRating.toFixed(1);
            
            // Calculate XP progress
            const levelThresholds = [0, 500, 1000, 1500, 2000, 2500];
            const currentLevelMin = levelThresholds[reviewer.level - 1] || 0;
            const nextLevelMin = levelThresholds[reviewer.level] || 2500;
            
            const progressPercent = ((reviewer.xp - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100;
            
            const progressFill = document.getElementById('xpProgressFill');
            progressFill.style.width = `${Math.min(progressPercent, 100)}%`;
            
            const xpNeeded = nextLevelMin - reviewer.xp;
            document.getElementById('xpProgressText').textContent = 
                xpNeeded > 0 ? `${xpNeeded} XP to Level ${reviewer.level + 1}` : 'Max level reached!';
        }
        
        // Get applications
        const appsResult = await safeFetch(`${API_URL}/applications/reviewer/${currentReviewerId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => loadReviewerDashboard());
        
        if (appsResult.success) {
            displayReviewerApplications(appsResult.data);
        }
        
    } catch (error) {
        console.error('Error loading reviewer dashboard:', error);
    }
}

function displayReviewerApplications(applications) {
    const container = document.getElementById('reviewerApplicationsList');
    
    if (applications.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No applications yet</div><div class="empty-message">Browse projects and apply to start reviewing!</div></div>';
        return;
    }
    
    container.innerHTML = '';
    
    applications.forEach(app => {
        const card = document.createElement('div');
        card.className = 'applicant-card';
        
        const appliedDate = new Date(app.appliedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        let actionButton = '';
        if (app.status === 'approved') {
            actionButton = `<button class="btn-success btn-small" onclick="openFeedbackModal('${app.projectId._id}', '${escapeHtml(app.projectId.title)}')">Submit Feedback</button>`;
        }
        
        card.innerHTML = `
            <div class="applicant-header">
                <div>
                    <h4>${escapeHtml(app.projectId.title)}</h4>
                    <p style="color: var(--neutral-mid); font-size: 14px;">${app.projectId.type} • ${app.projectId.xpReward} XP</p>
                    <p style="color: var(--neutral-mid); font-size: 14px;">Applied ${appliedDate}</p>
                </div>
                <span class="applicant-status status-${app.status}">${app.status}</span>
            </div>
            ${actionButton ? `<div style="margin-top: 1rem;">${actionButton}</div>` : ''}
        `;
        
        container.appendChild(card);
    });
}
// DOM Elements
const uploadForm = document.getElementById('uploadForm');
const applicationForm = document.getElementById('applicationForm');
const projectsGrid = document.getElementById('projectsGrid');
const reviewersList = document.getElementById('reviewersList');
const applyProjectsList = document.getElementById('applyProjectsList');
const uploadMessage = document.getElementById('uploadMessage');
const applyMessage = document.getElementById('applyMessage');
const filterType = document.getElementById('filterType');
const refreshBtn = document.getElementById('refreshBtn');
const totalProjectsEl = document.getElementById('totalProjects');
const totalReviewersEl = document.getElementById('totalReviewers');
const totalApplicationsEl = document.getElementById('totalApplications');
const applicationModal = document.getElementById('applicationModal');
const applicantsModal = document.getElementById('applicantsModal');
const feedbackModal = document.getElementById('feedbackModal');
const feedbackListModal = document.getElementById('feedbackListModal');
const reviewerSetup = document.getElementById('reviewerSetup');
const applicationSection = document.getElementById('applicationSection');

let currentProjectForFeedback = null;
let currentReviewerForFeedback = null;

// === INITIALIZATION ===
async function initializeAuth() {
    console.log('=== INITIALIZING AUTH ===');
    
    clerk = window.clerk;
    if (!clerk || !clerk.user) {
        console.log('No clerk or user, redirecting to login');
        window.location.href = 'login.html';
        return false;
    }
    
    currentUser = clerk.user;
    console.log('Current user:', currentUser.id);
    
    // Check if user just selected role (prevent loop)
    const justSelectedRole = sessionStorage.getItem('roleJustSelected');
    if (justSelectedRole === 'true') {
        sessionStorage.removeItem('roleJustSelected');
        console.log('✓ User just selected role, allowing entry');
    }
    
    // Get user role from backend
    await loadUserRole();
    
    console.log('Auth initialized. Role:', userRole);
    
    if (!userRole) {
        console.error('CRITICAL: Role still not set after loadUserRole');
        
        // Only redirect if they haven't just selected a role
        if (!justSelectedRole) {
            console.log('→ Redirecting to role selection');
            window.location.href = 'role-select.html';
            return false;
        }
    }
    
    return true;
}

// Load user role
async function loadUserRole() {
    console.log('=== LOAD USER ROLE START ===');
    
    try {
        // FIRST: Check localStorage
        const storedRole = localStorage.getItem('userRole');
        console.log('Stored role in localStorage:', storedRole);
        
        // SECOND: Check backend
        const token = await getAuthToken();
        console.log('Got auth token:', token ? 'YES' : 'NO');
        
        const result = await safeFetch(`${API_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => loadUserRole());
        
        console.log('Backend /auth/me response:', result);
        
        if (result.success) {
            // Priority 1: Backend confirms reviewer
            if (result.role === 'reviewer') {
                userRole = 'reviewer';
                currentReviewerId = result.data._id;
                localStorage.setItem('userRole', 'reviewer');
                console.log('✓ Role set to REVIEWER from backend');
            } 
            // Priority 2: Backend confirms owner
            else if (result.role === 'owner') {
                userRole = 'owner';
                localStorage.setItem('userRole', 'owner');
                console.log('✓ Role set to OWNER from backend');
            }
            // Priority 3: No backend role, use localStorage
            else if (storedRole) {
                userRole = storedRole;
                console.log('✓ Using stored role:', storedRole);
            }
            // Priority 4: No role anywhere - must select
            else {
                console.log('⚠️ No role found - redirecting to role selection');
                // Clear any stale data
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = 'role-select.html';
                return;
            }
        }
        
        console.log('=== FINAL ROLE:', userRole, '===');
        
        // IMMEDIATELY update UI
        if (userRole) {
            updateUIForRole();
        }
        
    } catch (error) {
        console.error('Error in loadUserRole:', error);
        
        // Fallback to localStorage
        const storedRole = localStorage.getItem('userRole');
        if (storedRole) {
            userRole = storedRole;
            console.log('✓ Using stored role after error:', storedRole);
            updateUIForRole();
        } else {
            console.error('❌ No stored role - redirecting to role selection');
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'role-select.html';
        }
    }
}

// Update UI based on user role
function updateUIForRole() {
    console.log('=== UPDATE UI FOR ROLE ===');
    console.log('Current role:', userRole);
    
    const uploadTabBtn = document.getElementById('uploadTabBtn');
    const applyTabBtn = document.getElementById('applyTabBtn');
    
    console.log('Upload button found:', !!uploadTabBtn);
    console.log('Apply button found:', !!applyTabBtn);
    
    // FORCE HIDE/SHOW based on role
    if (userRole === 'reviewer') {
        console.log('REVIEWER MODE - Hiding upload, showing apply');
        
        // Hide upload tab
        if (uploadTabBtn) {
            uploadTabBtn.style.display = 'none';
            uploadTabBtn.style.visibility = 'hidden';
            uploadTabBtn.remove(); // Completely remove from DOM
            console.log('✓ Upload tab removed');
        }
        
        // Show apply tab
        if (applyTabBtn) {
            applyTabBtn.style.display = 'inline-block';
            applyTabBtn.style.visibility = 'visible';
            console.log('✓ Apply tab shown');
        }
        
    } else if (userRole === 'owner') {
        console.log('OWNER MODE - Hiding apply, showing upload');
        
        // Hide apply tab
        if (applyTabBtn) {
            applyTabBtn.style.display = 'none';
            applyTabBtn.style.visibility = 'hidden';
            applyTabBtn.remove(); // Completely remove from DOM
            console.log('✓ Apply tab removed');
        }
        
        // Show upload tab
        if (uploadTabBtn) {
            uploadTabBtn.style.display = 'inline-block';
            uploadTabBtn.style.visibility = 'visible';
            console.log('✓ Upload tab shown');
        }
    } else {
        console.error('UNKNOWN ROLE:', userRole);
    }
    
    console.log('=== UI UPDATE COMPLETE ===');
}

// Helper function to get auth token
async function getAuthToken() {
    if (!clerk || !clerk.session) {
        throw new Error('Not authenticated');
    }
    return await clerk.session.getToken();
}

// === TAB NAVIGATION ===
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        
        console.log('Tab clicked:', targetTab);
        console.log('Current user role:', userRole);
        
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${targetTab}-tab`).classList.add('active');

        // Tab-Specific Logic
        if (targetTab === 'dashboard') {
            console.log('Dashboard tab clicked');
            console.log('Current userRole:', userRole);
            
            if (!userRole) {
                console.error('No role detected for dashboard');
                alert('Please select your role first');
                window.location.href = 'role-select.html';
                return;
            }
            
            if (userRole === 'owner') {
                console.log('Loading owner dashboard');
                const ownerDash = document.getElementById('ownerDashboard');
                const reviewerDash = document.getElementById('reviewerDashboard');
                if (ownerDash) ownerDash.style.display = 'block';
                if (reviewerDash) reviewerDash.style.display = 'none';
                loadOwnerDashboard();
            } else if (userRole === 'reviewer') {
                console.log('Loading reviewer dashboard');
                const ownerDash = document.getElementById('ownerDashboard');
                const reviewerDash = document.getElementById('reviewerDashboard');
                if (ownerDash) ownerDash.style.display = 'none';
                if (reviewerDash) reviewerDash.style.display = 'block';
                loadReviewerDashboard();
            } else {
                console.error('Unknown role:', userRole);
            }
        } else if (targetTab === 'projects') {
            loadProjects();
        } else if (targetTab === 'reviewers') {
            loadReviewers();
        } else if (targetTab === 'apply') {
            if (currentReviewerId) {
                loadProjectsForApplication();
            }
        }
    });
});

// === HELPER FUNCTIONS ===
function showMessage(elementId, text, type) {
    const messageEl = document.getElementById(elementId);
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

// === PROJECTS ===
let currentProjectsPage = 1;
let currentProjectsFilters = {};

async function loadProjects(filters = {}, page = 1) {
    try {
        projectsGrid.innerHTML = '<div class="loading">Loading projects</div>';
        
        currentProjectsFilters = filters;
        currentProjectsPage = page;
        
        const params = new URLSearchParams({
            ...filters,
            page: page,
            limit: 12
        });
        
        const url = `${API_URL}/projects?${params.toString()}`;
        
        const result = await safeFetch(url, {}, () => loadProjects(filters, page));
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        displayProjects(result.data);
        displayProjectsPagination(result.page, result.totalPages, result.total);
        updateStats();
        
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsGrid.innerHTML = '<div class="loading">Error loading projects</div>';
    }
}

function displayProjectsPagination(currentPage, totalPages, totalItems) {
    const pagination = document.getElementById('projectsPagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="loadProjects(currentProjectsFilters, ${currentPage - 1})">
            ← Previous
        </button>
    `;
    
    // Page numbers
    const maxPageButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
    
    if (endPage - startPage + 1 < maxPageButtons) {
        startPage = Math.max(1, endPage - maxPageButtons + 1);
    }
    
    if (startPage > 1) {
        paginationHTML += `<button class="pagination-btn" onclick="loadProjects(currentProjectsFilters, 1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span class="pagination-info">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="loadProjects(currentProjectsFilters, ${i})">
                ${i}
            </button>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span class="pagination-info">...</span>`;
        }
        paginationHTML += `<button class="pagination-btn" onclick="loadProjects(currentProjectsFilters, ${totalPages})">${totalPages}</button>`;
    }
    
    // Next button
    paginationHTML += `
        <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="loadProjects(currentProjectsFilters, ${currentPage + 1})">
            Next →
        </button>
    `;
    
    // Info
    paginationHTML += `<span class="pagination-info">Showing ${(currentPage - 1) * 12 + 1}-${Math.min(currentPage * 12, totalItems)} of ${totalItems}</span>`;
    
    pagination.innerHTML = paginationHTML;
}

function displayProjects(projects) {
    if (projects.length === 0) {
        projectsGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No projects yet</div><div class="empty-message">Be the first to upload a project!</div></div>';
        return;
    }
    
    projectsGrid.innerHTML = '';
    
    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        const date = new Date(project.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        // Show different actions based on role
        let actionsHTML = '';
        if (userRole === 'owner' && project.ownerId === currentUser.id) {
            actionsHTML = `
                <button class="btn-secondary btn-small" onclick="viewApplicants('${project._id}')">
                    View Applicants (${project.applicantsCount})
                </button>
                <button class="btn-secondary btn-small" onclick="viewFeedbackWithDownload('${project._id}', '${escapeHtml(project.title)}')">
    View Feedback (${project.reviewsCount})
                        </button>
                <button class="btn-danger btn-small" onclick="deleteProject('${project._id}')">Delete</button>
            `;
        } else {
            actionsHTML = `
               <button class="btn-secondary btn-small" onclick="viewFeedbackWithDownload('${project._id}', '${escapeHtml(project.title)}')">
    View Feedback (${project.reviewsCount})
                </button>
            `;
        }
        
        const deadline = new Date(project.deadline);
        const now = new Date();
        const hoursLeft = Math.floor((deadline - now) / (1000 * 60 * 60));
        const daysLeft = Math.floor(hoursLeft / 24);
        
        let deadlineText = '';
        let deadlineColor = '';
        
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
        
        card.innerHTML = `
            <h3>${escapeHtml(project.title)}</h3>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <span class="project-badge badge-${project.type}">${project.type}</span>
                <span class="project-badge" style="background: ${deadlineColor}; color: white;">⏰ ${deadlineText}</span>
            </div>
            <p class="project-desc">${escapeHtml(project.description)}</p>
            <a href="${project.link}" target="_blank" class="project-link">🔗 ${project.link}</a>
            <div class="project-meta">
 <a href="owner-profile.html?id=${project.ownerId}" class="project-owner" style="text-decoration: none; cursor: pointer;">
                    By ${escapeHtml(project.ownerName)} →
                </a>                <span class="project-xp">+${project.xpReward} XP</span>
            </div>
            <p class="project-applicants">📋 ${project.applicantsCount} applicants | ✅ ${project.approvedCount} approved</p>
            <div class="project-actions">
                ${actionsHTML}
            </div>
        `;
        
        projectsGrid.appendChild(card);
    });
}

// Upload Project
if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading...';
        
        try {
            console.log('Getting auth token...');
            const token = await getAuthToken();
            console.log('Token received:', token ? 'Yes' : 'No');
            
            if (!token) {
                throw new Error('Not authenticated. Please sign in again.');
            }
            
            if (!currentUser || !currentUser.id) {
                throw new Error('User session invalid. Please sign in again.');
            }
            
            console.log('Current user ID:', currentUser.id);
            
            const ownerName = currentUser.fullName || 
                  currentUser.firstName || 
                  currentUser.username || 
                  currentUser.primaryEmailAddress?.emailAddress || 
                  'Anonymous';

console.log('Using owner name:', ownerName);

const ownerEmail = currentUser.primaryEmailAddress?.emailAddress || '';

const deadlineValue = document.getElementById('deadline').value;
const deadline = new Date(deadlineValue);

// Validate deadline is in future
if (deadline <= new Date()) {
    throw new Error('Deadline must be in the future');
}

const projectData = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    type: document.getElementById('type').value,
    link: document.getElementById('link').value.trim(),
    ownerId: currentUser.id,
    ownerName: ownerName,
    ownerEmail: ownerEmail,
    xpReward: parseInt(document.getElementById('xpReward').value),
    deadline: deadline.toISOString()
};

console.log('Project data:', projectData);
            
            const result = await safeFetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(projectData)
        }, () => uploadForm.dispatchEvent(new Event('submit')));
        
        if (result.success) {
            showSuccessNotification('Project uploaded successfully!');
            uploadForm.reset();
            document.querySelector('[data-tab="projects"]').click();
        }
            
        } catch (error) {
            console.error('Upload error:', error);
            showMessage('uploadMessage', '❌ ' + error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Upload Project';
        }
    });
}

// Delete Project
async function deleteProject(id) {
    if (!confirm('Are you sure you want to delete this project?')) {
        return;
    }
    
    try {
        const token = await getAuthToken();
        
        const result = await safeFetch(`${API_URL}/projects/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => deleteProject(id));
        
        if (result.success) {
            showSuccessNotification('Project deleted successfully!');
            loadProjects();
        }
        
    } catch (error) {
        console.error('Delete error:', error);
        alert('Error: ' + error.message);
    }
}

// === REVIEWERS ===
async function loadReviewers() {
    try {
        const result = await safeFetch(`${API_URL}/reviewers`, {}, () => loadReviewers());
        
        if (result.success) {
            displayReviewers(result.data);
        }
        
    } catch (error) {
        console.error('Error loading reviewers:', error);
        reviewersList.innerHTML = '<div class="loading">Error loading reviewers</div>';
    }
}

function displayReviewers(reviewers) {
    if (reviewers.length === 0) {
        reviewersList.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-title">No reviewers yet</div></div>';
        return;
    }
    
    reviewersList.innerHTML = '';
    
    reviewers.slice(0, 10).forEach(reviewer => {
        const card = document.createElement('div');
        card.className = 'reviewer-card';
        
       card.style.cursor = 'pointer';
        card.onclick = () => window.location.href = `reviewer-profile.html?id=${reviewer._id}`;
        
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

// === APPLICATIONS ===
async function loadProjectsForApplication() {
    try {
        applyProjectsList.innerHTML = '<div class="loading">Loading available projects</div>';
        
        const result = await safeFetch(`${API_URL}/projects`, {}, () => loadProjectsForApplication());
        
        if (result.success) {
            displayProjectsForApplication(result.data);
        }
        
    } catch (error) {
        console.error('Error loading projects:', error);
        applyProjectsList.innerHTML = '<div class="loading">Error loading projects</div>';
    }
}

async function displayProjectsForApplication(projects) {
    if (projects.length === 0) {
        applyProjectsList.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No projects available</div></div>';
        return;
    }

    applyProjectsList.innerHTML = '';

    try {
        const result = await safeFetch(`${API_URL}/applications/reviewer/${currentReviewerId}`);
        if (result.success) {
            const applications = result.data;
            projects.forEach(project => {
                const card = document.createElement('div');
                card.className = 'apply-project-card';

                const application = applications.find(app => app.projectId._id === project._id);

                let actionButton = '';
                if (!application) {
                    actionButton = `<button class="btn-primary btn-small" onclick="openApplicationModal('${project._id}', '${escapeHtml(project.title)}', '${project.type}', ${project.xpReward})">Apply Now</button>`;
                } else if (application.status === 'pending') {
                    actionButton = `<button class="btn-secondary btn-small" disabled>Application Pending</button>`;
                } else if (application.status === 'approved') {
                    actionButton = `<button class="btn-success btn-small" onclick="openFeedbackModal('${project._id}', '${escapeHtml(project.title)}')">Submit Feedback</button>`;
                } else if (application.status === 'rejected') {
                    actionButton = `<button class="btn-danger btn-small" disabled>Application Rejected</button>`;
                }

                card.innerHTML = `
                    <div class="apply-project-info">
                        <h4>${escapeHtml(project.title)}</h4>
                        <p class="apply-project-meta">
                            <span class="project-badge badge-${project.type}">${project.type}</span>
                            <span style="color: #10B981; font-weight: 600;">+${project.xpReward} XP</span>
                            <span style="color: #6B7280;">• ${project.applicantsCount} applicants</span>
                        </p>
                    </div>
                    ${actionButton}
                `;
                applyProjectsList.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Error checking application status:', error);
    }
}

async function openApplicationModal(projectId, title, type, xpReward) {
    currentProjectForApplication = projectId;
    
    try {
        // Fetch full project details to get deadline
        const result = await safeFetch(`${API_URL}/projects/${projectId}`);
        
        if (result.success) {
            const project = result.data;
            const deadline = new Date(project.deadline);
            const now = new Date();
            const hoursLeft = Math.floor((deadline - now) / (1000 * 60 * 60));
            const daysLeft = Math.floor(hoursLeft / 24);
            
            let deadlineText = '';
            let deadlineColor = '';
            
            if (hoursLeft < 0) {
                deadlineText = 'Deadline passed';
                deadlineColor = '#EF4444';
            } else if (hoursLeft < 24) {
                deadlineText = `${hoursLeft} hours left`;
                deadlineColor = '#EF4444';
            } else if (daysLeft < 3) {
                deadlineText = `${daysLeft} days left`;
                deadlineColor = '#F59E0B';
            } else {
                deadlineText = `${daysLeft} days left`;
                deadlineColor = '#10B981';
            }
            
            const modalProjectInfo = document.getElementById('modalProjectInfo');
            modalProjectInfo.innerHTML = `
                <h3>${title}</h3>
                <p>
                    <span class="project-badge badge-${type}">${type}</span>
                    <span style="color: #10B981; font-weight: 600; margin-left: 0.5rem;">+${xpReward} XP</span>
                    <span class="project-badge" style="background: ${deadlineColor}; color: white; margin-left: 0.5rem;">⏰ ${deadlineText}</span>
                </p>
                <p style="color: #6B7280; font-size: 14px; margin-top: 8px;">
                    <strong>Deadline:</strong> ${deadline.toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
            `;
        }
    } catch (error) {
        console.error('Error loading project details:', error);
        // Fallback to basic info
        const modalProjectInfo = document.getElementById('modalProjectInfo');
        modalProjectInfo.innerHTML = `
            <h3>${title}</h3>
            <p>
                <span class="project-badge badge-${type}">${type}</span>
                <span style="color: #10B981; font-weight: 600; margin-left: 0.5rem;">+${xpReward} XP</span>
            </p>
        `;
    }
    
    applicationModal.classList.add('active');
}
// Open Feedback Submission Modal
function openFeedbackModal(projectId, projectTitle) {
    currentProjectForFeedback = projectId;
    
    const feedbackProjectInfo = document.getElementById('feedbackProjectInfo');
    feedbackProjectInfo.innerHTML = `<h3>Reviewing: ${projectTitle}</h3>`;
    
    feedbackModal.classList.add('active');
}

// Submit Feedback
const feedbackForm = document.getElementById('feedbackForm');
if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentProjectForFeedback || !currentReviewerId) {
            showErrorNotification('Missing project or reviewer information');
            return;
        }
        
        const submitBtn = document.getElementById('submitFeedbackBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        
        try {
            const token = await getAuthToken();
            
            const feedbackData = {
                projectId: currentProjectForFeedback,
                reviewerId: currentReviewerId,
                reviewerUsername: clerk.user.username || clerk.user.primaryEmailAddress.emailAddress,
                feedbackText: document.getElementById('feedbackText').value.trim(),
                projectRating: document.getElementById('projectRating').value ? parseInt(document.getElementById('projectRating').value) : null
            };
            
            const result = await safeFetch(`${API_URL}/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(feedbackData)
            }, () => feedbackForm.dispatchEvent(new Event('submit')));
            
            if (result.success) {
                showSuccessNotification('Feedback submitted successfully!');
                feedbackForm.reset();
                feedbackModal.classList.remove('active');
                loadProjectsForApplication();
            }
            
        } catch (error) {
            console.error('Feedback error:', error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Feedback';
        }
    });
}

// Submit Application
if (applicationForm) {
    applicationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentReviewerId || !currentProjectForApplication) {
            showErrorNotification('Missing reviewer or project information');
            return;
        }
        
        try {
            const token = await getAuthToken();
            
            const applicationData = {
                projectId: currentProjectForApplication,
                reviewerId: currentReviewerId,
                reviewerUsername: clerk.user.username || clerk.user.primaryEmailAddress.emailAddress,
                qualifications: document.getElementById('qualifications').value.trim(),
                focusAreas: document.getElementById('focusAreas').value.trim()
            };
            
            const result = await safeFetch(`${API_URL}/applications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(applicationData)
            }, () => applicationForm.dispatchEvent(new Event('submit')));
            
            if (result.success) {
                showSuccessNotification('Application submitted successfully!');
                applicationForm.reset();
                applicationModal.classList.remove('active');
                loadProjectsForApplication();
            }
            
        } catch (error) {
            console.error('Application error:', error);
        }
    });
}

// View Applicants
async function viewApplicants(projectId) {
    try {
        const applicantsList = document.getElementById('applicantsList');
        applicantsList.innerHTML = '<div class="loading">Loading applicants</div>';
        
        applicantsModal.classList.add('active');
        
        const token = await getAuthToken();
        
        const result = await safeFetch(`${API_URL}/applications/project/${projectId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => viewApplicants(projectId));
        
        if (result.success) {
            displayApplicants(result.data, projectId);
        }
        
    } catch (error) {
        console.error('Error loading applicants:', error);
        document.getElementById('applicantsList').innerHTML = '<div class="loading">Error loading applicants</div>';
    }
}

function displayApplicants(applications, projectId) {
    const applicantsList = document.getElementById('applicantsList');
    
    if (applications.length === 0) {
        applicantsList.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No applicants yet</div></div>';
        return;
    }
    
    applicantsList.innerHTML = '';
    
    applications.forEach(app => {
        const card = document.createElement('div');
        card.className = 'applicant-card';
        
        const reviewer = app.reviewerId;
        const appliedDate = new Date(app.appliedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        card.innerHTML = `
            <div class="applicant-header">
                <div class="applicant-info">
                    <h4>${escapeHtml(app.reviewerUsername)}</h4>
                    <p class="applicant-stats">
                        Level ${reviewer.level} • ${reviewer.xp} XP • 
                        ${reviewer.totalReviews} reviews • 
                        ${reviewer.averageRating.toFixed(1)}★ rating
                    </p>
                </div>
                <span class="applicant-status status-${app.status}">${app.status}</span>
            </div>
            
            <div class="applicant-text">
                <h5>Qualifications</h5>
                <p>${escapeHtml(app.qualifications)}</p>
            </div>
            
            <div class="applicant-text">
                <h5>Focus Areas</h5>
                <p>${escapeHtml(app.focusAreas)}</p>
            </div>
            
            <div class="nda-status" style="margin-bottom: 1rem;">
                <p style="color: #6B7280; font-size: 0.85rem;">Applied on ${appliedDate}</p>
                <p style="color: #10B981; font-size: 0.85rem; font-weight: 600;">
                    ✓ NDA Accepted on ${new Date(app.ndaAcceptedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p style="color: #6B7280; font-size: 0.75rem;">IP: ${app.applicantIp}</p>
            </div>
            
            ${app.status === 'pending' ? `
                <div class="applicant-actions">
                    <button class="btn-success" onclick="approveApplication('${app._id}', '${projectId}')">
                        ✓ Approve
                    </button>
                    <button class="btn-danger" onclick="rejectApplication('${app._id}', '${projectId}')">
                        ✗ Reject
                    </button>
                </div>
            ` : ''}
        `;
        
        applicantsList.appendChild(card);
    });
}

async function approveApplication(applicationId, projectId) {
    try {
        const token = await getAuthToken();
        
        const result = await safeFetch(`${API_URL}/applications/${applicationId}/approve`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => approveApplication(applicationId, projectId));
        
        if (result.success) {
            showSuccessNotification('Application approved!');
            viewApplicants(projectId);
            loadProjects();
        }
        
    } catch (error) {
        console.error('Approve error:', error);
    }
}

async function rejectApplication(applicationId, projectId) {
    if (!confirm('Are you sure you want to reject this application?')) {
        return;
    }
    
    try {
        const token = await getAuthToken();
        
        const result = await safeFetch(`${API_URL}/applications/${applicationId}/reject`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, () => rejectApplication(applicationId, projectId));
        
        if (result.success) {
            showSuccessNotification('Application rejected!');
            viewApplicants(projectId);
        }
        
    } catch (error) {
        console.error('Reject error:', error);
    }
}

// === FEEDBACK SYSTEM ===
async function viewFeedback(projectId) {
    try {
        const feedbackList = document.getElementById('feedbackList');
        feedbackList.innerHTML = '<div class="loading">Loading feedback</div>';
        
        feedbackListModal.classList.add('active');
        
        const result = await safeFetch(`${API_URL}/feedback/project/${projectId}`, {}, () => viewFeedback(projectId));
        
        if (result.success) {
            displayFeedback(result.data);
        }
        
    } catch (error) {
        console.error('Error loading feedback:', error);
        document.getElementById('feedbackList').innerHTML = '<div class="loading">Error loading feedback</div>';
    }
}

function displayFeedback(feedbackList) {
    const container = document.getElementById('feedbackList');
    
    if (feedbackList.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-title">No feedback yet</div></div>';
        return;
    }
    
    container.innerHTML = '';
    
    feedbackList.forEach(feedback => {
        const card = document.createElement('div');
        card.className = 'feedback-card';
        
        const submittedDate = new Date(feedback.submittedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        let ratingSection = '';
        if (feedback.isRated) {
            ratingSection = `
                <div class="feedback-rating">
                    <strong>Your Rating:</strong> ${'★'.repeat(feedback.ownerRating)}${'☆'.repeat(5 - feedback.ownerRating)}
                    <span class="xp-badge">+${feedback.xpAwarded} XP awarded</span>
                </div>
            `;
        } else if (userRole === 'owner') {
            ratingSection = `
                <div class="rating-form">
                    <label>Rate this feedback:</label>
                    <div class="rating-buttons">
                        <button class="rating-btn" onclick="rateFeedback('${feedback._id}', 5)">★★★★★</button>
                        <button class="rating-btn" onclick="rateFeedback('${feedback._id}', 4)">★★★★☆</button>
                        <button class="rating-btn" onclick="rateFeedback('${feedback._id}', 3)">★★★☆☆</button>
                        <button class="rating-btn" onclick="rateFeedback('${feedback._id}', 2)">★★☆☆☆</button>
                        <button class="rating-btn" onclick="rateFeedback('${feedback._id}', 1)">★☆☆☆☆</button>
                    </div>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="feedback-header">
                <h4>${escapeHtml(feedback.reviewerUsername)}</h4>
                <span class="feedback-date">${submittedDate}</span>
            </div>
            <div class="feedback-text">
                <p>${escapeHtml(feedback.feedbackText)}</p>
            </div>
            ${feedback.projectRating ? `<div class="project-rating">Rated project: ${'★'.repeat(feedback.projectRating)}${'☆'.repeat(5 - feedback.projectRating)}</div>` : ''}
            ${ratingSection}
        `;
        
        container.appendChild(card);
    });
}
// Download feedback as text file
let currentProjectFeedback = [];
let currentProjectTitle = '';

// Update viewFeedback to store data
async function viewFeedbackWithDownload(projectId, projectTitle) {
    currentProjectTitle = projectTitle;
    
    try {
        const feedbackList = document.getElementById('feedbackList');
        feedbackList.innerHTML = '<div class="loading">Loading feedback</div>';
        
        feedbackListModal.classList.add('active');
        
        const result = await safeFetch(`${API_URL}/feedback/project/${projectId}`, {}, () => viewFeedbackWithDownload(projectId, projectTitle));
        
        if (result.success) {
            currentProjectFeedback = result.data;
            displayFeedback(result.data);
        }
        
    } catch (error) {
        console.error('Error loading feedback:', error);
        document.getElementById('feedbackList').innerHTML = '<div class="loading">Error loading feedback</div>';
    }
}

function downloadFeedback() {
    if (currentProjectFeedback.length === 0) {
        alert('No feedback to download');
        return;
    }
    
    let content = `HelpMarq Feedback Report
Project: ${currentProjectTitle}
Generated: ${new Date().toLocaleString()}
Total Reviews: ${currentProjectFeedback.length}

${'='.repeat(80)}

`;
    
    currentProjectFeedback.forEach((feedback, index) => {
        const submittedDate = new Date(feedback.submittedAt).toLocaleString();
        
        content += `Review #${index + 1}
Reviewer: ${feedback.reviewerUsername}
Submitted: ${submittedDate}
${feedback.projectRating ? `Project Rating: ${'★'.repeat(feedback.projectRating)}${'☆'.repeat(5 - feedback.projectRating)}` : ''}
${feedback.isRated ? `Quality Rating: ${'★'.repeat(feedback.ownerRating)}${'☆'.repeat(5 - feedback.ownerRating)} (${feedback.xpAwarded} XP awarded)` : 'Awaiting your rating'}

Feedback:
${feedback.feedbackText}

${'-'.repeat(80)}

`;
    });
    
    // Calculate summary
    const ratedFeedback = currentProjectFeedback.filter(f => f.isRated);
    const avgRating = ratedFeedback.length > 0
        ? (ratedFeedback.reduce((sum, f) => sum + f.ownerRating, 0) / ratedFeedback.length).toFixed(1)
        : 'N/A';
    
    content += `
SUMMARY
Total Reviews: ${currentProjectFeedback.length}
Rated Reviews: ${ratedFeedback.length}
Average Quality Rating: ${avgRating} stars
Unrated Reviews: ${currentProjectFeedback.length - ratedFeedback.length}

${'='.repeat(80)}

Generated by HelpMarq - Expert insights. Accessible pricing.
https://helpmarq.com
`;
    
    // Create download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `helpmarq-feedback-${currentProjectTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('✅ Feedback downloaded successfully!');
}

async function rateFeedback(feedbackId, rating) {
    if (!confirm(`Rate this feedback ${rating} stars?`)) {
        return;
    }
    
    try {
        const token = await getAuthToken();
        
        const result = await safeFetch(`${API_URL}/feedback/${feedbackId}/rate`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rating })
        }, () => rateFeedback(feedbackId, rating));
        
        if (result.success) {
            showSuccessNotification(`Rated! Reviewer earned ${result.data.xpAwarded} XP`);
            
            const projectId = result.data.feedback.projectId;
            viewFeedback(projectId);
            loadReviewers();
        }
        
    } catch (error) {
        console.error('Rating error:', error);
    }
}

// === STATS ===
async function updateStats() {
    try {
        const [projects, reviewers] = await Promise.all([
            safeFetch(`${API_URL}/projects`, {}, () => updateStats()),
            safeFetch(`${API_URL}/reviewers`, {}, () => updateStats())
        ]);
        
        if (projects.success) {
            totalProjectsEl.textContent = projects.count;
            
            const totalApps = projects.data.reduce((sum, p) => sum + p.applicantsCount, 0);
            totalApplicationsEl.textContent = totalApps;
        }
        
        if (reviewers.success) {
            totalReviewersEl.textContent = reviewers.count;
        }
        
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// === MODALS ===
document.querySelectorAll('.modal-close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        applicationModal.classList.remove('active');
        applicantsModal.classList.remove('active');
        feedbackModal.classList.remove('active');
        feedbackListModal.classList.remove('active');
    });
});

window.addEventListener('click', (e) => {
    if (e.target === applicationModal) {
        applicationModal.classList.remove('active');
    }
    if (e.target === applicantsModal) {
        applicantsModal.classList.remove('active');
    }
    if (e.target === feedbackModal) {
        feedbackModal.classList.remove('active');
    }
    if (e.target === feedbackListModal) {
        feedbackListModal.classList.remove('active');
    }
});

// === FILTERS ===
if (filterType) {
    filterType.addEventListener('change', (e) => {
        const filters = {};
        if (e.target.value) {
            filters.type = e.target.value;
        }
        loadProjects(filters);
    });
}
// Search functionality
const searchProjects = document.getElementById('searchProjects');
const filterMinXP = document.getElementById('filterMinXP');

if (searchProjects) {
    searchProjects.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.project-card');
        
        cards.forEach(card => {
            const title = card.querySelector('h3').textContent.toLowerCase();
            const desc = card.querySelector('.project-desc').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || desc.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// Sort projects
const sortProjects = document.getElementById('sortProjects');
if (sortProjects) {
    sortProjects.addEventListener('change', (e) => {
        const filters = {};
        if (filterType.value) filters.type = filterType.value;
        if (filterMinXP.value) filters.minXP = filterMinXP.value;
        if (e.target.value) filters.sort = e.target.value;
        
        loadProjects(filters, 1);
    });
}

// Update existing filter listeners to include sort
if (filterType) {
    filterType.addEventListener('change', (e) => {
        const filters = {};
        if (e.target.value) filters.type = e.target.value;
        if (filterMinXP && filterMinXP.value) filters.minXP = filterMinXP.value;
        if (sortProjects && sortProjects.value) filters.sort = sortProjects.value;
        
        loadProjects(filters, 1);
    });
}

if (filterMinXP) {
    filterMinXP.addEventListener('change', (e) => {
        const filters = {};
        if (filterType.value) filters.type = filterType.value;
        if (e.target.value) filters.minXP = e.target.value;
        if (sortProjects.value) filters.sort = sortProjects.value;
        
        loadProjects(filters, 1);
    });
}

if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        loadProjects();
        loadReviewers();
        updateStats();
    });
}

// === INITIALIZE ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log('=== PAGE LOAD START ===');
    
    const authReady = await initializeAuth();
    if (!authReady) {
        console.error('Auth failed');
        return;
    }
    
    console.log('Auth complete, checking role...');
    console.log('Current userRole:', userRole);
    console.log('Current reviewerId:', currentReviewerId);
    
    // Wait for role to be set
    let attempts = 0;
    while (!userRole && attempts < 10) {
        console.log('Waiting for role... attempt', attempts + 1);
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
    }
    
    if (!userRole) {
        console.error('CRITICAL: Role still not set after 2 seconds');
        console.log('Redirecting to role selection...');
        window.location.href = 'role-select.html';
        return;
    }
    
    console.log('=== ROLE CONFIRMED:', userRole, '===');
    
    // Load initial data
    loadProjects();
    loadReviewers();
    updateStats();
    loadNotifications();
    
    // Load dashboard based on role
    // Initialize UI for role
    // Load dashboard based on role
updateUIForRole();

// Load initial data
console.log('Loading initial data...');

if (userRole === 'owner') {
    document.getElementById('reviewerDashboard').style.display = 'none';
    document.getElementById('ownerDashboard').style.display = 'block';
    // Add any owner-specific initialization here
} else if (userRole === 'reviewer') {
    document.getElementById('ownerDashboard').style.display = 'none';
    document.getElementById('reviewerDashboard').style.display = 'block';
    loadReviewerDashboard();
}

// Refresh notifications every 30 seconds
setInterval(loadNotifications, 30000);

// Load projects for reviewers
    if (userRole === 'reviewer') {
        loadProjectsForApplication();
    }
    
    // Pre-load dashboard data
    console.log('Pre-loading dashboard for role:', userRole);
    if (userRole === 'owner') {
        const ownerDash = document.getElementById('ownerDashboard');
        const reviewerDash = document.getElementById('reviewerDashboard');
        if (ownerDash) ownerDash.style.display = 'none'; // Hidden until tab clicked
        if (reviewerDash) reviewerDash.style.display = 'none';
    } else if (userRole === 'reviewer') {
        const ownerDash = document.getElementById('ownerDashboard');
        const reviewerDash = document.getElementById('reviewerDashboard');
        if (ownerDash) ownerDash.style.display = 'none';
        if (reviewerDash) reviewerDash.style.display = 'none'; // Hidden until tab clicked
    }
    
    console.log('=== PAGE LOAD COMPLETE ===');
});

// Make functions global for onclick handlers
window.deleteProject = deleteProject;
window.viewApplicants = viewApplicants;
window.viewFeedback = viewFeedback;
window.openApplicationModal = openApplicationModal;
window.approveApplication = approveApplication;
window.rejectApplication = rejectApplication;
window.rateFeedback = rateFeedback;
window.openFeedbackModal = openFeedbackModal;
window.downloadFeedback = downloadFeedback;
window.viewFeedbackWithDownload = viewFeedbackWithDownload;

console.log('HelpMarq Frontend Connected:', API_URL);
console.log('Authentication: Clerk Active');
