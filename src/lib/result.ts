/**
 * Result<T, E> — a lightweight discriminated union used by the pure logic
 * cores (Money, Catalog, Cart, etc.) to represent success or a domain error
 * without throwing. See design.md "Layering and separation of concerns".
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

/** Construct a successful Result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Construct a failed Result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard narrowing a Result to its success case. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard narrowing a Result to its error case. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}
