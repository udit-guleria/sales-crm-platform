let currentUser = null;

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = JSON.parse(userStr);
    document.getElementById('userInfo').textContent = `Welcome, ${currentUser.name}`;

    // Logout handler
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    });

    // Initialize data
    loadLeads();
    loadTasks();

    // Setup event listeners
    document.getElementById('saveLead').addEventListener('click', saveLead);
    document.getElementById('saveTask').addEventListener('click', saveTask);

    // Setup user management if current user is admin
    if (currentUser.type === 'ADMIN') {
        loadUsers();
        document.getElementById('saveUser').addEventListener('click', saveUser);
    } else {
        document.getElementById('users-tab').style.display = 'none';
    }

    // Add reset handler for new lead button
    document.querySelector('[data-bs-target="#leadModal"]').addEventListener('click', resetLeadModal);
});

async function loadLeads() {
    try {
        const response = await fetch('api/leads.php');
        const leads = await response.json();
        const tbody = document.querySelector('#leadsTable tbody');
        tbody.innerHTML = '';

        leads.forEach(lead => {
            const tr = document.createElement('tr');
            // Escape the lead object properly for the onclick handlers
            const leadJson = JSON.stringify(lead).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            tr.innerHTML = `
                <td>${lead.name}</td>
                <td>${lead.email}</td>
                <td>${lead.phone || '-'}</td>
                <td>${lead.company}</td>
                <td>${lead.industry}</td>
                <td><span class="badge ${getLeadStatusBadgeClass(lead.status)}">${lead.status}</span></td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick='editLead(${leadJson})'>
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-success" onclick='createTaskForLead(${leadJson})'>
                        <i class="bi bi-plus-circle"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteLead('${lead.email}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        alert('Error loading leads');
    }
}

async function loadTasks() {
    try {
        // Add users to the Promise.all to fetch creator information
        const [tasksResponse, leadsResponse, usersResponse] = await Promise.all([
            fetch('api/tasks.php'),
            fetch('api/leads.php'),
            fetch('api/users.php')
        ]);
        
        const tasks = await tasksResponse.json();
        const leads = await leadsResponse.json();
        const users = await usersResponse.json();
        
        // Create maps for both leads and users
        const leadMap = leads.reduce((map, lead) => {
            map[lead.id] = lead.name;
            return map;
        }, {});
        
        const userMap = users.reduce((map, user) => {
            map[user.id] = user.name;
            return map;
        }, {});

        const tasksContainer = document.querySelector('#tasksTable');
        tasksContainer.innerHTML = '<div class="row g-4" id="tasksGrid"></div>';
        const tasksGrid = document.getElementById('tasksGrid');

        tasks.forEach(task => {
            const taskCard = document.createElement('div');
            taskCard.className = 'col-md-4 col-lg-3';
            
            const taskJson = JSON.stringify(task).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            
            taskCard.innerHTML = `
                <div class="card h-100 task-card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title mb-0">${task.title}</h5>
                            <div class="dropdown">
                                <button class="btn btn-link btn-sm p-0 text-muted" type="button" data-bs-toggle="dropdown">
                                    <i class="bi bi-three-dots-vertical"></i>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end">
                                    <li><a class="dropdown-item" href="#" onclick='editTask(${taskJson})'><i class="bi bi-pencil me-2"></i>Edit</a></li>
                                    <li><a class="dropdown-item text-danger" href="#" onclick="deleteTask('${task.id}')"><i class="bi bi-trash me-2"></i>Delete</a></li>
                                </ul>
                            </div>
                        </div>
                        <p class="card-text text-muted small mb-2">
                            <i class="bi bi-person me-1"></i>Lead: ${leadMap[task.lead_id] || 'Unknown Lead'}
                        </p>
                        <p class="task-description mb-3">${task.description || 'No description provided'}</p>
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="d-flex gap-2">
                                <span class="badge ${getStatusBadgeClass(task.status)}">${task.status}</span>
                                <span class="badge bg-${task.priority === 'HIGH' ? 'danger' : 'warning'}">${task.priority}</span>
                            </div>
                            <span class="text-muted small">
                                <i class="bi bi-calendar me-1"></i>Due: ${task.due_date}
                            </span>
                        </div>
                        <p class="card-text text-muted small mb-0">
                            <i class="bi bi-person-badge me-1"></i>Created by: ${userMap[task.created_by] || 'Unknown User'}
                        </p>
                    </div>
                </div>
            `;
            
            tasksGrid.appendChild(taskCard);
        });
    } catch (error) {
        alert('Error loading tasks');
    }
}

// Lead CRUD operations
async function saveLead() {
    const form = document.getElementById('leadForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const isEdit = !!data.id;

    try {
        const response = await fetch('api/leads.php', {
            method: isEdit ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.message) {
            bootstrap.Modal.getInstance(document.getElementById('leadModal')).hide();
            loadLeads();
        } else {
            alert('Operation failed: ' + result.error);
        }
    } catch (error) {
        alert('Operation failed');
    }
}

// Task CRUD operations
async function saveTask() {
    const form = document.getElementById('taskForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Ensure lead_id is included in the data
    if (!data.lead_id) {
        const leadIdInput = form.querySelector('input[name="lead_id"]');
        if (leadIdInput) {
            data.lead_id = leadIdInput.value;
        }
    }
    
    data.created_by = currentUser.id;
    const isEdit = !!data.id;

    try {
        const response = await fetch('api/tasks.php', {
            method: isEdit ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.message) {
            bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
            loadTasks();
        } else {
            alert('Operation failed: ' + result.error);
        }
    } catch (error) {
        alert('Operation failed');
    }
}

// Helper functions for edit/delete operations
function editLead(lead) {
    const form = document.getElementById('leadForm');
    Object.keys(lead).forEach(key => {
        const input = form.elements[key];
        if (input) input.value = lead[key];
    });
    
    // Update modal title and description
    const modalTitle = document.querySelector('#leadModal .modal-title');
    modalTitle.textContent = 'Edit Lead';
    const modalDescription = modalTitle.nextElementSibling;
    modalDescription.textContent = 'Update lead information';
    
    // Update save button text
    const saveButton = document.getElementById('saveLead');
    saveButton.innerHTML = '<i class="bi bi-check-circle me-1"></i>Update Lead';
    
    const modal = new bootstrap.Modal(document.getElementById('leadModal'));
    modal.show();
}

function createTaskForLead(lead) {
    const form = document.getElementById('taskForm');
    form.reset(); // Reset form first
    
    // Hide the lead selection dropdown group when creating task from lead
    const leadSelectGroup = form.querySelector('.lead-select-group');
    leadSelectGroup.style.display = 'none';
    
    // Create a hidden input for lead_id if it doesn't exist
    let leadIdInput = form.querySelector('input[name="lead_id"]');
    if (!leadIdInput) {
        leadIdInput = document.createElement('input');
        leadIdInput.type = 'hidden';
        leadIdInput.name = 'lead_id';
        form.appendChild(leadIdInput);
    }
    
    // Set the lead_id value
    leadIdInput.value = lead.id;
    
    // Update modal title to indicate we're creating task for specific lead
    const modalTitle = document.querySelector('#taskModal .modal-title');
    modalTitle.textContent = `New Task for ${lead.name}`;
    
    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();
}

async function deleteLead(email) {
    if (confirm('Are you sure you want to delete this lead?')) {
        try {
            const response = await fetch(`api/leads.php?email=${email}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.message) {
                loadLeads();
            } else {
                alert('Delete failed: ' + result.error);
            }
        } catch (error) {
            alert('Delete failed');
        }
    }
}

