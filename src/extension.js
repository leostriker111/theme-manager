// extension.js — Punto de entrada de Theme Manager
// Se activa cuando el usuario abre el panel "Temas" en la barra de actividad

const vscode = require('vscode');
const GalleryViewProvider = require('./providers/GalleryViewProvider');

let mainProvider = null;

/**
 * Se llama una sola vez cuando la extensión se activa.
 * Registra el proveedor del Webview y los comandos disponibles.
 */
function activate(context) {
    console.log('[Theme Manager] Extensión activada.');

    const provider = new GalleryViewProvider(context);
    mainProvider = provider;

    // Registra el WebviewView en la barra lateral
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            GalleryViewProvider.viewId,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Comando: Actualizar lista de temas manualmente
    context.subscriptions.push(
        vscode.commands.registerCommand('themeManager.refresh', () => {
            provider.refresh();
        })
    );

    // Comando: Quitar imagen de fondo
    context.subscriptions.push(
        vscode.commands.registerCommand('themeManager.removeBackground', () => {
            provider.removeBackground();
        })
    );

    // Escucha cambios de tema externos (si el usuario cambia el tema por otra vía)
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.colorTheme') ||
                e.affectsConfiguration('workbench.iconTheme')) {
                provider.syncCurrentTheme();
            }
        })
    );
}

function deactivate() {
    console.log('[Theme Manager] Extensión desactivada. Iniciando limpieza...');
    if (mainProvider && mainProvider.creator) {
        // Intenta limpiar las inyecciones sincrónicamente antes de que muera el proceso.
        // Retornar la promesa ayuda a que VS Code espere a que termine la limpieza.
        return mainProvider.creator.restoreOriginalState().then(() => {
            console.log('[Theme Manager] Limpieza completada.');
        });
    }
}

module.exports = { activate, deactivate };
