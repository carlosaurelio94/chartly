export default function Loading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 bg-line rounded" />
        <div className="h-6 w-48 bg-line rounded" />
      </div>
      <div className="h-3 w-32 bg-line rounded" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-72 shrink-0 card h-64 bg-line/40" />
        ))}
      </div>
    </div>
  );
}