async function deleteTask(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        try {
            const response = await fetch(`api/tasks.php?id=${id}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.message) {
                loadTasks();
            } else {
                alert('Delete failed: ' + result.error);
            }
        } catch (error) {
            alert('Delete failed');
        }
    }
}

// Add helper function for status badge colors
function getStatusBadgeClass(status) {
    switch(status) {
        case 'NEW': return 'bg-primary';
        case 'IN-PROGRESS': return 'bg-info';
        case 'COMPLETED': return 'bg-success';
        case 'DROPPED': return 'bg-secondary';
        case 'OVERDUE': return 'bg-danger';
        default: return 'bg-primary';
    }
}

// Add helper function for lead status badge colors
function getLeadStatusBadgeClass(status) {
    switch(status) {
        case 'NEW': return 'bg-primary';
        case 'CONTACTED': return 'bg-info';
        case 'PROPOSAL': return 'bg-warning';
        case 'NEGOTIATION': return 'bg-secondary';
        case 'CLOSED-WON': return 'bg-success';
        case 'CLOSED-LOST': return 'bg-danger';
        default: return 'bg-primary';
    }
}

async function loadUsers() {
    try {
        const response = await fetch('api/users.php');
        const users = await response.json();
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td><span class="badge ${getUserTypeBadgeClass(user.type)}">${user.type}</span></td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick='editUser(${JSON.stringify(user)})'>
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        alert('Error loading users');
    }
}

function getUserTypeBadgeClass(type) {
    switch(type) {
        case 'SALES REP': return 'bg-info';
        case 'MANAGER': return 'bg-warning';
        case 'ADMIN': return 'bg-danger';
        default: return 'bg-primary';
    }
}

function editTask(task) {
    const form = document.getElementById('taskForm');
    // Reset form first
    form.reset();
    
    // Hide the lead selection group since we want to keep the same lead
    const leadSelectGroup = form.querySelector('.lead-select-group');
    leadSelectGroup.style.display = 'none';
    
    // Remove any existing hidden inputs first
    const existingLeadInput = form.querySelector('input[name="lead_id"]');
    if (existingLeadInput) {
        existingLeadInput.remove();
    }
    const existingCreatedByInput = form.querySelector('input[name="created_by"]');
    if (existingCreatedByInput) {
        existingCreatedByInput.remove();
    }
    
    // Create new hidden inputs
    const leadIdInput = document.createElement('input');
    leadIdInput.type = 'hidden';
    leadIdInput.name = 'lead_id';
    leadIdInput.value = task.lead_id;
    form.appendChild(leadIdInput);
    
    const createdByInput = document.createElement('input');
    createdByInput.type = 'hidden';
    createdByInput.name = 'created_by';
    createdByInput.value = task.created_by;
    form.appendChild(createdByInput);
    
    // Populate visible form fields with task data
    Object.keys(task).forEach(key => {
        // Skip lead_id and created_by as they're handled by hidden inputs
        if (key !== 'lead_id' && key !== 'created_by') {
            const input = form.elements[key];
            if (input) input.value = task[key];
        }
    });
    
    // Update modal title
    const modalTitle = document.querySelector('#taskModal .modal-title');
    modalTitle.textContent = 'Edit Task';
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();
}

function resetLeadModal() {
    const form = document.getElementById('leadForm');
    form.reset();
    
    // Reset modal title and description
    const modalTitle = document.querySelector('#leadModal .modal-title');
    modalTitle.textContent = 'Create New Lead';
    const modalDescription = modalTitle.nextElementSibling;
    modalDescription.textContent = 'Add a new potential client to your pipeline';
    
    // Reset save button text
    const saveButton = document.getElementById('saveLead');
    saveButton.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Create Lead';
}

// ... rest of existing code ... 