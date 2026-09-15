export default function Loading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-7 w-32 bg-line rounded" />
      <div className="h-9 bg-line rounded-full" />
      <div className="card h-40 bg-line/50" />
      <div className="card h-32 bg-line/50" />
    </div>
  );
}
