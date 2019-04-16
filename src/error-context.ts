/**
 * Gets the function name, or returns <anonymous> if it's unnamed.
 */
export const getFunctionName = (fn: Function) => fn.name || `<anonymous>`;

/**
 * Error context object thrown.
 */
export class ErrorContext {
  public readonly epicName: string;
  public readonly epicSource: string;

  constructor(
    sourceFunction: Function,
    public readonly error: Error,
    public readonly innerError?: ErrorContext,
  ) {
    this.epicName = getFunctionName(sourceFunction);
    this.epicSource = sourceFunction.toString();
  }

  /**
   * Gets the error's stacktrace.
   */
  public get stack() {
    return this.error.stack;
  }

  /**
   * Returns the innermost, original error that occurred.
   */
  public get innermostError(): ErrorContext {
    return this.innerError ? this.innerError.innermostError : this;
  }
}
