export default function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="512" height="512" rx="96" fill="#0b0d10" />
      <rect x="40" y="40" width="432" height="432" rx="80" fill="none" stroke="#22262d" strokeWidth="6" />
      <path
        d="M150 130 h140 a112 112 0 0 1 0 224 H150 z M210 186 v112 h78 a56 56 0 0 0 0-112 z"
        fill="#7dd3fc"
      />
      <circle cx="370" cy="380" r="22" fill="#4ade80" />
    </svg>
  );
}
