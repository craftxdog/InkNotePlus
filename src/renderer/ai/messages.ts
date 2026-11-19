import type { AiErrorStatus } from '../../shared/ai';

export const aiErrorMessages: Readonly<Record<AiErrorStatus, string>> = {
  disabled: 'Activa el asistente en Preferencias > Integraciones.',
  no_key: 'Añade tu clave en Preferencias > Integraciones.',
  bad_address: 'La dirección del proveedor no es segura o no es válida.',
  auth: 'El proveedor rechazó la clave.',
  rate_limit: 'El proveedor limitó las solicitudes. Inténtalo más tarde.',
  refused: 'El modelo no quiso responder a esta solicitud.',
  cancelled: 'Solicitud cancelada.',
  failed: 'No se pudo contactar con el proveedor.',
};
