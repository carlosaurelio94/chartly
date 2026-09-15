export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="card space-y-3">
        <div className="h-3 w-16 bg-line rounded" />
        <div className="h-10 w-40 bg-line rounded" />
        <div className="grid grid-cols-2 gap-2">
          <div className="card-sm h-16 bg-line/50" />
          <div className="card-sm h-16 bg-line/50" />
        </div>
        <div className="h-16 bg-line/40 rounded-xl" />
      </div>
      <div className="h-3 w-32 bg-line rounded" />
      {[0, 1].map((i) => (
        <div key={i} className="card-sm h-14 bg-line/50" />
      ))}
    </div>
  );
}
