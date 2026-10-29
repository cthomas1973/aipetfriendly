# Generador editorial por etapas

## Publicacion y frecuencia

El endpoint existente `api/cron/generate-blog-post` avanza una etapa por solicitud autenticada. Postgres reserva la corrida con bloqueo de fila y token de cinco minutos. Una reserva vigente impide la ejecucion concurrente; un trabajador vencido no puede guardar ni finalizar.

`blog-generation-pulse` consulta elegibilidad cada minuto mediante pg_cron. No equivale a generar cada minuto: despues de una finalizacion exitosa, `next_eligible_at` queda exactamente 36 horas mas tarde. El comienzo real puede demorarse hasta el siguiente tick o por indisponibilidad. No se promete precision temporal absoluta de una infraestructura externa. Los fallos no cuentan como generaciones exitosas.

La credencial exclusiva `BLOG_GENERATION_SECRET` vive en Vercel y en Vault, no en el frontend. `BLOG_IMAGE_MODEL` selecciona la portada sin cambiar el proveedor de los demas flujos; la prueba real uso `gpt-image-1.5`. El cron anterior de cuatro dias se retira de Vercel. El cron de video social es independiente y no acepta la credencial dedicada del pipeline.

## Etapas y recuperacion

1. `text`: clasifica el tema con la politica editorial antes de consultar fuentes. Rechaza temas clinicos y de urgencia; un tema reformulable debe convertirse en una propuesta cotidiana que se vuelve a validar. Solo entonces consulta una fuente primaria, genera afirmaciones con citas y enlaces inline, comprueba QA independiente y solicita una revision semantica factual.
2. `cover`: genera portada con el proveedor existente. El objeto Storage usa `generation/{runId}/cover.png`.
3. `infographic`: compone PNG 1080x1350 mediante un plan visual adaptado al tema: comparacion, escena, ficha, conversacion, linea temporal o relaciones. Usa iconos Lucide, la paleta del sitio y el archivo original del logo oficial con SHA-256 verificado. Las etiquetas cortas tienen un fragmento literal de respaldo en el articulo; no se usa una plantilla universal de tarjetas numeradas. Usa `generation/{runId}/infographic-{contentHash}.png`, preservando las versiones anteriores y reutilizando recursos validos.
4. `finalize`: revalida duplicados e inserta el post como `draft` y actualiza el intervalo en una sola transaccion. No existe publicacion automatica.

Los recursos existentes se reutilizan. Cada etapa tiene hasta tres intentos con cinco minutos entre fallos. El progreso y los errores se conservan; una corrida agotada o con un criterio obligatorio fallido queda `retained`. Admin muestra corridas pendientes/retenciones. No se crea un post incompleto cuando falla una imagen.

El catalogo es deliberadamente finito y evita repetir temas. Si se agota, se retiene la corrida; ampliar temas exige agregar fuentes reales, no generar contenido artificial para llenar una cuota. `api/cron/_editorial-policy.js` es la politica compartida de seleccion y validacion final. Prioriza cuidado cotidiano, organizacion, convivencia, enriquecimiento, viajes, adopcion, tenencia responsable y uso real de herramientas del producto. Excluye diagnosticos, triage de sintomas, tratamientos, medicamentos, urgencias, primeros auxilios, interpretacion de estudios, dietas terapeuticas y procedimientos potencialmente daninos. Un descargo no convierte un tema excluido en permitido.

Los temas cercanos a salud solo pueden reformularse si la nueva propuesta aporta valor por si misma como organizacion cotidiana y vuelve a superar la politica antes de redactar. El texto se revalida antes de guardar cada etapa y al finalizar, incluso si una corrida se reanuda con un payload anterior. Una retencion conserva un motivo legible para Admin y no genera portada, infografia ni post. La revision automatica no sustituye curaduria humana del borrador.

## Metadatos y editor

`editorial_metadata` guarda categoria, etiquetas, fecha, fuentes (URL, titulo, organismo, fecha de consulta y hash), evidencia breve, criterios, alt y leyenda. El texto extenso de consulta queda solo en el registro privado de la corrida. La infografia se muestra despues del texto y antes de relacionados. Admin permite revisar las dos imagenes y las fuentes.

