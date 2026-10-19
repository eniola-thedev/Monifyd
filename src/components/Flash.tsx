export function Flash({ error, message }: { error?: string; message?: string }) {
  if (error) return <p className="flash err" role="alert">{error}</p>;
  if (message) return <p className="flash ok" role="status">{message}</p>;
  return null;
}
