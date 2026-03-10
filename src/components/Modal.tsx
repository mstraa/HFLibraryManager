interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: string;
  children: React.ReactNode;
  /** Prevent closing on backdrop click (e.g. while loading) */
  preventClose?: boolean;
}

export default function Modal({
  open,
  onClose,
  title,
  maxWidth = "max-w-md",
  children,
  preventClose = false,
}: ModalProps) {
  if (!open) return null;

  function handleBackdropClick(e: React.MouseEvent) {
    if (!preventClose && e.target === e.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={handleBackdropClick}>
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full ${maxWidth} mx-4 p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
