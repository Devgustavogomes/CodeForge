export interface SanitizeProjectNameOptions {
  /**
   * Fallback string to return if the sanitized name ends up empty.
   * Defaults to empty string `""`.
   */
  fallback?: string;

  /**
   * Maximum character length of the sanitized project name.
   * If exceeded, the name is truncated cleanly without trailing separators.
   */
  maxLength?: number;

  /**
   * Whether to transform the result to lower case.
   * Defaults to `true`.
   */
  toLowerCase?: boolean;

  /**
   * Separator character used to replace whitespace and disallowed symbols.
   * Defaults to `"-"`.
   */
  separator?: string;
}

/**
 * Sanitizes an arbitrary string into a safe, URL- and filesystem-friendly project name.
 *
 * Rules:
 * - Trims leading and trailing whitespace.
 * - Decomposes and strips accents / diacritics (e.g., 'ç' -> 'c', 'é' -> 'e').
 * - Normalizes case to lowercase by default.
 * - Replaces whitespace, invalid filesystem characters and non-alphanumeric symbols with the separator.
 * - Collapses consecutive separators.
 * - Trims leading and trailing separators.
 * - Enforces maxLength if specified (trimming any trailing separators created by truncation).
 * - Returns `fallback` if the resulting string is empty.
 *
 * @param name The input project name to sanitize.
 * @param options Optional configuration options.
 * @returns The sanitized project name.
 */
export function sanitizeProjectName(
  name: string,
  options: SanitizeProjectNameOptions = {},
): string {
  const {
    fallback = '',
    maxLength,
    toLowerCase = true,
    separator = '-',
  } = options;

  if (typeof name !== 'string') {
    return fallback;
  }

  // 1. Normalize unicode diacritics / accents (NFD decomposition + strip combining marks)
  let result = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 2. Case handling
  if (toLowerCase) {
    result = result.toLowerCase();
  }

  // 3. Replace path traversal patterns and directory separators
  result = result.replace(/[\\/]+/g, separator);

  // 4. Escape separator if used in regex pattern
  const escapedSep = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 5. Replace any character that is not alphanumeric, underscore, or separator
  const invalidCharPattern = new RegExp(`[^a-zA-Z0-9_${escapedSep}]+`, 'g');
  result = result.replace(invalidCharPattern, separator);

  // 6. Collapse multiple consecutive separators or underscores/separators
  const consecutiveSepPattern = new RegExp(`${escapedSep}{2,}`, 'g');
  result = result.replace(consecutiveSepPattern, separator);

  // 7. Strip leading and trailing separators, underscores, dots, or whitespace
  const trimPattern = new RegExp(`^[${escapedSep}_\\s.]+|[${escapedSep}_\\s.]+$`, 'g');
  result = result.replace(trimPattern, '');

  // 8. Enforce maximum length if specified
  if (typeof maxLength === 'number' && maxLength > 0 && result.length > maxLength) {
    result = result.slice(0, maxLength);
    // Truncation might have split at a separator or left a trailing separator
    result = result.replace(new RegExp(`[${escapedSep}_]+$`, 'g'), '');
  }

  return result.length > 0 ? result : fallback;
}

/**
 * Validates whether a project name follows standard slug / identifier conventions:
 * - Starts with an alphanumeric character
 * - Ends with an alphanumeric character
 * - Contains only lowercase alphanumeric characters, hyphens, and underscores
 * - Is between 1 and 214 characters (npm package name limit standard)
 *
 * @param name The project name to validate.
 * @returns `true` if valid, `false` otherwise.
 */
export function isValidProjectName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > 214) {
    return false;
  }

  // Single character valid name
  if (/^[a-z0-9]$/.test(name)) {
    return true;
  }

  // Starts and ends with alphanumeric, middle can contain hyphens, underscores, or alphanumeric
  return /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(name);
}
