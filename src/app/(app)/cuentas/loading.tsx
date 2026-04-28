export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 bg-line rounded" />
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-line rounded-xl" />
          <div className="h-9 w-20 bg-line rounded-xl" />
        </div>
      </div>
      <div className="h-8 w-48 bg-line rounded" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-16 bg-line/50" />
      ))}
    </div>
  );
}
