import React from 'react';

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 4, className = '' }) => {
  return (
    <div className={`space-y-3 animate-pulse p-4 ${className}`}>
      <div className="h-4 bg-slate-800 rounded w-1/3 mb-4" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          <div className="h-3.5 bg-slate-800/80 rounded w-1/4" />
          <div className="h-3.5 bg-slate-800/60 rounded w-1/2" />
          <div className="h-3.5 bg-slate-800/70 rounded w-1/4" />
        </div>
      ))}
    </div>
  );
};
