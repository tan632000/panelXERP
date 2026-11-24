/**
 * Typed AI failures. Each carries a stable code and a fixed Vietnamese sentence; none keeps
 * the upstream body, header or message, so what is stored or logged can never leak them.
 */
export abstract class AiError extends Error {
  abstract readonly code: string;
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AiNotConfiguredError extends AiError {
  readonly code = 'AI_NOT_CONFIGURED';
  constructor() {
    super('AI chưa được cấu hình.');
  }
}

export class AiRateLimitedError extends AiError {
  readonly code = 'AI_RATE_LIMITED';
  constructor() {
    super('Dịch vụ AI đang quá tải, vui lòng thử lại sau.');
  }
}

export class AiTimeoutError extends AiError {
  readonly code = 'AI_TIMEOUT';
  constructor() {
    super('Dịch vụ AI phản hồi quá lâu.');
  }
}

export class AiOutputInvalidError extends AiError {
  readonly code = 'AI_OUTPUT_INVALID';
  constructor() {
    super('Kết quả AI không hợp lệ.');
  }
}

export class AiInternalError extends AiError {
  readonly code = 'AI_INTERNAL';
  constructor() {
    super('Dịch vụ AI gặp lỗi.');
  }
}

export class CatalogTooLargeError extends AiError {
  readonly code = 'AI_CATALOG_TOO_LARGE';
  constructor() {
    super('Danh mục vật tư quá lớn để chạy AI.');
  }
}
