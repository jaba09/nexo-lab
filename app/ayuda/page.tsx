import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedTeacher } from "../../lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manual de uso — Nexo Lab",
  description: "Ayuda para consultar y gestionar la actividad docente en Nexo Lab.",
};

const helpNavigation = [
  { href: "#primeros-pasos", code: "01", label: "Primeros pasos" },
  { href: "#vista-general", code: "02", label: "Vista general" },
  { href: "#calendario", code: "03", label: "Calendario" },
  { href: "#seleccion", code: "04", label: "Seleccionar sesiones" },
  { href: "#catalogos", code: "05", label: "Datos académicos" },
  { href: "#importaciones", code: "06", label: "Importaciones" },
  { href: "#exportaciones", code: "07", label: "Exportaciones" },
  { href: "#permisos", code: "08", label: "Permisos" },
  { href: "#acceso", code: "09", label: "Acceso y contraseña" },
  { href: "#problemas", code: "10", label: "Problemas frecuentes" },
];

function HelpSection({
  id,
  number,
  title,
  intro,
  children,
}: {
  id: string;
  number: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="help-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="help-section-heading">
        <span>{number}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{intro}</p>
        </div>
      </div>
      <div className="help-section-body">{children}</div>
      <a className="help-to-top" href="#inicio">Volver al índice <span aria-hidden="true">↑</span></a>
    </section>
  );
}

