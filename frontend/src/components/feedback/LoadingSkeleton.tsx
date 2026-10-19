import React from 'react';

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 4, className = '' }) => {
  return (
    <div className={`space-y-2.5 animate-pulse p-4 bg-white border border-[#E3E3DE] rounded ${className}`}>
      <div className="h-3.5 bg-[#EAEAE7] rounded w-1/4 mb-3" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-3">
          <div className="h-3 bg-[#EAEAE7] rounded w-1/4" />
          <div className="h-3 bg-[#F0F0EB] rounded w-1/2" />
          <div className="h-3 bg-[#EAEAE7] rounded w-1/4" />
        </div>
      ))}
    </div>
  );
};
