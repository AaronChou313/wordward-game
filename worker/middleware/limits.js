export async function consumeLimit(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return { allowed: true };
  try {
    const result = await binding.limit({ key: String(key) });
    return { allowed: result?.success !== false };
  } catch {
    return { allowed: true };
  }
}
