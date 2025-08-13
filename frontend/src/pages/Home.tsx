import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Settings, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DocumentUploader from '@/components/DocumentUploader';
import PDFViewer from '@/components/PDFViewer';
import RelatedSections from '@/components/RelatedSections';
import InsightsBulb from '@/components/InsightsBulb';
import PodcastPlayer from '@/components/PodcastPlayer';
import { APIService } from '@/services/api';
import { OfflineRecommendationEngine } from '@/services/offlineEngine';
import { PDFDocument, RelatedSection, Insight, PodcastSegment } from '@/types';

export default function Home() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [currentDocument, setCurrentDocument] = useState<PDFDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [relatedSections, setRelatedSections] = useState<RelatedSection[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [podcast, setPodcast] = useState<PodcastSegment | null>(null);
  const [loading, setLoading] = useState({
    documents: false,
    analysis: false,
    insights: false,
    podcast: false
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('documents');

  // Persona & Job state
  const [persona, setPersona] = useState('');
  const [job, setJob] = useState('');

  const loadDocuments = useCallback(async () => {
    setLoading(prev => ({ ...prev, documents: true }));
    try {
      const result = await APIService.getDocuments();
      setDocuments(result.documents || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(prev => ({ ...prev, documents: false }));
    }
  }, []);

  const handleDocumentReady = useCallback((document: File | PDFDocument, isLibraryDoc: boolean) => {
    if (!isLibraryDoc && 'name' in document) {
      setCurrentDocument(document as PDFDocument);
      setCurrentPage(1);
      setRelatedSections([]);
      setInsights([]);
      setPodcast(null);
    }
  }, []);

  const handleUploadComplete = useCallback(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleDocumentSelect = useCallback((document: PDFDocument) => {
    setCurrentDocument(document);
    setCurrentPage(1);
    setRelatedSections([]);
    setInsights([]);
    setPodcast(null);
  }, []);

  const handlePageChange = useCallback(async (pageNumber: number) => {
    setCurrentPage(pageNumber);
    if (!currentDocument?.id) return;

    setLoading(prev => ({ ...prev, analysis: true }));
    try {
      const offlineEngine = OfflineRecommendationEngine.getInstance();
      const offlineResults = await offlineEngine.findRelatedSections(
        currentDocument.id,
        pageNumber
      );

      if (offlineResults.length > 0) {
        setRelatedSections(offlineResults);
      } else {
        try {
          const result = await APIService.analyzeSection(
            currentDocument.id,
            pageNumber,
            undefined,
            persona || 'General Analyst',
            job || 'Analyze document'
          );
          setRelatedSections(result.related_sections || []);
        } catch {
          console.log('Online analysis unavailable, using offline only');
        }
      }
    } catch (error) {
      console.error('Failed to analyze section:', error);
    } finally {
      setLoading(prev => ({ ...prev, analysis: false }));
    }
  }, [currentDocument, persona, job]);

  const handleTextSelect = useCallback(async (selection: any) => {
    if (!currentDocument?.id || !selection.text) return;

    setLoading(prev => ({ ...prev, analysis: true, insights: true }));
    try {
      const offlineEngine = OfflineRecommendationEngine.getInstance();
      const offlineResults = await offlineEngine.findRelatedSections(
        currentDocument.id,
        currentPage,
        selection.text
      );
      setRelatedSections(offlineResults);

      try {
        const insightsResult = await APIService.getInsights(
          currentDocument.id,
          persona || 'General Analyst',
          job || 'Analyze document'
        );
        setInsights(insightsResult.insights || []);
      } catch {
        console.log('Online insights unavailable, using offline only');
        setInsights([
          {
            id: 'offline-1',
            type: 'key_insight',
            title: 'Related Content Found',
            content: `Found ${offlineResults.length} related sections in your document library.`,
            relevance: 0.8,
            sources: [currentDocument.id]
          }
        ]);
      }
    } catch (error) {
      console.error('Failed to analyze selection:', error);
    } finally {
      setLoading(prev => ({ ...prev, analysis: false, insights: false }));
    }
  }, [currentDocument, currentPage, persona, job]);

  const handleSectionClick = useCallback((section: RelatedSection) => {
    const targetDoc = documents.find(doc => doc.id === section.documentId);
    if (targetDoc) {
      setCurrentDocument(targetDoc);
      setCurrentPage(section.pageNumber);
    }
  }, [documents]);

  const handleGeneratePodcast = useCallback(async () => {
    if (!currentDocument?.id) return;

    setLoading(prev => ({ ...prev, podcast: true }));
    try {
      const result = await APIService.generatePodcast(
        currentDocument.id,
        relatedSections.map(s => s.id)
      );
      setPodcast(result.podcast);
    } catch (error) {
      console.error('Failed to generate podcast:', error);
    } finally {
      setLoading(prev => ({ ...prev, podcast: false }));
    }
  }, [currentDocument, relatedSections]);

  const handleRefreshInsights = useCallback(async () => {
    if (!currentDocument?.id) return;

    setLoading(prev => ({ ...prev, insights: true }));
    try {
      const result = await APIService.getInsights(
        currentDocument.id,
        persona || 'General Analyst',
        job || 'Analyze document'
      );
      setInsights(result.insights || []);
    } catch (error) {
      console.error('Failed to refresh insights:', error);
    } finally {
      setLoading(prev => ({ ...prev, insights: false }));
    }
  }, [currentDocument, persona, job]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="bg-transparent lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex items-center space-x-2">
              <FileText className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">
                PDF Intelligence
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" className="bg-transparent">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden bg-white border-r border-gray-200 flex flex-col`}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 m-2">
              <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
              <TabsTrigger value="related" className="text-xs">Related</TabsTrigger>
              <TabsTrigger value="podcast" className="text-xs">Podcast</TabsTrigger>
            </TabsList>
            
            <TabsContent value="documents" className="flex-1 overflow-hidden m-0">
              <div className="h-full flex flex-col">
                {/* Persona & Job Input */}
                <div className="p-4 space-y-3 border-b">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Persona</label>
                    <input
                      type="text"
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                      placeholder="e.g. Legal Analyst"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Job</label>
                    <input
                      type="text"
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                      placeholder="e.g. Summarize contracts"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                </div>

                <div className="p-4 border-b">
                  <h2 className="font-semibold text-gray-900 mb-2">Your Documents</h2>
                  <p className="text-sm text-gray-600">
                    {documents.length} document{documents.length !== 1 ? 's' : ''} available
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <DocumentUploader 
                    persona={persona}
                    job={job}
                    onDocumentReady={handleDocumentReady}
                    onUploadComplete={handleUploadComplete} 
                  />
                  
                  {documents.length > 0 && (
                    <div className="p-4 space-y-3 border-t">
                      <h3 className="font-medium text-gray-900">Your Library</h3>
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            currentDocument?.id === doc.id
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                          onClick={() => handleDocumentSelect(doc)}
                        >
                          <h3 className="font-medium text-gray-900 mb-1 truncate">
                            {doc.name}
                          </h3>
                          <p className="text-xs text-gray-500">
                            {doc.pageCount} pages • {new Date(doc.uploadDate).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="related" className="flex-1 overflow-hidden m-0">
              <RelatedSections
                sections={relatedSections}
                loading={loading.analysis}
                onSectionClick={handleSectionClick}
              />
            </TabsContent>
            
            <TabsContent value="podcast" className="flex-1 overflow-hidden m-0">
              <div className="p-4">
                <PodcastPlayer
                  podcast={podcast}
                  loading={loading.podcast}
                  onGenerate={handleGeneratePodcast}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {currentDocument ? (
            <PDFViewer
              documentId={currentDocument.id}
              documentUrl={`/api/documents/${currentDocument.id}/pdf`}
              onPageChange={handlePageChange}
              onTextSelect={handleTextSelect}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Welcome to PDF Intelligence
                </h2>
                <p className="text-gray-600 mb-6 max-w-md">
                  Upload your PDF documents to start discovering connections, insights, and generate intelligent summaries.
                </p>
                <Button
                  onClick={() => setSidebarOpen(true)}
                  className="inline-flex items-center"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Get Started
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Insights Bulb */}
      <InsightsBulb
        insights={insights}
        loading={loading.insights}
        onRefresh={handleRefreshInsights}
      />
    </div>
  );
}