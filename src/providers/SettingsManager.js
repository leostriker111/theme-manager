// providers/SettingsManager.js
const vscode = require('vscode');

class SettingsManager {
    constructor(context) {
        this.context = context;
    }

    /**
     * Lee los ajustes desde la configuración de VS Code.
     */
    getSettings() {
        const cfg = vscode.workspace.getConfiguration('themeManager');
        return {
            backgroundImagePath: cfg.get('backgroundImagePath') || '',
            backgroundOpacity: cfg.get('backgroundOpacity') || 0.15,
            favoriteThemes: cfg.get('favoriteThemes') || [],
            themeTags: cfg.get('themeTags') || {},
            lastVersion: '3.3.1'
        };
    }

    /**
     * Guarda un ajuste específico o un objeto completo en la configuración.
     */
    async updateSettings(newSettings) {
        const cfg = vscode.workspace.getConfiguration('themeManager');
        try {
            if (newSettings.backgroundImagePath !== undefined) await cfg.update('backgroundImagePath', newSettings.backgroundImagePath, vscode.ConfigurationTarget.Global);
            if (newSettings.backgroundOpacity !== undefined) await cfg.update('backgroundOpacity', newSettings.backgroundOpacity, vscode.ConfigurationTarget.Global);
            if (newSettings.favoriteThemes !== undefined) await cfg.update('favoriteThemes', newSettings.favoriteThemes, vscode.ConfigurationTarget.Global);
            if (newSettings.themeTags !== undefined) await cfg.update('themeTags', newSettings.themeTags, vscode.ConfigurationTarget.Global);
            return true;
        } catch (e) {
            console.error('[SettingsManager] Error guardando config:', e);
            return false;
        }
    }
}

module.exports = SettingsManager;
