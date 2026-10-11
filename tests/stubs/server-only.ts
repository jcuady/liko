/**
 * Stub for the `server-only` package, used only by Vitest.
 *
 * The real package throws on import outside a React Server Component graph, and
 * Vitest has no such graph, so a unit test for a server module could never
 * import it. Aliasing it here keeps the guard in the application, where it
 * belongs, and out of the test runner, where it would only prove that the
 * import guard exists.
 */
export {};