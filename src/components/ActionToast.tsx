type ActionToastProps = {
  message: string | null
}

export function ActionToast({ message }: ActionToastProps) {
  if (!message) return null
  return (
    <div className="action-toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
