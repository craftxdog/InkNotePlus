// InkNote's own starter templates, grouped like the categories in Inkdrop's guide:
// https://docs.inkdrop.app/reference/note-templates
export const builtinTemplates = [
  {
    id: 'builtin:ideas-session',
    title: 'Sesión de ideas',
    category: 'Lluvia de ideas',
    body: `---
_template:
  title: "Sesión de ideas - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Reúne ideas sin filtrar y elige cuáles probar.
  tags:
    - ideas
  status: active
---

## Pregunta de partida

## Ideas

- 

## Las tres más prometedoras

1. 

## Siguiente paso

- [ ] 
`,
  },
  {
    id: 'builtin:ideas-feature',
    title: 'Propuesta de función',
    category: 'Lluvia de ideas',
    body: `---
_template:
  title: "Propuesta de función - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Describe un problema, posibles soluciones y sus riesgos.
  tags:
    - propuesta
  status: none
---

## Problema

## A quién afecta

## Opciones

| Opción | Ventajas | Inconvenientes |
| ------ | -------- | -------------- |
|        |          |                |

## Recomendación
`,
  },
  {
    id: 'builtin:debug-bug',
    title: 'Informe de error',
    category: 'Depuración',
    body: `---
_template:
  title: "Informe de error - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Registra cómo reproducir un error y qué se esperaba.
  tags:
    - bug
  status: active
---

## Resumen

## Pasos para reproducirlo

1. 

## Resultado esperado

## Resultado actual

## Entorno

- Versión:
- Sistema:
`,
  },
  {
    id: 'builtin:debug-log',
    title: 'Diario de depuración',
    category: 'Depuración',
    body: `---
_template:
  title: "Diario de depuración - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Anota hipótesis, pruebas y conclusiones mientras investigas.
  tags:
    - depuración
  status: active
---

## Síntoma

## Hipótesis

- [ ] 

## Pruebas realizadas

| Prueba | Resultado |
| ------ | --------- |
|        |           |

## Causa

## Solución
`,
  },
  {
    id: 'builtin:learn-notes',
    title: 'Apuntes de estudio',
    category: 'Aprendizaje',
    body: `---
_template:
  title: "Apuntes de estudio - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Resume un tema con conceptos clave y preguntas pendientes.
  tags:
    - estudio
  status: active
---

## Tema

## Conceptos clave

- 

## Ejemplo

## Preguntas pendientes

- [ ] 

## Resumen con mis palabras
`,
  },
  {
    id: 'builtin:learn-book',
    title: 'Resumen de libro',
    category: 'Aprendizaje',
    body: `---
_template:
  title: "Resumen de libro - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Guarda las ideas principales y lo que vas a aplicar.
  tags:
    - lectura
  status: none
---

## Libro

- Autor:
- Fuente:

## Ideas principales

1. 

## Citas

> 

## Qué voy a aplicar

- [ ] 
`,
  },
  {
    id: 'builtin:plan-project',
    title: 'Plan de proyecto',
    category: 'Planificación',
    body: `---
_template:
  title: "Plan de proyecto - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Define objetivo, alcance, hitos y riesgos de un proyecto.
  tags:
    - proyecto
  status: active
---

## Objetivo

## Alcance

### Incluido

### Excluido

## Hitos

- [ ] 

## Riesgos

| Riesgo | Plan |
| ------ | ---- |
|        |      |
`,
  },
  {
    id: 'builtin:plan-week',
    title: 'Plan semanal',
    category: 'Planificación',
    body: `---
_template:
  title: "Plan semanal - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Fija las prioridades de la semana y revisa el resultado.
  tags:
    - semana
  status: active
---

## Prioridades

1. 
2. 
3. 

## Tareas

- [ ] 

## Revisión del viernes

### Qué salió bien

### Qué cambiaré
`,
  },
  {
    id: 'builtin:prod-daily',
    title: 'Informe diario',
    category: 'Productividad',
    body: `---
_template:
  title: "Informe diario - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Lo que hiciste hoy, lo que harás mañana y los bloqueos.
  tags:
    - informe
  status: active
---

## Hoy

1. 

## Mañana

1. 

## Bloqueos

1. 
`,
  },
  {
    id: 'builtin:prod-meeting',
    title: 'Acta de reunión',
    category: 'Productividad',
    body: `---
_template:
  title: "Acta de reunión - {{ 'now' | date: '%Y-%m-%d' }}"
  description: Asistentes, decisiones y tareas acordadas en una reunión.
  tags:
    - reunión
  status: none
---

## Asistentes

- 

## Temas

## Decisiones

- 

## Tareas

- [ ] 
`,
  },
] as const;
