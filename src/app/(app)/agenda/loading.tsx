export default function Loading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-7 w-16 bg-line rounded-full" />)}
      </div>
      <div className="h-6 w-48 bg-line rounded mx-auto" />
      <div className="card h-96 bg-line/50" />
    </div>
  );
}
