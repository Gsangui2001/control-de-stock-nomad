# Cámaras nuevas de 12 V para el barco

Investigación del 6 de octubre de 2026. El usuario confirmó 12 V de alimentación (no un límite de 12 W). También se requieren varias cámaras, varias personas con acceso y grabaciones consultables.

## Selección inicial

**Reolink RLC-810WA + grabador RLN12W**. Es una propuesta de equipo a evaluar, no una compra realizada ni una instalación probada a bordo.

| Equipo | Alimentación | Conexión / imagen | Usuarios / crecimiento |
|---|---|---|---|
| [RLC-810WA](https://reolink.com/product/rlc-810wa/) | 12 V CC, 1 A; consumo especificado menor a 12 W | Wi-Fi 6, 2,4/5 GHz, 4K/8 MP, IP67; RTSP y ONVIF | Hasta 20 cuentas: 1 administrador y 19 usuarios. Hasta 12 transmisiones simultáneas: 2 principales y 10 secundarias |
| [RLC-510WA](https://support.reolink.com/articles/11575873600153-FAQs-RLC-510WA/) | 12 V CC, 1 A | Alternativa de 5 MP, Wi-Fi, IP66; compatible con NVR Reolink | Usuarios separados y vista en varios dispositivos; confirmar versión regional antes de comprar |
| [RLN12W](https://reolink.com/product/rln12w/) | 12 V CC, 2 A | Grabador Wi-Fi con disco de 2 TB, grabación continua y salida HDMI/VGA para TV | Centraliza varias cámaras. Confirmar número de canales y versión: las páginas oficiales no son consistentes entre 12 y 16 |

La alimentación de 12 V del grabador también está documentada en la [tabla oficial de fuentes](https://support.reolink.com/articles/900000590386-What-is-the-Output-Voltage-of-Reolink-DC-Power-Adapter/). No sustituirlo automáticamente por un NVR PoE: varios de esos modelos usan alimentación de 48–53 V.

## Cómo lo armaría

Como configuración inicial ilustrativa: cuatro cámaras fijas distribuidas según las zonas que se acuerden, un grabador por barco en un lugar seco y protegido, y la red Wi-Fi del barco para enlazarlas. Cuatro unidades no es una cantidad confirmada por el usuario. La conexión inalámbrica transmite video; cada cámara necesita cable de alimentación.

El grabador permite concentrar la reproducción y conservar grabaciones; no exige que cada persona vaya físicamente hasta la cámara. Se crean cuentas con usuario y contraseña y se comparte el identificador del dispositivo, según la [guía oficial de cuentas](https://support.reolink.com/articles/360011355734-How-to-Add-Admin-User-Accounts-to-Reolink-Cameras/). Los permisos por canal dependen del firmware y la función de compartición disponible, por lo que hay que verificarlos en el grabador concreto.

**20 cuentas no significa 20 personas viendo todas las cámaras en alta calidad a la vez.** Hay un límite de transmisiones simultáneas; la [tabla oficial de visualización](https://support.reolink.com/articles/360008742233-How-Many-Online-Users-can-Live-View-the-Camera-at-the-Same-Time/) distingue 2 principales y 10 secundarias.

Para la capacidad: la página comercial del RLN12W dice hasta 16; la [introducción de soporte](https://support.reolink.com/articles/23954269446681-Introduction-to-RLN12W/) menciona 12 cámaras sin batería y hasta 16 de batería. No prometer 16 cámaras fijas sin confirmación de la versión/firmware exactos.

## Integración con A bordo

La aplicación ya admite múltiples fichas de cámaras por barco, con modelo, ubicación y enlaces a vivo/grabaciones. No se cargó ningún dispositivo ficticio.

Las RLC propuestas soportan [CGI/RTSP/ONVIF](https://support.reolink.com/articles/900000617826-Which-Reolink-Products-Support-CGI-RTSP-ONVIF/), lo que abre una vía para la integración. Mi evaluación es que una reproducción incrustada en navegador necesita un intermediario que convierta el video y controle el acceso; el soporte RTSP no significa que el enlace pueda reproducirse directamente en cualquier navegador. Esa integración debe probarse con el equipo real, manteniendo las credenciales del grabador fuera del navegador.

## Antes de decidir la compra

- Confirmar cantidad de cámaras, zonas, país de compra y presupuesto: todavía no fueron informados. No se verificaron precio final, stock local, importación ni garantía regional.
- Verificar alimentación compatible de 12 V con quien instale el sistema. No se confirmó tolerancia a la tensión variable de la instalación del barco ni conexión directa a batería.
- Probar cobertura Wi-Fi donde se monten; el casco, compartimentos y mástil pueden cambiar la cobertura real.
- IP66/IP67 no se tomó como certificación marina o resistencia al salitre. Esa aptitud debe confirmarse para cada punto de montaje.
- Definir cuántos días de historial se necesitan y cuántas personas mirarán simultáneamente; de eso depende el disco, la calidad de grabación y la conexión remota.

No se compró equipo, no se abrió acceso a terceros y no se configuró ninguna cámara.
