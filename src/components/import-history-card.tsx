import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { deleteImportBatch } from "@/app/importar/actions";
import { formatDate } from "@/lib/format";

type ImportBatch = {
  id: number;
  accountName: string;
  fileName: string;
  transactionCount: number;
  skippedDuplicates: number;
  createdAt: Date;
};

export function ImportHistoryCard({
  batches,
  emptyMessage,
}: {
  batches: ImportBatch[];
  /** Shown instead of the table when there's no history yet. Omit to hide
   * the whole card in that case (e.g. right on the import page itself,
   * where an empty history isn't worth a whole section). */
  emptyMessage?: string;
}) {
  if (batches.length === 0 && !emptyMessage) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de importaciones</CardTitle>
        <CardDescription>
          Cada importación queda registrada — si algo salió mal, elimina el lote completo en vez
          de borrar transacciones una por una.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Archivo</TableHead>
                <TableHead className="text-right">Transacciones</TableHead>
                <TableHead className="text-right">Duplicados omitidos</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-muted-foreground">{formatDate(b.createdAt)}</TableCell>
                  <TableCell className="font-medium">{b.accountName}</TableCell>
                  <TableCell className="max-w-[240px] truncate">{b.fileName}</TableCell>
                  <TableCell className="text-right">{b.transactionCount}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {b.skippedDuplicates > 0 ? b.skippedDuplicates : "—"}
                  </TableCell>
                  <TableCell>
                    <DeleteButton
                      action={deleteImportBatch.bind(null, b.id)}
                      confirmMessage={`¿Eliminar esta importación completa? Se eliminarán las ${b.transactionCount} transacciones de "${b.fileName}".`}
                      successMessage="Importación eliminada"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
