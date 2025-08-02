// Hardcoded Supabase credentials
const SUPABASE_URL = 'https://zllreietivjwymrtsbex.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsbHJlaWV0aXZqd3ltcnRzYmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNjg0OTQsImV4cCI6MjA2OTY0NDQ5NH0.ZwlaHXauaxc_37VRoRc4Oz3AkA9mkS88e6WCs_NaaxM';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global variables
let students = [];
let subjects = [];
let attendanceChart = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendanceDate').value = today;
    document.getElementById('viewDate').value = today;
    
    try {
        await loadSubjects();
        await loadStudents();
        await updateStatistics();
    } catch (error) {
        showMessage(`Failed to initialize: ${error.message}`, 'error');
    }
});

// Load subjects from database
async function loadSubjects() {
    try {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        subjects = data || [];
        populateSubjectDropdowns();
        
    } catch (error) {
        console.error('Error loading subjects:', error);
        // Continue without subjects - user can add custom ones
    }
}

// Populate subject dropdowns with existing subjects
function populateSubjectDropdowns() {
    const subjectSelect = document.getElementById('subject');
    const viewSubjectSelect = document.getElementById('viewSubject');
    
    // Clear existing options except the first two
    subjectSelect.innerHTML = '<option value="">Select Subject</option>';
    viewSubjectSelect.innerHTML = '<option value="">Select Subject</option>';
    
    // Add subjects from database
    subjects.forEach(subject => {
        const option1 = document.createElement('option');
        option1.value = subject.subject_id;
        option1.textContent = subject.name;
        subjectSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = subject.subject_id;
        option2.textContent = subject.name;
        viewSubjectSelect.appendChild(option2);
    });
    
    // Add "Other (Custom)" option
    const otherOption1 = document.createElement('option');
    otherOption1.value = 'other';
    otherOption1.textContent = 'Other (Custom)';
    subjectSelect.appendChild(otherOption1);
    
    const otherOption2 = document.createElement('option');
    otherOption2.value = 'other';
    otherOption2.textContent = 'Other (Custom)';
    viewSubjectSelect.appendChild(otherOption2);
}

// Ensure subject exists in database
async function ensureSubjectExists(subjectName) {
    try {
        // Generate subject_id from subject name (remove spaces, convert to uppercase)
        const subjectId = subjectName.replace(/\s+/g, '_').toUpperCase();
        
        // Check if subject already exists
        const { data: existingSubject, error: checkError } = await supabase
            .from('subjects')
            .select('subject_id')
            .eq('subject_id', subjectId)
            .single();
        
        if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
        }
        
        // If subject doesn't exist, create it
        if (!existingSubject) {
            const { error: insertError } = await supabase
                .from('subjects')
                .insert([{
                    subject_id: subjectId,
                    name: subjectName
                }]);
            
            if (insertError) throw insertError;
            
            // Reload subjects to update the dropdowns
            await loadSubjects();
        }
        
        return subjectId;
        
    } catch (error) {
        throw new Error(`Failed to ensure subject exists: ${error.message}`);
    }
}

// Load students from database
async function loadStudents() {
    try {
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .order('roll_number');
        
        if (error) throw error;
        
        students = data || [];
        displayStudents();
        
        // Enable submit button if students are loaded and form is valid
        updateSubmitButton();
        
    } catch (error) {
        showMessage(`Error loading students: ${error.message}`, 'error');
        console.error('Error loading students:', error);
    }
}

