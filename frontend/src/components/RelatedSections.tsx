/**
 * Related sections panel showing document connections
 */

import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, ExternalLink, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RelatedSection } from '@/types';

interface RelatedSectionsProps {
  sections: RelatedSection[];
  onSectionClick: (section: RelatedSection) => void;
  loading?: boolean;
}

export default function RelatedSections({
  sections,
  onSectionClick,
  loading = false
}: RelatedSectionsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  /**
   * Toggle section expansion
   */
  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  /**
   * Get relevance color based on score
   */
  const getRelevanceColor = (score: number): string => {
    if (score >= 0.8) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  /**
   * Get relevance label
   */
  const getRelevanceLabel = (score: number): string => {
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    return 'Low';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-gray-200 rounded"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center space-x-2 mb-2">
          <BookOpen className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Related Sections</h2>
        </div>
        <p className="text-sm text-gray-600">
          Found {sections.length} related section{sections.length !== 1 ? 's' : ''} across documents
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {sections.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No related sections found</p>
              <p className="text-sm text-gray-400 mt-1">
                Try selecting text or navigating to different pages
              </p>
            </div>
          ) : (
            sections.map((section, index) => (
              <div
                key={section.id}
                className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => toggleSection(section.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 mb-1 truncate">
                        {section.documentName}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">
                          Page {section.pageNumber}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${getRelevanceColor(section.relevanceScore)}`}
                        >
                          {getRelevanceLabel(section.relevanceScore)} ({Math.round(section.relevanceScore * 100)}%)
                        </Badge>
                      </div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 text-gray-400 transition-transform ${
                        expandedSections.has(section.id) ? 'rotate-90' : ''
                      }`}
                    />
                  </div>

                  <p className="text-sm text-gray-700 line-clamp-2">
                    {section.snippet}
                  </p>
                </div>

                {expandedSections.has(section.id) && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="mt-3 space-y-3">
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                          Full Content
                        </h4>
                        <p className="text-sm text-gray-700">
                          {section.content}
                        </p>
                      </div>
                      
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-transparent flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSectionClick(section);
                          }}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Section
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-transparent"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Zap className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
