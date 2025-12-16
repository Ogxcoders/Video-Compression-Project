/**
 * Logger Module for Video Processing API
 * Provides consistent logging across the application
 */

import fs from 'fs';
import path from 'path';
import { config } from './config';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'FATAL';

export interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private logFile: string;
  private component: string;

  constructor(component: string = 'APP') {
    this.logFile = config().log_file;
    this.component = component;
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o777 });
    }
  }

  private formatMessage(level: LogLevel, message: string, context: LogContext = {}): string {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const contextStr = Object.keys(context).length > 0 ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level}] [${this.component}] ${message}${contextStr}\n`;
  }

  private write(level: LogLevel, message: string, context: LogContext = {}): void {
    const formattedMessage = this.formatMessage(level, message, context);
    
    try {
      fs.appendFileSync(this.logFile, formattedMessage, { flag: 'a' });
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }

    if (config().debug || level === 'ERROR' || level === 'FATAL') {
      if (level === 'ERROR' || level === 'FATAL') {
        console.error(formattedMessage.trim());
      } else {
        console.log(formattedMessage.trim());
      }
    }
  }

  debug(message: string, context: LogContext = {}): void {
    if (config().debug) {
      this.write('DEBUG', message, context);
    }
  }

  info(message: string, context: LogContext = {}): void {
    this.write('INFO', message, context);
  }

  warning(message: string, context: LogContext = {}): void {
    this.write('WARNING', message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.write('ERROR', message, context);
  }

  fatal(message: string, context: LogContext = {}): void {
    this.write('FATAL', message, context);
  }

  child(component: string): Logger {
    return new Logger(component);
  }
}

export function createLogger(component: string): Logger {
  return new Logger(component);
}

export const logger = new Logger('APP');

export default logger;
