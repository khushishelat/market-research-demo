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
        const form = document.getElementById('research-form');
        const activityFeedSection = document.getElementById('activity-feed-section');
        const spinner = generateBtn?.querySelector('.spinner-border');
        const btnText = generateBtn?.querySelector('.btn-text');
        
        if (!generateBtn) return;
        
        if (isLoading) {
            generateBtn.disabled = true;
            spinner?.classList.remove('d-none');
            if (btnText) btnText.textContent = 'Launching AI Research...';
            
            // Add submitting class and disable form inputs
            if (form) {
                form.classList.add('form-submitting');
                const inputs = form.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    input.disabled = true;
                });
            }
            
            // Always show streaming UI when loading starts
            this.showStreamingUI();
            
        } else {
            generateBtn.disabled = false;
            spinner?.classList.add('d-none');
            if (btnText) btnText.textContent = 'Launch AI-Powered Deep Research';
            
            // Remove submitting class and re-enable form inputs
            if (form) {
                form.classList.remove('form-submitting');
                const inputs = form.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    input.disabled = false;
                });
            }
            
            // Keep activity feed visible after completion
            // Don't hide it automatically - user can scroll away
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
        // Mark task as complete to stop all background monitoring
        this.isTaskComplete = true;
        
        // Clean up all background processes
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
        
        if (this.currentEventSource) {
            this.currentEventSource.close();
            this.currentEventSource = null;
        }
        
        // Stop any pending reconnection attempts
        if (this._reconnectTimeout) {
            clearTimeout(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }
        
        // Add completion event to SSE feed
        this.addSSEEvent('Research completed successfully!', 'status');
        
        // Hide the generating container and show completion
        const sseFeedContainer = document.getElementById('sse-feed-container');
        const sseCompletion = document.getElementById('sse-completion');
        const viewReportBtn = document.getElementById('view-report-btn');
        
        if (sseFeedContainer) {
            sseFeedContainer.classList.add('d-none');
        }
        
        if (sseCompletion && viewReportBtn) {
            viewReportBtn.href = response.url;
            sseCompletion.classList.remove('d-none');
        }
        
        // Update user status
        this.updateUserStatus();
        
        // Set up modal as fallback but don't show it immediately
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
        
        const { type, category, message } = eventData;
        
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
            message: message || `Processed ${sources_processed || 0} of ${sources_total || 0} sources`,
            event_type: 'progress_stats',
            sources_processed: sources_processed,
            sources_total: sources_total,
            recent_sources: recent_sources
        });
    },
    
    // Handle log messages
    handleTaskLogEvent(eventData) {
        const { message, log_level, recent_sources, sources_processed, sources_total } = eventData;
        
        this.updateStreamingProgress({
            message: message || 'Processing...',
            event_type: `log.${log_level || 'info'}`,
            recent_sources: recent_sources,
            sources_processed: sources_processed,
            sources_total: sources_total
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
            this.addSSEEvent(
                `Connection interrupted. Reconnecting in ${waitTime/1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
                'status'
            );
            
            this._reconnectTimeout = setTimeout(() => {
                if (!this.isTaskComplete) {
                    this.connectToStreamRobust(taskRunId);
                }
            }, waitTime);
        } else {
            console.log('Max reconnection attempts reached, falling back to robust monitoring');
            this.addSSEEvent(
                'Live feed unavailable. Switching to background monitoring to track completion...',
                'status'
            );
            this.startRobustMonitoring(taskRunId);
        }
    },
    
    // Start robust monitoring as ultimate fallback
    async startRobustMonitoring(taskRunId) {
        if (this.isTaskComplete) return;
        
        console.log('Starting robust monitoring fallback for task:', taskRunId);
        this.updateConnectionStatus('monitoring');
        this.addSSEEvent(
            'Using advanced monitoring to track your research progress...',
            'status'
        );
        
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
            // Don't hide the UI completely - keep showing progress with manual check option
            this.showConnectionLostUI(taskRunId);
        }
    },
    
    // Show connection lost UI with manual check option
    showConnectionLostUI(taskRunId) {
        this.addSSEEvent(
            'Connection lost, but research continues in background. Checking for updates...',
            'error'
        );
        
        // Start periodic status checking every 30 seconds
        this.startPeriodicStatusCheck(taskRunId);
    },
    
    // Start periodic status checking
    startPeriodicStatusCheck(taskRunId) {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
        
        this.statusCheckInterval = setInterval(async () => {
            if (this.isTaskComplete) {
                clearInterval(this.statusCheckInterval);
                return;
            }
            
            try {
                const statusResponse = await fetch(`/task-status/${taskRunId}`);
                const statusResult = await statusResponse.json();
                
                if (statusResult.is_complete) {
                    clearInterval(this.statusCheckInterval);
                    if (statusResult.status === 'completed') {
                        // Automatically complete the task
                        this.manualStatusCheck(taskRunId);
                    } else {
                        this.showErrorModal(`Task completed with status: ${statusResult.status}`);
                    }
                }
            } catch (error) {
                console.log('Periodic status check failed:', error);
                // Don't show error, just continue checking
            }
        }, 30000); // Check every 30 seconds
    },
    
    // Manual status check
    async manualStatusCheck(taskRunId) {
        const checkBtn = document.querySelector('.manual-check-btn');
        if (checkBtn) {
            checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Checking...';
            checkBtn.disabled = true;
        }
        
        try {
            // Try the task status endpoint first
            const statusResponse = await fetch(`/task-status/${taskRunId}`);
            const statusResult = await statusResponse.json();
            
            if (statusResult.is_complete) {
                if (statusResult.status === 'completed') {
                    // Try to complete the task
                    const completeResponse = await fetch(`/complete-task/${taskRunId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const completeResult = await completeResponse.json();
                    
                    if (completeResult.success) {
                        this.showSuccessModal(completeResult);
                        return;
                    }
                }
                this.showErrorModal(`Task completed with status: ${statusResult.status}`);
            } else {
                // Task still running, try to reconnect to stream
                this.addSSEEvent(
                    'Research is still in progress. Attempting to reconnect to live feed...',
                    'status'
                );
                this.reconnectAttempts = 0; // Reset attempts
                this.connectToStreamRobust(taskRunId);
            }
        } catch (error) {
            console.error('Manual status check failed:', error);
            this.addSSEEvent(
                'Status check failed. Your research may still be running. Try again in a moment.',
                'error'
            );
        } finally {
            if (checkBtn) {
                checkBtn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Check Status';
                checkBtn.disabled = false;
            }
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
    
    // Show streaming UI with dynamic layout change
    showStreamingUI() {
        // Trigger dynamic layout change: centered form → side-by-side
        const mainContentRow = document.getElementById('main-content-row');
        const formColumn = document.getElementById('form-column');
        const feedColumn = document.getElementById('feed-column');
        const contentWrapper = document.querySelector('.content-wrapper');
        const heroSection = document.querySelector('.hero-section');
        
        if (mainContentRow && formColumn && feedColumn) {
            // Add research-active class for CSS transitions
            mainContentRow.classList.add('research-active');
            if (contentWrapper) {
                contentWrapper.classList.add('research-active');
            }
            if (heroSection) {
                heroSection.classList.add('research-active');
            }
            
            // Change form column from col-12 to col-lg-6 (give more space to feed)
            formColumn.className = 'col-lg-6';
            
            // Show and set feed column to col-lg-6 (equal split for more feed space)
            feedColumn.className = 'col-lg-6';
            feedColumn.classList.remove('d-none');
        }
        
        // Set up the SSE feed
        const sseFeed = document.getElementById('sse-feed');
        if (sseFeed) {
            sseFeed.innerHTML = '';
        }
        
        // Hide completion state
        const sseCompletion = document.getElementById('sse-completion');
        if (sseCompletion) {
            sseCompletion.classList.add('d-none');
        }
        
        // Add initial event
        this.addSSEEvent('Initializing research session...');
    },
    
    // Update streaming progress with simple event tracking
    updateStreamingProgress(data) {
        const message = data.message || '';
        const eventType = data.event_type || 'unknown';
        
        // Determine event class for styling
        let eventClass = '';
        if (eventType.includes('status')) {
            eventClass = 'status';
        } else if (eventType.includes('progress')) {
            eventClass = 'progress';
        } else if (eventType.includes('error') || eventType.includes('failed')) {
            eventClass = 'error';
        }
        
        // Update dedicated sources section if we have progress data
        if (data.sources_processed !== undefined || data.sources_total !== undefined || data.recent_sources) {
            this.updateSourcesSection(data);
        }
        
        // Only add event to feed if it has a meaningful message
        // Skip pure progress stats events and empty/meaningless messages
        const isProgressStatsOnly = eventType.includes('progress') && 
            (message.includes('Processed') && message.includes('sources') && message.includes('('));
        
        const isEmptyOrMeaningless = !message.trim() || 
            message === 'Processing...' || 
            message.length < 10 ||
            /^(Processed|Starting|Task status:|Using advanced|Connection|Initializing)/i.test(message);
            
        if (!isProgressStatsOnly && !isEmptyOrMeaningless) {
            this.addSSEEvent(message, eventClass);
        }
    },
    
    // Update the dedicated sources section
    updateSourcesSection(data) {
        const sourcesSection = document.getElementById('sse-sources-section');
        const sourcesRead = document.getElementById('sources-read');
        const sourcesConsidered = document.getElementById('sources-considered');
        const recentSourcesList = document.getElementById('recent-sources-list');
        
        if (!sourcesSection) return;
        
        // Update numbers
        if (data.sources_processed !== undefined && sourcesRead) {
            sourcesRead.textContent = data.sources_processed;
        }
        if (data.sources_total !== undefined && sourcesConsidered) {
            sourcesConsidered.textContent = data.sources_total;
        }
        
        // Only show the sources section if sources have been processed (sources_read > 0)
        const currentSourcesRead = parseInt(sourcesRead?.textContent || '0', 10);
        if (currentSourcesRead > 0 && sourcesSection.classList.contains('d-none')) {
            sourcesSection.classList.remove('d-none');
        }
        
        // Update recent sources list
        if (data.recent_sources && Array.isArray(data.recent_sources) && data.recent_sources.length > 0 && recentSourcesList) {
            const sourcesToShow = data.recent_sources.slice(-10); // Show last 10 sources
            recentSourcesList.innerHTML = sourcesToShow.map(source => 
                `<li><a href="${source}" target="_blank" rel="noopener noreferrer">${source}</a></li>`
            ).join('');
        }
    },
    
    // Add simple event to SSE feed
    addSSEEvent(message, eventClass = '') {
        const sseFeed = document.getElementById('sse-feed');
        if (!sseFeed) return;
        
        const eventElement = document.createElement('div');
        eventElement.className = `sse-event ${eventClass}`;
        
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Ensure message is a string and not undefined/null
        const rawMessage = message || 'No message';
        
        // Truncate message if too long (max 150 characters)
        const maxLength = 500;
        const displayMessage = rawMessage.length > maxLength 
            ? rawMessage.substring(0, maxLength) + '...'
            : rawMessage;
        
        eventElement.innerHTML = `
            <div class="sse-event-time">${timeString}</div>
            <div class="sse-event-message">${displayMessage}</div>
        `;
        
        // Add to feed (append to show chronological order)
        sseFeed.appendChild(eventElement);
        
        // Auto-scroll to bottom
        sseFeed.scrollTop = sseFeed.scrollHeight;
        
        // Limit number of events
        const events = sseFeed.querySelectorAll('.sse-event');
        if (events.length > 100) {
            sseFeed.removeChild(events[0]);
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