// Display students in the UI
function displayStudents() {
    const container = document.getElementById('studentsList');
    
    if (students.length === 0) {
        container.innerHTML = `
            <div class="message info">
                <strong>No students found.</strong> Please add students to the database first.
                <br><small>Table: students (fields: roll_number, name, email)</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = students.map(student => `
        <div class="student-item">
            <div class="student-info">
                <div class="student-name">${student.name}</div>
                <div class="student-roll">Roll: ${student.roll_number}</div>
            </div>
            <div style="display: flex; align-items: center;">
                <label class="toggle-switch">
                    <input type="checkbox" checked data-roll-number="${student.roll_number}">
                    <span class="slider"></span>
                    <span class="toggle-label">Present</span>
                </label>
            </div>
        </div>
    `).join('');
    
    // Add event listeners to toggle switches
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const label = this.parentNode.querySelector('.toggle-label');
            label.textContent = this.checked ? 'Present' : 'Absent';
            updateSubmitButton();
        });
    });
}

// Update submit button state
function updateSubmitButton() {
    const submitBtn = document.getElementById('submitBtn');
    const date = document.getElementById('attendanceDate').value;
    const subject = getCurrentSubject();
    
    submitBtn.disabled = !date || !subject || students.length === 0;
}

// Add event listeners for form validation
document.getElementById('attendanceDate').addEventListener('change', updateSubmitButton);
document.getElementById('subject').addEventListener('change', updateSubmitButton);

// Submit attendance
async function submitAttendance() {
    const date = document.getElementById('attendanceDate').value;
    const subjectName = getCurrentSubject();
    
    if (!date || !subjectName) {
        showMessage('Please select both date and subject', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="loading"></span>Submitting...';
    submitBtn.disabled = true;
    
    try {
        // Ensure subject exists in database and get subject_id
        const subjectId = await ensureSubjectExists(subjectName);
        
        const attendanceRecords = [];
        
        // Collect attendance data
        document.querySelectorAll('#studentsList input[type="checkbox"]').forEach(checkbox => {
            const rollNumber = checkbox.dataset.rollNumber;
            const status = checkbox.checked ? 'Present' : 'Absent';
            
            attendanceRecords.push({
                roll_number: rollNumber,
                date: date,
                subject_id: subjectId,
                status: status
            });
        });
        
        // Check if attendance already exists for this date and subject
        const { data: existingRecords, error: checkError } = await supabase
            .from('attendance')
            .select('roll_number')
            .eq('date', date)
            .eq('subject_id', subjectId);
        
        if (checkError) throw checkError;
        
        if (existingRecords && existingRecords.length > 0) {
            // Delete existing records first
            const { error: deleteError } = await supabase
                .from('attendance')
                .delete()
                .eq('date', date)
                .eq('subject_id', subjectId);
            
            if (deleteError) throw deleteError;
        }
        
        // Insert new records
        const { error } = await supabase
            .from('attendance')
            .insert(attendanceRecords);
        
        if (error) throw error;
        
        showMessage('Attendance submitted successfully!', 'success');
        
        await updateStatistics();
        
    } catch (error) {
        showMessage(`Error submitting attendance: ${error.message}`, 'error');
        console.error('Error submitting attendance:', error);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        updateSubmitButton();
    }
}

// View absentees
async function viewAbsentees() {
    const date = document.getElementById('viewDate').value;
    const subjectName = getCurrentViewSubject();
    
    if (!date || !subjectName) {
        showMessage('Please select both date and subject to view absentees', 'error');
        return;
    }
    
    try {
        // Find subject_id for the given subject name
        let subjectId;
        const existingSubject = subjects.find(s => s.name === subjectName || s.subject_id === subjectName);
        if (existingSubject) {
            subjectId = existingSubject.subject_id;
        } else {
            // Generate subject_id from name
            subjectId = subjectName.replace(/\s+/g, '_').toUpperCase();
        }
        
        // First get all absentees from attendance table
        const { data: absenteeData, error: attendanceError } = await supabase
            .from('attendance')
            .select('roll_number')
            .eq('date', date)
            .eq('subject_id', subjectId)
            .eq('status', 'Absent');
        
        if (attendanceError) throw attendanceError;
        
        const absenteesContainer = document.getElementById('absenteesList');
        
        if (!absenteeData || absenteeData.length === 0) {
            absenteesContainer.innerHTML = `
                <div class="message info">
                    <strong>Great news!</strong> No absentees found for ${subjectName} on ${date}.
                </div>
            `;
            return;
        }
        
        // Get student details for absentees
        const rollNumbers = absenteeData.map(record => record.roll_number);
        const { data: studentData, error: studentError } = await supabase
            .from('students')
            .select('name, roll_number')
            .in('roll_number', rollNumbers);
        
        if (studentError) throw studentError;
        
        absenteesContainer.innerHTML = `
            <h3 style="margin-bottom: 16px; color: #744210;">
                Absentees for ${subjectName} on ${date} (${studentData.length} students)
            </h3>
            ${studentData.map(student => `
                <div class="absentee-item">
                    <div class="student-name">${student.name}</div>
                    <div class="student-roll">Roll: ${student.roll_number}</div>
                </div>
            `).join('')}
        `;
        
    } catch (error) {
        showMessage(`Error fetching absentees: ${error.message}`, 'error');
        console.error('Error fetching absentees:', error);
    }
}

// Update statistics and chart
async function updateStatistics() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Get today's attendance
        const { data: todayAttendance, error } = await supabase
            .from('attendance')
            .select('status')
            .eq('date', today);
        
        if (error) throw error;
        
        const totalStudents = students.length;
        const presentToday = todayAttendance ? todayAttendance.filter(a => a.status === 'Present').length : 0;
        const absentToday = todayAttendance ? todayAttendance.filter(a => a.status === 'Absent').length : 0;
        const attendanceRate = totalStudents > 0 ? Math.round((presentToday / totalStudents) * 100) : 0;
        
        // Update stats display
        document.getElementById('totalStudents').textContent = totalStudents;
        document.getElementById('presentToday').textContent = presentToday;
        document.getElementById('absentToday').textContent = absentToday;
        document.getElementById('attendanceRate').textContent = `${attendanceRate}%`;
        
        // Update chart
        updateChart(presentToday, absentToday);
        
    } catch (error) {
        console.error('Error updating statistics:', error);
    }
}

// Update attendance chart
function updateChart(present, absent) {
    const ctx = document.getElementById('attendanceChart').getContext('2d');
    
    if (attendanceChart) {
        attendanceChart.destroy();
    }
    
    attendanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Absent'],
            datasets: [{
                data: [present, absent],
                backgroundColor: [
                    '#10b981',
                    '#ef4444'
                ],
                borderWidth: 0,
                hoverBorderWidth: 2,
                hoverBorderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            size: 14
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = present + absent;
                            const percentage = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

// Show message to user
function showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('messageDiv');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // Hide message after 5 seconds
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

// Toggle custom subject input
function toggleCustomSubject() {
    const subjectSelect = document.getElementById('subject');
    const customSubjectInput = document.getElementById('customSubject');
    
    if (subjectSelect.value === 'other') {
        customSubjectInput.style.display = 'block';
        customSubjectInput.required = true;
        customSubjectInput.focus();
    } else {
        customSubjectInput.style.display = 'none';
        customSubjectInput.required = false;
        customSubjectInput.value = '';
    }
    updateSubmitButton();
}

// Update subject value when custom input changes
function updateSubjectValue() {
    updateSubmitButton();
}

// Get the current subject value (either from dropdown or custom input)
function getCurrentSubject() {
    const subjectSelect = document.getElementById('subject');
    const customSubjectInput = document.getElementById('customSubject');
    
    if (subjectSelect.value === 'other' && customSubjectInput.value.trim()) {
        return customSubjectInput.value.trim();
    }
    
    // Find subject name from subjects array
    const selectedSubject = subjects.find(s => s.subject_id === subjectSelect.value);
    return selectedSubject ? selectedSubject.name : subjectSelect.value;
}

// Toggle custom view subject input
function toggleCustomViewSubject() {
    const viewSubjectSelect = document.getElementById('viewSubject');
    const customViewSubjectInput = document.getElementById('customViewSubject');
    
    if (viewSubjectSelect.value === 'other') {
        customViewSubjectInput.style.display = 'block';
        customViewSubjectInput.focus();
    } else {
        customViewSubjectInput.style.display = 'none';
        customViewSubjectInput.value = '';
    }
}

// Update view subject value when custom input changes
function updateViewSubjectValue() {
    // Just trigger any necessary updates
}

// Get the current view subject value (either from dropdown or custom input)
function getCurrentViewSubject() {
    const viewSubjectSelect = document.getElementById('viewSubject');
    const customViewSubjectInput = document.getElementById('customViewSubject');
    
    if (viewSubjectSelect.value === 'other' && customViewSubjectInput.value.trim()) {
        return customViewSubjectInput.value.trim();
    }
    
    // Find subject name from subjects array
    const selectedSubject = subjects.find(s => s.subject_id === viewSubjectSelect.value);
    return selectedSubject ? selectedSubject.name : viewSubjectSelect.value;
}

// Auto-hide messages when clicking anywhere
document.addEventListener('click', function() {
    const messageDiv = document.getElementById('messageDiv');
    if (messageDiv.style.display === 'block') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 1000);
    }
});