Un trigger impide publicar nuevos posts generados si faltan recursos, fallo QA, requieren revision veterinaria o el texto/titulo se modifico despues de validarse. Una edicion sustancial necesita revalidacion antes de publicar; nunca se debe eludir el trigger.

## Estandar editorial y visual v2

La intencion de busqueda, necesidad del lector y cobertura esencial quedan en `editorial_brief`. El QA comprueba utilidad, cobertura, estructura, repeticion de parrafos, voseo, fuentes, enlaces publicos reales, politica de seguridad y plan visual. No exige una cantidad minima artificial de palabras. Cada afirmacion atribuida debe tener evidencia literal en la fuente y el enlace debe aparecer en el mismo parrafo; el revisor semantico recibe ese mapeo para señalar problemas concretos, no para volver a auditar criterios independientes.

Se permite mencionar de forma acotada que un cuidador comparta las instrucciones veterinarias vigentes de una medicacion ya prescrita; no se permiten dosis, administracion, cambios, diagnosticos ni recomendaciones clinicas. La consulta profesional no se usa como descargo para incluir esas instrucciones.

El plan grafico contiene 3-5 bloques y al menos dos composiciones; las etiquetas no superan28 caracteres y deben tener respaldo en `content`. La firma usa `public/logo-aipetfriendly.png` sin redibujarlo ni deformarlo. La marca real incluye verde#2E7D32, fondo#f7fbf7, azul#0284c7 y acento#fbbf24. Si el logo no esta disponible o no coincide, se detiene el grafico.

La migracion063 agrega historial y revision compare-and-swap sobre el mismo borrador. Una revision conserva ID, slug, estado draft y programacion; archiva versiones completas y rechaza contenido concurrente. El trigger invalida QA e infografia tras cambios de texto, titulo, fuentes, portada o plan grafico. Admin muestra motivos y bloquea publicar hasta revalidar. La edicion no habilita publicacion automatica.

Para preparar la revision del articulo existente sin escribir:

```powershell
node scripts/revise-cat-holiday.mjs
```

`--apply` guarda solo ese borrador con auditoria e idempotencia. No genera una nueva portada ni un segundo articulo. Las fuentes y enlaces se verifican de nuevo; si falla un criterio critico, no lo presenta como revisado. La revalidacion de otros articulos debe pasar por el mismo QA y guardar una revision, no copiar un indicador `ready` manualmente.

## Operacion

Con configuracion local autorizada y sin imprimir secretos:

```powershell
node scripts/blog-pipeline.mjs status
node scripts/blog-pipeline.mjs advance
node scripts/blog-pipeline.mjs run
```

`run` usa exactamente el pipeline del cron y prueba dos solicitudes simultaneas. No fuerza el intervalo de 36 horas. `configure` activa el cron con la credencial presente en el entorno; ejecutar solo despues de comprobar el deployment.

`retry UUID` permite a un operador de backend habilitar una nueva corrida tras una retencion, preservando la anterior, con limite de tres corridas por hora y sin saltar las 36 horas desde un exito.

El estado incluye job activo, ticks reales y ultima corrida. No afirmar operacion en produccion basandose solamente en archivos de configuracion. Si falta un proveedor, permisos o cuota, el error queda registrado y no se simulan recursos.

## Retenciones previas

Los slugs de atragantamiento, salud preventiva y etapas de vida cuestionados por la auditoria siguen preservados en Supabase y accesibles al administrador, pero no se exponen en la web publica. La guia de atragantamiento permanece pendiente de revision. No eliminar registros ni levantar retenciones sin revision documentada.

## Reversion

Para detener generaciones, desactivar el job `blog-generation-pulse` desde el panel de Supabase. Conservar tablas/corridas y columnas; no borrar datos ni revertir destructivamente la migracion. Volver a desplegar una version anterior solo despues de evaluar si reactivaria el cron antiguo. La RPC administrativa existente no se reemplazo.