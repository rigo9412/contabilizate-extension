---
description: Configuración inicial de la extensión SAT para desarrollo
---

# Configuración Inicial de Extensión SAT

## Pasos para Configurar el Entorno de Desarrollo

### 1. Preparar el Entorno
```bash
# Clonar el repositorio (si no está clonado)
git clone <repository-url>
cd contabilizate-extension

# Verificar estructura de archivos
ls -la
```

### 2. Instalar Dependencias (si aplica)
```bash
# Si hay package.json
npm install

# Si no hay package.json, crear uno para desarrollo
npm init -y
npm install --save-dev eslint prettier
```

### 3. Configurar la Extensión en Chrome
1. Abrir Chrome y navegar a `chrome://extensions/`
2. Activar "Modo de desarrollador"
3. Hacer clic en "Cargar descomprimida"
4. Seleccionar la carpeta del proyecto

### 4. Verificar Funcionalidad
1. Hacer clic en el ícono de la extensión
2. Configurar certificados de prueba
3. Probar navegación al sitio SAT

### 5. Depuración y Desarrollo
- Usar `chrome://extensions/` para recargar la extensión
- Revisar la consola del popup para errores
- Usar las DevTools del background script

## Notas Importantes
- Los certificados .cer y .key deben ser válidos para el SAT
- La extensión solo funciona en dominios SAT autorizados
- Almacenar credenciales de forma segura en local storage

## Troubleshooting Común
- **Error de permisos**: Verificar `manifest.json`
- **Certificados no cargan**: Revisar formato y validez
- **Formularios no se llenan**: Verificar selectores CSS en los scripts de forms
