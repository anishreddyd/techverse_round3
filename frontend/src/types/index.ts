/**
 * Type definitions for the PDF reading application
 */

export interface PDFDocument {
  id: string;
  name: string;
  path: string;
  uploadDate: string;
  pageCount: number;
  processed: boolean;
}

export interface RelatedSection {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  content: string;
  snippet: string;
  relevanceScore: number;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface Insight {
  id: string;
  type: 'key_insight' | 'did_you_know' | 'contradiction' | 'connection';
  title: string;
  content: string;
  relevance: number;
  sources: string[];
}

export interface PodcastSegment {
  id: string;
  title: string;
  duration: number;
  audioUrl: string;
  transcript: string;
  relatedSections: string[];
}

export interface AnalysisResult {
  relatedSections: RelatedSection[];
  insights: Insight[];
  podcast?: PodcastSegment;
}
