/**
 * Input validation and sanitization utilities
 */

// CEP validation result type
export interface CEPValidationResult {
  valid: boolean;
  cleanCEP: string;
  error?: string;
}

// Name validation result
export interface NameValidationResult {
  valid: boolean;
  cleanName: string;
  error?: string;
}

// Address validation result
export interface AddressValidationResult {
  valid: boolean;
  missing: 'number' | 'all' | null;
  error?: string;
}

/**
 * Validates and sanitizes a Brazilian CEP
 */
export function validateCEP(cep: string): CEPValidationResult {
  if (!cep || typeof cep !== 'string') {
    return { valid: false, cleanCEP: '', error: 'Por favor, digite um CEP.' };
  }

  const cleanCEP = cep.replace(/\D/g, '');

  if (cleanCEP.length === 0) {
    return { valid: false, cleanCEP: '', error: 'Por favor, digite um CEP.' };
  }

  if (cleanCEP.length !== 8) {
    return { valid: false, cleanCEP, error: `CEP deve ter 8 digitos. Voce digitou ${cleanCEP.length}.` };
  }

  // Check for obviously invalid patterns
  const invalidPatterns = [
    /^0+$/,           // All zeros
    /^1{8}$/,         // All ones
    /^(\d)\1{7}$/,    // Any repeated digit
    /^12345678$/,     // Sequential
    /^87654321$/,     // Reverse sequential
  ];

  if (invalidPatterns.some(pattern => pattern.test(cleanCEP))) {
    return { valid: false, cleanCEP, error: 'CEP invalido. Por favor, digite um CEP real.' };
  }

  // Valid Brazilian CEP ranges (approximate)
  const firstDigit = parseInt(cleanCEP[0], 10);
  if (firstDigit > 9) {
    return { valid: false, cleanCEP, error: 'CEP invalido. Por favor, digite um CEP real.' };
  }

  return { valid: true, cleanCEP };
}

/**
 * Validates a user's name
 */
export function validateName(name: string): NameValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, cleanName: '', error: 'Por favor, digite seu nome.' };
  }

  const cleanName = name.trim();

  if (cleanName.length < 2) {
    return { valid: false, cleanName, error: 'Por favor, digite um nome valido (minimo 2 caracteres).' };
  }

  if (cleanName.length > 100) {
    return { valid: false, cleanName: cleanName.slice(0, 100), error: 'Nome muito longo. Maximo 100 caracteres.' };
  }

  // Check for suspicious patterns (only numbers, special characters, etc.)
  if (/^[\d\s]+$/.test(cleanName)) {
    return { valid: false, cleanName, error: 'Por favor, digite seu nome (nao apenas numeros).' };
  }

  if (/^[^a-zA-ZÀ-ÿ\s]+$/.test(cleanName)) {
    return { valid: false, cleanName, error: 'Por favor, digite um nome valido.' };
  }

  return { valid: true, cleanName };
}

/**
 * Validates address completeness
 */
export function validateAddress(address: string): AddressValidationResult {
  if (!address || typeof address !== 'string') {
    return { valid: false, missing: 'all', error: 'Por favor, digite o endereco.' };
  }

  const cleanAddress = address.trim();

  if (cleanAddress.length < 5) {
    return { valid: false, missing: 'all', error: 'O endereco parece muito curto. Por favor, digite Rua, Bairro e Cidade.' };
  }

  // Check if has number (including S/N for sem numero)
  const hasNumber = /\b\d+\b/i.test(cleanAddress) || /\bs\/?n\b/i.test(cleanAddress);

  if (!hasNumber) {
    return { valid: false, missing: 'number' };
  }

  return { valid: true, missing: null };
}

/**
 * Validates house/apartment number input
 */
export function validateAddressNumber(input: string): { valid: boolean; error?: string } {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Por favor, digite o numero.' };
  }

  const cleanInput = input.trim();

  if (cleanInput.length === 0) {
    return { valid: false, error: 'Por favor, digite o numero da casa.' };
  }

  if (cleanInput.length > 50) {
    return { valid: false, error: 'Numero muito longo.' };
  }

  return { valid: true };
}

/**
 * Validates payment method
 */
export function validatePaymentMethod(method: string): { valid: boolean; error?: string } {
  if (!method || typeof method !== 'string') {
    return { valid: false, error: 'Por favor, selecione a forma de pagamento.' };
  }

  const cleanMethod = method.trim();

  if (cleanMethod.length < 2) {
    return { valid: false, error: 'Por favor, selecione uma forma de pagamento valida.' };
  }

  if (cleanMethod.length > 50) {
    return { valid: false, error: 'Forma de pagamento invalida.' };
  }

  return { valid: true };
}

/**
 * Sanitizes text input for display
 */
export function sanitizeDisplayText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    .trim()
    .replace(/[<>]/g, '') // Remove HTML-like characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, 1000); // Reasonable limit
}

/**
 * Formats currency for display
 */
export function formatCurrency(value: number): string {
  if (typeof value !== 'number' || isNaN(value)) {
    return 'R$ 0,00';
  }

  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/**
 * Debounce function for input handling
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Safe JSON parse with fallback
 */
export function safeJSONParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Check if we're in a mobile environment
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Check if touch is supported
 */
export function isTouchSupported(): boolean {
  if (typeof window === 'undefined') return false;

  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
