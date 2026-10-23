import { AxiosError } from "axios";

/**
 * Shapes the rejection an API mapper reads.
 *
 * Test-only infrastructure, shared by every plugin's error-mapping test. It lives here
 * rather than in a plugin so no plugin depends on another plugin's test code.
 */
export function axiosErrorWithMessage(
  message: string,
  status = 409,
): AxiosError {
  return new AxiosError(
    message,
    status === 409 ? "ERR_BAD_REQUEST" : undefined,
    undefined,
    undefined,
    {
      data: { message, statusCode: status },
      status,
      statusText: status === 409 ? "Conflict" : "Bad Request",
      headers: {},
      config: { headers: {} as never },
    },
  );
}
