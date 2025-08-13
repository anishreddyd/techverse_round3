# File: app/utils/helpers.py

import os
import shutil
from pathlib import Path
from werkzeug.utils import secure_filename
from flask import current_app

ALLOWED_EXTENSIONS = {'pdf'}


def allowed_file(filename: str) -> bool:
    """Check if the uploaded file is a PDF."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_uploaded_file(file, session_id: str) -> str:
    """
    Save uploaded PDF file to a public session-specific folder inside /static/uploads/.
    Returns the absolute path to the saved file (for processing).
    """
    filename = secure_filename(file.filename)

    # Public uploads directory for browser access
    upload_root = Path(current_app.root_path) / "static" / "uploads"
    session_folder = upload_root / session_id
    session_folder.mkdir(parents=True, exist_ok=True)

    filepath = session_folder / filename
    file.save(str(filepath))

    return str(filepath)  # Absolute path for processing


def cleanup_temp_files(session_id: str) -> None:
    """
    Remove all files for a session from the uploads directory.
    """
    upload_root = Path(current_app.root_path) / "static" / "uploads"
    session_folder = upload_root / session_id
    if session_folder.exists():
        shutil.rmtree(session_folder)


def get_pdf_metadata(filepath: str) -> dict:
    """
    Extract basic metadata from a PDF file using PyMuPDF (fitz).
    Returns dictionary with page count, title, author, subject.
    """
    import fitz
    try:
        doc = fitz.open(filepath)
        metadata = doc.metadata or {}
        page_count = doc.page_count
        doc.close()
        return {
            "page_count": page_count,
            "title": metadata.get("title", ""),
            "author": metadata.get("author", ""),
            "subject": metadata.get("subject", "")
        }
    except Exception:
        return {
            "page_count": 0,
            "title": "",
            "author": "",
            "subject": ""
        }
