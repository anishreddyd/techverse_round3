from flask import Flask, send_from_directory
from flask_cors import CORS
from app.routes import register_routes
import os

def create_app():
    app = Flask(__name__)
    
    # Allow requests from your dev frontend on port 8000 (and others if needed)
    CORS(app, resources={r"/*": {"origins": [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8000"
    ]}})

    # Config paths
    app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB
    app.config['UPLOAD_FOLDER'] = os.path.join('app', 'static', 'uploads')
    app.config['OUTPUT_FOLDER'] = os.path.join('app', 'output')

    # Create required folders if they don't exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

    # Serve static files (PDFs, etc.) so frontend can load them in Adobe Embed API
    @app.route('/static/<path:filename>')
    def serve_static(filename):
        return send_from_directory(os.path.join('app', 'static'), filename)

    # Register app routes
    register_routes(app)

    return app
