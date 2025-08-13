/**
 * Insights bulb component for contextual knowledge discovery
 */

import React, { useState, useEffect } from 'react';
import { Lightbulb, X, Loader2, Brain, AlertTriangle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Insight } from '@/types';

interface InsightsBulbProps {
  insights: Insight[];
  loading?: boolean;
  onRefresh?: () => void;
}

export default function InsightsBulb({
  insights,
  loading = false,
  onRefresh
}: InsightsBulbProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  /**
   * Get insight icon based on type
   */
  const getInsightIcon = (type: Insight['type']) => {
    switch (type) {
      case 'key_insight':
        return <Brain className="h-4 w-4" />;
      case 'did_you_know':
        return <Lightbulb className="h-4 w-4" />;
      case 'contradiction':
        return <AlertTriangle className="h-4 w-4" />;
      case 'connection':
        return <Link2 className="h-4 w-4" />;
      default:
        return <Lightbulb className="h-4 w-4" />;
    }
  };

  /**
   * Get insight color based on type
   */
  const getInsightColor = (type: Insight['type']): string => {
    switch (type) {
      case 'key_insight':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'did_you_know':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'contradiction':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'connection':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  /**
   * Format insight type for display
   */
  const formatInsightType = (type: Insight['type']): string => {
    switch (type) {
      case 'key_insight':
        return 'Key Insight';
      case 'did_you_know':
        return 'Did You Know?';
      case 'contradiction':
        return 'Contradiction';
      case 'connection':
        return 'Connection';
      default:
        return 'Insight';
    }
  };

  // Auto-open when new insights are available
  useEffect(() => {
    if (insights.length > 0 && !loading) {
      setIsOpen(true);
    }
  }, [insights, loading]);

  return (
    <>
      {/* Floating Bulb Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className={`h-14 w-14 rounded-full shadow-lg ${
            insights.length > 0 ? 'bg-yellow-500 hover:bg-yellow-600 animate-pulse' : 'bg-gray-600 hover:bg-gray-700'
          }`}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          ) : (
            <Lightbulb className={`h-6 w-6 ${insights.length > 0 ? 'text-white' : 'text-gray-300'}`} />
          )}
        </Button>
        {insights.length > 0 && !loading && (
          <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs">
            {insights.length}
          </Badge>
        )}
      </div>

      {/* Insights Panel */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center space-x-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                <h2 className="text-lg font-semibold">Insights</h2>
                {insights.length > 0 && (
                  <Badge variant="outline" className="bg-transparent">
                    {insights.length} insights found
                  </Badge>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {onRefresh && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={loading}
                    className="bg-transparent"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Refresh'
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="bg-transparent"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {loading ? (
                <div className="p-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                  <p className="text-gray-600">Generating insights...</p>
                </div>
              ) : insights.length === 0 ? (
                <div className="p-6 text-center">
                  <Lightbulb className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">No insights available</p>
                  <p className="text-sm text-gray-400">
                    Navigate through the document to discover insights
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-6 space-y-4">
                    {insights.map((insight, index) => (
                      <div
                        key={insight.id}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-sm transition-shadow cursor-pointer"
                        onClick={() => setSelectedInsight(insight)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            {getInsightIcon(insight.type)}
                            <Badge
                              variant="outline"
                              className={`text-xs ${getInsightColor(insight.type)}`}
                            >
                              {formatInsightType(insight.type)}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="flex">
                              {[...Array(5)].map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-2 h-2 rounded-full mr-1 ${
                                    i < Math.round(insight.relevance * 5)
                                      ? 'bg-yellow-400'
                                      : 'bg-gray-200'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                        
                        <h3 className="font-medium text-gray-900 mb-2">
                          {insight.title}
                        </h3>
                        
                        <p className="text-sm text-gray-700 mb-3">
                          {insight.content}
                        </p>
                        
                        {insight.sources.length > 0 && (
                          <div className="text-xs text-gray-500">
                            Sources: {insight.sources.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Insight Modal */}
      {selectedInsight && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  {getInsightIcon(selectedInsight.type)}
                  <Badge
                    variant="outline"
                    className={`text-xs ${getInsightColor(selectedInsight.type)}`}
                  >
                    {formatInsightType(selectedInsight.type)}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedInsight(null)}
                  className="bg-transparent"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <h3 className="text-lg font-semibold mb-3">
                {selectedInsight.title}
              </h3>
              
              <p className="text-gray-700 mb-4">
                {selectedInsight.content}
              </p>
              
              {selectedInsight.sources.length > 0 && (
                <div className="text-sm text-gray-500">
                  <strong>Sources:</strong> {selectedInsight.sources.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
