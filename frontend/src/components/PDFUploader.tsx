/**
 * PDFUploader.tsx
 * Multiple PDF uploader with persona & job context
 * Integrated with Flask backend
 */

import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APIService } from '@/services/api'; // ✅ Named import

interface PDFUploaderProps {
  onUploadComplete: () => void;
}

export default function PDFUploader({ onUploadComplete }: PDFUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [persona, setPersona] = useState("");
  const [job, setJob] = useState("");

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
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf'
    );
    setFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  /** Handle file input change */
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  }, []);

  /** Remove file from list */
  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  /** Upload files to backend with persona & job */
  const uploadFiles = useCallback(async () => {
    if (files.length === 0) {
      alert("Please select at least one PDF to upload.");
      return;
    }
    if (!persona.trim() || !job.trim()) {
      alert("Please enter both Persona and Job to be Done before uploading.");
      return;
    }

    setUploading(true);
    try {
      const result = await APIService.uploadPDFs(files, persona, job);

      if (result.uploaded_files) {
        setUploadedFiles(result.uploaded_files);
      }
      setFiles([]);
      onUploadComplete(); // ✅ Refresh document list in parent
    } catch (error) {
      console.error('Upload failed:', error);
      alert("Upload failed. Check the console for details.");
    } finally {
      setUploading(false);
    }
  }, [files, persona, job, onUploadComplete]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors">

      {/* Persona Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Persona</label>
        <input
          type="text"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="e.g., Undergraduate Chemistry Student"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Job to be Done Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Job to be Done</label>
        <input
          type="text"
          value={job}
          onChange={(e) => setJob(e.target.value)}
          placeholder="e.g., Identify key concepts for exam preparation"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Drag & Drop Upload Area */}
      <div
        className={`relative ${dragActive ? 'bg-blue-50 border-blue-400' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="text-center py-8">
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Upload your PDF documents
          </h3>
          <p className="text-gray-600 mb-4">
            Drag and drop your PDFs here, or click to browse
          </p>
          <input
            type="file"
            multiple
            accept=".pdf"
            onChange={handleFileInput}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
          >
            Select PDFs
          </label>
        </div>
      </div>

      {/* Selected Files List */}
      {files.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Selected Files ({files.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-md"
              >
                <div className="flex items-center">
                  <FileText className="h-4 w-4 text-red-600 mr-2" />
                  <span className="text-sm text-gray-900 truncate">
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent h-6 w-6 p-0"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full mt-4"
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} PDF${files.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      )}

      {/* Upload Success Message */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center mb-2">
            <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
            <span className="text-sm text-green-800">
              Successfully uploaded {uploadedFiles.length} PDF{uploadedFiles.length > 1 ? 's' : ''}
            </span>
          </div>
          <ul className="list-disc list-inside text-sm text-green-700">
            {uploadedFiles.map((file, idx) => <li key={idx}>{file}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
