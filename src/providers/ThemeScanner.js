// providers/ThemeScanner.js
// Escanea todas las extensiones instaladas en Antigravity
// y extrae los temas de color e iconos que cada una aporta.

const vscode = require('vscode');

class ThemeScanner {
    constructor() {
        this._colorThemesCache = null;
        this._iconThemesCache = null;
        vscode.extensions.onDidChange(() => {
            this._colorThemesCache = null;
            this._iconThemesCache = null;
        });
    }

    /**
     * Retorna todos los temas de color agrupados por extensión.
     */
    getColorThemes(favorites = [], tags = {}) {
        if (this._colorThemesCache) return this._colorThemesCache;
        const groups = [];

        for (const ext of vscode.extensions.all) {
            const pkg = ext.packageJSON;
            if (!pkg?.contributes?.themes?.length) continue;

            const themes = pkg.contributes.themes.map(t => {
                const id = t.id || t.label; // VS Code prefiere id, si no label
                return {
                    label: t.label || t.id || 'Sin nombre',
                    id: id,
                    uiTheme: t.uiTheme || 'vs-dark',
                    extensionId: ext.id,
                    isFavorite: favorites.includes(id),
                    tags: tags[id] || []
                };
            });

            const name = pkg.displayName || pkg.name || ext.id;
            groups.push({
                extensionId: ext.id,
                extensionName: name,
                themes
            });
        }

        // Añadir temas personalizados del usuario
        const cfg = vscode.workspace.getConfiguration('themeManager');
        const customThemes = cfg.get('customThemes') || [];
        if (customThemes.length > 0) {
            groups.push({
                extensionId: 'custom',
                extensionName: '⭐ Mis Temas',
                themes: customThemes.map(t => ({
                    label: t.name,
                    id: t.name,
                    uiTheme: 'vs-dark',
                    extensionId: 'custom',
                    isFavorite: favorites.includes(t.name),
                    tags: tags[t.name] || []
                }))
            });
        }

        groups.sort((a, b) => a.extensionName.localeCompare(b.extensionName));
        this._colorThemesCache = groups;
        return groups;
    }

    /**
     * Retorna todos los packs de iconos.
     */
    getIconThemes() {
        if (this._iconThemesCache) return this._iconThemesCache;
        const result = [];
        for (const ext of vscode.extensions.all) {
            const pkg = ext.packageJSON;
            if (!pkg?.contributes?.iconThemes?.length) continue;

            const name = pkg.displayName || pkg.name || ext.id;
            for (const icon of pkg.contributes.iconThemes) {
                result.push({
                    label: icon.label || icon.id || 'Sin nombre',
                    id: icon.id,
                    extensionId: ext.id,
                    extensionName: name
                });
            }
        }
        result.sort((a, b) => a.label.localeCompare(b.label));
        this._iconThemesCache = result;
        return result;
    }

    /**
     * Retorna el ID del tema actual.
     */
    getCurrentColorTheme() {
        return vscode.workspace.getConfiguration().get('workbench.colorTheme') || '';
    }

    /**
     * Retorna el pack de iconos actual.
     */
    getCurrentIconTheme() {
        return vscode.workspace.getConfiguration().get('workbench.iconTheme') || '';
    }

    /**
     * Lista plana de todos los temas.
     */
    getAllThemesFlat() {
        const flat = [];
        const themes = this.getColorThemes();
        for (const group of themes) {
            for (const t of group.themes) {
                flat.push(t);
            }
        }
        return flat;
    }
}

module.exports = ThemeScanner;
