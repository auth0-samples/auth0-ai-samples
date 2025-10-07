/**
 * Lightweight verbose logging utility with global and per-component toggles
 * Usage: const log = createLogger('component-name'); log('message', data);
 */

// Simple request ID generator for tracing
let requestCounter = 0;
const generateRequestId = () => `req-${++requestCounter}`;

export function createLogger(component) {
    const componentKey = `LOG_${component.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    
    return {
        log: (msg, ...args) => {
            const isVerbose = process.env.LOG_VERBOSE === 'true' || process.env.LOG_VERBOSE === '1';
            const componentEnabled = process.env[componentKey] === 'true' || process.env[componentKey] === '1';
            if (isVerbose || componentEnabled) {
                console.log(`[${component}]`, msg, ...args);
            }
        },
        warn: (msg, ...args) => {
            const isVerbose = process.env.LOG_VERBOSE === 'true' || process.env.LOG_VERBOSE === '1';
            const componentEnabled = process.env[componentKey] === 'true' || process.env[componentKey] === '1';
            if (isVerbose || componentEnabled) {
                console.warn(`[${component}]`, msg, ...args);
            }
        },
        error: (msg, ...args) => {
            const isVerbose = process.env.LOG_VERBOSE === 'true' || process.env.LOG_VERBOSE === '1';
            const componentEnabled = process.env[componentKey] === 'true' || process.env[componentKey] === '1';
            if (isVerbose || componentEnabled) {
                console.error(`[${component}]`, msg, ...args);
            }
        },
        // Add request ID generator
        newRequest: () => generateRequestId()
    };
}