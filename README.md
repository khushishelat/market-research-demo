# AI-Powered Market Research Tool

A comprehensive web application that generates detailed market research reports using Parallel's Deep Research API. Built with Flask, this tool allows users to create, view, and download professional market analysis reports with citations and competitive intelligence.

## Features

- 🤖 **AI-Powered Research**: Uses Parallel's Deep Research API for comprehensive market analysis
- 🔐 **Google OAuth Authentication**: Secure user authentication with Google accounts
- 📖 **Public Report Library**: Browse all reports without authentication required
- 🔒 **Auth-Gated Generation**: Sign in required only to create new reports
- 📊 **Interactive Dashboard**: Clean, modern web interface for easy report generation
- 🔄 **User Limits**: Configurable report limits per authenticated user (5 reports default)
- 📈 **Report History**: Save and view previously generated reports
- 🌐 **Shareable URLs**: Each report gets a unique URL slug for easy sharing
- 📥 **Download Support**: Export reports as Markdown files
- 👤 **User Management**: Track reports by authenticated Google users
- 📱 **Responsive Design**: Works great on desktop and mobile devices
- 🎨 **Professional UI**: Bootstrap-based design with custom styling

## Quick Start

### Prerequisites

- Python 3.8 or higher
- Parallel API key (get yours at [platform.parallel.ai](https://platform.parallel.ai))
- Google Cloud Platform account (for OAuth authentication)

### Installation

1. **Clone or download the project**:
   ```bash
   cd market-research-demo
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**:
   Create a `.env.local` file with:
   ```env
   # Required for AI report generation
   PARALLEL_API_KEY=your_parallel_api_key_here
   SECRET_KEY=1c2a9a042ca2477a0db55ecb00a91854db62eba99562723c45191b0ba9ceb347
   
   # Required for Google OAuth (see GOOGLE_OAUTH_SETUP.md for details)
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   ```

4. **Set up Google OAuth** (required for report generation):
   - See [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md) for detailed instructions
   - Or run in "browse-only" mode without OAuth setup

5. **Run the application**:
   ```bash
   python app.py
   ```

6. **Open your browser** and go to `http://localhost:5000`

### Quick Test (Without OAuth)

You can test the app immediately without OAuth setup:
- Browse the public report library
- View and download existing reports
- OAuth is only needed to generate new reports

## Usage

### Browsing Reports (No Authentication Required)

1. **Visit the homepage**: View the public report library
2. **Browse reports**: See all publicly available market research reports
3. **View reports**: Click on any report to read the full analysis
4. **Download**: Get markdown files without signing in

### Generating Reports (Authentication Required)

1. **Sign in with Google**: Click "Sign in with Google" to authenticate
2. **Fill out the form**:
   - **Industry** (required): e.g., "HVAC", "SaaS", "Electric Vehicles"
   - **Geography** (optional): Select target region or leave blank for global analysis
   - **Research Focus** (optional): Specify details like "CAGR analysis", "M&A activity", etc.

3. **Generate Report**: Click the "Deep Research" button and wait for AI processing (typically 2-5 minutes)
4. **View Results**: Reports are automatically saved and added to the public library

### Authentication & User Management

- **Google OAuth**: Secure authentication using your Google account
- **User Limits**: Each authenticated user can generate up to 5 reports
- **Personal Dashboard**: Track your generated reports separately
- **Public Attribution**: Your reports are added to the public library with your name

### Viewing Reports

- **Public Access**: All reports are publicly viewable without authentication
- **Direct URLs**: Each report gets a unique URL like `/report/hvac-market-research-report`
- **Download**: Click the download button to get a Markdown file
- **Share**: Use the share button to copy the report URL
- **Print**: Reports are print-optimized for professional presentation

### Report Management

- **Public Library**: All reports appear in the main library for everyone to browse
- **Personal Tracking**: Authenticated users see their own reports in a separate section
- **Attribution**: Reports show the author's name (from Google account)
- **Permanent Storage**: Reports are stored permanently in SQLite database

## Configuration

### Environment Variables

Create a `.env.local` file with the following variables:

```env
# Required - Parallel API Configuration
PARALLEL_API_KEY=your_parallel_api_key_here
SECRET_KEY=your_secret_key_here

# Required - Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Optional - App Configuration
MAX_REPORTS_PER_USER=5
DEBUG=True
```

**Important**: See [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md) for detailed instructions on getting your Google OAuth credentials.

### Database

The app uses SQLite by default, creating a `market_research.db` file. The database is automatically initialized on first run.

### Customization

- **Report Limits**: Modify `MAX_REPORTS_PER_USER` in `app.py`
- **Styling**: Edit `static/css/style.css` for custom themes
- **Templates**: Modify HTML templates in the `templates/` directory

## API Endpoints

- `GET /` - Main dashboard
- `POST /generate-report` - Generate new report
- `GET /report/<slug>` - View specific report
- `GET /download/<slug>` - Download report as Markdown
- `GET /api/status` - Check user status and limits

## Project Structure

```
market-research-demo/
├── app.py                 # Main Flask application
├── deep_research_recipe.py # Original Parallel API examples
├── requirements.txt       # Python dependencies
├── .env.example          # Environment variables template
├── README.md             # This file
├── templates/            # HTML templates
│   ├── base.html
│   ├── index.html
│   ├── report.html
│   └── 404.html
├── static/               # Static assets
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
└── market_research.db    # SQLite database (created on first run)
```

## Technologies Used

- **Backend**: Flask (Python web framework)
- **Frontend**: Bootstrap 5, Font Awesome icons
- **Database**: SQLite with manual SQL queries
- **AI Research**: Parallel Deep Research API
- **Styling**: Custom CSS with Bootstrap theming

## Parallel Deep Research Integration

This app uses the Parallel Deep Research API with the following configuration:

- **Processor**: `ultra` (good balance of quality, speed, and cost)
- **Output Type**: `text` (markdown-formatted reports with citations)
- **Input Format**: Structured research prompt with industry, geography, and details

The original research examples from `deep_research_recipe.py` were adapted for the web interface while maintaining the core API integration patterns.

## Troubleshooting

### Common Issues

1. **API Key Error**: Make sure your Parallel API key is correctly set in `.env.local`
2. **Port Already in Use**: Change the port in `app.py` or kill the process using port 5000
3. **Database Errors**: Delete `market_research.db` to reset the database
4. **Module Not Found**: Run `pip install -r requirements.txt` to install dependencies

### Debug Mode

Set `DEBUG=True` in your environment or modify `app.py` to enable Flask debug mode for detailed error messages.

## Production Deployment

For production deployment:

1. Set `DEBUG=False`
2. Use a production WSGI server like Gunicorn
3. Set up a reverse proxy (nginx)
4. Use environment variables for secrets
5. Consider using PostgreSQL instead of SQLite
6. Set up proper logging and monitoring

## Contributing

This is a demo application showcasing Parallel's Deep Research capabilities. Feel free to fork and modify for your own use cases.

## License

This project is provided as-is for demonstration purposes. See Parallel's terms of service for API usage guidelines.

## Support

- **Parallel Documentation**: [docs.parallel.ai](https://docs.parallel.ai)
- **API Key**: Get yours at [platform.parallel.ai](https://platform.parallel.ai)
- **Issues**: Check Flask and Parallel documentation for troubleshooting
