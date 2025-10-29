Horizontal workspaces indicator, shows opened apps icons in each workspace, 
and give you the ability to switch to another workspace by just scrolling over it and 
move opened windows  to a another workspace buy just dragging them to that workspace. 
Fork of Workspace Indicator by fmuellner

In combination with Dash to panel extension:

<p align="center">
  <img src="https://github.com/giantturtle/workspaces-organizer-workspaces-organizer.giantturtle.github.com/blob/master/Screenshot%20from%202025-10-29%2018-26-50.png" alt="Screenshot">
</p>

Default Gnome Shell panel:
<p align="center">
  <img src="https://github.com/giantturtle/workspaces-organizer-workspaces-organizer.giantturtle.github.com/blob/master/Screenshot%20from%202025-10-29%2018-28-23.png" alt="Screenshot Extension settings">
</p>


To change colors and size of the indicator go to stylesheet.css file and edit it as you want.

For example changing size of workspace boxes:

```css
.panel-workspace-indicator-box .workspace {
    /* make workspace thumbnails slightly smaller so more previews fit */
    width: 70px;
    height: 28px;


.panel-workspace-indicator-box .workspace.active {
    /* highlight color */
	background-color: rgba(44, 183, 60, 0.362);
}

.panel-workspace-indicator-box .workspace {
        /* outline color, borders */

	border: 2px solid #10421d;
}


You can install it from [Gnome Extensions]  https://extensions.gnome.org/extension/8751/workspaces-organizer/