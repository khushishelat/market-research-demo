import os
import json
import uuid
import datetime
import sqlite3
import re
import requests
import threading
import time
from typing import Dict, Any, Optional
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_file, Response, stream_template
from werkzeug.utils import secure_filename
import tempfile
from dotenv import load_dotenv

from parallel import Parallel
from parallel.types import TaskSpecParam

# Load environment variables
load_dotenv('.env.local')

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')

# Initialize Parallel client
PARALLEL_API_KEY = os.getenv('PARALLEL_API_KEY')
if not PARALLEL_API_KEY:
    raise ValueError("PARALLEL_API_KEY not found in .env.local file")

client = Parallel(api_key=PARALLEL_API_KEY)

# Configuration
MAX_REPORTS_PER_HOUR = 5  # Global rate limit: 5 reports per hour
DATABASE_PATH = 'market_research.db'

# In-memory task tracking for background monitoring
active_tasks = {}  # {task_run_id: {'metadata': task_metadata, 'thread': thread_obj}}


def init_database():
    """Initialize SQLite database for storing reports and global rate limiting"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Create reports table (simplified for anonymous users)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            industry TEXT NOT NULL,
            geography TEXT,
            details TEXT,
            content TEXT NOT NULL,
            basis TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'completed',
            is_public INTEGER DEFAULT 1,
            task_run_id TEXT
        )
    ''')
    
    # Global rate limiting table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rate_limit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()


def get_recent_report_count():
    """Get the number of reports generated in the last hour (global rate limiting)"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Get count of reports in the last hour
    one_hour_ago = datetime.datetime.now() - datetime.timedelta(hours=1)
    cursor.execute('SELECT COUNT(*) FROM rate_limit WHERE created_at > ?', (one_hour_ago,))
    result = cursor.fetchone()
    
    conn.close()
    return result[0] if result else 0

def record_report_generation():
    """Record a new report generation for global rate limiting"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute('INSERT INTO rate_limit DEFAULT VALUES')
    
    conn.commit()
    conn.close()

def create_slug(title):
    """Create URL-friendly slug from title"""
    # Remove special characters and convert to lowercase
    slug = re.sub(r'[^a-zA-Z0-9\s-]', '', title)
    slug = re.sub(r'\s+', '-', slug.strip())
    slug = slug.lower()
    
    # Ensure uniqueness by checking database
    base_slug = slug
    counter = 1
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    while True:
        cursor.execute('SELECT id FROM reports WHERE slug = ?', (slug,))
        if not cursor.fetchone():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1
    
    conn.close()
    return slug

def generate_market_research_input(industry, geography, details):
    """Generate research input based on user parameters"""
    geography_text = geography if geography and geography.strip() else "Not specified"
    details_text = details if details and details.strip() else "Not specified"
    
    research_input = (
        "Generate a comprehensive market research report based on the following criteria:\n\n"
        "If geography is not specified, default to a global market scope.\n"
        "Ensure the report includes key trends, risks, metrics, and major players.\n"
        "Incorporate the specific details provided when applicable.\n\n"
        f"Industry: {industry}\n"
        f"Geography: {geography_text}\n"
        f"Specific Details Required: {details_text}"
    )
    
    return research_input

def convert_basis_to_dict(basis):
    """Convert FieldBasis objects to dictionaries for JSON serialization"""
    if not basis:
        return None
    
    result = []
    for field_basis in basis:
        # Convert FieldBasis object to dictionary
        basis_dict = {
            'field': getattr(field_basis, 'field', ''),
            'reasoning': getattr(field_basis, 'reasoning', ''),
            'confidence': getattr(field_basis, 'confidence', None),
            'citations': []
        }
        
        # Convert citation objects to dictionaries
        citations = getattr(field_basis, 'citations', [])
        if citations:
            for citation in citations:
                citation_dict = {
                    'url': getattr(citation, 'url', ''),
                    'excerpts': getattr(citation, 'excerpts', [])
                }
                basis_dict['citations'].append(citation_dict)
        
        result.append(basis_dict)
    
    return result

def save_report(title, slug, industry, geography, details, content, basis=None, task_run_id=None):
    """Save report to database"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    report_id = str(uuid.uuid4())
    
    # Convert basis to JSON string if provided
    basis_json = None
    if basis:
        try:
            basis_dict = convert_basis_to_dict(basis)
            basis_json = json.dumps(basis_dict) if basis_dict else None
        except Exception as e:
            print(f"Error converting basis to JSON: {e}")
            basis_json = None
    
    cursor.execute('''
        INSERT INTO reports (id, title, slug, industry, geography, details, content, basis, is_public, task_run_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ''', (report_id, title, slug, industry, geography, details, content, basis_json, task_run_id))
    
    conn.commit()
    conn.close()
    
    return report_id