export default async function HelpPage() {
  const teacher = await getAuthenticatedTeacher();
  if (!teacher) redirect("/");

  const roleLabel = teacher.isAdmin ? "Administrador" : "Profesor";

  return (
    <div className="app-shell help-shell" id="inicio">
      <a className="help-skip-link" href="#contenido-ayuda">Saltar al contenido</a>

      <aside className="sidebar help-app-sidebar">
        <Link className="brand" href="/" aria-label="Volver a la vista general de Nexo Lab">
          <span className="brand-mark">N</span>
          <span>NEXO<em>LAB</em></span>
        </Link>

        <nav className="main-nav" aria-label="Navegación de la aplicación">
          <p className="nav-caption">Aplicación</p>
          <Link className="nav-item" href="/" aria-label="Volver a Nexo Lab">
            <span className="nav-code">APP</span>
            <span>Volver a Nexo Lab</span>
            <span aria-hidden="true">↗</span>
          </Link>
          <span className="nav-item active help-current-item" aria-current="page">
            <span className="nav-code">AYU</span>
            <span>Manual de uso</span>
          </span>
        </nav>

        <div className="sidebar-foot">
          <span className="live-dot" />
          <div>
            <strong>Ayuda integrada</strong>
            <small>Acceso protegido</small>
          </div>
        </div>
      </aside>

      <main className="main-content help-main" id="contenido-ayuda">
        <header className="topbar help-topbar">
          <div>
            <span className="eyebrow">Gestión docente /</span>
            <strong>Manual de uso</strong>
          </div>
          <div className="account-summary help-account-summary">
            <span className="profile-button" aria-hidden="true">{teacher.code}</span>
            <span>
              <strong>{teacher.name}</strong>
              <small>{roleLabel} · {teacher.email}</small>
            </span>
            <Link className="help-back-link" href="/">Volver</Link>
          </div>
        </header>

        <div className="help-frame">
          <aside className="help-index" aria-label="Índice del manual">
            <p>En esta página</p>
            <nav>
              {helpNavigation.map((item) => (
                <a href={item.href} key={item.href}>
                  <span>{item.code}</span>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="help-index-tip">
              <span aria-hidden="true">?</span>
              <p><strong>Consejo</strong> Usa <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>F</kbd> para buscar una palabra en el manual.</p>
            </div>
          </aside>

          <article className="help-article">
            <header className="help-hero">
              <div>
                <span className="section-kicker">Manual de uso · Nexo Lab</span>
                <h1>Todo lo necesario para organizar la <em>docencia de laboratorio.</em></h1>
                <p>Consulta horarios y recursos, completa sesiones, importa calendarios y mantén conectados grados, asignaturas, prácticas e instalaciones.</p>
              </div>
              <div className="help-role-card">
                <span>Tu acceso</span>
                <strong>{roleLabel}</strong>
                <small>{teacher.isAdmin ? "Gestión completa del sistema" : "Consulta y acciones según tus asignaturas"}</small>
              </div>
            </header>

            <div className="help-quick-grid" aria-label="Accesos rápidos del manual">
              <a className="lime" href="#calendario"><span>SES</span><strong>Consultar el calendario</strong><small>Vistas, filtros y navegación</small></a>
              <a className="blue" href="#seleccion"><span>SEL</span><strong>Completar sesiones</strong><small>Prácticas y profesores</small></a>
              <a className="coral" href="#importaciones"><span>IMP</span><strong>Importar datos</strong><small>Calendarios ICS y CSV</small></a>
            </div>

            <HelpSection
              id="primeros-pasos"
              number="01"
              title="Primeros pasos"
              intro="Una ruta corta para empezar a trabajar sin tener que conocer toda la estructura."
            >
              <ol className="help-steps">
                <li><span>1</span><div><strong>Inicia sesión</strong><p>Utiliza como usuario tu correo electrónico. Si no recuerdas la contraseña, selecciona «He olvidado mi contraseña» en la pantalla de acceso.</p></div></li>
                <li><span>2</span><div><strong>Elige el semestre</strong><p>En Vista general o Calendario, selecciona el semestre y curso académico que quieres consultar. La aplicación limitará fechas y recuentos a ese periodo.</p></div></li>
                <li><span>3</span><div><strong>Empieza por Vista general</strong><p>Despliega un grado y una asignatura para revisar sus sesiones. También puedes consultar la carga agrupada por profesor.</p></div></li>
                <li><span>4</span><div><strong>Abre el Calendario</strong><p>Cambia entre las vistas mensual, semanal y lista, y aplica filtros para concentrarte en la actividad que necesitas.</p></div></li>
              </ol>

              <div className="help-callout lime">
                <span aria-hidden="true">i</span>
                <p><strong>Cómo se conectan los datos</strong> Un grado contiene asignaturas; cada asignatura se relaciona con prácticas; las prácticas utilizan instalaciones que pertenecen a laboratorios. Las sesiones programan esa docencia en una fecha y hora.</p>
              </div>
            </HelpSection>

            <HelpSection
              id="vista-general"
              number="02"
              title="Vista general"
              intro="El punto de partida para comprobar rápidamente la planificación de un semestre."
            >
              <div className="help-two-columns">
                <div>
                  <h3>Sesiones por grado</h3>
                  <ul>
                    <li>Selecciona el semestre en la cabecera verde.</li>
                    <li>Despliega un grado para ver sus asignaturas.</li>
                    <li>Despliega una asignatura para consultar sus sesiones en orden cronológico.</li>
                    <li>Activa «Por subgrupos» o «Por profesor» para cambiar la agrupación.</li>
                    <li>El indicador <em>s/prof</em> señala sesiones sin profesor asignado.</li>
                  </ul>
                </div>
                <div>
                  <h3>Resúmenes disponibles</h3>
                  <ul>
                    <li>Sesiones y sesiones incompletas por asignatura.</li>
                    <li>Profesores y número de sesiones asignadas.</li>
                    <li>Editores autorizados para cada asignatura.</li>
                    <li>Exportación del semestre completo desde la cabecera del panel.</li>
                  </ul>
                </div>
              </div>
              <div className="help-callout blue">
                <span aria-hidden="true">✓</span>
                <p><strong>Sesión incompleta</strong> Una sesión se considera incompleta cuando todavía no tiene práctica asignada. Puede tener o no profesor.</p>
              </div>
            </HelpSection>

            <HelpSection
              id="calendario"
              number="03"
              title="Calendario"
              intro="Consulta las sesiones con el nivel de detalle adecuado y reduce el resultado mediante filtros relacionados."
            >
              <div className="help-view-cards">
                <div><span>MES</span><strong>Vista mensual</strong><p>Ofrece una visión global. Cada sesión muestra hora, asignatura, práctica y profesor en el espacio disponible.</p></div>
                <div><span>SEM</span><strong>Vista semanal</strong><p>Muestra de lunes a viernes entre las 08:00 y las 19:00. Es la mejor vista para detectar solapamientos.</p></div>
                <div><span>LIS</span><strong>Vista de lista</strong><p>Ordena las sesiones cronológicamente y presenta toda la información en filas fáciles de revisar.</p></div>
              </div>

              <h3>Filtrar el calendario</h3>
              <p>Abre el panel de filtros y selecciona laboratorio, instalación, grado, asignatura o práctica. Los campos están relacionados: al elegir un grado, por ejemplo, la lista de asignaturas se limita a las de ese grado. Pulsa «Limpiar filtros» para recuperar todas las sesiones del semestre.</p>

              <h3>Mover una sesión</h3>
              <ol className="help-compact-steps">
                <li><strong>1.</strong> Usa la vista mensual o semanal.</li>
                <li><strong>2.</strong> Mantén pulsada la sesión y arrástrala.</li>
                <li><strong>3.</strong> Suéltala en el nuevo día y, en la vista semanal, en la nueva franja horaria.</li>
              </ol>
              <div className="help-callout coral">
                <span aria-hidden="true">!</span>
                <p><strong>Días festivos</strong> No se pueden crear ni trasladar sesiones a una fecha registrada como festiva. El calendario marca esos días de forma diferenciada.</p>
              </div>
            </HelpSection>

            <HelpSection
              id="seleccion"
              number="04"
              title="Seleccionar y completar sesiones"
              intro="Trabaja sobre una sesión o sobre un intervalo completo sin repetir la misma acción."
            >
              <div className="help-action-example" aria-label="Ejemplo de selección de sesiones">
                <div><span>1</span><strong>Clic</strong><small>Selecciona una sesión</small></div>
                <i aria-hidden="true">→</i>
                <div><span>2</span><strong>Shift + clic</strong><small>Amplía el intervalo</small></div>
                <i aria-hidden="true">→</i>
                <div><span>3</span><strong>Barra de acciones</strong><small>Aplica el cambio</small></div>
              </div>
              <p>Las selecciones por intervalo se mantienen dentro de la misma asignatura o del grupo que estés consultando. La barra flotante indica cuántas sesiones están seleccionadas.</p>
              <ul>
                <li><strong>Asignar práctica:</strong> elige una práctica compatible con la asignatura de las sesiones.</li>
                <li><strong>Asignar profesor:</strong> selecciona un profesor o deja las sesiones sin asignación.</li>
                <li><strong>Exportar:</strong> descarga solamente la selección en el formato disponible.</li>
                <li><strong>Borrar selección:</strong> elimina las sesiones seleccionadas; esta acción está reservada a administradores.</li>
              </ul>
              <p>Pulsa <kbd>Esc</kbd> para limpiar la selección. En Vista general también puedes utilizar «Selec. subgrupos» para seleccionar la primera sesión incompleta de cada subgrupo.</p>
            </HelpSection>

            <HelpSection
              id="catalogos"
              number="05"
              title="Datos académicos"
              intro="La navegación lateral refleja la jerarquía de la información que utiliza el calendario."
            >
              <div className="help-entity-grid">
                <div><span>L/I</span><strong>Lab/instalaciones</strong><p>Laboratorios desplegables con sus espacios, equipos y datos de gestión.</p></div>
                <div><span>PRA</span><strong>Prácticas</strong><p>Actividad, duración, riesgo e instalaciones necesarias.</p></div>
                <div><span>GRA</span><strong>Grados</strong><p>Programa académico y código utilizado en importaciones.</p></div>
                <div><span>ASI</span><strong>Asignaturas</strong><p>Materias agrupadas por grado, con prácticas ordenadas y profesores editores.</p></div>
                <div><span>PRO</span><strong>Profesores</strong><p>Nombre, código, correo, contraseña y permiso de administrador.</p></div>
                <div><span>MEN</span><strong>Mensajes</strong><p>Correo a profesores con docencia en una asignatura o semestre.</p></div>
              </div>
              <h3>Crear, editar o eliminar</h3>
              <p>Cuando tu cuenta tenga permiso, verás el botón de creación en la cabecera. Selecciona una fila o tarjeta editable para abrir su ficha. La eliminación aparece dentro de los controles del registro y puede impedirse si existen datos relacionados que deban conservarse.</p>
              <div className="help-callout neutral">
                <span aria-hidden="true">↳</span>
                <p><strong>Orden recomendado</strong> Si partes de cero, abre «Lab/instalaciones», crea primero un laboratorio y añade sus instalaciones. Después continúa con prácticas, grados y asignaturas.</p>
              </div>
            </HelpSection>

            <HelpSection
              id="importaciones"
              number="06"
              title="Importaciones"
              intro="Los administradores pueden incorporar calendarios y asignaciones docentes con una vista previa antes de guardar."
            >
              <div className="help-two-columns">
                <div className="help-import-card">
                  <span>ICS</span>
                  <h3>Importar horarios</h3>
                  <ol>
                    <li>Abre Calendario y pulsa «Importar ICS».</li>
                    <li>Selecciona el archivo de calendario.</li>
                    <li>Revisa los eventos detectados y relaciona cada código con su asignatura.</li>
                    <li>Elige un profesor si quieres asignarlo durante la importación.</li>
                    <li>Confirma la vista previa.</li>
                  </ol>
                  <p>Solo se importan eventos de prácticas de laboratorio. Los identificadores del calendario evitan duplicados y los festivos se guardan para bloquear esas fechas.</p>
                </div>
                <div className="help-import-card">
                  <span>CSV</span>
                  <h3>Importar asignaciones</h3>
                  <ol>
                    <li>En Vista general, pulsa «Importar asignación sesiones».</li>
                    <li>Selecciona el CSV preparado.</li>
                    <li>Revisa coincidencias, avisos de duración y conflictos.</li>
                    <li>Decide si se conservan o sustituyen las asignaciones existentes.</li>
                    <li>Confirma la importación.</li>
                  </ol>
                  <p>La vista previa no modifica datos. Si hay filas sin coincidencia, corrige sus códigos, fechas u horas y vuelve a cargar el archivo.</p>
                </div>
              </div>
            </HelpSection>

            <HelpSection
              id="exportaciones"
              number="07"
              title="Exportaciones"
              intro="Descarga el semestre o una selección concreta para compartirla o utilizarla en otras herramientas."
            >
              <div className="help-format-list">
                <div><span>CSV</span><p><strong>Datos tabulares</strong> Útil para revisar, filtrar o transformar sesiones en una hoja de cálculo.</p></div>
                <div><span>ICS</span><p><strong>Calendario</strong> Permite incorporar las sesiones a aplicaciones de calendario compatibles.</p></div>
                <div><span>PDF</span><p><strong>Documento</strong> Adecuado para imprimir, archivar o enviar una planificación cerrada.</p></div>
              </div>
              <p>En Vista general, los botones de exportación utilizan el semestre seleccionado. En la barra de acciones del calendario o de una asignatura, la exportación se limita a las sesiones seleccionadas. La sección Profesores también permite exportar el listado docente en CSV.</p>
            </HelpSection>

            <HelpSection
              id="permisos"
              number="08"
              title="Permisos y responsabilidades"
              intro="La interfaz muestra únicamente las acciones compatibles con los permisos de la cuenta."
            >
              <div className="help-table-wrap">
                <table className="help-permission-table">
                  <thead><tr><th>Acción</th><th>Solo lectura</th><th>Editor de asignatura</th><th>Administrador</th></tr></thead>
                  <tbody>
                    <tr><td>Consultar, filtrar y exportar</td><td><span className="yes">Sí</span></td><td><span className="yes">Sí</span></td><td><span className="yes">Sí</span></td></tr>
                    <tr><td>Gestionar sesiones</td><td>—</td><td>Solo sus asignaturas</td><td>Todas</td></tr>
                    <tr><td>Crear instalaciones y prácticas</td><td>—</td><td>Para sus asignaturas</td><td><span className="yes">Sí</span></td></tr>
                    <tr><td>Editar catálogos y profesores</td><td>—</td><td>—</td><td><span className="yes">Sí</span></td></tr>
                    <tr><td>Borrar registros o sesiones</td><td>—</td><td>—</td><td><span className="yes">Sí</span></td></tr>
                    <tr><td>Importar ICS o asignaciones</td><td>—</td><td>—</td><td><span className="yes">Sí</span></td></tr>
                    <tr><td>Enviar mensajes a grupos</td><td>—</td><td>—</td><td><span className="yes">Sí</span></td></tr>
                  </tbody>
                </table>
              </div>
              <p>Un administrador concede el rol de editor desde la ficha de una asignatura. El sistema conserva siempre al menos una cuenta administradora.</p>
              <div className="help-callout neutral">
                <span aria-hidden="true">✉</span>
                <p><strong>Mensajes</strong> Elige el semestre y el grupo, revisa los destinatarios y redacta el correo. La contraseña de Unizar se solicita en el primer envío y se conserva solo en memoria hasta cerrar sesión o recargar; los destinatarios reciben el mensaje en copia oculta.</p>
              </div>
            </HelpSection>

            <HelpSection
              id="acceso"
              number="09"
              title="Acceso y contraseña"
              intro="La cuenta utiliza el correo electrónico del profesor como nombre de usuario."
            >
              <div className="help-two-columns">
                <div>
                  <h3>Recuperar la contraseña</h3>
                  <ol>
                    <li>En la pantalla de acceso, pulsa «He olvidado mi contraseña».</li>
                    <li>Introduce tu correo y envía la solicitud.</li>
                    <li>Abre el enlace recibido por correo antes de 30 minutos.</li>
                    <li>Define una contraseña nueva de al menos 12 caracteres.</li>
                  </ol>
                </div>
                <div>
                  <h3>Si el correo no llega</h3>
                  <ul>
                    <li>Revisa las carpetas de correo no deseado.</li>
                    <li>Comprueba que has escrito la dirección institucional correcta.</li>
                    <li>Solicita un enlace nuevo si han transcurrido 30 minutos.</li>
                    <li>Contacta con un administrador si el problema continúa.</li>
                  </ul>
                </div>
              </div>
            </HelpSection>

            <HelpSection
              id="problemas"
              number="10"
              title="Problemas frecuentes"
              intro="Comprobaciones rápidas antes de solicitar ayuda técnica."
            >
              <div className="help-faq">
                <details>
                  <summary>No encuentro una sesión en el calendario.</summary>
                  <p>Comprueba el semestre seleccionado, limpia los filtros y revisa la Vista de lista. Una sesión de otro semestre no aparece aunque su asignatura sí exista.</p>
                </details>
                <details>
                  <summary>No puedo modificar un registro.</summary>
                  <p>Puede que tu cuenta sea de solo lectura o editora de otras asignaturas. Revisa la etiqueta de rol junto a tu nombre y solicita el permiso correspondiente a un administrador.</p>
                </details>
                <details>
                  <summary>No puedo asignar una práctica a una sesión.</summary>
                  <p>La práctica debe estar relacionada con la asignatura o con su grado, según la selección. Revisa primero la ficha de la asignatura y el orden de sus prácticas.</p>
                </details>
                <details>
                  <summary>La aplicación impide borrar un registro.</summary>
                  <p>Existen datos dependientes. Por ejemplo, una instalación utilizada por una práctica no se puede eliminar hasta retirar esa relación.</p>
                </details>
                <details>
                  <summary>Una importación no crea ninguna sesión.</summary>
                  <p>Revisa la vista previa. El archivo puede no contener eventos de prácticas, puede estar duplicado o sus códigos pueden necesitar una relación manual.</p>
                </details>
              </div>
              <div className="help-callout lime">
                <span aria-hidden="true">?</span>
                <p><strong>Al comunicar una incidencia</strong> Indica la sección, el semestre, el código de la asignatura y la acción que estabas realizando. No envíes contraseñas ni secretos de configuración.</p>
              </div>
            </HelpSection>

            <footer className="help-footer">
              <div><span className="brand-mark">N</span><p><strong>Nexo Lab</strong><small>Manual de la versión actual</small></p></div>
              <Link href="/">Volver a la aplicación <span aria-hidden="true">→</span></Link>
            </footer>
          </article>
        </div>
      </main>
    </div>
  );
}
