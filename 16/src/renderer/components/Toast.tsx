interface ToastProps {
  type: 'success' | 'error';
  message: string;
}

export default function Toast({ type, message }: ToastProps) {
  return (
    <div className={`toast ${type}`}>
      <span>{type === 'success' ? '✓' : '✗'}</span>
      <span>{message}</span>
    </div>
  );
}