def get_report_by_slug(slug):
    """Get report by slug (public access)"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, title, industry, geography, details, content, basis, created_at, task_run_id
        FROM reports WHERE slug = ? AND is_public = 1
    ''', (slug,))
    
    result = cursor.fetchone()
    conn.close()
    
    if result:
        # Parse basis JSON if it exists
        basis_data = None
        if result[6]:  # basis column
            try:
                basis_data = json.loads(result[6])
            except (json.JSONDecodeError, TypeError):
                basis_data = None
                
        return {
            'id': result[0],
            'title': result[1],
            'industry': result[2],
            'geography': result[3],
            'details': result[4],
            'content': result[5],
            'basis': basis_data,
            'created_at': result[7],
            'task_run_id': result[8],
            'slug': slug
        }
    return None

def get_all_public_reports():
    """Get all public reports for the library"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, title, slug, industry, geography, created_at
        FROM reports WHERE is_public = 1
        ORDER BY created_at DESC
    ''', ())
    
    results = cursor.fetchall()
    conn.close()
    
    return [{
        'id': row[0],
        'title': row[1],
        'slug': row[2],
        'industry': row[3],
        'geography': row[4],
        'created_at': row[5]
    } for row in results]



@app.route('/')
def index():
    """Main page with public report library and report generation"""
    # Get all public reports for the library
    public_reports = get_all_public_reports()
    
    # Get current rate limit status
    recent_report_count = get_recent_report_count()
    
    return render_template('index.html', 
                         recent_report_count=recent_report_count,
                         max_reports_per_hour=MAX_REPORTS_PER_HOUR,
                         public_reports=public_reports)

@app.route('/generate-report', methods=['POST'])
def generate_report():
    """Generate a new market research report (global rate limited)"""
    # Check global rate limit
    recent_report_count = get_recent_report_count()
    
    if recent_report_count >= MAX_REPORTS_PER_HOUR:
        return jsonify({
            'error': f'Rate limit exceeded. Maximum {MAX_REPORTS_PER_HOUR} reports per hour globally.',
            'recent_report_count': recent_report_count,
            'max_reports_per_hour': MAX_REPORTS_PER_HOUR
        }), 429
    
    data = request.json
    industry = data.get('industry', '').strip()
    geography = data.get('geography', '').strip()
    details = data.get('details', '').strip()
    
    if not industry:
        return jsonify({'error': 'Industry is required'}), 400
    
    try:
        # Generate research input
        research_input = generate_market_research_input(industry, geography, details)
        
        # Create task with Parallel API (events enabled by default for ultra processor)
        task_run = client.task_run.create(
            input=research_input,
            processor="ultra",
            task_spec={
                "output_schema": {
                    "type": "text",
                }
            }
        )
        
        # Store task metadata for later completion handling
        task_metadata = {
            'task_run_id': task_run.run_id,
            'industry': industry,
            'geography': geography,
            'details': details
        }
        
        # Store in session for completion handling
        session[f'task_{task_run.run_id}'] = task_metadata
        
        # Start background monitoring thread as ultimate fallback
        monitor_thread = threading.Thread(
            target=monitor_task_completion,
            args=(task_run.run_id, task_metadata),
            daemon=True
        )
        monitor_thread.start()
        
        # Track active task
        active_tasks[task_run.run_id] = {
            'metadata': task_metadata,
            'thread': monitor_thread,
            'start_time': datetime.datetime.now()
        }
        
        # Return task_run_id immediately for SSE streaming
        return jsonify({
            'success': True,
            'task_run_id': task_run.run_id,
            'stream_url': f'/stream-events/{task_run.run_id}'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to generate report: {str(e)}'}), 500

@app.route('/stream-events/<task_run_id>')
def stream_events(task_run_id):
    """Stream real-time events from a task run via SSE with robust error handling"""
    print(f"SSE request for task {task_run_id}")
    
    task_metadata = session.get(f'task_{task_run_id}')
    if not task_metadata:
        print(f"SSE: Task metadata not found for {task_run_id}")
        def not_found_error():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Task not found'})}\n\n"
        response = Response(not_found_error(), mimetype='text/event-stream')
        response.headers['Cache-Control'] = 'no-cache'
        return response
    
    print(f"SSE: Starting stream for task {task_run_id}")
    
    def generate_events():
        # Use robust SSE stream handler
        try:
            for event in stream_task_events(task_run_id, PARALLEL_API_KEY):
                yield f"data: {json.dumps(event)}\n\n"
                
                # Stop streaming if task completed
                if event.get('type') == 'task.status' and event.get('is_complete'):
                    return
                    
        except Exception as e:
            print(f"SSE: Stream failed with error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'Stream failed: {str(e)}'})}\n\n"
    
    response = Response(generate_events(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

def stream_task_events(task_id, api_key):
    """
    Stream events from SSE endpoint with proper parsing and error handling
    - Accept: text/event-stream header
    - Parse 'data: {json}' format  
    - Yield events as generator
    - Handle connection errors
    """
    headers = {
        'x-api-key': api_key,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'parallel-beta': 'events-sse-2025-07-24'
    }
    
    stream_url = f"https://api.parallel.ai/v1beta/tasks/runs/{task_id}/events"
    
    try:
        with requests.get(stream_url, headers=headers, stream=True, timeout=30) as response:
            response.raise_for_status()
            
            current_event_type = None
            buffer = ""
            
            for line in response.iter_lines(decode_unicode=True):
                if line is None:
                    continue
                    
                # Handle SSE format
                if line.startswith('event:'):
                    current_event_type = line[6:].strip()
                elif line.startswith('data:'):
                    data_line = line[5:].strip()
                    if data_line:
                        try:
                            # Parse JSON data
                            event_data = json.loads(data_line)
                            
                            # Process event based on type
                            processed_event = process_task_event(current_event_type, event_data)
                            if processed_event:
                                yield processed_event
                                
                        except json.JSONDecodeError as e:
                            print(f"Failed to parse SSE event data: {data_line}, error: {e}")
                            continue
                elif line == "":
                    # Empty line indicates end of event
                    current_event_type = None
                    
    except requests.RequestException as e:
        # Let the caller handle connection errors
        raise ConnectionError(f"SSE connection failed: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error in SSE stream: {str(e)}")

def process_task_event(event_type, event_data):
    """
    Process different event types from Parallel API
    Returns standardized event format for frontend
    """
    processed = {
        'timestamp': event_data.get('timestamp'),
        'raw_type': event_data.get('type', event_type)
    }
    
    # Handle different event types
    if event_data.get('type') == 'task_run.state':
        run_info = event_data.get('run', {})
        status = run_info.get('status', 'unknown')
        
        processed.update({
            'type': 'task.status',
            'status': status,
            'is_complete': status in ['completed', 'failed', 'cancelled'],
            'message': f"Task status: {status}",
            'category': 'status'
        })
        
    elif event_data.get('type') == 'task_run.progress_stats':
        source_stats = event_data.get('source_stats', {})
        num_sources = source_stats.get('num_sources_read', 0)
        total_sources = source_stats.get('num_sources_considered', 0)
        
        processed.update({
            'type': 'task.progress',
            'sources_processed': num_sources,
            'sources_total': total_sources,
            'message': f"Processed {num_sources} of {total_sources} sources",
            'category': 'progress',
            'recent_sources': source_stats.get('sources_read_sample', [])[-5:]  # Last 5
        })
        
    elif 'progress_msg' in event_data.get('type', ''):
        msg_type = event_data.get('type', '').split('.')[-1]  # Get last part after dot
        
        processed.update({
            'type': 'task.log',
            'log_level': msg_type,
            'message': event_data.get('message', ''),
            'category': 'log'
        })
        
    else:
        # Handle unknown event types
        processed.update({
            'type': 'task.unknown',
            'message': event_data.get('message', str(event_data)),
            'category': 'unknown'
        })
    
    return processed

@app.route('/monitor-task/<task_run_id>', methods=['POST'])
def monitor_task_with_sse(task_run_id):
    """
    Monitor task with robust reconnection and state tracking
    - Track completion state (completed/failed/cancelled)
    - Handle different event types (status/progress/logs)
    - Auto-reconnect on stream interruption
    - Exponential backoff for retries
    - Fetch final result after completion
    """
    try:
        # Check if task exists
        task_metadata = session.get(f'task_{task_run_id}')
        if not task_metadata:
            return jsonify({'error': 'Task not found'}), 404
        
        # Monitor with exponential backoff
        task_completed, final_status, error_msg = monitor_task_completion_robust(
            task_id=task_run_id,
            api_key=PARALLEL_API_KEY,
            max_reconnects=10
        )
        
        if task_completed and final_status == 'completed':
            # Fetch final result and save report
            try:
                run_result = client.task_run.result(task_run_id)
                content = getattr(run_result.output, "content", "No content found.")
                basis = getattr(run_result.output, "basis", None)
                
                # Create and save report
                title = f"{task_metadata['industry']} Market Research Report"
                if task_metadata['geography'] and task_metadata['geography'] != "Not specified":
                    title += f" - {task_metadata['geography']}"
                
                slug = create_slug(title)
                
                report_id = save_report(
                    title, slug,
                    task_metadata['industry'],
                    task_metadata['geography'], 
                    task_metadata['details'],
                    content,
                    basis,
                    task_run_id=task_run_id
                )
                
                record_report_generation()
                
                # Clean up
                session.pop(f'task_{task_run_id}', None)
                if task_run_id in active_tasks:
                    del active_tasks[task_run_id]
                
                return jsonify({
                    'success': True,
                    'task_completed': True,
                    'report_id': report_id,
                    'slug': slug,
                    'title': title,
                    'url': f'/report/{slug}'
                })
                
            except Exception as e:
                return jsonify({
                    'success': False,
                    'task_completed': True,
                    'error': f'Failed to retrieve final result: {str(e)}'
                }), 500
                
        else:
            return jsonify({
                'success': False,
                'task_completed': task_completed,
                'status': final_status,
                'error': error_msg or 'Task monitoring failed'
            }), 500
            
    except Exception as e:
        return jsonify({'error': f'Monitor task failed: {str(e)}'}), 500

def monitor_task_completion_robust(task_id, api_key, max_reconnects=10):
    """
    Monitor task with robust reconnection using exponential backoff
    Returns: (task_completed: bool, final_status: str, error_msg: str)
    """
    task_completed = False
    final_status = None
    error_msg = None
    reconnect_count = 0
    
    print(f"Starting robust monitoring for task {task_id}")
    
    while not task_completed and reconnect_count < max_reconnects:
        try:
            print(f"Monitoring attempt {reconnect_count + 1}/{max_reconnects}")
            
            # Stream events with timeout
            for event in stream_task_events(task_id, api_key):
                if event.get('type') == 'task.status':
                    final_status = event.get('status')
                    task_completed = event.get('is_complete', False)
                    
                    if task_completed:
                        print(f"Task {task_id} completed with status: {final_status}")
                        return task_completed, final_status, None
                        
                elif event.get('type') == 'error':
                    error_msg = event.get('message', 'Unknown error')
                    print(f"Task {task_id} error: {error_msg}")
                    
                    # Check if this is a recoverable error
                    if is_recoverable_error(error_msg):
                        break  # Break to retry
                    else:
                        return False, 'failed', error_msg
                        
        except (ConnectionError, requests.RequestException) as e:
            # Network errors are recoverable
            print(f"Connection error for task {task_id}: {e}")
            reconnect_count += 1
            
            if reconnect_count < max_reconnects:
                # Exponential backoff: wait_time = min(2 ** retry_count, 30)
                wait_time = min(2 ** reconnect_count, 30)
                print(f"Waiting {wait_time}s before reconnection attempt {reconnect_count + 1}")
                time.sleep(wait_time)
            else:
                error_msg = f"Max reconnection attempts reached after {max_reconnects} tries"
                
        except Exception as e:
            # Unexpected errors
            error_msg = f"Unexpected monitoring error: {str(e)}"
            print(f"Unexpected error for task {task_id}: {e}")
            break
    
    # Final status check if monitoring failed
    if not task_completed:
        try:
            print(f"Performing final status check for task {task_id}")
            run_result = client.task_run.result(task_id)
            return True, 'completed', None
        except Exception as e:
            print(f"Final status check failed for task {task_id}: {e}")
            return False, 'failed', error_msg or f"Monitoring failed after {max_reconnects} attempts"
    
    return task_completed, final_status, error_msg

def is_recoverable_error(error_message):
    """
    Classify errors as recoverable (network) vs non-recoverable (task failed)
    """
    error_lower = error_message.lower()
    
    # Non-recoverable errors
    non_recoverable = [
        'unauthorized', 'forbidden', 'not found', 'invalid task',
        'task failed', 'cancelled', 'quota exceeded'
    ]
    
    for pattern in non_recoverable:
        if pattern in error_lower:
            return False
    
    # Recoverable errors (network, timeout, etc.)
    recoverable = [
        'connection', 'timeout', 'network', 'stream', 'disconnected',
        'server error', 'service unavailable', 'gateway timeout'
    ]
    
    for pattern in recoverable:
        if pattern in error_lower:
            return True
    
    # Default to recoverable for unknown errors
    return True

@app.route('/task-status/<task_run_id>')
def get_task_status(task_run_id):
    """Get current task status for polling fallback"""
    try:
        # Check if task exists
        task_metadata = session.get(f'task_{task_run_id}')
        if not task_metadata:
            return jsonify({'error': 'Task not found'}), 404
        
        # Get task status from Parallel API
        try:
            # Try to get task result (this will fail if task is still running)
            run_result = client.task_run.result(task_run_id)
            # If we get here, task is complete
            return jsonify({
                'status': 'completed',
                'is_complete': True,
                'task_run_id': task_run_id
            })
        except Exception as e:
            # If result() fails, the task is likely still running
            # We can't easily determine the exact status without additional API methods
            # So we'll assume it's still running unless we get a specific error
            error_str = str(e).lower()
            if 'not found' in error_str or 'invalid' in error_str:
                return jsonify({
                    'status': 'failed',
                    'is_complete': True,
                    'error': str(e),
                    'task_run_id': task_run_id
                })
            else:
                # Assume still running
                return jsonify({
                    'status': 'running',
                    'is_complete': False,
                    'task_run_id': task_run_id
                })
            
    except Exception as e:
        return jsonify({'error': f'Failed to get task status: {str(e)}'}), 500

def monitor_task_completion(task_run_id, task_metadata):
    """
    Background thread function to monitor task completion using blocking call.
    This is the ultimate fallback to ensure tasks complete even if SSE fails.
    """
    try:
        print(f"Starting background monitoring for task {task_run_id}")
        
        # Use the blocking call to wait for completion
        run_result = client.task_run.result(task_run_id)
        
        # If we reach here, the task completed
        print(f"Background monitor detected completion for task {task_run_id}")
        
        # Check if task is still being tracked (not already completed via SSE)
        if task_run_id in active_tasks:
            print(f"Task {task_run_id} completed via background monitor - saving report")
            
            # Save the report (same logic as complete_task endpoint)
            try:
                content = getattr(run_result.output, "content", "No content found.")
                basis = getattr(run_result.output, "basis", None)
                
                title = f"{task_metadata['industry']} Market Research Report"
                if task_metadata['geography'] and task_metadata['geography'] != "Not specified":
                    title += f" - {task_metadata['geography']}"
                
                slug = create_slug(title)
                
                report_id = save_report(
                    title, slug, 
                    task_metadata['industry'], 
                    task_metadata['geography'], 
                    task_metadata['details'], 
                    content,
                    basis,
                    task_run_id=task_run_id
                )
                
                record_report_generation()
                
                print(f"Background monitor saved report {report_id} for task {task_run_id}")
                
            except Exception as e:
                print(f"Error saving report in background monitor for task {task_run_id}: {e}")
        
        # Clean up tracking
        if task_run_id in active_tasks:
            del active_tasks[task_run_id]
            
    except Exception as e:
        print(f"Error in background monitor for task {task_run_id}: {e}")
        # Clean up tracking even on error
        if task_run_id in active_tasks:
            del active_tasks[task_run_id]

@app.route('/complete-task/<task_run_id>', methods=['POST'])
def complete_task(task_run_id):
    """Handle task completion and save the report"""
    try:
        # Get task metadata from session
        task_metadata = session.get(f'task_{task_run_id}')
        if not task_metadata:
            return jsonify({'error': 'Task metadata not found'}), 404
            
        # Get the final result
        run_result = client.task_run.result(task_run_id)
        
        # Extract content
        content = getattr(run_result.output, "content", "No content found.")
        basis = getattr(run_result.output, "basis", None)
        
        # Create title and slug
        title = f"{task_metadata['industry']} Market Research Report"
        if task_metadata['geography'] and task_metadata['geography'] != "Not specified":
            title += f" - {task_metadata['geography']}"
        
        slug = create_slug(title)
        
        # Save report
        report_id = save_report(
            title, slug, 
            task_metadata['industry'], 
            task_metadata['geography'], 
            task_metadata['details'], 
            content,
            basis,
            task_run_id=task_run_id
        )
        
        # Record report generation for rate limiting
        record_report_generation()
        
        # Clean up session and active tasks tracking
        session.pop(f'task_{task_run_id}', None)
        if task_run_id in active_tasks:
            del active_tasks[task_run_id]
        
        return jsonify({
            'success': True,
            'report_id': report_id,
            'slug': slug,
            'title': title,
            'url': f'/report/{slug}'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to complete task: {str(e)}'}), 500

@app.route('/report/<slug>')
def view_report(slug):
    """View a specific report by slug"""
    report = get_report_by_slug(slug)
    
    if not report:
        return render_template('404.html'), 404
    
    return render_template('report.html', report=report)

@app.route('/download/<slug>')
def download_report(slug):
    """Download report as markdown file"""
    report = get_report_by_slug(slug)
    
    if not report:
        return jsonify({'error': 'Report not found'}), 404
    
    # Create temporary file
    temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.md')
    
    # Write markdown content
    markdown_content = f"""# {report['title']}

**Generated on:** {report['created_at']}  
**Industry:** {report['industry']}  
**Geography:** {report['geography'] or 'Global'}  
**Details:** {report['details'] or 'None specified'}

---

{report['content']}
"""
    
    temp_file.write(markdown_content)
    temp_file.close()
    
    # Send file
    filename = f"{report['slug']}.md"
    return send_file(temp_file.name, as_attachment=True, download_name=filename)

@app.route('/api/status')
def api_status():
    """API endpoint to check global rate limit status"""
    recent_report_count = get_recent_report_count()
    remaining_reports = MAX_REPORTS_PER_HOUR - recent_report_count
    
    return jsonify({
        'authenticated': False,  # No authentication required
        'recent_report_count': recent_report_count,
        'max_reports_per_hour': MAX_REPORTS_PER_HOUR,
        'remaining_reports': max(0, remaining_reports),
        'login_required': False
    })

if __name__ == '__main__':
    # Initialize database
    init_database()
    
    # Run the application
    app.run(debug=True, host='0.0.0.0', port=5000)
