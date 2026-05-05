import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { statisticsService } from '@/services/statisticsService';

interface CreateMetricDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateMetricDialog({ isOpen, onClose, onSuccess }: CreateMetricDialogProps) {
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [unit, setUnit] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code || !name || !unit) {
            setError('Заполните все поля');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await statisticsService.createMetric({ code, name, unit });
            onSuccess();
            handleClose();
        } catch (err: unknown) {
            const msg = (err as any)?.response?.data?.error || (err as Error)?.message || 'Ошибка при создании метрики';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setCode('');
        setName('');
        setUnit('');
        setError(null);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Создать новую метрику" size="sm">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="rounded-md border border-primary/20 bg-primarySoft p-3 text-sm text-primary">
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label htmlFor="metric-code" className="text-sm font-medium text-textPrimary">Код (латиница)</label>
                    <Input
                        id="metric-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="sales_calls"
                        disabled={loading}
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="metric-name" className="text-sm font-medium text-textPrimary">Название</label>
                    <Input
                        id="metric-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Звонки"
                        disabled={loading}
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="metric-unit" className="text-sm font-medium text-textPrimary">Единица измерения</label>
                    <Input
                        id="metric-unit"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        placeholder="шт"
                        disabled={loading}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                        Отмена
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Создание...' : 'Создать'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
