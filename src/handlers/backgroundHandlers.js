// handlers/backgroundHandlers.js
// Handlers del dominio: Imagen de Fondo (pestaña Fondo).
// Cubre: selección de archivo, aplicar fondo, quitar fondo y Master Switch.

const vscode = require('vscode');
const path   = require('path');

/**
 * Fábrica de handlers de imagen de fondo.
 * @param {object} deps - { settings, bgManager }
 */
function createBackgroundHandlers({ settings, bgManager }) {
    return {

        // Abre el diálogo nativo del sistema operativo para elegir una imagen.
        // Valida la extensión antes de enviarla al webview.
        openFilePicker: async (_msg, webview) => {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'Imágenes': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
                title: 'Seleccionar imagen de fondo'
            });
            if (!uris || uris.length === 0) return;

            const filePath = uris[0].fsPath;
            const ext      = path.extname(filePath).toLowerCase();
            const allowed  = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

            if (!allowed.includes(ext)) {
                vscode.window.showErrorMessage(
                    `[Theme Manager] Formato "${ext}" no permitido. Usa PNG, JPG, GIF o WebP.`
                );
                return;
            }

            const previewUri = webview.asWebviewUri(uris[0]).toString();
            webview.postMessage({ command: 'fileSelected', filePath, previewUri });
        },

        // Inyecta la imagen en el CSS del workbench y persiste la configuración.
        applyBackground: async (msg, webview) => {
            const ok = await bgManager.applyBackground(msg.imagePath, msg.opacity);
            if (ok) {
                await settings.updateSettings({
                    backgroundImagePath: msg.imagePath,
                    backgroundOpacity:  msg.opacity
                });
            }
            webview.postMessage({ command: 'backgroundResult', success: ok });
        },

        // Elimina la inyección del CSS y limpia la configuración persistida.
        removeBackground: async () => {
            await bgManager.removeBackground(false);
            await settings.updateSettings({ backgroundImagePath: '' });
        },

        // Interruptor maestro: activa o desactiva todas las inyecciones CSS.
        // Al desactivar, restaura el estado original del workbench.
        // Al activar, re-aplica el fondo configurado si existe.
        masterSwitch: async (msg) => {
            const isActive = msg.value;

            if (!isActive) {
                await bgManager.restoreOriginalState();
                await settings.updateSettings({ masterSwitchActive: false });
                const choice = await vscode.window.showInformationMessage(
                    '[Theme Manager] Inyecciones desactivadas. ¿Recargar VS Code ahora?',
                    'Recargar', 'Más tarde'
                );
                if (choice === 'Recargar') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            } else {
                const s = settings.getSettings();
                await settings.updateSettings({ masterSwitchActive: true });

                if (s.backgroundImagePath) {
                    const ok = await bgManager.applyBackground(
                        s.backgroundImagePath,
                        s.backgroundOpacity || 0.15
                    );
                    if (ok) {
                        const choice = await vscode.window.showInformationMessage(
                            '[Theme Manager] Inyecciones activadas. ¿Recargar VS Code ahora?',
                            'Recargar', 'Más tarde'
                        );
                        if (choice === 'Recargar') {
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    }
                } else {
                    vscode.window.showInformationMessage(
                        '[Theme Manager] Master Switch activado. Configura un fondo para aplicar inyecciones.'
                    );
                }
            }
        }
    };
}

module.exports = { createBackgroundHandlers };
