// Ядро: ошибки создания (исключение PetError) и отказы команд ({ ok: false, error }) — docs/ARCHITECTURE.md § 4.1, § 6.3.
// PL06: ошибки определений (definition-invalid, duplicate-id, unsupported-format) несут path — место дефекта
// ('scenes[0].pose', при регистрации — 'pets[2].scenes[0].pose').

export class PetError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'PetError';
    this.code = code;
    if (details && typeof details.path === 'string') this.path = details.path;
  }
}

// Отказ команды: ничего не изменилось и ничего не поставлено (§ 5.5).
export const fail = (code, message) => ({ ok: false, error: { code, message } });

export const describe = (error) => (error instanceof Error ? error.message : String(error));
