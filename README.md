# Comercial IA PRO

PWA comercial modular. La versión inicial prioriza:
- Tarifas Fresco y Congelado X/XY/Z/W.
- Carga de PDF y registro de fecha/hora de carga.
- Productos, búsqueda y estado de stock.
- Generación de listados con Fresco + un único congelado.
- Descuentos: >19,99 € = 3%; <=19,99 € = 3/4/5% seleccionable.
- Clientes/prospectos y ofertas históricas.
- Envío/compartición del listado mediante el sistema del móvil.
- Módulos activables/desactivables.
- Solicitud Crédito y Caución usando la plantilla `assets/plantilla-cyc.xlsx`.

## Crédito y Caución
El módulo genera una copia de la plantilla real y rellena:
- Importe solicitado
- NIF
- Teléfono del contacto del cliente
- Nombre fiscal
- Nombre comercial
- Domicilio
- Localidad
- Provincia
- Código postal

Asunto del email: **Alta de cliente C y C**

En navegador puro no se puede forzar el adjunto de un `mailto:`. Por eso el botón **Compartir Excel** usa Web Share API cuando está disponible (iPhone/Android) y permite seleccionar Mail, WhatsApp u otra aplicación compatible. Para envío automático por email con adjunto se debe conectar posteriormente un proveedor/backend (p.ej. SMTP/API).

## GitHub Pages
1. Sube todo el contenido a un repositorio.
2. GitHub → Settings → Pages → Deploy from branch → `main` / root.
3. Abre la URL HTTPS y añade a la pantalla de inicio.
4. Para producción multiusuario, conecta autenticación y base de datos (Supabase/Firebase/etc.). Este paquete deja la UI y modelo local preparados para ello.

## Datos
Esta demo guarda datos localmente en el navegador (`localStorage`). No es todavía un backend multiusuario. No pongas datos sensibles de clientes en un entorno de prueba público hasta conectar autenticación y almacenamiento seguro.

## Supabase conectado

Esta versión está configurada para el proyecto Supabase `Comercial IA PRO` con su Project URL y Publishable key. La publishable key está diseñada para aplicaciones de navegador; la seguridad de los datos depende de las políticas RLS del esquema.

**Importante:** no incluir nunca una `sb_secret_...` en el frontend, GitHub o archivos públicos.

### Paso pendiente en Supabase

En el Dashboard de Supabase abre **SQL Editor**, pega `supabase/schema.sql` y ejecútalo para crear las tablas y políticas. Después crea el primer usuario administrador y ajusta su `profiles.role` a `admin` mediante una operación administrativa segura.
