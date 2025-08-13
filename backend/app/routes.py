# File: app/routes.py

from flask import request, jsonify, current_app, url_for
import os
import uuid
import json
from pathlib import Path
from werkzeug.utils import secure_filename

from app.utils.process_pdfs import process_headings_1a
from app.utils.analyze_collections import analyze_collection_1b
from app.utils.recommendation_engine import RecommendationEngine
from app.utils.helpers import allowed_file, save_uploaded_file, cleanup_temp_files

# Initialize recommendation engine (in-memory storage)
recommendation_engine = RecommendationEngine()

# Output folder for JSON results
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "output"))
os.makedirs(OUTPUT_DIR, exist_ok=True)

def register_routes(app):

    # ------------------ Health Check ------------------ #
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "healthy", "message": "Backend is running"})

    # ------------------ Single PDF Upload ------------------ #
    @app.route("/api/upload", methods=["POST"])
    def upload_pdf():
        try:
            if "file" not in request.files:
                return jsonify({"status": "error", "message": "No PDF file provided"}), 400

            file = request.files["file"]
            if file.filename.strip() == "" or not allowed_file(file.filename):
                return jsonify({"status": "error", "message": "Invalid file"}), 400

            session_id = str(uuid.uuid4())
            filename = secure_filename(file.filename)
            filepath = os.path.abspath(save_uploaded_file(file, session_id))

            pdf_url = url_for(
                "serve_static",
                filename=f"uploads/{session_id}/{filename}",
                _external=True
            )

            # Step 1A: Extract headings
            headings_list = process_headings_1a(filepath)
            headings_result = headings_list[0] if headings_list else {}

            # Save 1A output JSON for single file
            output_path = os.path.join(OUTPUT_DIR, f"{session_id}_1a.json")
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(headings_result, f, indent=2, ensure_ascii=False)

            return jsonify({
                "status": "success",
                "session_id": session_id,
                "pdf_url": pdf_url,
                "headings": headings_result.get("outline", []),
                "title": headings_result.get("title", "")
            })

        except Exception as e:
            current_app.logger.exception("Error uploading single PDF")
            return jsonify({"status": "error", "message": str(e)}), 500

    # ------------------ Multiple PDF Upload ------------------ #
    @app.route("/api/upload-pdfs", methods=["POST"])
    def upload_library_pdfs():
        try:
            files = request.files.getlist("pdfs")
            persona = request.form.get("persona", "General Analyst")
            job = request.form.get("job", "Analyze documents")

            if not files or all(f.filename.strip() == "" for f in files):
                return jsonify({"status": "error", "message": "No files provided"}), 400

            session_id = str(uuid.uuid4())
            processed_docs = []

            for file in files:
                if file.filename.strip() == "" or not allowed_file(file.filename):
                    continue

                filepath = os.path.abspath(save_uploaded_file(file, session_id))

                try:
                    # Step 1A - extract headings
                    headings_list = process_headings_1a(filepath)
                    headings_result = headings_list[0] if headings_list else {}
                except Exception as e:
                    current_app.logger.error(f"[upload_library_pdfs] Failed to process {filepath}: {e}")
                    continue

                # Store in recommendation engine
                recommendation_engine.add_document(
                    filepath,
                    headings_result,
                    persona,
                    job,
                    session_id=session_id
                )

                processed_docs.append({
                    "filename": file.filename,
                    "title": headings_result.get("title", ""),
                    "sections_count": len(headings_result.get("outline", [])),
                    "outline": headings_result.get("outline", []),
                    "pdf_url": url_for(
                        "serve_static",
                        filename=f"uploads/{session_id}/{secure_filename(file.filename)}",
                        _external=True
                    )
                })

            # Save 1A output JSON
            headings_output_path = os.path.join(OUTPUT_DIR, f"{session_id}_1a.json")
            with open(headings_output_path, "w", encoding="utf-8") as f:
                json.dump(processed_docs, f, indent=2, ensure_ascii=False)

            # Step 1B - analyze across uploaded PDFs
            insights = analyze_collection_1b(
                session_id=session_id,
                persona=persona,
                job=job,
                recommendation_engine=recommendation_engine
            )

            # Save 1B output JSON
            insights_output_path = os.path.join(OUTPUT_DIR, f"{session_id}_1b.json")
            with open(insights_output_path, "w", encoding="utf-8") as f:
                json.dump(insights, f, indent=2, ensure_ascii=False)

            return jsonify({
                "status": "success",
                "session_id": session_id,
                "message": f"Processed {len(processed_docs)} documents",
                "processed_docs": processed_docs,
                "uploaded_files": [doc["filename"] for doc in processed_docs],
                "total_library_size": recommendation_engine.get_library_size(),
                "insights": insights
            })

        except Exception as e:
            current_app.logger.exception("Error uploading multiple PDFs")
            return jsonify({"status": "error", "message": str(e)}), 500

    # ------------------ List Uploaded Documents ------------------ #
    @app.route("/api/documents", methods=["GET"])
    def list_documents():
        docs = []
        for doc_id, doc in recommendation_engine.documents.items():
            file_path = doc.get("filepath")  # fixed key name
            if not file_path or not os.path.isfile(file_path):
                current_app.logger.warning(f"[list_documents] Missing file for doc_id={doc_id}, skipping")
                continue

            docs.append({
                "id": doc_id,
                "filename": doc.get("filename"),
                "title": doc.get("title"),
                "session_id": doc.get("session_id"),
                "persona": doc.get("persona", ""),
                "job": doc.get("job", ""),
                "pdf_url": url_for(
                    "serve_static",
                    filename=f"uploads/{doc.get('session_id')}/{doc.get('filename')}",
                    _external=True
                )
            })
        return jsonify({"status": "success", "documents": docs})

    # ------------------ Analyze Section ------------------ #
    @app.route("/api/analyze", methods=["POST"])
    def analyze_section():
        try:
            data = request.get_json()
            document_id = data.get("document_id")
            current_section = data.get("selection", "")
            persona = data.get("persona", "General Analyst")
            job = data.get("job", "Analyze document")

            if not document_id:
                return jsonify({"status": "error", "message": "Missing document_id"}), 400

            doc = recommendation_engine.documents.get(document_id)
            if not doc:
                return jsonify({"status": "error", "message": "Document not found"}), 404

            recommendations = recommendation_engine.get_section_recommendations(
                current_section=current_section,
                persona=persona,
                job=job,
                document_id=document_id
            )

            return jsonify({"status": "success", "recommendations": recommendations})

        except Exception as e:
            current_app.logger.exception("Error analyzing section")
            return jsonify({"status": "error", "message": str(e)}), 500

    # ------------------ Insights ------------------ #
    @app.route("/api/insights", methods=["POST"])
    def generate_insights():
        try:
            data = request.get_json()
            session_id = data.get("session_id")
            persona = data.get("persona", "General Analyst")
            job = data.get("job", "Analyze document")

            if not session_id:
                return jsonify({"status": "error", "message": "Missing session_id"}), 400

            insights = analyze_collection_1b(
                session_id=session_id,
                persona=persona,
                job=job,
                recommendation_engine=recommendation_engine
            )

            # Save insights JSON
            insights_output_path = os.path.join(OUTPUT_DIR, f"{session_id}_1b.json")
            with open(insights_output_path, "w", encoding="utf-8") as f:
                json.dump(insights, f, indent=2, ensure_ascii=False)

            return jsonify({"status": "success", "insights": insights})

        except Exception as e:
            current_app.logger.exception("Error generating insights")
            return jsonify({"status": "error", "message": str(e)}), 500

    # ------------------ Podcast Placeholder ------------------ #
    @app.route("/api/podcast", methods=["POST"])
    def generate_podcast():
        try:
            data = request.get_json()
            sections = data.get("sections", [])
            return jsonify({
                "status": "success",
                "message": "Podcast feature not implemented yet",
                "sections": sections
            })
        except Exception as e:
            current_app.logger.exception("Error generating podcast")
            return jsonify({"status": "error", "message": str(e)}), 500

    # ------------------ Cleanup ------------------ #
    @app.route("/api/cleanup", methods=["POST"])
    def cleanup_session():
        try:
            data = request.get_json()
            session_id = data.get("session_id")

            if not session_id:
                return jsonify({"status": "error", "message": "Missing session_id"}), 400

            cleanup_temp_files(session_id)

            recommendation_engine.documents = {
                doc_id: doc
                for doc_id, doc in recommendation_engine.documents.items()
                if doc.get("session_id") != session_id
            }
            recommendation_engine._refit_vectorizer()

            return jsonify({"status": "success", "message": f"Session {session_id} cleaned up"})

        except Exception as e:
            current_app.logger.exception("Error cleaning up session")
            return jsonify({"status": "error", "message": str(e)}), 500
