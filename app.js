// Main application logic
import { getCurrentUser, getSession, signOut } from './lib/auth.js';
import { getCached, setCache, clearCache } from './lib/cache.js';

const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://helpmarq-backend.onrender.com/api';

// Global state
let currentUser = null;
let userRole = null;
let currentReviewerId = null;
let currentProjectForApplication = null;
let currentProjectForFeedback = null;

// Initialize
async function initialize() {
    console.log('=== INITIALIZING APP ===');
    
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    await loadUserRole();
    
    if (!userRole) {
        const justSelected = sessionStorage.getItem('roleJustSelected');
        if (!justSelected) {
            window.location.href = 'role-select.html';
            return;
        }
    }
    
    updateUIForRole();
    setupEventListeners();
    loadInitialData();
    
    console.log('✓ App initialized');
}

// Load user role from backend
async function loadUserRole() {
    console.log('=== LOADING USER ROLE ===');
    
    try {
        // Check localStorage first
        const storedRole = localStorage.getItem('userRole');
        if (storedRole) {
            userRole = storedRole;
            console.log('✓ Role from localStorage:', userRole);
        }
        
        // Verify with backend
        const session = await getSession();
        if (!session) {
            console.error('No session found');
            return;
        }
        
        const response = await fetch(`${API_URL}/auth/me`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (result.role === 'reviewer') {
                userRole = 'reviewer';
                currentReviewerId = result.data._id;
                localStorage.setItem('userRole', 'reviewer');
                console.log('✓ Backend confirmed: REVIEWER');
            } else if (result.role === 'owner') {
                userRole = 'owner';
                localStorage.setItem('userRole', 'owner');
                console.log('✓ Backend confirmed: OWNER');
            }
        }
        
    } catch (error) {
        console.error('Error loading role:', error);
    }
}

// Update UI based on role
function updateUIForRole() {
    console.log('=== UPDATING UI FOR ROLE:', userRole, '===');
    
    const uploadTabBtn = document.getElementById('uploadTabBtn');
    const applyTabBtn = document.getElementById('applyTabBtn');
    
    if (userRole === 'reviewer') {
        if (uploadTabBtn) uploadTabBtn.remove();
        if (applyTabBtn) applyTabBtn.style.display = 'inline-block';
    } else if (userRole === 'owner') {
        if (applyTabBtn) applyTabBtn.remove();
        if (uploadTabBtn) uploadTabBtn.style.display = 'inline-block';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab navigation
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${targetTab}-tab`).classList.add('active');
            
            // Load data for specific tabs
            if (targetTab === 'dashboard') {
                loadDashboard();
            } else if (targetTab === 'projects') {
                loadProjects();
            } else if (targetTab === 'reviewers') {
                loadReviewers();
            } else if (targetTab === 'apply') {
                loadProjectsForApplication();
            }
        });
    });
    
    // Upload form
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUploadProject);
    }
    
    // Application form
    const applicationForm = document.getElementById('applicationForm');
    if (applicationForm) {
        applicationForm.addEventListener('submit', handleSubmitApplication);
    }
    
    // Feedback form
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', handleSubmitFeedback);
    }
    
    // Filters
    const filterType = document.getElementById('filterType');
    const sortProjects = document.getElementById('sortProjects');
    const searchProjects = document.getElementById('searchProjects');
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (filterType) {
        filterType.addEventListener('change', () => loadProjects());
    }
    
    if (sortProjects) {
        sortProjects.addEventListener('change', () => loadProjects());
    }
    
    if (searchProjects) {
        let searchTimeout;
        searchProjects.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadProjects();
            }, 300);
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
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    
    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModals();
        }
    });
}

// Load initial data
function loadInitialData() {
    loadProjects();
    loadReviewers();
    updateStats();
}

// Load projects
async function loadProjects() {
    try {
        const projectsGrid = document.getElementById('projectsGrid');
        projectsGrid.innerHTML = '<div class="loading">Loading projects</div>';
        
        const filters = {};
        
        const typeFilter = document.getElementById('filterType');
        if (typeFilter && typeFilter.value) {
            filters.type = typeFilter.value;
        }
        
        const sortFilter = document.getElementById('sortProjects');
        if (sortFilter && sortFilter.value) {
            filters.sort = sortFilter.value;
        }
        
        const searchInput = document.getElementById('searchProjects');
        if (searchInput && searchInput.value) {
            filters.search = searchInput.value;
        }
        
        const params = new URLSearchParams(filters);
        const url = `${API_URL}/projects?${params.toString()}`;
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        displayProjects(result.data);
        
    } catch (error) {
        console.error('Load projects error:', error);
        document.getElementById('projectsGrid').innerHTML = 
            '<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error loading projects</div></div>';
    }
}

// Display projects
function displayProjects(projects) {
    const projectsGrid = document.getElementById('projectsGrid');
    
    if (projects.length === 0) {
        projectsGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No projects found</div></div>';
        return;
    }
    
    projectsGrid.innerHTML = '';
    
    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        
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
        
        let actionsHTML = '';
        if (userRole === 'owner' && project.ownerId === currentUser.id) {
            actionsHTML = `
                <div class="project-actions">
                    <button class="btn-secondary btn-small" onclick="viewApplicants('${project._id}')">
                        Applicants (${project.applicantsCount})
                    </button>
                    <button class="btn-secondary btn-small" onclick="viewFeedback('${project._id}')">
                        Feedback (${project.reviewsCount})
                    </button>
                    <button class="btn-danger btn-small" onclick="deleteProject('${project._id}')">Delete</button>
                </div>
            `;
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
                <span>By ${escapeHtml(project.ownerName)}</span>
                <span class="project-xp">+${project.xpReward} XP</span>
            </div>
            <p class="project-applicants">📋 ${project.applicantsCount} applicants | ✅ ${project.approvedCount} approved</p>
            ${actionsHTML}
        `;
        
        projectsGrid.appendChild(card);
    });
}

