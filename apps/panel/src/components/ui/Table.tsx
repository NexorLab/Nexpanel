import type { ReactNode } from "react";
import "./Table.css";

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
  width?: string;
}

interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  empty?: ReactNode;
  skeletonRows?: number;
}

export default function Table<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  skeletonRows = 5,
}: TableProps<Row>) {
  const alignClass = (align?: string) =>
    align ? `table-cell-${align}` : "table-cell-start";

  if (!loading && rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={alignClass(column.align)}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      <div className="skeleton table-skeleton-cell" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key} className={alignClass(column.align)}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
