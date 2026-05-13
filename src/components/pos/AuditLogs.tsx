import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async (pageIndex: number) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/audit-logs?page=${pageIndex}&limit=50`);
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setTotalPages(data.pagination.totalPages);
      } else {
        setError(data.error || 'Failed to fetch logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);

    const handleSyncComplete = () => fetchLogs(page);
    window.addEventListener('offlineSyncComplete', handleSyncComplete);

    return () => {
      window.removeEventListener('offlineSyncComplete', handleSyncComplete);
    };
  }, [page]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Audit Logs</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="text-red-500 mb-4">{error}</div>}
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No audit logs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        {log.user ? `${log.user.name} (${log.user.username})` : 'System / Unknown'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell>
                        {log.entityType} {log.entityId ? `(#${log.entityId.slice(-6)})` : ''}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.ipAddress || '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs" title={log.details}>
                        {log.details || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button 
              variant="outline" 
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button 
              variant="outline" 
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
