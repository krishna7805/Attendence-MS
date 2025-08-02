// Hardcoded Supabase credentials
const SUPABASE_URL = 'https://zllreietivjwymrtsbex.supabase.co';  // replace with your actual Supabase URL
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsbHJlaWV0aXZqd3ltcnRzYmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNjg0OTQsImV4cCI6MjA2OTY0NDQ5NH0.ZwlaHXauaxc_37VRoRc4Oz3AkA9mkS88e6WCs_NaaxM';  // replace with your actual Supabase anon/public key

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global variables
let students = [];
let attendanceChart = null;

document.addEventListener('DOMContentLoaded', async function () {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('attendanceDate').value = today;
  document.getElementById('viewDate').value = today;

  try {
    await loadStudents();
    await updateStatistics();
  } catch (error) {
    showMessage(`Failed to initialize: ${error.message}`, 'error');
  }
});


// Load saved credentials from localStorage
function loadSavedCredentials() {
    const savedUrl = localStorage.getItem('supabaseUrl');
    const savedKey = localStorage.getItem('supabaseKey');
    
    if (savedUrl && savedKey) {
        document.getElementById('supabaseUrl').value = savedUrl;
        document.getElementById('supabaseKey').value = savedKey;
        connectSupabase();
    }
}

// Connect to Supabase
async function connectSupabase() {
    const url = document.getElementById('supabaseUrl').value.trim();
    const key = document.getElementById('supabaseKey').value.trim();
    
    if (!url || !key) {
        showMessage('Please enter both Supabase URL and API key', 'error');
        return;
    }
    
    try {
        // Initialize Supabase client
        supabase = window.supabase.createClient(url, key);
        
        // Test connection by trying to fetch students
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .limit(1);
        
        if (error) {
            throw error;
        }
        
        // Save credentials
        localStorage.setItem('supabaseUrl', url);
        localStorage.setItem('supabaseKey', key);
        
        // Hide config section and show main app
        document.getElementById('configSection').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        showMessage('Successfully connected to Supabase!', 'success');
        
        // Load students and initialize
        await loadStudents();
        await updateStatistics();
        
    } catch (error) {
        showMessage(`Connection failed: ${error.message}`, 'error');
        console.error('Connection error:', error);
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
                <br><small>Table: students (fields: id, name, roll_number)</small>
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
                    <input type="checkbox" checked data-student-id="${student.id}">
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
    const subject = document.getElementById('subject').value;
    
    submitBtn.disabled = !date || !subject || students.length === 0;
}

// Add event listeners for form validation
document.getElementById('attendanceDate').addEventListener('change', updateSubmitButton);
document.getElementById('subject').addEventListener('change', updateSubmitButton);

// Submit attendance
async function submitAttendance() {
    const date = document.getElementById('attendanceDate').value;
    const subject = document.getElementById('subject').value;
    
    if (!date || !subject) {
        showMessage('Please select both date and subject', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="loading"></span>Submitting...';
    submitBtn.disabled = true;
    
    try {
        const attendanceRecords = [];
        
        // Collect attendance data
        document.querySelectorAll('#studentsList input[type="checkbox"]').forEach(checkbox => {
            const studentId = checkbox.dataset.studentId;
            const status = checkbox.checked ? 'present' : 'absent';
            
            attendanceRecords.push({
                student_id: parseInt(studentId),
                date: date,
                subject: subject,
                status: status
            });
        });
        
        // Check if attendance already exists for this date and subject
        const { data: existingRecords, error: checkError } = await supabase
            .from('attendance')
            .select('student_id')
            .eq('date', date)
            .eq('subject', subject);
        
        if (checkError) throw checkError;
        
        if (existingRecords && existingRecords.length > 0) {
            // Update existing records
            for (const record of attendanceRecords) {
                const { error } = await supabase
                    .from('attendance')
                    .update({ status: record.status })
                    .eq('student_id', record.student_id)
                    .eq('date', date)
                    .eq('subject', subject);
                
                if (error) throw error;
            }
            showMessage('Attendance updated successfully!', 'success');
        } else {
            // Insert new records
            const { error } = await supabase
                .from('attendance')
                .insert(attendanceRecords);
            
            if (error) throw error;
            showMessage('Attendance submitted successfully!', 'success');
        }
        
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
    const subject = document.getElementById('viewSubject').value;
    
    if (!date || !subject) {
        showMessage('Please select both date and subject to view absentees', 'error');
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('attendance')
            .select(`
                student_id,
                students (name, roll_number)
            `)
            .eq('date', date)
            .eq('subject', subject)
            .eq('status', 'absent');
        
        if (error) throw error;
        
        const absenteesContainer = document.getElementById('absenteesList');
        
        if (!data || data.length === 0) {
            absenteesContainer.innerHTML = `
                <div class="message info">
                    <strong>Great news!</strong> No absentees found for ${subject} on ${date}.
                </div>
            `;
        } else {
            absenteesContainer.innerHTML = `
                <h3 style="margin-bottom: 16px; color: #744210;">
                    Absentees for ${subject} on ${date} (${data.length} students)
                </h3>
                ${data.map(record => `
                    <div class="absentee-item">
                        <div class="student-name">${record.students.name}</div>
                        <div class="student-roll">Roll: ${record.students.roll_number}</div>
                    </div>
                `).join('')}
            `;
        }
        
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
        const presentToday = todayAttendance ? todayAttendance.filter(a => a.status === 'present').length : 0;
        const absentToday = todayAttendance ? todayAttendance.filter(a => a.status === 'absent').length : 0;
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

// Auto-hide messages when clicking anywhere
document.addEventListener('click', function() {
    const messageDiv = document.getElementById('messageDiv');
    if (messageDiv.style.display === 'block') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 1000);
    }
});