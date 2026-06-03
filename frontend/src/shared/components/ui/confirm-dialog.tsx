import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

export interface ConfirmOptions {
  /** Heading shown at the top of the dialog. */
  title: string;
  /** Optional supporting text. */
  description?: React.ReactNode;
  /** Label of the confirm button. Defaults to "Confirmar". */
  confirmText?: string;
  /** Label of the cancel button. Defaults to "Cancelar". */
  cancelText?: string;
  /** Visual tone of the confirm button. */
  tone?: 'default' | 'destructive';
  /** Hide the warning icon (shown by default for destructive). */
  hideIcon?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

const DEFAULTS: Required<Pick<ConfirmOptions, 'confirmText' | 'cancelText' | 'tone'>> = {
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  tone: 'default',
};

/**
 * Provides an imperative, promise-based confirmation dialog.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: '¿Eliminar?', tone: 'destructive' })) { ... }
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const settle = React.useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    // If a previous confirm is still pending, resolve it as cancelled.
    resolverRef.current?.(false);
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const merged = { ...DEFAULTS, ...options } as ConfirmOptions & typeof DEFAULTS;
  const isDestructive = merged.tone === 'destructive';
  const showIcon = !merged.hideIcon && isDestructive;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <div className={cn('flex items-start gap-3', showIcon ? 'text-left' : '')}>
              {showIcon && (
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </span>
              )}
              <div className="space-y-1.5 min-w-0">
                <DialogTitle>{merged.title}</DialogTitle>
                {merged.description && <DialogDescription>{merged.description}</DialogDescription>}
              </div>
            </div>
          </DialogHeader>

          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => settle(false)}>
              {merged.cancelText}
            </Button>
            <Button
              variant={isDestructive ? 'destructive' : 'default'}
              onClick={() => settle(true)}
              autoFocus
            >
              {merged.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a <ConfirmProvider>');
  return ctx;
}
