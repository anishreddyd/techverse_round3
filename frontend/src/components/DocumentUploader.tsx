/**
 * Enhanced document uploader supporting both bulk upload and fresh PDF opening
 */

import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, CheckCircle, BookOpen, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { APIService } from '@/services/api';
import { OfflineRecommendationEngine } from '@/services/offlineEngine';

interface DocumentUploaderProps {
  onDocumentReady: (document: File | PDFDocument, isLibraryDoc: boolean) => void;
  onUploadComplete: () => void;
}

interface PDFDocument {
  id: string;
  name: string;
  path: string;
  uploadDate: string;
  pageCount: number;
  processed: boolean;
}

export default function DocumentUploader({ onDocumentReady, onUploadComplete }: DocumentUploaderProps) {
  const [activeTab, setActiveTab] = useState('fresh');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState<File[]>([]);
  const [freshFile, setFreshFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [persona, setPersona] = useState('');
  const [job, setJob] = useState('');
  
  /** Handle drag events */
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  /** Handle file drop */
  const handleDrop = useCallback((e: React.DragEvent, target: 'fresh' | 'library') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf'
    );

    if (target === 'fresh' && droppedFiles.length > 0) {
      setFreshFile(droppedFiles[0]);
    } else if (target === 'library') {
      setLibraryFiles(prev => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleFreshFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFreshFile(e.target.files[0]);
    }
  }, []);

  const handleLibraryFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setLibraryFiles(prev => [...prev, ...selectedFiles]);
    }
  }, []);

  const removeLibraryFile = useCallback((index: number) => {
    setLibraryFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  /** Open fresh PDF for immediate reading and send to backend with persona & job */
  const openFreshPDF = useCallback(async () => {
    if (!freshFile) return;

    setProcessing(true);
    try {
      // Upload to backend with persona & job for context
      await APIService.uploadPDFs([freshFile], persona, job);

      // Process PDF locally for offline recommendations
      const text = await extractPDFTextLocally(freshFile);
      const mockDoc: PDFDocument = {
        id: 'fresh-' + Date.now(),
        name: freshFile.name,
        path: URL.createObjectURL(freshFile),
        uploadDate: new Date().toISOString(),
        pageCount: Math.ceil(text.length / 2000),
        processed: true
      };

      const offlineEngine = OfflineRecommendationEngine.getInstance();
      await offlineEngine.addDocument(mockDoc, text.split('\n\n'));

      onDocumentReady(mockDoc, false);
      setFreshFile(null);
    } catch (error) {
      console.error('Failed to open fresh PDF:', error);
    } finally {
      setProcessing(false);
    }
  }, [freshFile, persona, job, onDocumentReady]);

  /** Upload library PDFs */
  const uploadLibraryPDFs = useCallback(async () => {
    if (libraryFiles.length === 0) return;

    setUploading(true);
    try {
      const result = await APIService.uploadPDFs(libraryFiles, persona, job);
      setUploadedFiles(result.uploaded_files || []);
      
      const offlineEngine = OfflineRecommendationEngine.getInstance();
      for (const file of libraryFiles) {
        const text = await extractPDFTextLocally(file);
        const mockDoc: PDFDocument = {
          id: 'library-' + Date.now() + Math.random(),
          name: file.name,
          path: URL.createObjectURL(file),
          uploadDate: new Date().toISOString(),
          pageCount: Math.ceil(text.length / 2000),
          processed: true
        };
        await offlineEngine.addDocument(mockDoc, text.split('\n\n'));
      }

      setLibraryFiles([]);
      onUploadComplete();
    } catch (error) {
      console.error('Library upload failed:', error);
    } finally {
      setUploading(false);
    }
  }, [libraryFiles, persona, job, onUploadComplete]);

  /** PDF.js text extraction */
  const extractPDFTextLocally = async (file: File): Promise<string> => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `\n\n--- Page ${pageNum} ---\n${pageText}`;
      }
      return fullText;
    } catch (error) {
      console.error('PDF extraction failed:', error);
      return `Sample text from ${file.name}`;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="fresh"><BookOpen className="h-4 w-4" /> Open Fresh PDF</TabsTrigger>
          <TabsTrigger value="library"><FolderOpen className="h-4 w-4" /> Build Your Library</TabsTrigger>
        </TabsList>

        {/* FRESH PDF TAB */}
        <TabsContent value="fresh">
          <div className="bg-white rounded-lg border-2 border-dashed border-blue-300 p-8">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={(e) => handleDrop(e, 'fresh')}
            >
              <div className="text-center">
                {freshFile ? (
                  <div className="bg-blue-50 p-4 rounded-lg mb-4 flex items-center justify-between">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">{freshFile.name}</span>
                    <Button variant="outline" size="sm" onClick={() => setFreshFile(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <input type="file" accept=".pdf" onChange={handleFreshFileInput} className="hidden" id="fresh-file-upload" />
                    <label htmlFor="fresh-file-upload" className="btn-primary">Select PDF to Read</label>
                  </>
                )}

                {/* Persona & Job for Fresh PDF */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Persona</label>
                    <input
                      type="text"
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                      placeholder="e.g., Research Analyst"
                      className="w-full px-4 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Task / Job</label>
                    <input
                      type="text"
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                      placeholder="e.g., Summarize key findings"
                      className="w-full px-4 py-2 border rounded-md"
                    />
                  </div>
                </div>

                {freshFile && (
                  <Button onClick={openFreshPDF} disabled={processing} className="w-full mt-4" size="lg">
                    {processing ? 'Processing...' : 'Start Reading'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* LIBRARY TAB */}
        <TabsContent value="library">
          <div className="bg-white rounded-lg border-2 border-dashed border-green-300 p-8">
            <input type="file" multiple accept=".pdf" onChange={handleLibraryFileInput} className="hidden" id="library-file-upload" />
            <label htmlFor="library-file-upload" className="btn-primary">Select Multiple PDFs</label>

            {libraryFiles.length > 0 && (
              <div className="mt-8">
                {libraryFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 text-green-600 mr-3" />
                      {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                    </div>
                    <Button variant="outline" size="sm" onClick={() => removeLibraryFile(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {/* Persona & Job for Library Upload */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Persona</label>
                    <input
                      type="text"
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                      placeholder="e.g., Marketing Analyst"
                      className="w-full px-4 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Task / Job</label>
                    <input
                      type="text"
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                      placeholder="e.g., Identify trends from past reports"
                      className="w-full px-4 py-2 border rounded-md"
                    />
                  </div>
                </div>

                <Button onClick={uploadLibraryPDFs} disabled={uploading} className="w-full mt-6" size="lg">
                  {uploading ? 'Processing...' : `Add ${libraryFiles.length} Documents`}
                </Button>
              </div>
            )}

            {uploadedFiles.length > 0 && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                Successfully added {uploadedFiles.length} document{uploadedFiles.length > 1 ? 's' : ''}.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
