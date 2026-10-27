/** Builds a sized Unsplash URL. Demo imagery only; stage 6 moves media to object storage. */
export function photo(id: string, width = 1200, height?: number): string {
  const size = height ? `&h=${height}&fit=crop` : '';
  return `https://images.unsplash.com/photo-${id}?auto=format&q=75&w=${width}${size}`;
}
