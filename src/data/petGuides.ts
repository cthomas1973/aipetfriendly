export type PetGuideCategory = 'adiestramiento' | 'ansiedad' | 'conducta' | 'salud';
export type PetGuidePetType = 'perro' | 'gato';

export interface PetGuideImage {
  src: string;
  alt: string;
}

export interface PetGuideSection {
  heading: string;
  paragraphs: string[];
  image?: PetGuideImage;
}

export interface PetGuide {
  slug: string;
  title: string;
  category: PetGuideCategory;
  petTypes: PetGuidePetType[];
  // Fecha ISO (YYYY-MM-DD) de publicacion. Se usa para ordenar por novedad y
  // para mostrar la etiqueta "Nuevo". Al sumar guias nuevas cada semana, basta
  // con agregarlas al array con la fecha del dia.
  publishedAt: string;
  summary: string;
  readingTime: string;
  coverImage?: PetGuideImage;
  sections: PetGuideSection[];
}

export const PET_GUIDE_CATEGORY_LABELS: Record<PetGuideCategory, string> = {
  adiestramiento: 'Adiestramiento',
  ansiedad: 'Ansiedad y estrés',
  conducta: 'Conducta',
  salud: 'Salud y cuidados',
};

export const PET_GUIDES: PetGuide[] = [
  {
    slug: 'ansiedad-por-separacion-en-perros',
    title: 'Ansiedad por separación en perros: cómo identificarla y tratarla',
    category: 'ansiedad',
    petTypes: ['perro'],
    publishedAt: '2026-06-16',
    summary:
      'Ladridos, destrozos y accidentes cuando el perro se queda solo pueden ser señales de ansiedad por separación. Te contamos cómo reconocerla y un plan de trabajo gradual para mejorarla.',
    readingTime: '6 min',
    sections: [
      {
        heading: '¿Qué es la ansiedad por separación?',
        paragraphs: [
          'La ansiedad por separación es una respuesta de estrés que aparece cuando el perro queda solo o se separa de su persona de referencia. No es "maleducación" ni un intento de "vengarse": es una reacción emocional que el animal no puede controlar por sí solo.',
          'Los signos más comunes son ladridos o aullidos prolongados apenas la persona sale, destrozos en puertas y ventanas, necesidad de estar siempre pegado al dueño dentro de la casa, salivación excesiva, jadeo sin motivo aparente y, en casos más marcados, pérdida de control de esfínteres pese a estar bien entrenado.',
        ],
      },
      {
        heading: 'Cómo confirmar que se trata de esto',
        paragraphs: [
          'Antes de asumir que es ansiedad, conviene descartar causas médicas (dolor, problemas digestivos, edad avanzada) con una consulta veterinaria, y observar si los destrozos ocurren únicamente en ausencia del dueño o también estando en casa.',
          'Filmar los primeros 15 a 20 minutos después de salir suele ser muy revelador: la mayoría de los episodios de ansiedad se concentran en ese lapso inicial.',
        ],
      },
      {
        heading: 'Plan de trabajo gradual (desensibilización)',
        paragraphs: [
          'El objetivo es que el perro asocie las salidas con algo neutro o positivo, no con pánico. Se empieza practicando las "señales previas a salir" (tomar las llaves, ponerse el abrigo) sin salir realmente, varias veces al día, hasta que dejen de generar alerta.',
          'Luego se trabajan ausencias cortísimas: salir por la puerta y volver a los 5-10 segundos, sin saludos efusivos ni despedidas largas (esto reduce el contraste emocional). Se va aumentando el tiempo de a poco, en sesiones cortas, solo avanzando cuando el perro está tranquilo en el paso anterior.',
          'Dejar un juguete interactivo con premios (kong relleno, alfombra de olfato) unos minutos antes de salir ayuda a que la salida se asocie con algo bueno y a canalizar la ansiedad en una actividad.',
        ],
      },
      {
        heading: 'Cuándo pedir ayuda profesional',
        paragraphs: [
          'Si los destrozos son severos, hay autolesiones, o no se observan mejoras después de varias semanas de trabajo constante, es momento de consultar a un veterinario especializado en comportamiento o a un adiestrador con experiencia en ansiedad. En algunos casos se combina el trabajo de modificación de conducta con apoyo farmacológico transitorio indicado por un profesional.',
        ],
      },
    ],
  },
  {
    slug: 'como-socializar-un-cachorro',
    title: 'Cómo socializar a un cachorro correctamente',
    category: 'adiestramiento',
    petTypes: ['perro'],
    publishedAt: '2026-06-23',
    summary:
      'Las primeras 16 semanas de vida son claves para formar un perro adulto seguro y equilibrado. Guía práctica de socialización, paso a paso y sin sobreexponer al cachorro.',
    readingTime: '5 min',
    sections: [
      {
        heading: 'Por qué la socialización temprana importa',
        paragraphs: [
          'El período sensible de socialización va aproximadamente de las 3 a las 16 semanas de vida. Las experiencias que el cachorro tiene en esa ventana (personas, otros animales, sonidos, superficies, viajes) moldean en gran parte cómo reaccionará de adulto frente a lo desconocido.',
          'Socializar bien no significa "exponerlo a todo" sin criterio, sino generar experiencias controladas y positivas, evitando que el cachorro se asuste o se sature.',
        ],
      },
      {
        heading: 'Qué incluir en el plan de socialización',
        paragraphs: [
          'Personas variadas: adultos, niños, personas con gorra, bastón o uniforme, siempre dejando que el cachorro se acerque a su ritmo.',
          'Otros animales sanos y vacunados: perros adultos equilibrados y, si es posible, cachorros de la misma edad en espacios seguros.',
          'Sonidos cotidianos: aspiradora, timbre, tráfico, a volumen bajo al principio y aumentando gradualmente.',
          'Superficies y entornos distintos: pasto, piso de madera, escaleras, auto, para que no le generen inseguridad más adelante.',
        ],
      },
      {
        heading: 'Cómo hacerlo sin sobreestimular',
        paragraphs: [
          'Cada experiencia nueva debe terminar en un estado tranquilo o positivo. Si el cachorro se muestra asustado, se retrocede a una distancia o intensidad donde se sienta cómodo y se avanza más despacio, en vez de forzarlo a "acostumbrarse".',
          'Los premios (comida, caricias, juego breve) ayudan a que el cachorro asocie lo nuevo con algo bueno. Es preferible hacer sesiones cortas y frecuentes que una única salida larga y agotadora.',
        ],
      },
      {
        heading: 'Vacunación y salidas seguras',
        paragraphs: [
          'Muchos veterinarios recomiendan combinar salidas controladas (upo en brazos o en zonas de bajo riesgo sanitario) incluso antes de completar el plan de vacunación, para no perder la ventana de socialización. Consultá con tu veterinario de confianza cuál es el criterio más seguro para tu cachorro según su esquema de vacunas.',
        ],
      },
    ],
  },
  {
    slug: 'adiestramiento-en-positivo-comandos-basicos',
    title: 'Adiestramiento en positivo: los comandos básicos para empezar',
    category: 'adiestramiento',
    petTypes: ['perro'],
    publishedAt: '2026-06-30',
    summary:
      'Sentado, quieto, ven y junto: cómo enseñar los comandos fundamentales usando refuerzo positivo, sin gritos ni castigos.',
    readingTime: '7 min',
    sections: [
      {
        heading: 'Qué es el refuerzo positivo',
        paragraphs: [
          'El adiestramiento en positivo se basa en premiar los comportamientos que queremos que se repitan (con comida, juego o afecto) en vez de castigar los que queremos eliminar. Es el método respaldado por la mayoría de los especialistas actuales en comportamiento animal, porque genera aprendizaje sin miedo ni deterioro del vínculo.',
          'La clave está en el timing: el premio debe llegar en el instante en que el perro hace lo correcto, o usar una palabra/clicker que marque ese momento exacto antes de entregar el premio.',
        ],
      },
      {
        heading: '"Sentado"',
        paragraphs: [
          'Con un premio en la mano, se lo acerca a la nariz del perro y se sube lentamente por encima de su cabeza: al seguir el movimiento, la mayoría de los perros se sienta solo. En el instante en que se sienta, se marca ("¡bien!") y se premia.',
          'Se repite varias veces hasta que el gesto se vuelve predecible, y recién ahí se le agrega la palabra "sentado" justo antes del gesto.',
        ],
      },
      {
        heading: '"Quieto" y "ven"',
        paragraphs: [
          'Para "quieto", se pide "sentado" y se premia por permanecer en esa posición, aumentando de a poco el tiempo antes de dar el premio. Si se levanta, no pasa nada: se vuelve a pedir y se acorta el tiempo exigido en el próximo intento.',
          'Para "ven", conviene practicar en espacios seguros (o con correa larga), llamando con voz alegre y premiando siempre que el perro llegue, sin nunca usar ese llamado para algo desagradable (como cortar el juego o retarlo), porque eso hace que deje de responder.',
        ],
      },
      {
        heading: 'Caminar "junto" sin tirar de la correa',
        paragraphs: [
          'Se premia al perro cada vez que camina con la correa floja a la altura de la pierna, y se detiene por completo cuando tira (sin avanzar mientras la correa esté tensa). Con constancia, el perro aprende que tirar no lleva a ningún lado y que caminar cerca sí trae premios.',
        ],
      },
      {
        heading: 'Consejos generales',
        paragraphs: [
          'Sesiones cortas (5-10 minutos) varias veces al día funcionan mejor que una sesión larga. Terminar siempre con un ejercicio que el perro domine, para cerrar con una sensación de éxito.',
        ],
      },
    ],
  },
  {
    slug: 'ansiedad-en-gatos-senales-y-soluciones',
    title: 'Ansiedad en gatos: señales que pasan desapercibidas',
    category: 'ansiedad',
    petTypes: ['gato'],
    publishedAt: '2026-07-07',
    summary:
      'Los gatos expresan el estrés de forma mucho más sutil que los perros. Aprendé a reconocer las señales tempranas y cómo mejorar su entorno.',
    readingTime: '5 min',
    sections: [
      {
        heading: 'Señales de estrés en gatos',
        paragraphs: [
          'A diferencia de los perros, los gatos tienden a mostrar el estrés de forma silenciosa: esconderse más de lo habitual, dejar de usar la caja de arena o marcar fuera de ella, exceso de acicalamiento (zonas peladas de tanto lamerse), cambios en el apetito, o mayor irritabilidad al ser tocados.',
          'También puede manifestarse como hipervigilancia (sobresaltarse con cualquier ruido) o, al contrario, apatía y menor interés por jugar.',
        ],
      },
      {
        heading: 'Causas frecuentes',
        paragraphs: [
          'Cambios en el hogar (mudanzas, nuevos muebles, reformas), la llegada de otra mascota o de un bebé, cambios de horarios de la familia, conflictos con otros gatos de la casa, o la falta de recursos suficientes (arena, comederos, lugares altos) en hogares con varios gatos.',
        ],
      },
      {
        heading: 'Cómo mejorar el entorno (enriquecimiento ambiental)',
        paragraphs: [
          'Los gatos necesitan lugares altos para observar desde una posición segura, escondites disponibles, rascadores en zonas de tránsito y sesiones cortas de juego tipo caza (con caña o puntero) que les permitan liberar energía y frustración de forma sana.',
          'En casas con más de un gato, la regla general es "una caja de arena por gato más una", ubicadas en lugares distintos y tranquilos, para evitar competencia por el recurso.',
        ],
      },
      {
        heading: 'Cuándo consultar al veterinario',
        paragraphs: [
          'Cambios repentinos de apetito, dejar de usar la arena, o acicalamiento excesivo con zonas de piel visible ameritan una consulta veterinaria: además del componente emocional, hay que descartar causas médicas (cistitis, dolor, problemas dermatológicos) que pueden verse muy parecidas al estrés puro.',
        ],
      },
    ],
  },
  {
    slug: 'como-prevenir-el-estres-en-viajes-y-mudanzas',
    title: 'Cómo prevenir el estrés en viajes y mudanzas',
    category: 'ansiedad',
    petTypes: ['perro', 'gato'],
    publishedAt: '2026-07-14',
    summary:
      'Viajar en auto, mudarse de casa o cambiar de rutina puede ser muy estresante para una mascota. Tips prácticos para que la transición sea más tranquila.',
    readingTime: '4 min',
    sections: [
      {
        heading: 'Antes del viaje o la mudanza',
        paragraphs: [
          'Anticipar el cambio ayuda mucho: si es un viaje en auto, conviene acostumbrar a la mascota al transportín o al cinturón de seguridad para mascotas con sesiones cortas y positivas en los días previos, no recién el día del viaje.',
          'En mudanzas, mantener la rutina de comidas y paseos el mayor tiempo posible durante el proceso de empaque reduce la sensación de descontrol.',
        ],
      },
      {
        heading: 'Durante el traslado',
        paragraphs: [
          'Un objeto con el olor familiar de casa (una manta, un juguete) dentro del transportín da seguridad. Para perros propensos a marearse, es mejor viajar con el estómago liviano y hacer paradas para hidratarse y estirar las patas en trayectos largos.',
          'Evitar premios o mimos exagerados antes de subir al auto si el animal ya está nervioso, para no reforzar ese estado; es preferible transmitir calma con un tono de voz tranquilo.',
        ],
      },
      {
        heading: 'Instalarse en el nuevo hogar',
        paragraphs: [
          'Armar primero un "rincón conocido" (cama, comederos, juguetes) apenas se llega ayuda a que la mascota tenga un punto de referencia estable mientras explora el resto del espacio a su propio ritmo.',
          'Es normal que los primeros días haya menos apetito o más necesidad de esconderse; si esto se prolonga más de una semana o hay signos físicos (vómitos, diarrea sostenida), conviene consultar al veterinario.',
        ],
      },
    ],
  },
  {
    slug: 'destructividad-y-ladridos-excesivos',
    title: 'Destructividad y ladridos excesivos: por qué pasan y cómo abordarlos',
    category: 'conducta',
    petTypes: ['perro'],
    publishedAt: '2026-07-21',
    summary:
      'Antes de pensar en "corregir" estos comportamientos, hay que entender qué necesidad está cubriendo el perro. Guía para identificar la causa y trabajarla.',
    readingTime: '6 min',
    sections: [
      {
        heading: 'La destructividad casi siempre tiene una causa',
        paragraphs: [
          'Masticar y destruir objetos es un comportamiento natural, sobre todo en cachorros y perros jóvenes. Cuando se vuelve excesivo, suele estar relacionado con falta de estimulación mental y física, ansiedad por separación, aburrimiento, o en cachorros, la dentición.',
          'El primer paso es aumentar el ejercicio físico adecuado a la raza y edad, sumar juegos de olfato y juguetes rellenos que exijan esfuerzo mental, y ofrecer alternativas legítimas para morder antes de que aparezca la necesidad de destruir otra cosa.',
        ],
      },
      {
        heading: 'Ladridos: identificar el "por qué" antes del "cómo parar"',
        paragraphs: [
          'Un perro puede ladrar por alerta (ruidos, gente pasando), por ansiedad al quedarse solo, por aburrimiento, por pedir atención, o por frustración (ver algo que quiere y no poder llegar). El abordaje es distinto según la causa.',
          'Para ladridos de alerta, tapar parcialmente la vista hacia la calle o el uso de cortinas puede reducir los disparadores. Para ladridos por atención, es clave no reforzarlos (ni con regaños, que también son atención) y sí premiar el silencio quieto.',
        ],
      },
      {
        heading: 'Qué evitar',
        paragraphs: [
          'Los castigos físicos o los gritos suelen empeorar la ansiedad de base y no resuelven la causa, generando en algunos casos más ladridos o directamente miedo hacia la persona. Los collares de citronela o antiladridos deben usarse, si acaso, solo bajo supervisión profesional y nunca como primera opción.',
        ],
      },
      {
        heading: 'Cuándo pedir ayuda',
        paragraphs: [
          'Si después de aumentar estímulo y trabajar la causa probable no hay mejoras en algunas semanas, o el comportamiento es muy intenso, un adiestrador o veterinario especializado en conducta puede armar un plan personalizado.',
        ],
      },
    ],
  },
  {
    slug: 'primeros-auxilios-basicos-para-mascotas',
    title: 'Primeros auxilios básicos para mascotas: qué hacer mientras llegás al veterinario',
    category: 'salud',
    petTypes: ['perro', 'gato'],
    publishedAt: '2026-07-28',
    summary:
      'Ante una urgencia, los primeros minutos importan. Estas son pautas generales de primeros auxilios, que nunca reemplazan la atención veterinaria.',
    readingTime: '5 min',
    sections: [
      {
        heading: 'Antes que nada',
        paragraphs: [
          'Esta guía es orientativa y no reemplaza la consulta veterinaria. Ante cualquier emergencia, el paso más importante es contactar a tu veterinario o a una guardia veterinaria lo antes posible, siguiendo mientras tanto estas pautas generales de contención.',
        ],
      },
      {
        heading: 'Heridas y sangrado',
        paragraphs: [
          'Aplicar presión directa con una gasa o tela limpia sobre la herida ayuda a controlar el sangrado mientras se traslada a la mascota. Evitar aplicar alcohol, agua oxigenada o cualquier producto casero directamente sobre heridas profundas sin indicación veterinaria.',
        ],
      },
      {
        heading: 'Golpe de calor',
        paragraphs: [
          'Jadeo excesivo, encías muy rojas, debilidad o desorientación en un día caluroso pueden indicar golpe de calor. Mientras se traslada a la mascota, se puede mojar con agua templada (no helada) en el cuerpo y las patas, y ofrecer sombra y ventilación, evitando sumergirla en agua muy fría, que puede ser contraproducente.',
        ],
      },
      {
        heading: 'Ingesta de algo tóxico o extraño',
        paragraphs: [
          'Si se sospecha que la mascota comió algo tóxico (chocolate, algunas plantas, medicamentos humanos) o un objeto extraño, no inducir el vómito por cuenta propia: cada sustancia requiere un manejo distinto y en algunos casos vomitar puede empeorar el cuadro. Lo correcto es llamar de inmediato al veterinario o a un centro de toxicología veterinaria con el producto o envase a mano para dar la información exacta.',
        ],
      },
      {
        heading: 'Convulsiones',
        paragraphs: [
          'Durante una convulsión, alejar objetos con los que la mascota pueda golpearse, no sujetarla con fuerza ni poner las manos cerca de su boca, y cronometrar la duración del episodio para informarla al veterinario. Si dura más de unos minutos o se repite varias veces seguidas, es una urgencia y debe trasladarse de inmediato.',
        ],
      },
    ],
  },
  {
    slug: 'vacunas-y-desparasitacion-guia-para-no-perderse',
    title: 'Vacunas y desparasitación: guía para no perderte ninguna dosis',
    category: 'salud',
    petTypes: ['perro', 'gato'],
    publishedAt: '2026-08-04',
    summary:
      'Cumplir el calendario de vacunas y desparasitaciones es una de las formas más simples y efectivas de prevenir enfermedades graves. Cómo organizarlo sin olvidos.',
    readingTime: '4 min',
    sections: [
      {
        heading: 'Por qué respetar el calendario',
        paragraphs: [
          'Las vacunas protegen contra enfermedades graves y en muchos casos mortales (parvovirus, moquillo, panleucopenia felina, entre otras), y su efectividad depende de aplicarse en el esquema y los intervalos que indique el veterinario, especialmente durante los primeros meses de vida.',
          'La desparasitación interna y externa regular no solo cuida a la mascota: algunos parásitos pueden transmitirse a las personas, por lo que sostener el esquema es también una medida de salud familiar.',
        ],
      },
      {
        heading: 'Errores comunes',
        paragraphs: [
          'Espaciar demasiado las dosis de refuerzo pensando que "ya está protegido", dejar de desparasitar en invierno creyendo que solo hace falta en verano, o suspender el esquema en mascotas que no salen a la calle (los parásitos también pueden ingresar por otras vías, como alimentos crudos o contacto con otros animales).',
        ],
      },
      {
        heading: 'Cómo organizarse para no perder ninguna dosis',
        paragraphs: [
          'Llevar un registro por escrito (o digital) de cada aplicación con la fecha de la próxima dosis es la forma más simple de no depender de la memoria. Configurar recordatorios con unos días de anticipación permite reservar turno con el veterinario a tiempo.',
        ],
      },
    ],
  },
  {
    slug: 'como-ensenar-a-tu-perro-a-sentarse',
    title: 'Cómo enseñar a tu perro a sentarse: el truco base',
    category: 'adiestramiento',
    petTypes: ['perro'],
    publishedAt: '2026-08-07',
    summary:
      'Enseñar "sentado" no es solo un truco vistoso: es la base de toda la educación del perro y una forma clara de comunicarse con él. Cómo enseñarlo paso a paso con refuerzo positivo.',
    readingTime: '5 min',
    coverImage: {
      src: '/guides/como-ensenar-a-tu-perro-a-sentarse/paso-1.jpg',
      alt: 'Mujer abrazando a su perro Border Collie sentado en el pasto de un parque',
    },
    sections: [
      {
        heading: 'Por qué empezar por "sentado"',
        paragraphs: [
          'El comando "sentado" funciona como el botón de pausa del perro: una vez que lo aprende, es más fácil pedirle calma antes de cruzar una puerta, saludar visitas o esperar la comida. Por eso suele ser el primer ejercicio de cualquier plan de adiestramiento.',
          'Además de ser útil en el día a día, practicarlo estimula la mente del perro, ayuda a reducir la ansiedad y fortalece el vínculo con la familia. Con paciencia y refuerzo positivo, la mayoría de los perros lo aprende en pocos días.',
        ],
      },
      {
        heading: 'El kit de entrenamiento y el entorno ideal',
        paragraphs: [
          'Conviene tener a mano premios de alto valor (trocitos de salchicha, queso o pollo), del tamaño de una arveja para que el perro los coma rápido y no se distraiga masticando.',
          'Elegir un lugar tranquilo, sin otros perros, pelotas ni ruidos fuertes cerca, ayuda mucho en las primeras sesiones. Si la persona está cansada o de mal humor, mejor practicar otro día: el perro nota el estado de ánimo de quien lo entrena.',
        ],
        image: {
          src: '/guides/como-ensenar-a-tu-perro-a-sentarse/paso-3.jpg',
          alt: 'Riñonera con premios de entrenamiento mientras el perro espera atento',
        },
      },
      {
        heading: 'Paso 1: guiar con la comida (luring)',
        paragraphs: [
          'Con el perro parado frente a la persona, se toma un premio entre los dedos y se lo acerca a la punta de su nariz, dejando que lo huela sin que lo coma todavía.',
          'Despacio, se mueve la mano hacia atrás por encima de su cabeza, en dirección a la cola. Al seguir el premio con la mirada, la mayoría de los perros levanta la cabeza y, de forma natural, va bajando la cola hasta sentarse.',
        ],
        image: {
          src: '/guides/como-ensenar-a-tu-perro-a-sentarse/paso-4.jpg',
          alt: 'Persona acercando un premio a la nariz del perro para guiarlo a sentarse',
        },
      },
      {
        heading: 'Paso 2: marcar el momento y sumar la palabra',
        paragraphs: [
          'En el instante exacto en que se sienta, hay que marcarlo con una palabra entusiasta ("¡muy bien!") y entregar el premio enseguida. Repetir esta secuencia 5 a 10 veces seguidas ayuda a que el perro empiece a anticipar el movimiento.',
          'Una vez que se sienta con fluidez siguiendo la mano, se suma la palabra "sentado" justo antes del gesto, para que empiece a asociar la orden con la acción.',
        ],
        image: {
          src: '/guides/como-ensenar-a-tu-perro-a-sentarse/paso-2.jpg',
          alt: 'Perro sentado mirando atentamente a su entrenadora',
        },
      },
      {
        heading: 'Paso 3: soltar la mano y generalizar',
        paragraphs: [
          'El objetivo final es que el perro responda a la palabra y no solo a la mano con comida. Para lograrlo, se repite el mismo gesto pero con la mano vacía: cuando el perro se sienta igual, se lo marca y se le da el premio desde el otro bolsillo.',
          'Practicar la orden en distintos lugares (el living, el patio, la vereda) ayuda a que el comando se fije en cualquier situación, no solo en el rincón donde se entrenó al principio.',
        ],
        image: {
          src: '/guides/como-ensenar-a-tu-perro-a-sentarse/paso-6.jpg',
          alt: 'Persona dando la señal de mano para pedir "sentado" sin premio a la vista',
        },
      },
      {
        heading: 'Resolución de problemas frecuentes',
        paragraphs: [
          'Si el perro se para en dos patas en lugar de sentarse, probablemente la mano con el premio está demasiado alta: conviene mantenerla más cerca de su cabeza, casi rozando el hocico.',
          'Si camina hacia atrás en vez de sentarse, la mano se está moviendo demasiado rápido; hay que hacerlo más lento para darle tiempo a acomodar el cuerpo. Y si se distrae con facilidad, lo mejor es acortar las sesiones a 3-5 minutos y practicar varias veces al día.',
        ],
      },
      {
        heading: 'Después de lograrlo',
        paragraphs: [
          'Una vez que el perro responde bien, conviene mantener el ejercicio practicado durante la semana: es la base sobre la que se apoyan los próximos comandos. Festejar cada logro con juego y caricias ayuda a cerrar la sesión con una sensación de éxito para los dos.',
        ],
        image: {
          src: '/guides/como-ensenar-a-tu-perro-a-sentarse/paso-7.jpg',
          alt: 'Persona chocando la mano con la pata de su perro como festejo',
        },
      },
    ],
  },
];

export const PET_GUIDE_TYPE_LABELS: Record<PetGuidePetType, string> = {
  perro: 'Perros',
  gato: 'Gatos',
};

export function getPetGuideBySlug(slug: string): PetGuide | undefined {
  return PET_GUIDES.find((guide) => guide.slug === slug);
}

export function getGuidesSortedByDate(): PetGuide[] {
  return [...PET_GUIDES].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getRecentGuides(count = 5): PetGuide[] {
  return getGuidesSortedByDate().slice(0, count);
}

export function isRecentlyPublished(publishedAt: string, days = 7): boolean {
  const publishedTime = new Date(publishedAt).getTime();
  const diffDays = (Date.now() - publishedTime) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

export function filterGuides(
  guides: PetGuide[],
  filters: { category?: PetGuideCategory | 'todas'; petType?: PetGuidePetType | 'todas' },
): PetGuide[] {
  return guides.filter((guide) => {
    const matchesCategory = !filters.category || filters.category === 'todas' || guide.category === filters.category;
    const matchesPetType = !filters.petType || filters.petType === 'todas' || guide.petTypes.includes(filters.petType);
    return matchesCategory && matchesPetType;
  });
}
