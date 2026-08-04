export async function consumeLimit(binding, key) {
  if (binding == null) return { allowed: true };
  if (typeof binding.limit !== 'function') return { allowed: false };
  try {
    const result = await binding.limit({ key: String(key) });
    return { allowed: result?.success === true };
  } catch {
    return { allowed: false };
  }
}
