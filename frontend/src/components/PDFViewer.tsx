/**
 * PDF viewer component using Adobe PDF Embed API
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface PDFViewerProps {
  documentId: string;
  documentUrl: string;
  onPageChange?: (pageNumber: number) => void;
  onTextSelect?: (selection: any) => void;
  highlights?: Array<{
    pageNumber: number;
    position: { x: number; y: number; width: number; height: number };
    color: string;
  }>;
}

// Read Adobe Client ID from global variable injected in index.html
const adobeClientId =
  (window as any).ADOBE_CLIENT_ID || '';

export default function PDFViewer({
  documentId,
  documentUrl,
  onPageChange,
  onTextSelect,
  highlights = []
}: PDFViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const adobeDCViewRef = useRef<any>(null);

  /**
   * Initialize the viewer
   */
  const initializeViewer = () => {
    if (!window.AdobeDC || !viewerRef.current) return;

    if (!adobeClientId) {
      console.error("Missing Adobe Client ID. Set window.ADOBE_CLIENT_ID in index.html");
      setError("Missing Adobe Client ID.");
      setLoading(false);
      return;
    }

    const adobeDCView = new window.AdobeDC.View({
      clientId: adobeClientId,
      divId: `adobe-dc-view-${documentId}`,
    });

    adobeDCView.previewFile(
      {
        content: { location: { url: documentUrl } },
        metaData: { fileName: `document-${documentId}.pdf` }
      },
      {
        embedMode: 'SIZED_CONTAINER',
        focusOnRendering: true,
        showAnnotationTools: false,
        showDownloadPDF: false,
        showPrintPDF: false,
        showLeftHandPanel: false,
        showZoomControl: true,
      }
    );

    // Register event listeners
    adobeDCView.registerCallback(
      window.AdobeDC.View.Enum.CallbackType.EVENT_LISTENER,
      (event: any) => {
        if (event.type === 'PAGE_VIEW' && onPageChange) {
          onPageChange(event.data.pageNumber);
        }
        if (event.type === 'TEXT_SELECTION' && onTextSelect) {
          onTextSelect(event.data);
        }
      },
      { enablePDFAnalytics: false }
    );

    adobeDCViewRef.current = adobeDCView;
    setLoading(false);
  };

  /**
   * Load Adobe PDF Embed API and initialize
   */
  useEffect(() => {
    setLoading(true);

    if (!window.AdobeDC) {
      const script = document.createElement('script');
      script.src = 'https://documentcloud.adobe.com/view-sdk/main.js';
      script.onload = initializeViewer;
      script.onerror = () => {
        setError('Failed to load Adobe PDF SDK');
        setLoading(false);
      };
      document.body.appendChild(script);
    } else {
      initializeViewer();
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.innerHTML = '';
      }
    };
  }, [documentId, documentUrl]);

  /**
   * Apply highlights
   */
  useEffect(() => {
    if (
      adobeDCViewRef.current &&
      typeof adobeDCViewRef.current.getAnnotationManager === 'function' &&
      highlights.length > 0
    ) {
      const manager = adobeDCViewRef.current.getAnnotationManager();
      highlights.forEach((highlight, index) => {
        try {
          manager.addAnnotation({
            type: 'highlight',
            page: highlight.pageNumber,
            bounds: highlight.position,
            color: highlight.color,
            id: `highlight-${index}`,
          });
        } catch (error) {
          console.error('Failed to add highlight:', error);
        }
      });
    }
  }, [highlights]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load PDF</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-gray-100 rounded-lg overflow-hidden">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Loading PDF...</p>
          </div>
        </div>
      )}
      <div
        ref={viewerRef}
        id={`adobe-dc-view-${documentId}`}
        className="h-full w-full"
        style={{ minHeight: '600px' }}
      />
    </div>
  );
}

// Extend window interface for Adobe DC
declare global {
  interface Window {
    AdobeDC: any;
    ADOBE_CLIENT_ID?: string;
  }
}
