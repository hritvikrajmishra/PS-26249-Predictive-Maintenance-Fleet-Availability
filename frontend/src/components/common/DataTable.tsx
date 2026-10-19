import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSkeleton } from '../feedback/LoadingSkeleton';
import { EmptyState } from '../feedback/EmptyState';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T extends object>({
  columns,
  data,
  loading = false,
  emptyTitle,
  emptyMessage,
  onRowClick,
  pagination,
}: DataTableProps<T>): React.JSX.Element {
  if (loading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div className="w-full flex flex-col space-y-2.5">
      <div className="overflow-x-auto rounded border border-[#E3E3DE] bg-white">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E3E3DE] bg-[#FAFAF8] text-[#5C5C57] font-mono uppercase text-[11px] tracking-wider select-none sticky top-0 z-10">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`py-2.5 px-3.5 font-semibold ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECECE8] font-mono text-[#1A1A1A]">
            {data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                onClick={() => onRowClick && onRowClick(row)}
                className={`transition-colors duration-100 ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-[#F6F6F3]'
                    : 'hover:bg-[#FAFAF8]'
                }`}
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className={`py-2.5 px-3.5 tabular-nums ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    } ${col.className || ''}`}
                  >
                    {col.render
                      ? col.render(row, rowIdx)
                      : col.accessorKey
                      ? String((row as Record<string, unknown>)[col.accessorKey as string] ?? '—')
                      : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-1 text-xs font-mono text-[#5C5C57]">
          <div>
            Page <span className="font-semibold text-[#1A1A1A]">{pagination.currentPage}</span> of{' '}
            <span className="font-semibold text-[#1A1A1A]">{pagination.totalPages}</span> ({pagination.totalItems} records)
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage <= 1}
              className="p-1 rounded border border-[#E3E3DE] bg-white hover:bg-[#F6F6F3] text-[#5C5C57] disabled:opacity-40 disabled:pointer-events-none transition"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 py-0.5 font-semibold text-[#1A1A1A] bg-[#FAFAF8] rounded border border-[#E3E3DE]">
              {pagination.currentPage}
            </span>
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage >= pagination.totalPages}
              className="p-1 rounded border border-[#E3E3DE] bg-white hover:bg-[#F6F6F3] text-[#5C5C57] disabled:opacity-40 disabled:pointer-events-none transition"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
