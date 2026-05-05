import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { statisticsService } from '@/services/statisticsService';
import type { MetricDefinition } from '@/services/statisticsService';

interface DeleteMetricDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  metrics: MetricDefinition[];
}

export default function DeleteMetricDialog({ isOpen, onClose, onSuccess, metrics }: DeleteMetricDialogProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) {
      setError('Выберите метрику');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await statisticsService.deleteMetric(code);
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (err as Error)?.message || 'Ошибка при удалении метрики';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCode('');
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Удалить определение метрики" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {metrics.length === 0 ? (
          <p className="text-sm text-textSecondary">Нет созданных метрик для удаления.</p>
        ) : (
          <>
            {error && (
              <div className="rounded-md border border-primary/20 bg-primarySoft p-3 text-sm text-primary">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="delete-metric-code" className="text-sm font-medium text-textPrimary">
                Метрика (удалить можно только если нет назначений в матрице)
              </label>
              <select
                id="delete-metric-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="select-std"
                disabled={loading}
              >
                <option value="">— выбрать —</option>
                {metrics.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" variant="primary" disabled={loading || !code}>
                {loading ? 'Удаление...' : 'Удалить'}
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
