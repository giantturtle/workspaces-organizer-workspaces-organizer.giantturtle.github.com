// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { WorkspacesView } from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as SessionMode from 'resource:///org/gnome/shell/ui/sessionMode.js';

// gettext is provided via the Extension module import above

// Schema and Key
const WORKSPACE_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_KEY = 'workspace-names';

// WindowPreview Class
let WindowPreview = GObject.registerClass(
    class WindowPreview extends St.Button {
        _init(window) {
            super._init({
                style_class: 'workspace-indicator-window-preview',
            });

            this._delegate = this;
            DND.makeDraggable(this, { restoreOnSuccess: true });

            this._window = window;

            /* Use a smaller icon to allow more previews to fit in a workspace */
            this.icon_size = 22;

            this._updateIcon();

            this._focusChangedId = global.workspace_manager.connect('notify::focus-window',
                this._onFocusChanged.bind(this));
            this._wmClassChangedId = this._window.connect('notify::wm-class',
                this._updateIcon.bind(this));
            this._mappedId = this._window.connect('notify::mapped',
                this._updateIcon.bind(this));
            this._onFocusChanged();
        }

        // needed for DND
        get realWindow() {
            return this._window.get_compositor_private();
        }

        _updateIcon() {
            const app = Shell.WindowTracker.get_default().get_window_app(this._window) ||
                        Shell.AppSystem.get_default().lookup_app(this._window.get_wm_class());
            if (app && app.get_app_info().get_icon()) {
                this.set_child(app.create_icon_texture(this.icon_size));
            } else {
                let gicon = this._window.get_gicon();
                if (!gicon) {
                    gicon = new Gio.ThemedIcon({ name: 'applications-system-symbolic' });
                }
                const icon = new St.Icon({
                    gicon: gicon,
                    style_class: 'popup-menu-icon'
                });
                this.set_child(St.TextureCache.get_default().load_gicon(null, icon, this.icon_size));
            }
        }

        destroy() {
            global.workspace_manager.disconnect(this._focusChangedId);
            this._window.disconnect(this._wmClassChangedId);
            this._window.disconnect(this._mappedId);
            super.destroy();
        }

        _onFocusChanged() {
            
        }
    });

// WorkspaceThumbnail Class
let WorkspaceThumbnail = GObject.registerClass(
    class WorkspaceThumbnail extends St.Button {
        _init(index) {
            super._init({
                style_class: 'workspace',
                x_expand: true,
                y_expand: true,
            });

            this._windowsBox = new St.BoxLayout({
                style_class: 'workspace-windows',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.set_child(this._windowsBox);

            this._index = index;
            this._delegate = this; // needed for DND

            this._windowPreviews = new Map();
            this._addWindowTimeoutIds = new Map();

            let workspaceManager = global.workspace_manager;
            this._workspace = workspaceManager.get_workspace_by_index(index);

            this._windowAddedId = this._workspace.connect('window-added',
                (ws, window) => {
                    this._addWindow(window);
                });
            this._windowRemovedId = this._workspace.connect('window-removed',
                (ws, window) => {
                    this._removeWindow(window);
                });
            this._restackedId = global.display.connect('restacked',
                this._onRestacked.bind(this));
            this._windowCreatedId = global.display.connect('window-created',
                (display, window) => {
                    if (window.get_workspace() === this._workspace) {
                        this._addWindow(window);
                    }
                });

            this._workspace.list_windows().forEach(w => this._addWindow(w));
            this._onRestacked();
        }

        acceptDrop(source) {
            if (!source.realWindow)
                return false;

            let window = source.realWindow.get_meta_window();
            this._moveWindow(window);
            return true;
        }

        handleDragOver(source) {
            if (source.realWindow)
                return DND.DragMotionResult.MOVE_DROP;
            else
                return DND.DragMotionResult.CONTINUE;
        }

        _addWindow(window) {
            if (this._windowPreviews.has(window))
                return;

            // Skip uninteresting windows
            if (window.skip_taskbar)
                return;

            // Ensure we don't leave behind multiple timeouts for the same window
            if (this._addWindowTimeoutIds.has(window)) {
                GLib.Source.remove(this._addWindowTimeoutIds.get(window));
                this._addWindowTimeoutIds.delete(window);
            }
            const sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                // If already created a preview for this window, stop
                if (this._windowPreviews.has(window))
                    return GLib.SOURCE_REMOVE;

                if (!this._windowsBox || !this._windowsBox.get_stage())
                    return GLib.SOURCE_REMOVE;

                let preview = new WindowPreview(window);
                preview.connect('clicked', () => {
                    this._workspace.activate(global.get_current_time());
                    window.activate(global.get_current_time());
                });
                this._windowPreviews.set(window, preview);
                // Double check container is still valid  before adding
                if (this._windowsBox && this._windowsBox.get_stage())
                    this._windowsBox.add_child(preview);
                else
                    preview.destroy();

                this._addWindowTimeoutIds.delete(window);
                return GLib.SOURCE_REMOVE;
            });
            this._addWindowTimeoutIds.set(window, sourceId);
        }

        _removeWindow(window) {
            let preview = this._windowPreviews.get(window);
            if (!preview)
                return;

            // Remove any pending timeout for this window
            if (this._addWindowTimeoutIds.has(window)) {
                GLib.Source.remove(this._addWindowTimeoutIds.get(window));
                this._addWindowTimeoutIds.delete(window);
            }

            this._windowPreviews.delete(window);
            preview.destroy();
        }

        _onRestacked() {
            let lastPreview = null;
            let windows = global.get_window_actors().map(a => a.meta_window);
            for (let i = 0; i < windows.length; i++) {
                let preview = this._windowPreviews.get(windows[i]);
                if (!preview)
                    continue;

                lastPreview = preview;
            }
        }

        _moveWindow(window) {
            let monitorIndex = Main.layoutManager.findIndexForActor(this);
            if (monitorIndex !== window.get_monitor())
                window.move_to_monitor(monitorIndex);
            window.change_workspace_by_index(this._index, false);
        }

        on_clicked() {
            let ws = global.workspace_manager.get_workspace_by_index(this._index);
            if (ws)
                ws.activate(global.get_current_time());
        }

        // Explicitly cancel main loop sources without destroying the actor
        cleanupSources() {
            for (const [, id] of this._addWindowTimeoutIds) {
                GLib.Source.remove(id);
            }
            this._addWindowTimeoutIds.clear();
        }

        destroy() {
            this._workspace.disconnect(this._windowAddedId);
            this._workspace.disconnect(this._windowRemovedId);
            global.display.disconnect(this._restackedId);
            global.display.disconnect(this._windowCreatedId);
            // Clear any pending timeouts
            for (const [, id] of this._addWindowTimeoutIds) {
                GLib.Source.remove(id);
            }
            this._addWindowTimeoutIds.clear();
            super.destroy();
        }
    });

