// Shared typed error so callers don't depend on Supabase specifics.

export class AppError extends Error {
  constructor(message, { cause, code } = {}) {
    super(message || 'Unexpected error')
    this.name = 'AppError'
    if (code) this.code = code
    if (cause) this.cause = cause
  }
}

// Convert a Supabase { data, error } response into a thrown AppError
// (or returns data when there is no error). Keeps service bodies small.
export function unwrap({ data, error }, fallbackMessage) {
  if (error) {
    throw new AppError(error.message || fallbackMessage || 'Request failed', { code: error.code })
  }
  return data
}

// Supabase POST/PUT RPC error responses occasionally come back as the
// function-returned error (e.g. "Registrant was not found or has already
// checked in"). Treat them as a real AppError.
export function unwrapRpc({ data, error }, fallbackMessage) {
  if (error) throw new AppError(error.message || fallbackMessage || 'Request failed', { code: error.code })
  return data
}