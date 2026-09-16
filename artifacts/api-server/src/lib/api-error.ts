export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly retryable = false,
    public readonly outcomeUnknown = false,
    public readonly orderId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}