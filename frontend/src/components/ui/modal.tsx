import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
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

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const modalContent = (
    <div 
      className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center w-screen min-h-screen bg-black/60 backdrop-blur-sm"
      style={{ width: '100vw', height: '100vh', minHeight: '100dvh' }}
      onClick={onClose}
      aria-modal
      role="dialog"
    >
      <div 
        className={cn(
          "bg-surface rounded-lg shadow-2xl ring-1 ring-black/10 w-full mx-4 animate-in fade-in zoom-in-95 duration-200",
          sizes[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-textPrimary">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-background transition-colors"
            >
              <X className="w-5 h-5 text-textSecondary" />
            </button>
          </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
