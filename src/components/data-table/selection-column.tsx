import type { ColumnDef } from "@tanstack/react-table";

export function createSelectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = !table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected();
        }}
        onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        aria-label="Seleccionar todo"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        aria-label="Seleccionar fila"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 32,
  };
}
