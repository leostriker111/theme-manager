// webview/main.js
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();

    // ── ESTADO ──
    let state = {
        colorThemeGroups:  [],
        iconThemes:        [],
        allThemesFlat:     [],
        customThemes:      [],
        currentColorTheme: '',
        currentIconTheme:  '',
        currentSettings:   {},
        currentBackground: '',
        currentBgOpacity:  0.15,
        randomOnlyFav:     false,
        masterSwitchActive: true
    };

    // ── DOM ──
    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    const tabBtns  = $$('.tab-btn');
    const tabPanes = $$('.tab-content');

    const themeSearch    = $('themeSearch');
    const themeGroups    = $('themeGroups');
    const themeCurrent   = $('themeCurrentBadge');
    const btnRandom      = $('btnRandomGeneric');
    const btnRandomFav   = $('btnRandomFav');

    // UI
    const editorFontSize    = $('editorFontSize');
    const editorFontSizeVal = $('editorFontSizeVal');
    const zoomLevel         = $('zoomLevel');
    const zoomLevelVal      = $('zoomLevelVal');
    const scrollbarSize     = $('scrollbarSize');
    const scrollbarSizeVal  = $('scrollbarSizeVal');
    const uiMinimap         = $('uiMinimap');
    const uiMenuVisible     = $('uiMenuVisible');
    const uiActivityBar     = $('uiActivityBarPos');
    const uiStatusBar       = $('uiStatusBar');
    const fontFamily        = $('fontFamily');

    // Crear
    const newThemeName   = $('newThemeName');
    const copyFromTheme  = $('copyFromTheme');
    const savedThemes    = $('savedThemesList');

    // ── NAVEGACIÓN ──
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            $(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

    // ── TEMAS DE COLOR ──
    function renderThemes(filter = '') {
        const q = filter.toLowerCase().trim();
        themeGroups.innerHTML = '';

        const allMatching = state.colorThemeGroups.flatMap(g => g.themes).filter(t => 
            t.label.toLowerCase().includes(q) || 
            (q.startsWith('#') && t.tags.some(tag => tag.toLowerCase().includes(q.substring(1))))
        );

        if (q.startsWith('#')) {
            const tagName = q.substring(1);
            if (tagName) {
                renderTagSearch(tagName, allMatching);
                return;
            }
        }

        // Mis Temas
        const misTemas = allMatching.filter(t => t.extensionId === 'custom');
        if (misTemas.length > 0) renderGroup('⭐ Mis Temas', misTemas);

        // Favoritos
        const favs = allMatching.filter(t => t.isFavorite && t.extensionId !== 'custom');
        if (favs.length > 0) renderGroup('💖 Favoritos', favs);
        
        // Resto por grupos
        state.colorThemeGroups.forEach(group => {
            if (group.extensionId === 'custom') return;
            const matches = group.themes.filter(t => allMatching.includes(t));
            if (matches.length > 0) renderGroup(group.extensionName, matches);
        });

        if (allMatching.length === 0) {
            themeGroups.innerHTML = `<div class="saved-theme-empty">No hay resultados para "${escapeHtml(filter)}"</div>`;
        }
    }

    function renderGroup(title, themes, options = {}) {
        const groupEl = document.createElement('div');
        groupEl.className = 'theme-group';
        
        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = `
            <span>${escapeHtml(title)}</span> 
            <div class="header-right">
                ${options.actions || ''}
                <span class="collapse-icon">▼</span>
            </div>
        `;

        header.onclick = () => {
            groupEl.classList.toggle('collapsed');
        };

        const itemsEl = document.createElement('div');
        itemsEl.className = 'group-items';

        themes.forEach(t => {
            const item = document.createElement('div');
            item.className = 'theme-item' + (t.id === state.currentColorTheme ? ' active' : '');
            
            const content = document.createElement('div');
            content.className = 'item-main';
            content.innerHTML = `<span class="type-dot ${t.uiTheme}"></span> <span>${escapeHtml(t.label)}</span>`;
            content.onclick = () => applyTheme(t.id);

            const star = document.createElement('div');
            star.className = 'star-btn' + (t.isFavorite ? ' active' : '');
            star.innerHTML = '★';
            star.onclick = (e) => { e.stopPropagation(); vscode.postMessage({ command: 'toggleFavorite', themeId: t.id }); };

            const tags = document.createElement('div');
            tags.className = 'tag-list';
            t.tags.forEach(tag => {
                const badge = document.createElement('div');
                badge.className = 'tag-badge';
                badge.innerHTML = `<span>#${escapeHtml(tag)}</span><span class="remove-tag">×</span>`;
                badge.querySelector('.remove-tag').onclick = (e) => { 
                    e.stopPropagation(); 
                    vscode.postMessage({ command: 'removeTag', themeId: t.id, tag }); 
                };
                tags.appendChild(badge);
            });

            const addTag = document.createElement('div');
            addTag.className = 'add-tag-btn';
            addTag.innerHTML = '+ Etiqueta';
            addTag.onclick = (e) => {
                e.stopPropagation();
                vscode.postMessage({ 
                    command: 'requestAddTag', 
                    themeId: t.id, 
                    themeLabel: t.label 
                });
            };
            tags.appendChild(addTag);

            item.appendChild(content);
            item.appendChild(star);
            item.appendChild(tags);
            itemsEl.appendChild(item);
        });

        groupEl.appendChild(header);
        groupEl.appendChild(itemsEl);
        themeGroups.appendChild(groupEl);
    }

    function renderTagSearch(tagName, themes) {
        const actions = `
            <div class="tag-folder-actions">
                <span class="action-icon" onclick="applyRandomInGroup('${tagName}')" title="Aleatorio en #${tagName}">🎲</span>
                <span class="action-icon action-delete" onclick="deleteTagGlobally('${tagName}')" title="Eliminar etiqueta #${tagName}">🗑️</span>
            </div>
        `;
        renderGroup(`📁 Etiqueta: #${tagName}`, themes, { actions });
    }

    function applyTheme(id) {
        state.currentColorTheme = id;
        vscode.postMessage({ command: 'applyTheme', themeId: id });
        updateBadges();
        // Feedback visual inmediato
        $$('.theme-item').forEach(el => el.classList.toggle('active', el.dataset.themeId === id));
    }

    // ── ALEATORIO ──
    btnRandom.onclick = () => {
        let pool = state.colorThemeGroups.flatMap(g => g.themes);
        if (state.randomOnlyFav) pool = pool.filter(t => t.isFavorite);
        if (pool.length === 0) return;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        applyTheme(pick.id);
    };

    btnRandomFav.onclick = () => {
        state.randomOnlyFav = !state.randomOnlyFav;
        btnRandomFav.classList.toggle('active', state.randomOnlyFav);
    };

    let allFoldersCollapsed = false;
    $('btnToggleFolders').onclick = () => {
        allFoldersCollapsed = !allFoldersCollapsed;
        $$('.theme-group').forEach(g => {
            if (allFoldersCollapsed) g.classList.add('collapsed');
            else g.classList.remove('collapsed');
        });
        $('btnToggleFolders').textContent = allFoldersCollapsed ? '📂 Mostrar Carpetas' : '📂 Ocultar Carpetas';
    };

    window.applyRandomInGroup = (tagName) => {
        const pool = state.colorThemeGroups.flatMap(g => g.themes).filter(t => t.tags.includes(tagName));
        if (pool.length > 0) applyTheme(pool[Math.floor(Math.random() * pool.length)].id);
    };

    window.deleteTagGlobally = (tagName) => {
        if (confirm(`¿Eliminar la etiqueta #${tagName} de todos los temas?`)) 
            vscode.postMessage({ command: 'deleteTagGlobally', tag: tagName });
    };

    // ── ICONOS ──
    function renderIconThemes(filter = '') {
        const q = filter.toLowerCase().trim();
        const list = $('iconList');
        list.innerHTML = '';
        state.iconThemes.filter(i => !q || i.label.toLowerCase().includes(q)).forEach(icon => {
            const item = document.createElement('div');
            item.className = 'icon-item' + (icon.id === state.currentIconTheme ? ' active' : '');
            item.innerHTML = `<span>🗂</span><span>${escapeHtml(icon.label)}</span>`;
            item.onclick = () => { state.currentIconTheme = icon.id; vscode.postMessage({ command: 'applyIconTheme', iconId: icon.id }); updateBadges(); renderIconThemes(q); };
            list.appendChild(item);
        });
    }

    // ── FONDO ──
    $('btnPickImage').onclick = () => vscode.postMessage({ command: 'openFilePicker' });
    $('bgOpacity').oninput = () => $('bgOpacityVal').textContent = $('bgOpacity').value + '%';
    $('btnApplyBg').onclick = () => {
        const path = $('bgImagePath').value;
        if (path) vscode.postMessage({ command: 'applyBackground', imagePath: path, opacity: parseInt($('bgOpacity').value)/100 });
    };
    $('btnRemoveBg').onclick = () => vscode.postMessage({ command: 'removeBackground' });

    function setBackgroundPreview(path, previewUri) {
        $('bgImagePath').value = path || '';
        const img = $('bgPreviewImg');
        const label = $('bgPreviewLabel');
        
        if (path && previewUri) {
            img.src = previewUri;
            img.style.display = 'block';
            label.style.display = 'none';
        } else {
            img.style.display = 'none';
            label.style.display = 'block';
            img.src = '';
        }
        $('btnApplyBg').disabled = !path || !$('masterSwitch').checked;
    }
    
    // ── MASTER SWITCH ──
    $('masterSwitch').onchange = (e) => {
        const isActive = e.target.checked;
        $('btnApplyBg').disabled = !$('bgImagePath').value || !isActive;
        $('btnRemoveBg').disabled = !isActive;
        $('bgOpacity').disabled = !isActive;
        vscode.postMessage({ command: 'masterSwitch', value: isActive });
    };

    // ── UI UI UI ──
    function updateSettingsUI() {
        const s = state.currentSettings;
        if (!s) return;
        ['editorFontSize','zoomLevel','scrollbarSize'].forEach(k => {
            if ($(k)) {
                $(k).value = s[k]; 
                $(k+'Val').textContent = s[k];
            }
        });
        uiMinimap.checked = s.minimap;
        uiMenuVisible.checked = s.menuBar;
        uiActivityBar.checked = s.activityBarPos;
        uiStatusBar.checked = s.statusBar;
        fontFamily.value = s.fontFamily || '';

        // Sincronizar slider de opacidad de fondo
        const opVal = Math.round((state.currentBgOpacity || 0.15) * 100);
        $('bgOpacity').value = opVal;
        $('bgOpacityVal').textContent = opVal + '%';
    }

    function sendUIUpdates() {
        vscode.postMessage({
            command: 'updateUISettings',
            settings: {
                editorFontSize: parseInt(editorFontSize.value),
                zoomLevel: parseFloat(zoomLevel.value),
                scrollbarSize: parseInt(scrollbarSize.value),
                minimap: uiMinimap.checked,
                menuBar: uiMenuVisible.checked,
                activityBarPos: uiActivityBar.checked,
                statusBar: uiStatusBar.checked,
                fontFamily: fontFamily.value
            }
        });
    }

    // Sliders vinculación visual y reactividad
    [editorFontSize, zoomLevel, scrollbarSize].forEach(s => {
        s.addEventListener('input', () => {
            $(s.id + 'Val').textContent = s.value;
            sendUIUpdates();
        });
    });

    [uiMinimap, uiMenuVisible, uiActivityBar, uiStatusBar].forEach(cb => {
        cb.addEventListener('change', sendUIUpdates);
    });

    fontFamily.addEventListener('change', sendUIUpdates);

    // ── CREAR ──
    $('btnCopyTheme').onclick = () => {
        const sel = copyFromTheme.value;
        if (sel) { $('btnCopyTheme').textContent = '⏳'; vscode.postMessage({ command: 'loadThemeColors', themeLabel: sel }); }
    };
    $('btnSaveTheme').onclick = () => {
        const name = newThemeName.value.trim();
        if (!name) return;
        const colors = {};
        $$('.color-grid input[type="color"]').forEach(i => colors[i.dataset.key] = i.value);
        vscode.postMessage({ command: 'saveCustomTheme', name, colors });
    };

    function renderSavedThemes() {
        savedThemes.innerHTML = '';
        if (state.customThemes.length === 0) {
            savedThemes.innerHTML = '<div class="saved-theme-empty">No hay temas propios</div>';
        } else {
            state.customThemes.forEach(t => {
                const el = document.createElement('div');
                el.className = 'saved-theme-item';
                el.innerHTML = `<span class="name">${escapeHtml(t.name)}</span> <button class="btn-primary" style="padding:2px 8px; font-size:10px" onclick="applyTheme('${t.name}')">Aplicar</button>`;
                savedThemes.appendChild(el);
            });
        }
    }

    // ── MENSAJES ──
    window.addEventListener('message', ev => {
        const msg = ev.data;
        switch (msg.command) {
            case 'setState':
                state = { ...state, ...msg };
                renderThemes(themeSearch.value);
                renderIconThemes(iconSearch.value);
                renderSavedThemes();
                updateSettingsUI();
                updateBadges();
                if (msg.masterSwitchActive !== undefined) {
                    $('masterSwitch').checked = msg.masterSwitchActive;
                    $('btnApplyBg').disabled = !$('bgImagePath').value || !msg.masterSwitchActive;
                    $('btnRemoveBg').disabled = !msg.masterSwitchActive;
                    $('bgOpacity').disabled = !msg.masterSwitchActive;
                }
                if (msg.currentBackground) setBackgroundPreview(msg.currentBackground, msg.currentBackgroundUri);
                populateCopyFrom();
                break;
            case 'themeColorsLoaded':
                $('btnCopyTheme').textContent = '📋 Copiar';
                if (msg.data?.colors) {
                    $$('.color-grid input[type="color"]').forEach(input => {
                        const val = msg.data.colors[input.dataset.key];
                        if (val) input.value = toHex(val) || input.value;
                    });
                }
                break;
            case 'fileSelected': setBackgroundPreview(msg.filePath, msg.previewUri); break;
        }
    });

    function populateCopyFrom() {
        copyFromTheme.innerHTML = '<option value="">-- Seleccionar --</option>';
        state.allThemesFlat.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id || t.label;
            opt.textContent = `${t.label} (${t.extensionName})`;
            copyFromTheme.appendChild(opt);
        });
    }

    function updateBadges() {
        const currentId = state.currentColorTheme;
        const found = state.allThemesFlat.find(t => t.id === currentId);
        const displayName = found ? found.label : currentId;
        themeCurrent.textContent = currentId ? `✓ ${displayName}` : '';
        
        const foundIcon = state.iconThemes.find(i => i.id === state.currentIconTheme);
        $('iconCurrentBadge').textContent = foundIcon ? `✓ ${foundIcon.label}` : '';

        // Actualizar versión en su nueva posición
        if (state.version) {
            const vInfo = $('versionInfo');
            if (vInfo) vInfo.textContent = 'v' + state.version;
        }
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function toHex(c) {
        if (!c || c[0] !== '#') return null;
        return c.length === 9 ? c.substring(0, 7) : c;
    }

    window.applyTheme = applyTheme; // Para botones inline
    themeSearch.oninput = () => renderThemes(themeSearch.value);
    iconSearch.oninput = () => renderIconThemes(iconSearch.value);
    vscode.postMessage({ command: 'requestState' });

})();
