export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 w-20 bg-line rounded" />
      <div className="card space-y-3">
        <div className="flex gap-2">
          <div className="h-6 w-20 bg-line rounded-full" />
          <div className="h-6 w-12 bg-line rounded-full" />
        </div>
        <div className="h-7 w-2/3 bg-line rounded" />
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-2">
            <div className="h-3 w-12 bg-line rounded" />
            <div className="h-7 w-32 bg-line rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-12 bg-line rounded" />
            <div className="h-5 w-16 bg-line rounded" />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <div className="h-10 flex-1 bg-line rounded-xl" />
          <div className="h-10 w-20 bg-line rounded-xl" />
        </div>
      </div>
      <div className="h-5 w-40 bg-line rounded" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-14 bg-line/50" />
      ))}
    </div>
  );
}
