# Nexo Lab

Aplicación web independiente para gestionar laboratorios (LAB), instalaciones
(INS), prácticas de laboratorio (PRA), grados (GRA), asignaturas (ASI),
profesores (PRO) y sesiones docentes (SES).
Todas las entidades se pueden crear, editar y eliminar desde la interfaz.

El acceso está protegido por usuario y contraseña. El usuario de cada profesor
es su correo electrónico; las contraseñas se guardan en SQLite mediante un hash
`scrypt`, nunca como texto legible. La sesión de acceso usa una cookie segura y
también protege todas las rutas de la API, incluida la importación ICS.
La pantalla de acceso incluye «He olvidado mi contraseña». El sistema envía por
SMTP un enlace de un solo uso, válido durante 30 minutos, sin revelar si el
correo introducido pertenece a un profesor. Al establecer una clave nueva se
invalidan las sesiones de acceso que ese usuario tuviera abiertas.

La jerarquía se conserva en una base de datos SQLite propia:

```text
GRA → ASI ↔ PRA ↔ INS → LAB
       └── SES (día, hora y duración)
            ↑
           PRO
```

Cada asignatura pertenece a un grado y se vincula con sus prácticas. Una
práctica puede utilizar una o varias instalaciones. Las sesiones pertenecen a
una asignatura y pueden tener profesor y práctica; las que todavía no tienen
práctica aparecen como incompletas. Los profesores incluyen abreviatura, nombre
y correo electrónico, y se muestran ordenados por apellido.

El calendario ofrece vistas mensual, semanal (de lunes a viernes, entre las
08:00 y las 19:00) y de lista. Permite filtrar por laboratorio, instalación,
grado, asignatura y práctica. Un clic selecciona una sesión y `Shift` + clic
amplía el rango; una barra flotante permite asignar práctica o profesor y
borrar la selección. Las sesiones también se pueden mover mediante arrastre,
excepto a días festivos.

El selector de semestre filtra las sesiones del calendario por curso académico.
Cada curso ofrece `S1` (septiembre–enero) y `S2` (febrero–agosto), por ejemplo
`Semestre 1 · Curso 26-27`. La navegación queda limitada a las fechas del
semestre seleccionado. La Vista general utiliza el mismo semestre y permite
desplegar grados, asignaturas y sus sesiones.

## Importar horarios ICS

Desde **Sesiones → Importar ICS** se puede cargar un calendario académico. La
vista previa conserva únicamente los eventos cuyo campo `SUMMARY` contiene
`Prácticas de laboratorio`. Por ejemplo, en `30013 - Mecánica de fluidos`,
`30013` es el código de asignatura y el prefijo `300` identifica el grado.
En el mismo `SUMMARY`, el valor de `Grupo: 36` se conserva como número de
grupo de la sesión importada.

El importador propone automáticamente la asignatura por código y permite elegir
el profesor antes de guardar, aunque por defecto queda sin asignar. Las sesiones
se crean sin práctica y aparecen en el calendario con el estado especial
**Incompleta: sin práctica**. Los UID del ICS evitan duplicados si se importa el
mismo archivo otra vez. Los eventos con `SUMMARY:Día festivo` se guardan como
festivos y bloquean la creación o el traslado de sesiones a esa fecha. Las
fechas en UTC se convierten a la zona horaria `Europe/Madrid`.

## Requisitos

- Node.js 22.13 o posterior
- npm

## Ejecutar en local

```bash
npm install
export NEXO_LAB_BOOTSTRAP_PASSWORD='una contraseña inicial de 12 caracteres o más'
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

## Despliegue en Render

La imagen Docker fija `NEXO_LAB_DB_PATH=/app/data/nexo-lab.sqlite`. El servicio
de Render debe mantener un disco persistente montado exactamente en
`/app/data`; de este modo los despliegues y reinicios sustituyen la aplicación,
pero no la base de datos. No se debe guardar SQLite en el sistema de archivos
efímero del contenedor ni cambiar esta ruta sin migrar antes el volumen.

## Configuración

La variable `NEXO_LAB_DB_PATH` permite elegir mediante una ruta absoluta dónde
se guarda SQLite. Si no se define, el valor es `./data/nexo-lab.sqlite` dentro
del proyecto.

Puedes copiar `.env.template` como `.env.local` para personalizarla.

El primer administrador es `jablasal@unizar.es`. Antes de su primer acceso hay
que definir `NEXO_LAB_BOOTSTRAP_PASSWORD` con una contraseña de al menos 12
caracteres, tanto en local como en las variables secretas de Render. Tras el
primer inicio de sesión correcto, la aplicación guarda su hash en la base de
datos persistente y deja de utilizar esa variable para ese usuario.

Un administrador puede establecer la contraseña de otro profesor al crearlo o
editarlo. Al editar, dejar el campo «Nueva contraseña» vacío conserva la clave
actual. `NEXO_LAB_BOOTSTRAP_EMAIL` permite cambiar excepcionalmente el correo
del administrador inicial; su valor predeterminado es `jablasal@unizar.es`.

### Recuperación de contraseña por correo de Unizar

Para enviar los enlaces mediante el correo institucional, configura estas
variables en Render (o en `.env.local` durante el desarrollo):

```text
SMTP_HOST=smtp.unizar.es
SMTP_PORT=587
SMTP_USER=jablasal@unizar.es
SMTP_PASSWORD=<contraseña del correo, solo como secreto del servidor>
EMAIL_FROM=Nexo Lab <jablasal@unizar.es>
NEXO_LAB_PUBLIC_URL=https://nexo-lab.onrender.com
```

La conexión utiliza STARTTLS y exige TLS 1.2 o posterior. `SMTP_PASSWORD` no
debe escribirse en el repositorio, en una imagen Docker ni en el chat. Si la
contraseña del correo cambia, también hay que actualizar el secreto en Render.
Los tokens se guardan en SQLite solo mediante su hash y no modifican los datos
docentes existentes.

## Comprobaciones

```bash
npm test
npm run lint
```

La aplicación ya no depende de Sites, Cloudflare, D1, Wrangler ni Vinext.
