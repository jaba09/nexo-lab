# Nexo Lab

Aplicación web independiente para gestionar laboratorios (LAB), instalaciones
(INS), prácticas de laboratorio (PRA), grados (GRA), asignaturas (ASI),
profesores (PRO) y sesiones docentes (SES).
Todas las entidades se pueden crear, editar y eliminar desde la interfaz.

La jerarquía se conserva en una base de datos SQLite propia:

```text
GRA → ASI ↔ PRA ↔ INS → LAB
       └── SES (día, hora y duración)
            ↑
           PRO
```

Cada asignatura pertenece a un grado y se vincula con sus prácticas. Una
práctica puede utilizar una o varias instalaciones. Las
sesiones pertenecen a una asignatura, tienen un profesor obligatorio y pueden
vincularse con una de sus prácticas. La aplicación las muestra en un calendario mensual con navegación
entre meses y acceso directo a su edición.

En el calendario, un clic selecciona una sesión y `Shift` + clic selecciona el
rango cronológico entre la primera y la segunda. Con el botón derecho se abre
un menú para asignar a todas las seleccionadas una práctica compatible con sus
asignaturas, o dejarlas sin práctica como sesiones incompletas. El doble clic abre
la edición completa de una sesión.

El selector de semestre filtra las sesiones del calendario por curso académico.
Cada curso ofrece `S1` (septiembre–enero) y `S2` (febrero–agosto), por ejemplo
`2026-27 S1`. La navegación mensual queda limitada a los meses del semestre
seleccionado.

## Importar horarios ICS

Desde **Sesiones → Importar ICS** se puede cargar un calendario académico. La
vista previa conserva únicamente los eventos cuyo campo `SUMMARY` contiene
`Prácticas de laboratorio`. Por ejemplo, en `30013 - Mecánica de fluidos`,
`30013` es el código de asignatura y el prefijo `300` identifica el grado.
En el mismo `SUMMARY`, el valor de `Grupo: 36` se conserva como número de
grupo de la sesión importada.

El importador propone automáticamente la asignatura por código y permite elegir
también el profesor antes de guardar. Las sesiones se crean sin práctica y aparecen en
el calendario con el estado especial **Incompleta: sin práctica**; se completan
asignando una práctica desde su formulario de edición. Los UID del ICS evitan
duplicados si se importa el mismo archivo otra vez. Las fechas en UTC se
convierten a la zona horaria `Europe/Madrid`.

## Requisitos

- Node.js 22.13 o posterior
- npm

## Ejecutar en local

```bash
npm install
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`. La primera vez crea
automáticamente `data/nexo-lab.sqlite` y carga los registros iniciales.

Para ejecutar la versión de producción:

```bash
npm run build
npm start
```

## Ejecutar con Docker

```bash
docker compose up --build
```

El volumen `nexo_lab_data` conserva la base de datos aunque se sustituya o
reinicie el contenedor.

## Configuración

La variable `NEXO_LAB_DB_PATH` permite elegir mediante una ruta absoluta dónde
se guarda SQLite. Si no se define, el valor es `./data/nexo-lab.sqlite` dentro
del proyecto.

Puedes copiar `.env.example` como `.env.local` para personalizarla.

## Comprobaciones

```bash
npm test
npm run lint
```

La aplicación ya no depende de Sites, Cloudflare, D1, Wrangler ni Vinext.