// Upload project
async function handleUploadProject(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    
    try {
        const session = await getSession();
        if (!session) {
            throw new Error('Session expired. Please log in again.');
        }
        
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
            deadline: deadline.toISOString()
        };
        
        const response = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(projectData)
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showSuccess('Project uploaded successfully!');
        document.getElementById('uploadForm').reset();
        
        // Switch to projects tab
        document.querySelector('[data-tab="projects"]').click();
        
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
        const response = await fetch(`${API_URL}/reviewers?limit=10`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
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

// Load projects for application (reviewer view)
async function loadProjectsForApplication() {
    if (!currentReviewerId) return;
    
    try {
        const applyProjectsList = document.getElementById('applyProjectsList');
        applyProjectsList.innerHTML = '<div class="loading">Loading projects</div>';
        
        const [projectsRes, applicationsRes] = await Promise.all([
            fetch(`${API_URL}/projects`),
            fetch(`${API_URL}/applications/reviewer/${currentReviewerId}`, {
                credentials: 'include'
            })
        ]);
        
        const projectsResult = await projectsRes.json();
        const applicationsResult = await applicationsRes.json();
        
        if (!projectsResult.success) {
            throw new Error(projectsResult.error);
        }
        
        const applications = applicationsResult.success ? applicationsResult.data : [];
        
        displayProjectsForApplication(projectsResult.data, applications);
        
    } catch (error) {
        console.error('Load projects for application error:', error);
    }
}

// Display projects for application
function displayProjectsForApplication(projects, applications) {
    const applyProjectsList = document.getElementById('applyProjectsList');
    
    if (projects.length === 0) {
        applyProjectsList.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No projects available</div></div>';
        return;
    }
    
    applyProjectsList.innerHTML = '';
    
    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'apply-project-card';
        
        const application = applications.find(app => app.projectId._id === project._id);
        
        let actionButton = '';
        if (!application) {
            actionButton = `<button class="btn-primary btn-small" onclick="openApplicationModal('${project._id}', '${escapeHtml(project.title)}', '${project.type}', ${project.xpReward})">Apply Now</button>`;
        } else if (application.status === 'pending') {
            actionButton = `<button class="btn-secondary btn-small" disabled>Pending</button>`;
        } else if (application.status === 'approved') {
            actionButton = `<button class="btn-success btn-small" onclick="openFeedbackModal('${project._id}', '${escapeHtml(project.title)}')">Submit Feedback</button>`;
        } else if (application.status === 'rejected') {
            actionButton = `<button class="btn-danger btn-small" disabled>Rejected</button>`;
        }
        
        card.innerHTML = `
            <div class="apply-project-info">
                <h4>${escapeHtml(project.title)}</h4>
                <p class="apply-project-meta">
                    <span class="project-badge badge-${project.type}">${project.type}</span>
                    <span style="color: var(--success-green); font-weight: 600;">+${project.xpReward} XP</span>
                </p>
            </div>
            ${actionButton}
        `;
        
        applyProjectsList.appendChild(card);
    });
}

