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

La seleccion de temas ya no usa un catalogo fijo (ver "Busqueda autonoma de temas y fuentes"). Si no hay candidatos aptos se retiene la corrida: ampliar la oferta exige fuentes reales aprobadas, nunca generar contenido artificial para llenar una cuota. `api/cron/_editorial-policy.js` es la politica compartida de seleccion y validacion final. Prioriza cuidado cotidiano, organizacion, convivencia, enriquecimiento, viajes, adopcion, tenencia responsable y uso real de herramientas del producto. Excluye diagnosticos, triage de sintomas, tratamientos, medicamentos, urgencias, primeros auxilios, interpretacion de estudios, dietas terapeuticas y procedimientos potencialmente daninos. Un descargo no convierte un tema excluido en permitido.

Los temas cercanos a salud solo pueden reformularse si la nueva propuesta aporta valor por si misma como organizacion cotidiana y vuelve a superar la politica antes de redactar. El texto se revalida antes de guardar cada etapa y al finalizar, incluso si una corrida se reanuda con un payload anterior. Una retencion conserva un motivo legible para Admin y no genera portada, infografia ni post. La revision automatica no sustituye curaduria humana del borrador.

## Busqueda autonoma de temas y fuentes (migracion 076)

La etapa `text` se divide en fases dentro del `payload` (sin cambiar el `CHECK` de etapas): `select` (busca y verifica, sin IA de redaccion), `draft` (redacta desde la fuente ya verificada) y la revision existente. Una corrida historica con `payload.content` sigue el camino anterior.

**Registro de fuentes** (`api/cron/_blog-sources.js`). Lista controlada: Cats Protection, Dogs Trust, Battersea, RSPCA y ASPCA, cada una con dominios, selector de contenido, lista blanca de rutas y especie por ruta. Los segmentos clinicos (`health`, `vaccin*`, `diet`, `nutrition`, `breeds`, etc.) se bloquean siempre, sin excepciones por URL. Una fuente nueva solo se incorpora tras investigarla en solo lectura (robots.txt, rutas, extraccion) y con aprobacion explicita. Los candidatos iniciales salen de los indices oficiales; el descubrimiento recorre como maximo un indice por pulso, profundidad 1, hasta 30 enlaces permitidos y una vez cada 7 dias por indice.

**Verificacion** (`api/cron/_blog-source-verifier.js`). Errores tipados: `http_403/404/429/5xx`, `timeout`, `dns`, `connection`, `redirect_unauthorized`, `redirect_path_not_allowed`, `insufficient_content`, `too_large`, `unsupported_content`, `domain_not_allowed`, `path_not_allowed`. Las redirecciones se validan una por una (maximo 3; mismo dominio y ruta permitida), hay un unico plazo de 8 s por verificacion y nunca se envian ni registran credenciales ni cabeceras.

**Rotacion** (`api/cron/_blog-candidates.js`). Perros y gatos se alternan segun los ultimos articulos; otras especies (hoy conejos via RSPCA) solo tienen turno una de cada cinco generaciones y solo si hay un candidato valido. La calidad y la seguridad editorial prevalecen sobre la rotacion: si la especie preferida no tiene candidatos aptos se prueba la siguiente.

**Politica veterinaria como bloqueo.** Un candidato se descarta, sin reformular ni agregar descargos, si falla cualquiera de estas compuertas: titulo/ruta/apartados con terminos clinicos, densidad clinica del texto por encima del umbral (`evaluateCandidateTopic`), la revision semantica por modelo (`interpretSemanticVerdict`: solo pasa con `requires_veterinary_validation=false`, `everyday_non_clinical=true`, confianza >= 0,8 y categoria permitida; cualquier ambiguedad, error de formato o falla del clasificador descarta). Despues se aplican, sin cambios, la politica del texto, `classifyEditorialSafety` (`veterinaryReviewRequired`), la revision semantica factual, la revalidacion al finalizar y el trigger anti-publicacion.

**Limites por corrida** (`SEARCH_LIMITS`): 3 verificaciones por pulso, 12 verificaciones en total (aunque haya 8 pulsos disponibles), 8 pulsos de seleccion, 6 verificaciones por especie, 2 por dominio, 6 revisiones semanticas de candidatos, 2 revisiones semanticas del articulo, 2 redacciones con IA, 15 evaluaciones por pulso, 20 s de presupuesto por pulso y 6 h de ventana.

**Presupuestos duros en Supabase.** Pulsos, verificaciones, revisiones semanticas (de candidatos y de articulo) y redacciones se **reservan en la base antes de gastarse** con `reserve_blog_generation_budget`; el contador vive en `blog_generation_runs.budget`. La base impone sus propios maximos (8, 12, 6, 2 y 2) y la aplicacion solo puede pedir menos. Como se reserva antes de consumir, un reinicio, un error, un reintento o una reanudacion nunca devuelven presupuesto y el `payload` ya no es la autoridad. Si no hay cupo, la RPC responde `allowed=false` sin modificar nada. Sin presupuesto semantico no se descarga la fuente; si el cupo se agotara justo despues de verificarla, la verificacion se registra (con 6 h de espera) para no repetirla de inmediato. Ademas, la base conserva los topes de 12 verificaciones y 2 redacciones rechazadas sobre los intentos registrados.

