"use strict";
/**
 * Logger Module for Video Processing API
 * Provides consistent logging across the application
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
class Logger {
    constructor(component = 'APP') {
        this.logFile = (0, config_1.config)().log_file;
        this.component = component;
        this.ensureLogDirectory();
    }
    ensureLogDirectory() {
        const logDir = path_1.default.dirname(this.logFile);
        if (!fs_1.default.existsSync(logDir)) {
            fs_1.default.mkdirSync(logDir, { recursive: true, mode: 0o777 });
        }
    }
    formatMessage(level, message, context = {}) {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const contextStr = Object.keys(context).length > 0 ? ` | ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level}] [${this.component}] ${message}${contextStr}\n`;
    }
    write(level, message, context = {}) {
        const formattedMessage = this.formatMessage(level, message, context);
        try {
            fs_1.default.appendFileSync(this.logFile, formattedMessage, { flag: 'a' });
        }
        catch (error) {
            console.error(`Failed to write to log file: ${error}`);
        }
        if ((0, config_1.config)().debug || level === 'ERROR' || level === 'FATAL') {
            if (level === 'ERROR' || level === 'FATAL') {
                console.error(formattedMessage.trim());
            }
            else {
                console.log(formattedMessage.trim());
            }
        }
    }
    debug(message, context = {}) {
        if ((0, config_1.config)().debug) {
            this.write('DEBUG', message, context);
        }
    }
    info(message, context = {}) {
        this.write('INFO', message, context);
    }
    warning(message, context = {}) {
        this.write('WARNING', message, context);
    }
    error(message, context = {}) {
        this.write('ERROR', message, context);
    }
    fatal(message, context = {}) {
        this.write('FATAL', message, context);
    }
    child(component) {
        return new Logger(component);
    }
}
function createLogger(component) {
    return new Logger(component);
}
exports.logger = new Logger('APP');
exports.default = exports.logger;