// Open application modal
window.openApplicationModal = function(projectId, title, type, xpReward) {
    currentProjectForApplication = projectId;
    
    const modalProjectInfo = document.getElementById('modalProjectInfo');
    modalProjectInfo.innerHTML = `
        <h3>${title}</h3>
        <p>
            <span class="project-badge badge-${type}">${type}</span>
            <span style="color: var(--success-green); font-weight: 600; margin-left: 0.5rem;">+${xpReward} XP</span>
        </p>
    `;
    
    document.getElementById('applicationModal').classList.add('active');
};

// Submit application
async function handleSubmitApplication(e) {
    e.preventDefault();
    
    if (!currentReviewerId || !currentProjectForApplication) {
        showError('Missing information');
        return;
    }
    
    try {
        const session = await getSession();
        if (!session) {
            throw new Error('Session expired');
        }
        
        const applicationData = {
            projectId: currentProjectForApplication,
            reviewerId: currentReviewerId,
            reviewerUsername: currentUser.name || currentUser.email,
            qualifications: document.getElementById('qualifications').value.trim(),
            focusAreas: document.getElementById('focusAreas').value.trim()
        };
        
        const response = await fetch(`${API_URL}/applications`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(applicationData)
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showSuccess('Application submitted!');
        document.getElementById('applicationForm').reset();
        closeModals();
        loadProjectsForApplication();
        
    } catch (error) {
        showError(error.message);
    }
}

// Open feedback modal
window.openFeedbackModal = function(projectId, projectTitle) {
    currentProjectForFeedback = projectId;
    
    const feedbackProjectInfo = document.getElementById('feedbackProjectInfo');
    feedbackProjectInfo.innerHTML = `<h3>Reviewing: ${projectTitle}</h3>`;
    
    document.getElementById('feedbackModal').classList.add('active');
};

// Submit feedback
async function handleSubmitFeedback(e) {
    e.preventDefault();
    
    if (!currentProjectForFeedback || !currentReviewerId) {
        showError('Missing information');
        return;
    }
    
    try {
        const session = await getSession();
        if (!session) {
            throw new Error('Session expired');
        }
        
        const feedbackData = {
            projectId: currentProjectForFeedback,
            reviewerId: currentReviewerId,
            reviewerUsername: currentUser.name || currentUser.email,
            feedbackText: document.getElementById('feedbackText').value.trim(),
            projectRating: document.getElementById('projectRating').value ? 
                parseInt(document.getElementById('projectRating').value) : null
        };
        
        const response = await fetch(`${API_URL}/feedback`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(feedbackData)
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showSuccess('Feedback submitted!');
        document.getElementById('feedbackForm').reset();
        closeModals();
        loadProjectsForApplication();
        
    } catch (error) {
        showError(error.message);
    }
}

// View applicants
window.viewApplicants = async function(projectId) {
    try {
        const session = await getSession();
        if (!session) {
            throw new Error('Session expired');
        }
        
        const applicantsList = document.getElementById('applicantsList');
        applicantsList.innerHTML = '<div class="loading">Loading applicants</div>';
        
        document.getElementById('applicantsModal').classList.add('active');
        
        const response = await fetch(`${API_URL}/applications/project/${projectId}`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`
            }
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        displayApplicants(result.data, projectId);
        
    } catch (error) {
        console.error('View applicants error:', error);
        showError(error.message);
    }
};

// Display applicants
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
        
        card.innerHTML = `
            <div class="applicant-header">
                <div class="applicant-info">
                    <h4>${escapeHtml(app.reviewerUsername)}</h4>
                    <p class="applicant-stats">
                        Level ${reviewer.level} • ${reviewer.xp} XP • ${reviewer.totalReviews} reviews
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
            
            ${app.status === 'pending' ? `
                <div class="applicant-actions">
                    <button class="btn-success" onclick="approveApplication('${app._id}', '${projectId}')">Approve</button>
                    <button class="btn-danger" onclick="rejectApplication('${app._id}', '${projectId}')">Reject</button>
                </div>
            ` : ''}
        `;
        
        applicantsList.appendChild(card);
    });
}

// Approve application
window.approveApplication = async function(applicationId, projectId) {
    try {
        const session = await getSession();
        if (!session) {
            throw new Error('Session expired');
        }
        
        const response = await fetch(`${API_URL}/applications/${applicationId}/approve`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showSuccess('Application approved!');
        viewApplicants(projectId);
        
    } catch (error) {
        showError(error.message);
    }
};

// Reject application
window.rejectApplication = async function(applicationId, projectId) {
    if (!confirm('Are you sure you want to reject this application?')) {
        return;
    }
    
    try {
        const session = await getSession();
        if (!session) {
            throw new Error('Session expired');
        }
        
        const response = await fetch(`${API_URL}/applications/${applicationId}/reject`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showSuccess('Application rejected');
        viewApplicants(projectId);
        
    } catch (error) {
        showError(error.message);
    }
};

// View feedback
window.viewFeedback = async function(projectId) {
    try {
        const feedbackList = document.getElementById('feedbackList');
        feedbackList.innerHTML = '<div class="loading">Loading feedback</div>';
        
        document.getElementById('feedbackListModal').classList.add('active');
        
        const response = await fetch(`${API_URL}/feedback/project/${projectId}`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        displayFeedback(result.data);
        
    } catch (error) {
        console.error('View feedback error:', error);
        showError(error.message);
    }
};

// Display feedback
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
                <span class="feedback-date">${new Date(feedback.submittedAt).toLocaleDateString()}</span>
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

// Rate feedback
window.rateFeedback = async function(feedbackId, rating) {
    if (!confirm(`Rate this feedback ${rating} stars?`)) {
        return;
    }
    
    try {
        const session = await getSession();
        if (!session) {
            throw new Error('Session expired');
        }
        
        const response = await fetch(`${API_URL}/feedback/${feedbackId}/rate`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rating })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showSuccess(`Rated! Reviewer earned ${result.data.xpAwarded} XP`);
        
        // Reload feedback
        const projectId = result.data.feedback.projectId;
        viewFeedback(projectId);
        
    } catch (error) {
        showError(error.message);
    }
};

// Delete project
window.deleteProject = async function(projectId) {
    if (!confirm('Are you sure you want to delete this project?')) {
        return;
    }
    
    try {
        const session = await getSession();
        if (!session) {
            throw new Error('Session expired');
        }
        
        const response = await fetch(`${API_URL}/projects/${projectId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        showSuccess('Project deleted');
        loadProjects();
        
    } catch (error) {
        showError(error.message);
    }
};

// Load dashboard
async function loadDashboard() {
    if (userRole === 'owner') {
        document.getElementById('ownerDashboard').style.display = 'block';
        document.getElementById('reviewerDashboard').style.display = 'none';
        loadOwnerDashboard();
    } else if (userRole === 'reviewer') {
        document.getElementById('ownerDashboard').style.display = 'none';
        document.getElementById('reviewerDashboard').style.display = 'block';
        loadReviewerDashboard();
    }
}

// Load owner dashboard
async function loadOwnerDashboard() {
    try {
        const session = await getSession();
        if (!session) return;
        
        const response = await fetch(`${API_URL}/projects`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            const userProjects = result.data.filter(p => p.ownerId === currentUser.id);
            
            document.getElementById('ownerTotalProjects').textContent = userProjects.length;
            
            const totalApplicants = userProjects.reduce((sum, p) => sum + p.applicantsCount, 0);
            document.getElementById('ownerTotalApplicants').textContent = totalApplicants;
            
            const totalFeedback = userProjects.reduce((sum, p) => sum + p.reviewsCount, 0);
            document.getElementById('ownerTotalFeedback').textContent = totalFeedback;
            
            // Display projects
            const ownerProjectsList = document.getElementById('ownerProjectsList');
            if (userProjects.length === 0) {
                ownerProjectsList.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No projects yet</div></div>';
            } else {
                displayProjects(userProjects);
            }
        }
        
    } catch (error) {
        console.error('Load owner dashboard error:', error);
    }
}

// Load reviewer dashboard
async function loadReviewerDashboard() {
    if (!currentReviewerId) return;
    
    try {
        const session = await getSession();
        if (!session) return;
        
        const response = await fetch(`${API_URL}/reviewers/${currentReviewerId}`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            const reviewer = result.data;
            
            document.getElementById('reviewerLevel').textContent = reviewer.level;
            document.getElementById('reviewerXP').textContent = reviewer.xp;
            document.getElementById('reviewerTotalReviews').textContent = reviewer.totalReviews;
            document.getElementById('reviewerAvgRating').textContent = reviewer.averageRating.toFixed(1);
            
            // XP progress
            const levelThresholds = [0, 500, 1000, 1500, 2000, 2500];
            const currentLevelMin = levelThresholds[reviewer.level - 1] || 0;
            const nextLevelMin = levelThresholds[reviewer.level] || 2500;
            
            const progressPercent = ((reviewer.xp - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100;
            
            document.getElementById('xpProgressFill').style.width = `${Math.min(progressPercent, 100)}%`;
            
            const xpNeeded = nextLevelMin - reviewer.xp;
            document.getElementById('xpProgressText').textContent = 
                xpNeeded > 0 ? `${xpNeeded} XP to Level ${reviewer.level + 1}` : 'Max level!';
        }
        
        // Load applications
        const appsResponse = await fetch(`${API_URL}/applications/reviewer/${currentReviewerId}`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${session.session.token}`
            }
        });
        
        const appsResult = await appsResponse.json();
        
        if (appsResult.success) {
            displayReviewerApplications(appsResult.data);
        }
        
    } catch (error) {
        console.error('Load reviewer dashboard error:', error);
    }
}

// Display reviewer applications
function displayReviewerApplications(applications) {
    const container = document.getElementById('reviewerApplicationsList');
    
    if (applications.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No applications yet</div></div>';
        return;
    }
    
    container.innerHTML = '';
    
    applications.forEach(app => {
        const card = document.createElement('div');
        card.className = 'applicant-card';
        
        let actionButton = '';
        if (app.status === 'approved') {
            actionButton = `<button class="btn-success btn-small" onclick="openFeedbackModal('${app.projectId._id}', '${escapeHtml(app.projectId.title)}')">Submit Feedback</button>`;
        }
        
        card.innerHTML = `
            <div class="applicant-header">
                <div>
                    <h4>${escapeHtml(app.projectId.title)}</h4>
                    <p style="color: var(--neutral-mid); font-size: 14px;">${app.projectId.type} • ${app.projectId.xpReward} XP</p>
                </div>
                <span class="applicant-status status-${app.status}">${app.status}</span>
            </div>
            ${actionButton ? `<div style="margin-top: 1rem;">${actionButton}</div>` : ''}
        `;
        
        container.appendChild(card);
    });
}

// Update stats
async function updateStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
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
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">✅</div>
            <div class="notification-message">${escapeHtml(message)}</div>
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'error-notification';
    notification.innerHTML = `
        <div class="error-content">
            <div class="error-icon">⚠️</div>
            <div class="error-message">
                <strong>Error</strong>
                <p>${escapeHtml(message)}</p>
            </div>
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Initialize app
document.addEventListener('DOMContentLoaded', initialize);