"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1.5rem),28rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--edge)] bg-[var(--raised)] p-5 shadow-2xl sm:p-6">
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--muted)]">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-3 min-[360px]:flex-row min-[360px]:justify-end">
            <AlertDialog.Cancel className="min-h-11 rounded-lg px-4">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className="min-h-11 rounded-lg bg-[var(--accent)] px-4 font-medium text-black"
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