**Espera por dominio.** Un dominio con `crawlDelayMs` (ASPCA, 10 s) no se vuelve a consultar hasta cumplirla, ya sea para verificar un candidato o para descubrir en su indice: ambas consultas comparten el mismo registro por pulso. Un indice pospuesto no consume su reserva semanal.

**Revision semantica del articulo completo** (`api/cron/_blog-vet-review.js`). Una vez redactado y revisado factualmente, el texto completo (titulo, cuerpo, meta descripcion y plan de la infografia) pasa por un clasificador en un pulso propio, ANTES de generar portada e infografia y antes de que exista el borrador. Solo se aprueba con `requires_veterinary_validation=false`, `contains_clinical_advice=false`, `everyday_non_clinical=true`, confianza numerica >= 0,8 y sin observaciones; los tipos son estrictos. Cualquier error del proveedor, respuesta invalida, duda o baja confianza descarta el articulo (el candidato queda permanentemente descartado si el modelo lo rechaza, o 24 h si el clasificador no estuvo disponible) y se busca otra alternativa dentro de los presupuestos; si no quedan, la corrida se retiene sin crear post. La aprobacion queda atada por hash al texto exacto revisado: cualquier cambio posterior la invalida y `finalize` vuelve a la revision. Una defensa independiente de la aplicacion, el trigger `blog_generated_post_vet_review_guard`, impide en la base insertar un post generado sin una aprobacion vigente para ese titulo y texto.

**Persistencia y recuperacion.** Cada intento se registra al instante en `blog_generation_candidate_attempts` (historial que no se borra) y actualiza `blog_topic_candidates` con su espera: 24 h para 403/429/5xx/timeout/DNS/conexion, 14 dias para contenido insuficiente, 30 dias para 404/redirecciones/tema no respaldado/borrador sin calidad, 1 h si el clasificador no respondio, y permanente para descartes veterinarios, de politica, duplicados y borradores con contenido clinico. El avance (`payload.search`) se guarda al cerrar cada pulso y el siguiente lo retoma sin repetir verificaciones. Guardar avance sin error resetea los intentos, asi que la busqueda no consume los 3 intentos de la corrida. Si un borrador viola la politica o los controles, el candidato se descarta y se busca otro (maximo 2 redacciones); si no hay alternativas, la corrida se retiene sin crear post.

**Sin candidatos aptos.** `retain_blog_generation_search_exhausted` retiene la corrida con "No se encontro una oportunidad editorial apta" y solo puede alargar la espera (hasta 6 h) para no abrir una corrida nueva cada hora; nunca acorta las 36 h desde el ultimo exito. Una fuente ya usada por un borrador (incluidas las anteriores a la migracion) no se vuelve a proponer.

**Trazabilidad.** Admin muestra por corrida especie, tema, categoria, fuente, URL, alternativas probadas, descartes con motivo legible, etapa, errores, resultado y el articulo generado (`admin_blog_generation_run_detail`), mas el resumen del pool por fuente y especie (`admin_blog_candidate_pool_summary`). Todas las tablas nuevas tienen RLS sin politicas y solo las usa `service_role`; los intentos fallidos no se mezclan con `blog_posts`.

Activacion: aplicar `supabase/migrations/076_blog_candidate_pipeline.sql` y despues desplegar el backend (Vercel) de inmediato. Antes de la migracion el panel sigue funcionando y la busqueda nueva no. Despues de la migracion, un backend anterior ya no puede crear borradores generados (el trigger exige la revision semantica): es una barrera intencional. Rollback: bloque comentado al final de la migracion (revertir primero el deploy); la migracion es aditiva.

**Edicion, revalidacion y publicacion (trigger `BEFORE UPDATE`).** La aprobacion veterinaria vale solo para el titulo, el texto y la meta descripcion exactos (`content_md5`, `title_md5`, `meta_md5`). `blog_generated_post_vet_review_publish_guard` actua unicamente sobre posts generados: (1) cambiar titulo, texto o meta descripcion marca la aprobacion como `approved=false` (queda registrada, no se borra); (2) publicar un generado, o cambiar el texto de uno publicado, exige una aprobacion vigente para el texto exacto; (3) no se puede desvincular `generation_run_id`. Editar un borrador sigue siendo libre. La revalidacion por `saveExistingDraftRevision` exige `vetReviewIsValid` y el script de revision ejecuta `approveRevisionSemantically` sobre el texto nuevo (falla cerrado). Los posts generados antes de la migracion se respetan: la 076 registra la huella de su texto actual en `blog_vet_review_grandfathered` y mientras coincida pueden (re)publicarse; cualquier cambio exige aprobacion nueva. Los posts manuales no se ven afectados. La guarda 063 sigue vigente y es mas estricta en un punto: una vez que el texto diverge exige revalidar aunque se restaure el original. Limite: `service_role` puede escribir `editorial_metadata` directamente, asi que la barrera protege contra la edicion del panel y las RPC existentes, no contra quien tenga esa credencial.

## Pruebas

`vitest.config.ts` fusiona `vite.config` y limita Vitest a 2 workers (`maxWorkers: 2`) porque con un worker por nucleo esta maquina agota la memoria y aparecen `Test timed out` que no son fallos reales. No excluye ni filtra ninguna prueba.

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