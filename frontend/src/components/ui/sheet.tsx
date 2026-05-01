import { X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: 'left' | 'right';
  className?: string;
}

export function Sheet(props: SheetProps) {
  const { isOpen, onClose, title, children, side = 'right', className } = props;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const titleBlock = title ? (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
      <h2 className="text-lg font-semibold text-textPrimary">{title}</h2>
      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-background transition-colors"
        type="button"
      >
        <X className="w-5 h-5 text-textSecondary" />
      </button>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          'fixed top-0 bottom-0 z-50 w-full max-w-lg bg-surface shadow-xl flex flex-col',
          side === 'right' ? 'right-0' : 'left-0',
          className
        )}
      >
        {titleBlock}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
