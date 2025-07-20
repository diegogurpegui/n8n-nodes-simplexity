/**
 * Logger utility with timestamp prefixes
 */

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * Get formatted timestamp for logging
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format log message with timestamp prefix
 */
function formatLogMessage(level: string, message: string): string {
  return `[${getTimestamp()}] [${level.toUpperCase()}] ${message}`;
}

/**
 * Logger implementation with timestamp prefixes
 */
class TimestampLogger implements Logger {
  debug(message: string, ...args: any[]): void {
    console.debug(formatLogMessage("debug", message), ...args);
  }

  info(message: string, ...args: any[]): void {
    console.info(formatLogMessage("info", message), ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(formatLogMessage("warn", message), ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(formatLogMessage("error", message), ...args);
  }
}

// Export the logger instance
export const logger: Logger = new TimestampLogger();

// Also export the class for custom instances
export { TimestampLogger };
