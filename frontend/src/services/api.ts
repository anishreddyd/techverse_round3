/**
 * API service for communicating with Flask backend
 * Handles file uploads, document analysis, and insights
 */

export interface UploadResponse {
  uploaded_files: string[];
  message?: string;
}

export interface DocumentListResponse {
  documents: { id: string; name: string; pages: number }[];
}

export interface AnalysisResponse {
  recommendations: string[];
  context?: string;
}

export interface InsightsResponse {
  insights: string[];
}

export interface PodcastResponse {
  audio_url: string;
}

const API_BASE =
  process.env.NODE_ENV === "production"
    ? "/api"
    : "http://localhost:5000/api";

// Keep the upload field name in one place
const PDF_UPLOAD_FIELD = "pdfs";

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `API request failed (${res.status} ${res.statusText}): ${text}`
    );
  }
  return res.json();
}

export class APIService {
  /**
   * Upload multiple PDF files with persona & job context
   */
  static async uploadPDFs(
    files: File[],
    persona: string,
    job: string
  ): Promise<UploadResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append(PDF_UPLOAD_FIELD, file));
    formData.append("persona", persona);
    formData.append("job", job);

    return apiFetch<UploadResponse>("/upload-pdfs", {
      method: "POST",
      body: formData,
    });
  }

  /**
   * Get list of uploaded documents
   */
  static async getDocuments(): Promise<DocumentListResponse> {
    return apiFetch<DocumentListResponse>("/documents");
  }

  /**
   * Analyze a document section
   */
  static async analyzeSection(
    documentId: string,
    pageNumber: number,
    selection?: string,
    persona: string = "General Analyst",
    job: string = "Analyze document"
  ): Promise<AnalysisResponse> {
    const payload = { document_id: documentId, page_number: pageNumber, selection, persona, job };
    return apiFetch<AnalysisResponse>("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Get contextual insights
   */
  static async getInsights(
    sessionId: string,
    context: string,
    persona: string = "General Analyst",
    job: string = "Get insights"
  ): Promise<InsightsResponse> {
    const payload = { session_id: sessionId, context, persona, job };
    return apiFetch<InsightsResponse>("/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Generate a podcast from selected sections
   */
  static async generatePodcast(
    documentId: string,
    sectionIds: string[]
  ): Promise<PodcastResponse> {
    const payload = { document_id: documentId, sections: sectionIds };
    return apiFetch<PodcastResponse>("/podcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}
