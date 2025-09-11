// Market Research App JavaScript

// Global app configuration
const App = {
    config: {
        maxReports: 5,
        apiEndpoints: {
            generateReport: '/generate-report',
            apiStatus: '/api/status'
        }
    },
    
    // Initialize the application
    init() {
        this.setupEventListeners();
        this.updateUserStatus();
        this.setupFormValidation();
        this.addAnimations();
    },
    
    // Set up event listeners
    setupEventListeners() {
        // Form submission
        const form = document.getElementById('research-form');
        if (form) {
            form.addEventListener('submit', this.handleFormSubmit.bind(this));
        }
        
        // Input validation (only for authenticated users)
        if (window.isAuthenticated) {
            const industryInput = document.getElementById('industry');
            if (industryInput) {
                industryInput.addEventListener('input', this.validateIndustryInput.bind(this));
            }
        }
        
        // Geography select
        const geographySelect = document.getElementById('geography');
        if (geographySelect) {
            geographySelect.addEventListener('change', this.handleGeographyChange.bind(this));
        }
        
        // Copy to clipboard functionality
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-copy]')) {
                this.copyToClipboard(e.target.getAttribute('data-copy'));
            }
        });
        
        // Modal events
        this.setupModalEvents();
    },
    
    // Setup modal events
    setupModalEvents() {
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.addEventListener('hidden.bs.modal', () => {
                // Reload page after successful report generation
                window.location.reload();
            });
        }
    },
    
    // Handle form submission
    async handleFormSubmit(e) {
        e.preventDefault();
        
        // Check if user is authenticated
        if (!window.isAuthenticated) {
            window.location.href = '/login';
            return;
        }
        
        const formData = this.getFormData();
        if (!this.validateFormData(formData)) {
            return;
        }
        
        this.setLoadingState(true);
        
        try {
            const response = await this.generateReport(formData);
            
            if (response.streaming) {
                // Streaming started, loading state will be managed by streaming updates
                this.showStreamingUI();
            } else if (response.success) {
                this.showSuccessModal(response);
            } else {
                this.showErrorModal(response.error || 'Failed to generate report');
            }
            
        } catch (error) {
            console.error('Report generation error:', error);
            if (error.message.includes('401') || error.message.includes('login')) {
                this.showErrorModal('Please sign in to generate reports.');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                this.showErrorModal('Network error occurred. Please try again.');
            }
            this.setLoadingState(false);
        }
    },
    
    // Get form data
    getFormData() {
        return {
            industry: document.getElementById('industry')?.value.trim() || '',
            geography: document.getElementById('geography')?.value || '',
            details: document.getElementById('details')?.value.trim() || ''
        };
    },
    
    // Validate form data
    validateFormData(data) {
        if (!data.industry) {
            this.showAlert('Please enter an industry', 'warning');
            document.getElementById('industry')?.focus();
            return false;
        }
        
        if (data.industry.length < 2) {
            this.showAlert('Industry name must be at least 2 characters', 'warning');
            document.getElementById('industry')?.focus();
            return false;
        }
        
        return true;
    },
    
    // Generate report via API
    async generateReport(formData) {
        const response = await fetch(this.config.apiEndpoints.generateReport, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }
        
        // If we get a task_run_id, start SSE streaming
        if (result.task_run_id) {
            this.startTaskStream(result.task_run_id);
            return { streaming: true, task_run_id: result.task_run_id };
        }
        
        return result;
    },
    
    // Set loading state
    setLoadingState(isLoading) {
        const generateBtn = document.getElementById('generate-btn');
        const progressArea = document.getElementById('progress-area');
        const spinner = generateBtn?.querySelector('.spinner-border');
        const btnText = generateBtn?.querySelector('.btn-text');
        
        if (!generateBtn) return;
        
        if (isLoading) {
            generateBtn.disabled = true;
            spinner?.classList.remove('d-none');
            if (btnText) btnText.textContent = 'Generating Report...';
            progressArea?.classList.remove('d-none');
            
            // Add progress animation
            this.animateProgress();
            
        } else {
            generateBtn.disabled = false;
            spinner?.classList.add('d-none');
            if (btnText) btnText.textContent = 'Deep Research - Generate comprehensive market research report';
            progressArea?.classList.add('d-none');
        }
    },
    
    // Animate progress bar
    animateProgress() {
        const progressBar = document.querySelector('#progress-area .progress-bar');
        if (progressBar) {
            let width = 0;
            const interval = setInterval(() => {
                width += Math.random() * 5;
                if (width > 90) width = 90; // Don't complete until actual completion
                progressBar.style.width = width + '%';
            }, 500);
            
            // Store interval for cleanup
            this._progressInterval = interval;
        }
    },
    
    // Show success modal
    showSuccessModal(response) {
        const reportLinks = document.getElementById('report-links');
        if (reportLinks) {
            reportLinks.innerHTML = `
                <a href="${response.url}" class="btn btn-primary">
                    <i class="fas fa-eye me-2"></i>View Report
                </a>
                <a href="/download/${response.slug}" class="btn btn-outline-secondary">
                    <i class="fas fa-download me-2"></i>Download Markdown
                </a>
                <button class="btn btn-outline-info" onclick="App.copyToClipboard('${window.location.origin}${response.url}')">
                    <i class="fas fa-share me-2"></i>Copy Share Link
                </button>
            `;
        }
        
        const successModal = new bootstrap.Modal(document.getElementById('successModal'));
        successModal.show();
        
        // Update user status
        this.updateUserStatus();
    },
    
    // Show error modal
    showErrorModal(message) {
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        
        const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
        errorModal.show();
    },
    
    // Show alert
    showAlert(message, type = 'info') {
        // Create alert element
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alert);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    },
    
    // Update user status
    async updateUserStatus() {
        try {
            const response = await fetch(this.config.apiEndpoints.apiStatus);
            const status = await response.json();
            
            this.updateStatusDisplay(status);
            
        } catch (error) {
            console.error('Failed to update user status:', error);
        }
    },
    
    // Update status display
    updateStatusDisplay(status) {
        // Update progress bar
        const progressBar = document.querySelector('.progress-bar');
        if (progressBar) {
            const percentage = (status.report_count / status.max_reports) * 100;
            progressBar.style.width = percentage + '%';
        }
        
        // Update remaining count
        const remainingElement = document.querySelector('.text-muted small');
        if (remainingElement && remainingElement.textContent.includes('remaining')) {
            remainingElement.textContent = `${status.remaining_reports} remaining`;
        }
        
        // Disable button if limit reached
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn && status.remaining_reports <= 0) {
            generateBtn.disabled = true;
        }
    },
    
    // Form validation
    setupFormValidation() {
        // Only setup validation for authenticated users
        if (!window.isAuthenticated) {
            return;
        }
        
        const industryInput = document.getElementById('industry');
        if (industryInput) {
            industryInput.addEventListener('blur', this.validateIndustryInput.bind(this));
        }
    },
    
    // Validate industry input
    validateIndustryInput(e) {
        const input = e.target;
        const value = input.value.trim();
        
        // Remove existing feedback
        const existingFeedback = input.parentNode.querySelectorAll('.invalid-feedback, .valid-feedback');
        existingFeedback.forEach(feedback => feedback.remove());
        
        input.classList.remove('is-invalid', 'is-valid');
        
        if (value.length === 0) {
            return; // Don't validate empty on blur
        }
        
        if (value.length < 2) {
            this.addValidationFeedback(input, 'Industry name must be at least 2 characters', false);
        } else if (value.length > 100) {
            this.addValidationFeedback(input, 'Industry name is too long', false);
        } else {
            this.addValidationFeedback(input, 'Looks good!', true);
        }
    },
    
    // Add validation feedback
    addValidationFeedback(input, message, isValid) {
        input.classList.add(isValid ? 'is-valid' : 'is-invalid');
        
        const feedback = document.createElement('div');
        feedback.className = isValid ? 'valid-feedback' : 'invalid-feedback';
        feedback.textContent = message;
        
        input.parentNode.appendChild(feedback);
    },
    
    // Handle geography change
    handleGeographyChange(e) {
        const value = e.target.value;
        
        // Add analytics or additional handling if needed
        console.log('Geography selected:', value);
    },
    
    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showAlert('Copied to clipboard!', 'success');
        } catch (err) {
            console.error('Failed to copy:', err);
            // Fallback for older browsers
            this.fallbackCopyToClipboard(text);
        }
    },
    
    // Fallback copy method
    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showAlert('Copied to clipboard!', 'success');
        } catch (err) {
            console.error('Fallback copy failed:', err);
            this.showAlert('Failed to copy. Please copy manually.', 'warning');
        }
        
        document.body.removeChild(textArea);
    },
    
    // Add animations
    addAnimations() {
        // Animate cards on scroll
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in');
                }
            });
        }, observerOptions);
        
        // Observe cards
        document.querySelectorAll('.card').forEach(card => {
            observer.observe(card);
        });
        
        // Add hover effects to buttons
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-1px)';
            });
            
            btn.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0)';
            });
        });
    },
    
    // Start robust task monitoring with SSE + fallbacks
    startTaskStream(taskRunId) {
        console.log('Starting robust task monitoring for:', taskRunId);
        this.currentTaskId = taskRunId;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.isTaskComplete = false;
        this.lastEventTime = Date.now();
        
        // Start primary SSE stream
        this.connectToStreamRobust(taskRunId);
        
        // Start monitoring with fallback after delay
        setTimeout(() => {
            if (!this.isTaskComplete) {
                this.startRobustMonitoring(taskRunId);
            }
        }, 30000); // Start fallback monitoring after 30 seconds
    },
    
    // Connect to SSE stream with production-ready error handling  
    connectToStreamRobust(taskRunId) {
        if (this.isTaskComplete) return;
        
        const streamUrl = `/stream-events/${taskRunId}`;
        
        try {
            // EventSource automatically includes cookies for same-origin requests
            this.currentEventSource = new EventSource(streamUrl);
            
            this.currentEventSource.onmessage = (event) => {
                try {
                    const eventData = JSON.parse(event.data);
                    this.lastEventTime = Date.now();
                    this.handleRobustEvent(eventData, taskRunId);
                } catch (error) {
                    console.error('Failed to parse SSE event:', error);
                }
            };
            
            this.currentEventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                console.log('EventSource state:', this.currentEventSource.readyState);
                
                if (!this.isTaskComplete) {
                    // Check if it's an auth error by checking readyState
                    if (this.currentEventSource.readyState === EventSource.CLOSED) {
                        console.log('Connection closed by server, likely auth issue');
                    }
                    this.handleConnectionError(taskRunId);
                }
            };
            
            this.currentEventSource.onopen = () => {
                console.log('SSE connection established successfully');
                // Don't reset reconnectAttempts here - only reset on successful event reception
                this.updateConnectionStatus('connected');
            };
            
        } catch (error) {
            console.error('Failed to create EventSource:', error);
            this.handleConnectionError(taskRunId);
        }
    },
    
    // Handle events with robust categorization
    handleRobustEvent(eventData, taskRunId) {
        console.log('Robust event received:', eventData);
        
        // Reset reconnection attempts on successful event reception
        this.reconnectAttempts = 0;
        
        const { type, category } = eventData;
        
        switch (type) {
            case 'task.status':
                this.handleTaskStatusEvent(eventData, taskRunId);
                break;
            case 'task.progress':
                this.handleTaskProgressEvent(eventData);
                break;
            case 'task.log':
                this.handleTaskLogEvent(eventData);
                break;
            case 'error':
                this.handleTaskErrorEvent(eventData, taskRunId);
                break;
            default:
                console.log('Unknown event type:', type, eventData);
                this.updateStreamingProgress({
                    message: eventData.message || 'Processing...',
                    event_type: type
                });
        }
    },
    
    // Handle task status changes
    handleTaskStatusEvent(eventData, taskRunId) {
        const { status, is_complete, message } = eventData;
        
        this.updateStreamingProgress({
            message: message,
            event_type: `status.${status}`,
            status: status
        });
        
        if (is_complete) {
            console.log(`Task ${taskRunId} completed with status: ${status}`);
            this.handleTaskCompletion({ status, task_run_id: taskRunId }, taskRunId);
        }
    },
    
    // Handle progress updates 
    handleTaskProgressEvent(eventData) {
        const { sources_processed, sources_total, message, recent_sources } = eventData;
        
        this.updateStreamingProgress({
            message: message,
            event_type: 'progress_stats',
            sources_processed: sources_processed,
            sources_total: sources_total,
            recent_sources: recent_sources
        });
    },
    
    // Handle log messages
    handleTaskLogEvent(eventData) {
        const { message, log_level } = eventData;
        
        this.updateStreamingProgress({
            message: message,
            event_type: `log.${log_level}`
        });
    },
    
    // Handle error events
    handleTaskErrorEvent(eventData, taskRunId) {
        const { message } = eventData;
        console.error('Task error:', message);
        
        // Check for authentication errors
        if (message.includes('Authentication required') || message.includes('Unauthorized access')) {
            console.error('Authentication error in SSE stream');
            this.showErrorModal('Authentication error. Please sign in again.');
            this.setLoadingState(false);
            // Redirect to login after delay
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
            return;
        }
        
        this.updateStreamingProgress({
            message: `Error: ${message}`,
            event_type: 'error'
        });
        
        // For other errors, try reconnection
        this.handleConnectionError(taskRunId);
    },
    
    // Handle task completion with robust final result retrieval
    async handleTaskCompletion(data, taskRunId) {
        this.isTaskComplete = true;
        console.log('Handling task completion:', data);
        
        // Clean up connections
        this.cleanupConnections();
        
        // Update UI to show completion processing
        this.updateStreamingProgress({
            message: 'Task completed, processing final results...',
            event_type: 'completion'
        });
        
        if (data.status === 'completed') {
            try {
                // Use robust monitoring endpoint for final result
                const response = await fetch(`/monitor-task/${taskRunId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const result = await response.json();
                
                if (result.success && result.task_completed) {
                    this.showSuccessModal(result);
                } else {
                    this.showErrorModal(result.error || 'Failed to retrieve final results');
                }
            } catch (error) {
                console.error('Final result retrieval error:', error);
                this.showErrorModal('Failed to retrieve final results');
            }
        } else {
            this.showErrorModal(`Task failed with status: ${data.status}`);
        }
        
        this.setLoadingState(false);
    },
    
    // Handle connection errors with exponential backoff
    handleConnectionError(taskRunId) {
        if (this.isTaskComplete) return;
        
        this.reconnectAttempts++;
        console.log(`Connection error. Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        if (this.currentEventSource) {
            this.currentEventSource.close();
            this.currentEventSource = null;
        }
        
        // If we've failed quickly multiple times, it's likely an auth issue - skip to robust monitoring
        if (this.reconnectAttempts >= 3 && (Date.now() - this.lastEventTime) < 5000) {
            console.log('Rapid failures detected, likely authentication issue. Switching to robust monitoring.');
            this.startRobustMonitoring(taskRunId);
            return;
        }
        
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            // Exponential backoff: wait_time = min(2 ** retry_count, 30)
            const waitTime = Math.min(Math.pow(2, this.reconnectAttempts), 30) * 1000;
            
            this.updateConnectionStatus('reconnecting', this.reconnectAttempts);
            this.updateStreamingProgress({
                message: `Connection lost. Reconnecting in ${waitTime/1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
                event_type: 'reconnecting'
            });
            
            setTimeout(() => {
                if (!this.isTaskComplete) {
                    this.connectToStreamRobust(taskRunId);
                }
            }, waitTime);
        } else {
            console.log('Max reconnection attempts reached, falling back to robust monitoring');
            this.startRobustMonitoring(taskRunId);
        }
    },
    
    // Start robust monitoring as ultimate fallback
    async startRobustMonitoring(taskRunId) {
        if (this.isTaskComplete) return;
        
        console.log('Starting robust monitoring fallback for task:', taskRunId);
        this.updateConnectionStatus('monitoring');
        this.updateStreamingProgress({
            message: 'Using robust monitoring to track completion...',
            event_type: 'robust_monitoring'
        });
        
        try {
            const response = await fetch(`/monitor-task/${taskRunId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (result.success && result.task_completed) {
                this.showSuccessModal(result);
            } else {
                this.showErrorModal(result.error || 'Task monitoring failed');
            }
        } catch (error) {
            console.error('Robust monitoring failed:', error);
            this.showErrorModal('All monitoring methods failed. Please check your connection and try again.');
        } finally {
            this.setLoadingState(false);
        }
    },
    
    // Update connection status in UI
    updateConnectionStatus(status, attempts = 0) {
        const statusElement = document.getElementById('current-event');
        if (statusElement) {
            statusElement.setAttribute('data-status', status);
            
            let statusText = status;
            if (attempts > 0) {
                statusText += ` (${attempts}/${this.maxReconnectAttempts})`;
            }
            
            if (status !== 'connected') {
                statusElement.textContent = statusText;
            }
        }
    },
    
    // Clean up all connections
    cleanupConnections() {
        if (this.currentEventSource) {
            this.currentEventSource.close();
            this.currentEventSource = null;
        }
        this.stopPollingFallback();
    },
    
    // Show streaming UI
    showStreamingUI() {
        const progressArea = document.getElementById('progress-area');
        if (progressArea) {
            progressArea.classList.remove('d-none');
            
            // Update progress area for streaming
            const cardBody = progressArea.querySelector('.card-body');
            if (cardBody) {
                cardBody.innerHTML = `
                    <div class="spinner-border text-orange mb-3" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <h5 class="card-title">Generating Market Research Report</h5>
                    <p class="card-text">
                        Our AI is conducting deep research on your market...
                    </p>
                    <div class="streaming-updates">
                        <div class="stream-message mb-2">
                            <strong>Status:</strong> <span id="current-status">Starting research...</span>
                        </div>
                        <div class="stream-event mb-2">
                            <strong>Event:</strong> <span id="current-event">task_run.state</span>
                        </div>
                        <div class="stream-sources">
                            <strong>Recent Sources:</strong>
                            <ul id="recent-sources" class="list-unstyled mt-1"></ul>
                        </div>
                    </div>
                    <div class="progress mt-3">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             role="progressbar" style="width: 100%"></div>
                    </div>
                `;
            }
        }
    },
    
    // Update streaming progress with enhanced status tracking
    updateStreamingProgress(data) {
        const statusElement = document.getElementById('current-status');
        const eventElement = document.getElementById('current-event');
        const sourcesElement = document.getElementById('recent-sources');
        
        if (statusElement && data.message) {
            statusElement.textContent = data.message;
        }
        
        if (eventElement && data.event_type) {
            eventElement.textContent = data.event_type;
            
            // Apply status-specific styling for connection states
            eventElement.removeAttribute('data-status');
            const connectionStates = ['reconnecting', 'monitoring', 'robust_monitoring', 'error'];
            if (connectionStates.some(state => data.event_type.includes(state))) {
                eventElement.setAttribute('data-status', data.event_type);
            }
        }
        
        // Handle different data formats for sources
        const sources = data.recent_sources || data.sources || [];
        if (sourcesElement && sources.length > 0) {
            sourcesElement.innerHTML = '';
            sources.forEach(source => {
                const li = document.createElement('li');
                li.className = 'small text-muted mb-1';
                li.textContent = this.truncateUrl(source, 60);
                li.title = source; // Full URL on hover
                sourcesElement.appendChild(li);
            });
        }
        
        // Update progress if available
        if (data.sources_processed && data.sources_total) {
            const progressBar = document.querySelector('#progress-area .progress-bar');
            if (progressBar) {
                const percentage = Math.min((data.sources_processed / data.sources_total) * 100, 90);
                progressBar.style.width = percentage + '%';
            }
        }
    },
    
    // Truncate URL for display
    truncateUrl(url, maxLength) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    },
    
    // Legacy polling fallback (kept for compatibility)
    stopPollingFallback() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    },

    // Cleanup function
    cleanup() {
        this.isTaskComplete = true; // Stop all monitoring
        
        if (this._progressInterval) {
            clearInterval(this._progressInterval);
        }
        
        // Use new cleanup method
        this.cleanupConnections();
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    App.cleanup();
});

// Export for global access
window.App = App;
