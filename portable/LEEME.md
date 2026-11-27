# SIGEM portable

Cada computador guarda sus datos localmente. Descomprime el archivo completo antes de abrirlo.

En Windows abre SIGEM.exe. En macOS abre SIGEM.app. SIGEM inicia su servidor local y abre el navegador. Cierra el proceso SIGEM para detener el servidor.

En una instalación nueva, la base y las claves de prueba se crean en la carpeta SIGEM dentro de AppData Local en Windows o Library/Application Support en macOS. El archivo credenciales-demo.json contiene la contraseña de cada rol. El RUT del supervisor de demostración es 11111111-1. En un Mac que ya tenga Desktop/ProyectoAndinaSA/backend/data/andina.sqlite se usa esa base y sus fotografías existentes.

Los paquetes se generan en GitHub Actions y se descargan desde la ejecución Generar ejecutables. El paquete de Mac se genera para Apple Silicon y el de Windows para x64. Los ejecutables carecen de firma comercial y el sistema puede mostrar una advertencia.
