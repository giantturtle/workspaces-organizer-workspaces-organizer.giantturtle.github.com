// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

// Import statements at the top level
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// gettext is provided via the prefs module import above

// Schema and Key
const WORKSPACE_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_KEY = 'workspace-names';

// WorkspaceNameModel Class
const WorkspaceNameModel = GObject.registerClass(
class WorkspaceNameModel extends Gtk.ListStore {
    _init(params) {
        super._init(params);
        this.set_column_types([GObject.TYPE_STRING]);

        this.Columns = {
            LABEL: 0,
        };

        this._settings = new Gio.Settings({ schema_id: WORKSPACE_SCHEMA });
        this._reloadFromSettings();

        this.connect('row-changed', this._onRowChanged.bind(this));
        this.connect('row-inserted', this._onRowInserted.bind(this));
        this.connect('row-deleted', this._onRowDeleted.bind(this));
    }

    _reloadFromSettings() {
        if (this._preventChanges)
            return;
        this._preventChanges = true;

        let newNames = this._settings.get_strv(WORKSPACE_KEY);

        let i = 0;
        let [ok, iter] = this.get_iter_first();
        while (ok && i < newNames.length) {
            this.set(iter, [this.Columns.LABEL], [newNames[i]]);
            ok = this.iter_next(iter);
            i++;
        }

        while (ok)
            ok = this.remove(iter);

        for (; i < newNames.length; i++) {
            iter = this.append();
            this.set(iter, [this.Columns.LABEL], [newNames[i]]);
        }

        this._preventChanges = false;
    }

    _onRowChanged(self, path, iter) {
        if (this._preventChanges)
            return;
        this._preventChanges = true;

        let index = path.get_indices()[0];
        let names = this._settings.get_strv(WORKSPACE_KEY);

        if (index >= names.length) {
            for (let i = names.length; i <= index; i++)
                names[i] = '';
        }

        names[index] = this.get_value(iter, this.Columns.LABEL);
        this._settings.set_strv(WORKSPACE_KEY, names);

        this._preventChanges = false;
    }

    _onRowInserted(self, path, iter) {
        if (this._preventChanges)
            return;
        this._preventChanges = true;

        let index = path.get_indices()[0];
        let names = this._settings.get_strv(WORKSPACE_KEY);
        let label = this.get_value(iter, this.Columns.LABEL) || '';
        names.splice(index, 0, label);

        this._settings.set_strv(WORKSPACE_KEY, names);

        this._preventChanges = false;
    }

    _onRowDeleted(self, path) {
        if (this._preventChanges)
            return;
        this._preventChanges = true;

        let index = path.get_indices()[0];
        let names = this._settings.get_strv(WORKSPACE_KEY);

        if (index >= names.length)
            return;

        names.splice(index, 1);

        for (let i = names.length - 1; i >= 0 && !names[i]; i++)
            names.pop();

        this._settings.set_strv(WORKSPACE_KEY, names);

        this._preventChanges = false;
    }
});

// WorkspaceSettingsWidget Class
const WorkspaceSettingsWidget = GObject.registerClass(
class WorkspaceSettingsWidget extends Gtk.Grid {
    _init(params) {
        super._init(params);
        this.set_margin_top(12);
        this.set_margin_bottom(12);
        this.set_margin_start(12);
        this.set_margin_end(12);
        this.orientation = Gtk.Orientation.VERTICAL;

        let scrolled = new Gtk.ScrolledWindow({ });
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.attach(scrolled, 0, 1, 1, 1);

        this._store = new WorkspaceNameModel();
        this._treeView = new Gtk.TreeView({
            model: this._store,
            headers_visible: false,
            reorderable: true,
            hexpand: true,
            vexpand: true,
        });

        let column = new Gtk.TreeViewColumn({ title: _('Name') });
        let renderer = new Gtk.CellRendererText({ editable: true });
        renderer.connect('edited', this._cellEdited.bind(this));
        column.pack_start(renderer, true);
        column.add_attribute(renderer, 'text', this._store.Columns.LABEL);
        this._treeView.append_column(column);

        scrolled.set_child(this._treeView);

        let toolbar = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        toolbar.get_style_context().add_class('toolbar');
        toolbar.get_style_context().add_class('inline-toolbar');

        let newButton = new Gtk.Button({ icon_name: 'list-add-symbolic' });
        newButton.connect('clicked', this._newClicked.bind(this));
        toolbar.append(newButton);

        let delButton = new Gtk.Button({ icon_name: 'list-remove-symbolic' });
        delButton.connect('clicked', this._delClicked.bind(this));
        toolbar.append(delButton);

        let selection = this._treeView.get_selection();
        selection.connect('changed', () => {
            delButton.sensitive = selection.count_selected_rows() > 0;
        });
        delButton.sensitive = selection.count_selected_rows() > 0;

        this.attach(toolbar, 0, 2, 1, 1);
    }

    _cellEdited(renderer, path, newText) {
        let [ok, iter] = this._store.get_iter_from_string(path);

        if (ok)
            this._store.set(iter, [this._store.Columns.LABEL], [newText]);
    }

    _newClicked() {
        let iter = this._store.append();
        let index = this._store.get_path(iter).get_indices()[0];

        let label = _('Workspace %d').format(index + 1);
        this._store.set(iter, [this._store.Columns.LABEL], [label]);
    }

    _delClicked() {
        let [any, model_, iter] = this._treeView.get_selection().get_selected();

        if (any)
            this._store.remove(iter);
    }
});

export default class TopNotchWorkspacesPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: _('Workspace Names'),
        });
        page.add(group);
        group.add(new WorkspaceSettingsWidget());
        window.add(page);
    }
}