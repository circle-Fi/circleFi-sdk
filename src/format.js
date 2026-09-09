export const short = (a) => (a ? `${a.slice(0, 5)}...${a.slice(-5)}` : '');

/** Token units are integers; this is the only place that knows about decimals. */
export function amount(units, decimals, symbol) {
  const v = BigInt(units ?? 0);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const scale = 10n ** BigInt(decimals);
  const frac = (abs % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${abs / scale}${frac ? '.' + frac : ''} ${symbol}`;
}

/** Parse what a person typed into integer token units, without float drift. */
export function toUnits(text, decimals) {
  const t = String(text).trim();
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  const [whole = '0', frac = ''] = t.split('.');
  if (frac.length > decimals) return null;
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((frac || '0').padEnd(decimals, '0') || '0');
}

export function duration(seconds) {
  const s = Number(seconds);
  if (s % 86400 === 0 && s >= 86400) { const d = s / 86400; return d === 1 ? 'a day' : `${d} days`; }
  if (s % 3600 === 0 && s >= 3600) { const h = s / 3600; return h === 1 ? 'an hour' : `${h} hours`; }
  if (s % 60 === 0 && s >= 60) return `${s / 60} min`;
  return `${s}s`;
}

export function remaining(endsAt) {
  const left = Number(endsAt) - Math.floor(Date.now() / 1000);
  if (left <= 0) return 'the window has closed';
  if (left < 3600) return `${Math.ceil(left / 60)} min left`;
  if (left < 86400) return `${Math.floor(left / 3600)} h left`;
  return `${Math.floor(left / 86400)} d left`;
}

export const STATUS = ['forming', 'active', 'complete'];
export const statusOf = (raw) => STATUS[Number(raw)] ?? 'forming';
