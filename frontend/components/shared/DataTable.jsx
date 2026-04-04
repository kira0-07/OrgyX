import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

export default function DataTable({ 
  columns, 
  data, 
  onRowClick,
  defaultSortField = null
}) {
  const [sortField, setSortField] = useState(defaultSortField);
  const [sortDirection, setSortDirection] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default new sort to desc
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortField) return 0;
    
    // Support nested paths (e.g. 'employee.firstName')
    const getVal = (obj, path) => path.split('.').reduce((acc, part) => acc && acc[part], obj);
    
    const valA = getVal(a, sortField);
    const valB = getVal(b, sortField);

    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    let res = 0;
    if (typeof valA === 'string' && typeof valB === 'string') {
      res = valA.localeCompare(valB);
    } else {
      res = valA > valB ? 1 : valA < valB ? -1 : 0;
    }

    return sortDirection === 'asc' ? res : -res;
  });

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border/50 bg-card shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="bg-surface-hover/50 text-xs uppercase text-muted-foreground border-b border-border">
          <tr>
            {columns.map((col, idx) => (
              <th 
                key={idx} 
                className={`py-3 px-4 font-semibold tracking-wider ${col.sortable ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''} ${col.align === 'right' ? 'text-right' : ''}`}
                onClick={() => col.sortable && handleSort(col.sortField || col.accessor)}
              >
                <div className={`flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : ''}`}>
                  {col.header}
                  {col.sortable && (
                    <span className="flex items-center opacity-50">
                      {sortField === (col.sortField || col.accessor) ? (
                        sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50 text-foreground">
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                No data available
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIndex) => (
              <tr 
                key={row.id || rowIndex} 
                onClick={() => onRowClick && onRowClick(row)}
                className={`transition-colors duration-150 ${onRowClick ? 'cursor-pointer hover:bg-surface-hover/70' : ''}`}
              >
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className={`py-4 px-4 ${col.align === 'right' ? 'text-right' : ''}`}>
                    {col.cell ? col.cell(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
