// Ядро: ошибки создания (исключение PetError) и отказы команд ({ ok: false, error }) — docs/ARCHITECTURE.md § 4.1, § 6.3.

export class PetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PetError';
    this.code = code;
  }
}

// Отказ команды: ничего не изменилось и ничего не поставлено (§ 5.5).
export const fail = (code, message) => ({ ok: false, error: { code, message } });

export const describe = (error) => (error instanceof Error ? error.message : String(error));
