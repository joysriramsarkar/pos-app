import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export function AuditLogs() {
  const t = useTranslations('AuditLogs');
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
      if (!res.ok) throw new Error(t('loading'));
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setTotalPages(data.pagination.totalPages);
      } else {
        setError(data.error || t('loading'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loading'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);

    const handleSyncComplete = () => fetchLogs(page);
    window.addEventListener('offlineSyncComplete', handleSyncComplete);
    return () => window.removeEventListener('offlineSyncComplete', handleSyncComplete);
  }, [page]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">{t('title')}</h2>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('subtitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <div className="text-red-500 mb-4">{error}</div>}

            <div className="rounded-md border hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('time')}</TableHead>
                    <TableHead>{t('user')}</TableHead>
                    <TableHead>{t('action')}</TableHead>
                    <TableHead>{t('entity')}</TableHead>
                    <TableHead>{t('ip')}</TableHead>
                    <TableHead>{t('details')}</TableHead>
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
                        {t('no_logs')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          {log.user ? `${log.user.name} (${log.user.username})` : t('system_unknown')}
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
                        <TableCell className="max-w-xs truncate text-xs" title={typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}>
                          {typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || '-')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile View */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {loading && logs.length === 0 ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  {t('no_logs')}
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-semibold">
                        {log.user ? `${log.user.name} (${log.user.username})` : t('system_unknown')}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{log.action}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">
                      {format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}
                    </div>
                    <div className="text-sm mt-1">
                      <span className="text-muted-foreground">{t('entity')}:</span> <span className="font-medium">{log.entityType} {log.entityId ? `(#${log.entityId.slice(-6)})` : ''}</span>
                    </div>
                    <div className="text-xs bg-muted/50 p-2 rounded mt-1 truncate" title={typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}>
                      {typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || '-')}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => p - 1)}
              >
                {t('previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('page_of', { page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => p + 1)}
              >
                {t('next')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
