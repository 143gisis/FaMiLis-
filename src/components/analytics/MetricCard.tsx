export function MetricCard({
  icon,
  iconBg,
  title,
  value,
}: {
  icon: string;
  iconBg: string;
  title: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
      <span
        className={`text-2xl w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0 ${iconBg}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-semibold">{title}</p>
        <p className="text-2xl leading-none text-gray-900 font-bold mt-1">{value}</p>
      </div>
    </div>
  );
}
