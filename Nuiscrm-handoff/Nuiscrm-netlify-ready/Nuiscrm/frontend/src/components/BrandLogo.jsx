// Recreation of the התאחדות הסטודנטים והסטודנטיות הארצית logo
// (slanted box with offset shadow + stacked wordmark) per the brand book.
export default function BrandLogo({ size = 48, onLight = false }) {
  const boxFill = onLight ? '#FFFFFF' : '#FFFFFF';
  const shadowFill = onLight ? '#052941' : '#F2055D';
  const textFill = '#052941';
  const stroke = '#052941';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 132"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="התאחדות הסטודנטים והסטודנטיות הארצית"
      style={{ flexShrink: 0 }}
    >
      <g transform="rotate(-5 70 66)">
        {/* offset shadow box */}
        <rect x="30" y="26" width="92" height="86" rx="14" fill={shadowFill} />
        {/* front box */}
        <rect x="20" y="18" width="92" height="86" rx="14" fill={boxFill} stroke={stroke} strokeWidth="5" />
        {/* stacked wordmark */}
        <text x="66" y="42" textAnchor="middle" fontFamily="Heebo, Rubik, sans-serif" fontWeight="800" fontSize="15.5" fill={textFill}>התאחדות</text>
        <text x="66" y="60" textAnchor="middle" fontFamily="Heebo, Rubik, sans-serif" fontWeight="800" fontSize="15.5" fill={textFill}>הסטודנטים</text>
        <text x="66" y="78" textAnchor="middle" fontFamily="Heebo, Rubik, sans-serif" fontWeight="800" fontSize="14" fill={textFill}>והסטודנטיות</text>
        <text x="66" y="95" textAnchor="middle" fontFamily="Heebo, Rubik, sans-serif" fontWeight="800" fontSize="15.5" fill={textFill}>הארצית</text>
      </g>
    </svg>
  );
}