// WorkspaceIndicator Class
let WorkspaceIndicator = GObject.registerClass(
    class WorkspaceIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, _('Workspace Indicator'));

            this._origUpdateSwitcherVisibility =
                WorkspacesView.prototype._updateSwitcher;

            let container = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                x_expand: true,
                y_expand: true,
            });
            this.add_child(container);

            let workspaceManager = global.workspace_manager;

            this._currentWorkspace = workspaceManager.get_active_workspace_index();
            this._statusLabel = new St.Label({
                style_class: 'panel-workspace-indicator',
                y_align: Clutter.ActorAlign.CENTER,
                text: this._labelText(),
            });

            container.add_child(this._statusLabel);

            this._thumbnailsBox = new St.BoxLayout({
                style_class: 'panel-workspace-indicator-box',
                y_expand: true,
                reactive: true,
            });

            container.add_child(this._thumbnailsBox);

            this._workspacesItems = [];
            this._workspaceSection = new PopupMenu.PopupMenuSection();
            this.menu.addMenuItem(this._workspaceSection);

            this._workspaceManagerSignals = [
                workspaceManager.connect_after('notify::n-workspaces',
                    this._nWorkspacesChanged.bind(this)),
                workspaceManager.connect_after('workspace-switched',
                    this._onWorkspaceSwitched.bind(this)),
                workspaceManager.connect('notify::layout-rows',
                    this._onWorkspaceOrientationChanged.bind(this)),
            ];

            this.connect('scroll-event', this._onScrollEvent.bind(this));
            this._thumbnailsBox.connect('scroll-event', this._onScrollEvent.bind(this));
            this._createWorkspacesSection();
            this._updateThumbnails();
            this._onWorkspaceOrientationChanged();

            this._settings = new Gio.Settings({ schema_id: WORKSPACE_SCHEMA });
            this._settingsChangedId = this._settings.connect(
                `changed::${WORKSPACE_KEY}`,
                this._updateMenuLabels.bind(this));
        }

        destroy() {
            this.cleanupSources();
            this._thumbnailsBox?.destroy();
            
            for (let i = 0; i < this._workspaceManagerSignals.length; i++)
                global.workspace_manager.disconnect(this._workspaceManagerSignals[i]);

            if (this._settingsChangedId) {
                this._settings.disconnect(this._settingsChangedId);
                this._settingsChangedId = 0;
            }

            Main.panel.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);

            super.destroy();
        }

        _onWorkspaceOrientationChanged() {
            let vertical = global.workspace_manager.layout_rows === -1;
            this.reactive = vertical;

            this._statusLabel.visible = vertical;
            this._thumbnailsBox.visible = !vertical;

            // Disable offscreen-redirect when showing the workspace switcher
            // so that clip-to-allocation works
            Main.panel.set_offscreen_redirect(vertical
                ? Clutter.OffscreenRedirect.ALWAYS
                : Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY);
        }

        _onWorkspaceSwitched() {
            this._currentWorkspace = global.workspace_manager.get_active_workspace_index();

            this._updateMenuOrnament();
            this._updateActiveThumbnail();

            this._statusLabel.set_text(this._labelText());
        }

        _nWorkspacesChanged() {
            this._createWorkspacesSection();
            this._updateThumbnails();
        }

        _updateMenuOrnament() {
            for (let i = 0; i < this._workspacesItems.length; i++) {
                this._workspacesItems[i].setOrnament(i === this._currentWorkspace
                    ? PopupMenu.Ornament.DOT
                    : PopupMenu.Ornament.NONE);
            }
        }

        _updateActiveThumbnail() {
            let thumbs = this._thumbnailsBox.get_children();
            for (let i = 0; i < thumbs.length; i++) {
                if (i === this._currentWorkspace)
                    thumbs[i].add_style_class_name('active');
                else
                    thumbs[i].remove_style_class_name('active');
            }
        }

        _labelText(workspaceIndex) {
            if (workspaceIndex === undefined) {
                workspaceIndex = this._currentWorkspace;
                return (workspaceIndex + 1).toString();
            }
            return Meta.prefs_get_workspace_name(workspaceIndex);
        }

        _updateMenuLabels() {
            for (let i = 0; i < this._workspacesItems.length; i++)
                this._workspacesItems[i].label.text = this._labelText(i);
        }

        _createWorkspacesSection() {
            let workspaceManager = global.workspace_manager;

            this._workspaceSection.removeAll();
            this._workspacesItems = [];
            this._currentWorkspace = workspaceManager.get_active_workspace_index();

            let i = 0;
            for (; i < workspaceManager.n_workspaces; i++) {
                this._workspacesItems[i] = new PopupMenu.PopupMenuItem(this._labelText(i));
                this._workspaceSection.addMenuItem(this._workspacesItems[i]);
                this._workspacesItems[i].workspaceId = i;
                this._workspacesItems[i].label_actor = this._statusLabel;
                this._workspacesItems[i].connect('activate', (actor, _event) => {
                    this._activate(actor.workspaceId);
                });

                if (i === this._currentWorkspace)
                    this._workspacesItems[i].setOrnament(PopupMenu.Ornament.DOT);
            }

            this._statusLabel.set_text(this._labelText());
        }

        _updateThumbnails() {
            let workspaceManager = global.workspace_manager;

            this._thumbnailsBox.destroy_all_children();

            for (let i = 0; i < workspaceManager.n_workspaces; i++) {
                let thumb = new WorkspaceThumbnail(i);
                this._thumbnailsBox.add_child(thumb);
            }
            this._updateActiveThumbnail();
        }

        // Explicitly cancel any GLib sources created by thumbnails
        cleanupSources() {
            let thumbs = this._thumbnailsBox.get_children();
            for (let i = 0; i < thumbs.length; i++) {
                if (typeof thumbs[i].cleanupSources === 'function')
                    thumbs[i].cleanupSources();
            }
        }

        _activate(index) {
            let workspaceManager = global.workspace_manager;

            if (index >= 0 && index < workspaceManager.n_workspaces) {
                let metaWorkspace = workspaceManager.get_workspace_by_index(index);
                metaWorkspace.activate(global.get_current_time());
            }
        }

        _onScrollEvent(actor, event) {
            let direction = event.get_scroll_direction();
            let diff = 0;
            if (direction === Clutter.ScrollDirection.DOWN)
                diff = 1;
            else if (direction === Clutter.ScrollDirection.UP)
                diff = -1;
            else
                return;

            let newIndex = global.workspace_manager.get_active_workspace_index() + diff;
            this._activate(newIndex);
        }
    });

export default class TopNotchWorkspaces extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._handles = [];
        this._origUpdateSwitcher = null;
    }



    enable() {
        
        // Workspace indicator in top bar
        this._indicator = new WorkspaceIndicator();
        Main.panel.addToStatusArea('workspace-indicator', this._indicator, 0, 'center');
    }

    disable() {
        
        // Destroy workspace indicator
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
