/**
 * Offline recommendation engine for base functionality
 * Provides document similarity without internet dependency
 */

import { PDFDocument, RelatedSection } from '@/types';

interface DocumentEmbedding {
  id: string;
  name: string;
  pageEmbeddings: Array<{
    pageNumber: number;
    text: string;
    embedding: number[];
    keywords: string[];
  }>;
}

export class OfflineRecommendationEngine {
  private static instance: OfflineRecommendationEngine;
  private documents: Map<string, DocumentEmbedding> = new Map();
  private isInitialized = false;

  static getInstance(): OfflineRecommendationEngine {
    if (!OfflineRecommendationEngine.instance) {
      OfflineRecommendationEngine.instance = new OfflineRecommendationEngine();
    }
    return OfflineRecommendationEngine.instance;
  }

  /**
   * Initialize the offline engine with stored documents
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load from localStorage/IndexedDB
      const storedDocs = localStorage.getItem('offline_documents');
      if (storedDocs) {
        const parsed = JSON.parse(storedDocs);
        parsed.forEach((doc: DocumentEmbedding) => {
          this.documents.set(doc.id, doc);
        });
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize offline engine:', error);
    }
  }

  /**
   * Add document to offline storage
   */
  async addDocument(document: PDFDocument, textContent: string[]): Promise<void> {
    const embedding: DocumentEmbedding = {
      id: document.id,
      name: document.name,
      pageEmbeddings: textContent.map((text, index) => ({
        pageNumber: index + 1,
        text: text.substring(0, 1000), // Store first 1000 chars
        embedding: this.generateSimpleEmbedding(text),
        keywords: this.extractKeywords(text)
      }))
    };

    this.documents.set(document.id, embedding);
    await this.saveToStorage();
  }

  /**
   * Find related sections using offline similarity
   */
  async findRelatedSections(
    currentDocId: string, 
    currentPage: number, 
    selectedText?: string
  ): Promise<RelatedSection[]> {
    await this.initialize();

    const currentDoc = this.documents.get(currentDocId);
    if (!currentDoc) return [];

    const queryText = selectedText || currentDoc.pageEmbeddings[currentPage - 1]?.text || '';
    const queryEmbedding = this.generateSimpleEmbedding(queryText);
    const queryKeywords = this.extractKeywords(queryText);

    const relatedSections: Array<{section: RelatedSection, score: number}> = [];

    // Search across all documents
    for (const [docId, doc] of this.documents.entries()) {
      for (const page of doc.pageEmbeddings) {
        // Skip current page
        if (docId === currentDocId && page.pageNumber === currentPage) continue;

        const similarity = this.calculateSimilarity(
          queryEmbedding, 
          page.embedding,
          queryKeywords,
          page.keywords
        );

        if (similarity > 0.3) { // Threshold for relevance
          relatedSections.push({
            section: {
              id: `${docId}-${page.pageNumber}`,
              documentId: docId,
              documentName: doc.name,
              pageNumber: page.pageNumber,
              content: page.text,
              snippet: page.text.substring(0, 150) + '...',
              relevanceScore: similarity,
              position: { x: 0, y: 0, width: 100, height: 20 }
            },
            score: similarity
          });
        }
      }
    }

    // Sort by relevance and return top 5
    return relatedSections
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => item.section);
  }

  /**
   * Simple TF-IDF based embedding (CPU-friendly)
   */
  private generateSimpleEmbedding(text: string): number[] {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCount = new Map<string, number>();
    
    words.forEach(word => {
      if (word.length > 2) { // Filter short words
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    });

    // Create a simple 100-dimensional vector
    const embedding = new Array(100).fill(0);
    let index = 0;
    
    for (const [word, count] of wordCount.entries()) {
      const hash = this.simpleHash(word) % 100;
      embedding[hash] += count / words.length; // TF normalization
      index++;
      if (index > 50) break; // Limit processing
    }

    return embedding;
  }

  /**
   * Extract keywords using simple frequency analysis
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const frequency = new Map<string, number>();

    words.forEach(word => {
      if (!this.isStopWord(word)) {
        frequency.set(word, (frequency.get(word) || 0) + 1);
      }
    });

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Calculate cosine similarity + keyword overlap
   */
  private calculateSimilarity(
    embedding1: number[], 
    embedding2: number[], 
    keywords1: string[], 
    keywords2: string[]
  ): number {
    // Cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const cosineSim = norm1 && norm2 ? dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2)) : 0;

    // Keyword overlap
    const overlap = keywords1.filter(k => keywords2.includes(k)).length;
    const keywordSim = overlap / Math.max(keywords1.length, keywords2.length, 1);

    // Combine similarities
    return (cosineSim * 0.7) + (keywordSim * 0.3);
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Basic stop words filter
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should'
    ]);
    return stopWords.has(word);
  }

  /**
   * Save documents to localStorage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const docsArray = Array.from(this.documents.values());
      localStorage.setItem('offline_documents', JSON.stringify(docsArray));
    } catch (error) {
      console.error('Failed to save to storage:', error);
    }
  }

  /**
   * Clear offline storage
   */
  async clearStorage(): Promise<void> {
    this.documents.clear();
    localStorage.removeItem('offline_documents');
  }

  /**
   * Get offline document count
   */
  getDocumentCount(): number {
    return this.documents.size;
  }
}
