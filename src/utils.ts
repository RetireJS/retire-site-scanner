export const unique = (data: string[]): string[] => {
  return Array.from(new Set<string>(data));
};
