/**
 * Podcast player component for audio overview generation
 */

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PodcastSegment } from '@/types';

interface PodcastPlayerProps {
  podcast: PodcastSegment | null;
  loading?: boolean;
  onGenerate?: () => void;
}

export default function PodcastPlayer({
  podcast,
  loading = false,
  onGenerate
}: PodcastPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  /**
   * Handle play/pause toggle
   */
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  /**
   * Handle time update
   */
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  /**
   * Handle duration change
   */
  const handleDurationChange = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  /**
   * Handle seek
   */
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  /**
   * Format time in MM:SS
   */
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * Reset player when podcast changes
   */
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [podcast]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-3" />
          <span className="text-gray-600">Generating podcast...</span>
        </div>
      </div>
    );
  }

  if (!podcast && onGenerate) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
        <Volume2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Podcast Mode</h3>
        <p className="text-gray-600 mb-4">
          Generate an AI-narrated overview of the current section and related content
        </p>
        <Button onClick={onGenerate} className="inline-flex items-center">
          <Volume2 className="h-4 w-4 mr-2" />
          Generate Podcast
        </Button>
      </div>
    );
  }

  if (!podcast) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {podcast.title}
          </h3>
          <div className="flex items-center space-x-2 mt-1">
            <Badge variant="outline" className="bg-transparent text-xs">
              {formatTime(podcast.duration)}
            </Badge>
            <Badge variant="outline" className="bg-transparent text-xs">
              {podcast.relatedSections.length} sections
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent"
          onClick={() => {
            const link = document.createElement('a');
            link.href = podcast.audioUrl;
            link.download = `${podcast.title}.mp3`;
            link.click();
          }}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Audio Element */}
      <audio
        ref={audioRef}
        src={podcast.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />

      {/* Player Controls */}
      <div className="space-y-3">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={togglePlayPause}
            className="bg-transparent"
            disabled={!podcast.audioUrl}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          
          <div className="flex-1">
            <div
              className="bg-gray-200 h-2 rounded-full cursor-pointer relative"
              onClick={handleSeek}
            >
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%'
                }}
              />
            </div>
          </div>
          
          <div className="text-sm text-gray-500 min-w-[80px] text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Transcript Toggle */}
      {podcast.transcript && (
        <div className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTranscript(!showTranscript)}
            className="bg-transparent w-full"
          >
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </Button>
          
          {showTranscript && (
            <div className="bg-gray-50 rounded-lg p-4 max-h-40 overflow-y-auto">
              <p className="text-sm text-gray-700 leading-relaxed">
                {podcast.transcript}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Related Sections */}
      {podcast.relatedSections.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Related Sections:</h4>
          <div className="flex flex-wrap gap-2">
            {podcast.relatedSections.map((sectionId, index) => (
              <Badge
                key={index}
                variant="outline"
                className="bg-transparent text-xs cursor-pointer hover:bg-blue-50"
              >
                Section {index + 1}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
