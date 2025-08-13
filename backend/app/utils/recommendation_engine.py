# File: app/utils/recommendation_engine.py

from typing import Dict, List, Optional, Union
import numpy as np
import re
import json
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class RecommendationEngine:
    def __init__(self):
        """
        In-memory recommendation engine using TF-IDF similarity.
        """
        self.documents: Dict[str, Dict] = {}
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.document_vectors = None
        self.is_fitted = False

    # ---------------------- DOCUMENT MANAGEMENT ----------------------

    def add_document(
        self,
        filepath: str,
        headings_result: Union[Dict, str],
        persona: str = "",
        job: str = "",
        session_id: str = None
    ):
        """
        Add a document to the recommendation engine's memory and re-index TF-IDF vectors.
        Supports headings_result as either dict or JSON string.
        """
        parsed_headings = self._ensure_dict(headings_result)
        text_content = self._extract_text_content(parsed_headings)

        doc_id = Path(filepath).stem
        self.documents[doc_id] = {
            "filepath": filepath,
            "filename": Path(filepath).name,
            "title": parsed_headings.get("title", ""),
            "outline": parsed_headings.get("outline", []),
            "text_content": text_content,
            "persona": persona,
            "job": job,
            "session_id": session_id,
            "raw_headings_result": headings_result  # Keep original for frontend rendering
        }

        self._refit_vectorizer()

    def _ensure_dict(self, data: Union[Dict, str]) -> Dict:
        """
        Convert JSON string to dict if needed, otherwise return as-is.
        """
        if isinstance(data, dict):
            return data
        if isinstance(data, str):
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                return {"title": "", "outline": []}
        return {"title": "", "outline": []}

    def _extract_text_content(self, headings_result: Dict) -> str:
        """
        Concatenate title and all headings text for TF-IDF vectorization.
        """
        title = headings_result.get("title", "")
        outline = headings_result.get("outline", [])

        if not isinstance(outline, list):
            outline = []

        outline_text = " ".join(
            [item.get("text", "") for item in outline if isinstance(item, dict)]
        )
        return f"{title} {outline_text}".strip()

    def _refit_vectorizer(self):
        """
        Fit TF-IDF vectorizer across all stored documents.
        """
        if not self.documents:
            self.is_fitted = False
            return

        try:
            texts = [doc["text_content"] for doc in self.documents.values()]
            self.document_vectors = self.vectorizer.fit_transform(texts)
            self.is_fitted = True
        except Exception as e:
            print(f"[Vectorizer Error] {e}")
            self.is_fitted = False

    def get_documents_for_session(self, session_id: str) -> List[Dict]:
        """
        Retrieve all documents linked to a given session_id.
        """
        return [
            doc for doc in self.documents.values()
            if doc.get("session_id") == session_id
        ]

    def get_library_size(self) -> int:
        """
        Return the number of documents in the library.
        """
        return len(self.documents)

    # ---------------------- RECOMMENDATION LOGIC ----------------------

    def get_recommendations(
        self,
        current_doc_path: str,
        persona: str,
        job: str,
        current_doc_data: Dict
    ) -> List[Dict]:
        """
        Return similar documents and their relevant sections for a given persona/job/query.
        """
        if not self.is_fitted or not self.documents:
            return []

        query_text = f"{persona} {job} {current_doc_data.get('title', '')}"

        try:
            query_vector = self.vectorizer.transform([query_text])
            similarities = cosine_similarity(query_vector, self.document_vectors)[0]

            recommendations = []
            doc_ids = list(self.documents.keys())
            sorted_indices = np.argsort(similarities)[::-1]

            for idx in sorted_indices:
                if similarities[idx] > 0.1:
                    doc_id = doc_ids[idx]
                    doc = self.documents[doc_id]

                    relevant_sections = self._find_relevant_sections(doc["outline"], query_text)

                    recommendations.append({
                        "document_id": doc_id,
                        "document": doc["filename"],
                        "title": doc["title"],
                        "similarity_score": float(similarities[idx]),
                        "relevant_sections": relevant_sections[:3],
                        "snippet": self._generate_snippet(doc["outline"][:2])
                    })

            return recommendations
        except Exception as e:
            print(f"[Recommendation Error] {e}")
            return []

    def get_section_recommendations(
        self,
        current_section: str,
        persona: str,
        job: str,
        document_id: Optional[str] = None,
        page_number: Optional[int] = None
    ) -> List[Dict]:
        """
        Recommend documents related to a specific section in context.
        """
        current_doc_data = {"title": current_section}

        # Anchor recommendations to the document if provided
        if document_id and document_id in self.documents:
            doc = self.documents[document_id]
            current_doc_data["title"] = doc.get("title", "")
            current_doc_data["outline"] = doc.get("outline", [])

            # If page_number provided, filter to that page
            if page_number is not None:
                current_doc_data["outline"] = [
                    sec for sec in current_doc_data["outline"]
                    if sec.get("page") == page_number
                ]

        return self.get_recommendations(
            current_doc_path="",
            persona=persona,
            job=job,
            current_doc_data=current_doc_data
        )

    # ---------------------- TEXT ANALYSIS HELPERS ----------------------

    def _find_relevant_sections(self, outline: List[Dict], query: str) -> List[Dict]:
        """
        Match sections against the query using token overlap.
        """
        relevant = []
        query_words = set(re.findall(r'\b\w+\b', query.lower()))

        for section in outline:
            section_text = section.get("text", "").lower()
            section_words = set(re.findall(r'\b\w+\b', section_text))
            overlap = len(query_words & section_words)

            if overlap > 0:
                relevant.append({
                    "text": section.get("text", ""),
                    "page": section.get("page", 1),
                    "level": section.get("level", "H1"),
                    "relevance_score": overlap / len(query_words) if query_words else 0
                })

        relevant.sort(key=lambda x: x["relevance_score"], reverse=True)
        return relevant

    def _generate_snippet(self, sections: List[Dict]) -> str:
        """
        Build a short preview snippet from top sections.
        """
        snippets = []
        for section in sections:
            text = section.get("text", "")
            if len(text) > 50:
                text = text[:50] + "..."
            snippets.append(text)

        return " | ".join(snippets) if snippets else "No content available"
