export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-7 w-20 bg-line rounded-full" />)}
      </div>
      {[0, 1, 2].map((i) => <div key={i} className="card h-20 bg-line/50" />)}
    </div>
  );
}
