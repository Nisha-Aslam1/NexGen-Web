import React, { useEffect, useState } from 'react';

interface MasonryGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => string;
  estimateWeight?: (item: T) => number;
  maxCols?: 2 | 3;
  gapClass?: string;
}

function getViewportCols(maxCols: number): number {
  if (typeof window === 'undefined') return maxCols;
  const w = window.innerWidth;
  if (w >= 1024) return maxCols;
  if (w >= 768) return Math.min(2, maxCols);
  return 1;
}

export function MasonryGrid<T>({
  items,
  renderItem,
  getKey,
  estimateWeight,
  maxCols = 3,
  gapClass = 'gap-7'
}: MasonryGridProps<T>) {
  const [viewportCols, setViewportCols] = useState<number>(() => getViewportCols(maxCols));

  useEffect(() => {
    const updateCols = () => setViewportCols(getViewportCols(maxCols));
    updateCols();
    window.addEventListener('resize', updateCols);
    return () => window.removeEventListener('resize', updateCols);
  }, [maxCols]);

  if (items.length === 0) return null;

  const activeCols = Math.max(1, Math.min(viewportCols, items.length));
  const columns: Array<Array<{ item: T; index: number }>> = Array.from({ length: activeCols }, () => []);
  const colHeights: number[] = Array.from({ length: activeCols }, () => 0);

  items.forEach((item, index) => {
    const weight = estimateWeight ? Math.max(0.5, estimateWeight(item)) : 1;
    let targetCol = index % activeCols;

    // Keep the top row strictly left-to-right; pack subsequent items into the lightest column
    if (index >= activeCols && estimateWeight) {
      let minHeight = colHeights[0];
      targetCol = 0;
      for (let c = 1; c < activeCols; c++) {
        if (colHeights[c] < minHeight) {
          minHeight = colHeights[c];
          targetCol = c;
        }
      }
    }

    columns[targetCol].push({ item, index });
    colHeights[targetCol] += weight;
  });

  const gridColsClass =
    activeCols === 1
      ? items.length === 1
        ? 'grid-cols-1 max-w-xl mx-auto'
        : 'grid-cols-1'
      : activeCols === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  return (
    <div className={`grid items-start ${gridColsClass} ${gapClass}`}>
      {columns.map((colItems, colIndex) => (
        <div key={colIndex} className={`flex flex-col ${gapClass}`}>
          {colItems.map(({ item, index }) => (
            <React.Fragment key={getKey(item, index)}>
              {renderItem(item, index)}
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
