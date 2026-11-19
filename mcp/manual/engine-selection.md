# Selección de motor, idioma y voz

## Descubrimiento obligatorio

Usa `voice_catalog` sin filtro para obtener un resumen. Para Edge, repite con `engine=edge` e `include_voices=true`; el catálogo puede ser amplio y requiere conexión. Filtra las voces por `locale` en el cliente.

## Motores

- **Edge TTS**: online, catálogo amplio, adecuado para narraciones generales.
- **Azure Speech**: online y sujeto a credenciales. No lo selecciones si `configured=false`.
- **Qwen TTS**: local, voces y estilos configurables; puede tardar al cargar el modelo.
- **MeloTTS**: local, sencillo y multilingüe.
- **Matxa alVoCat CA**: online, especializado en catalán y con voces dependientes del acento; máximo 500 caracteres por generación.
- **Clonador**: usa perfiles creados por el usuario. No clones una voz sin autorización y muestra los perfiles existentes con `voice_list_clone_profiles`.

## Preguntas al usuario

Pregunta solamente cuando falte una decisión material: idioma o variante, tipo de narrador, estilo interpretativo, perfil clonado o preferencia local/online. Si el usuario no conoce las voces, genera entre dos y tres pruebas cortas y claramente etiquetadas.

## Ajustes

Velocidad y volumen aceptan -50 a +50. El tono acepta -100 a +100 Hz. Empieza en cero salvo indicación creativa. Para ajustar una locución a una escena, modifica primero velocidad moderadamente; no fuerces cambios extremos que degraden la voz.

