export function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-gray-600">
      <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      <span className="text-sm">Loading...</span>
    </div>
  );
}
