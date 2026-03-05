import { Input, Button } from './GuiBuilder';
import { compile, isImporting } from '../compiler/compile';
import exportAction from '../compiler/exportAction';
import Settings from '../utils/config';
import getItemFromNBT from '../utils/getItemFromNBT';
import loadItemstack from '../utils/loadItemstack';

const guiTopField = net.minecraft.client.gui.inventory.GuiContainer.class.getDeclaredField('field_147009_r');
const xSizeField = net.minecraft.client.gui.inventory.GuiContainer.class.getDeclaredField('field_146999_f');
guiTopField.setAccessible(true);
xSizeField.setAccessible(true);

// init buttons
const importButton = new Button(0, 0, 0, 20, 'Import HTSL');
const exportButton = new Button(0, 0, 0, 20, 'Export HTSL');
const refreshFiles = new Button(0, 0, 0, 20, '⟳');
const backDir = new Button(0, 0, 0, 20, '⇪');
const forwardPage = new Button(0, 0, 15, 20, '⇨');
const backwardPage = new Button(0, 0, 15, 20, '⇦');
const toggleShow = new Button(0, 0, 0, 20, '⇩');
let show = false;

// load assets
const htslIcon = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/htsl.png`)));
const itemIcon = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/item.png`)));
const folderIcon = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/folder.png`)));
const nh_htslIcon = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/nh_htsl.png`)));
const nh_itemIcon = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/nh_item.png`)));
const nh_folderIcon = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/nh_folder.png`)));
const trashBin = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/bin_closed.png`)));
const openTrashBin = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/bin.png`)));

const input = new Input(0, 0, 0, 18);
input.setEnabled(false);
input.setText('Enter File Name');
input.mcObject.func_146203_f(1000); 

let files = [];
let filteredFiles = [];
let subDir = "";
let page = 0;
let linesPerPage;
let hoveringIndex;
let renderItemIcons = [];
let isGlobalSearching = false;

function renderActionGUI(x, y) {
    if (!Player.getContainer() || !(Settings.guiAvaliableEverywhere ? isInItemGui() : isInActionGui()) || isImporting()) return;

    let chestWidth = xSizeField.get(Client.currentGui.get());
    let chestX = Renderer.screen.getWidth() / 2 - chestWidth / 2;
    let topBound = input.getY() + 30;
    let xBound = input.getX() + input.getWidth();

    input.setY(Renderer.screen.getHeight() / 7 - 20);
    input.setWidth(chestX * 6 / 7);
    input.setX(chestX / 2 - input.getWidth() / 2);

    importButton.setY(input.getY() - 25);
    exportButton.setY(input.getY() - 25);
    importButton.setX(input.getX());
    importButton.setWidth(input.getWidth() / 2);
    exportButton.setX(input.getX() + input.getWidth() / 2);
    exportButton.setWidth(importButton.getWidth());

    try {
        if ((Settings.toggleFileExplorer && show) || !Settings.toggleFileExplorer) {
            refreshFiles.setWidth(Math.max(10, chestX - xBound - 10));
            refreshFiles.setX((chestX - xBound) / 2 + xBound - refreshFiles.getWidth() / 2);
            refreshFiles.setY(input.getY());
            backDir.setWidth(Math.max(10, chestX - xBound - 10));
            backDir.setX((chestX - xBound) / 2 + xBound - refreshFiles.getWidth() / 2);
            backDir.setY(input.getY() - 25);

            forwardPage.setY(Renderer.screen.getHeight() / 7 * 6 + 2);
            forwardPage.setX(input.getWidth() + input.getX() - 5);
            backwardPage.setY(Renderer.screen.getHeight() / 7 * 6 + 2);
            backwardPage.setX(input.getX() - 5);

            Renderer.drawRect(Renderer.color(30, 30, 30, 200), input.getX() - 5, topBound, input.getWidth() + 10, Renderer.screen.getHeight() / 7 * 6 - topBound);

            linesPerPage = Math.floor((Renderer.screen.getHeight() / 7 * 6 - topBound - 9) / 20);
            let hovered = false;

            for (let i = page * linesPerPage; i < filteredFiles.length && i < (page + 1) * linesPerPage; i++) {
                let currentFile = filteredFiles[i];
                let type;
                if (currentFile.endsWith(".htsl")) type = Settings.altIcons ? nh_htslIcon : htslIcon;
                else if (currentFile.endsWith(".json")) type = Settings.altIcons ? nh_itemIcon : itemIcon;
                else type = Settings.altIcons ? nh_folderIcon : folderIcon;

                let isHoveringRow = (y < topBound + 20 + 20 * (i - page * linesPerPage) && y > topBound + 20 * (i - page * linesPerPage) && x < xBound && x > input.getX());
                
                if (isHoveringRow) {
                    if (hoveringIndex != i) {
						World.playSound('random.wood_click', 0.05, 2);
                        hoveringIndex = i;
                    }
                    hovered = true;
                    Renderer.drawRect(Renderer.color(60, 60, 60, 200), input.getX() - 3, topBound + 2 + 20 * (i - page * linesPerPage), input.getWidth() + 6, 21);
                    
                    if (currentFile.endsWith(".htsl") || currentFile.endsWith(".json")) {
                        let isHoveringTrash = (x < xBound - 8 && x > xBound - 24);
                        Renderer.drawImage(isHoveringTrash ? openTrashBin : trashBin, xBound - 24, topBound + 3 + 20 * (i - page * linesPerPage), 16, 16);
                    }
                }

                let item = null;
                let pathKey = currentFile.replace(/\\/g, "/");
                if (Settings.itemIcons && currentFile.endsWith(".json")) {
                    if (renderItemIcons[pathKey]) item = renderItemIcons[pathKey];
                    else {
                        let content = FileLib.read("BHTSL", `imports/${pathKey}`);
                        if (content) {
                            try {
                                item = getItemFromNBT(JSON.parse(content).item);
                                renderItemIcons[pathKey] = item;
                            } catch(e) {}
                        }
                    }
                }

                let drawX = input.getX() + (isHoveringRow ? -2 : 0);
                let drawY = topBound + (isHoveringRow ? 3 : (Settings.altIcons ? 6 : 5)) + 20 * (i - page * linesPerPage);
                let size = isHoveringRow ? 20 : (Settings.altIcons ? 14 : 16);

                if (item) item.draw(input.getX(), topBound + 4 + 20 * (i - page * linesPerPage), 1, 200);
                else Renderer.drawImage(type, drawX, drawY, size, size);

				let displayName = isGlobalSearching ? currentFile : currentFile.replace(subDir, "");
				let maxTextWidth = input.getWidth() - 35;

				let dotIndex = displayName.lastIndexOf(".");
                if (!currentFile.endsWith(".htsl") && !currentFile.endsWith(".json")) {
                    dotIndex = -1;
                    displayName = displayName.slice(0, -1);
                }
                let baseName = dotIndex !== -1 ? displayName.substring(0, dotIndex) : displayName;
                let extension = dotIndex !== -1 ? "&8." + displayName.substring(dotIndex + 1) : "";

				let currentWidth = Renderer.getStringWidth(displayName);

				if (currentWidth > maxTextWidth) {
					while (Renderer.getStringWidth(baseName + "..." + (dotIndex !== -1 ? "." + displayName.substring(dotIndex + 1) : "")) > maxTextWidth && baseName.length > 0) {
						baseName = baseName.substring(0, baseName.length - 1);
					}
					baseName += "...";
				}

                let renderedName = baseName + extension;
				
				Renderer.drawString(renderedName, input.getX() + 21, topBound + 9 + 20 * (i - page * linesPerPage), true);

				if (input.getText() != "Enter File Name" && input.getText() != "" && currentWidth <= maxTextWidth) {
					let searchIdx = displayName.toLowerCase().indexOf(input.getText().toLowerCase());
					if (searchIdx !== -1) {
						Renderer.drawRect(Renderer.color(252, 229, 15, 100), input.getX() + 21 + Renderer.getStringWidth(displayName.substring(0, searchIdx)), topBound + 5 + 20 * (i - page * linesPerPage), Renderer.getStringWidth(input.getText()), 17);
					}
				}
            }
            if (!hovered) hoveringIndex = -1;
            if (filteredFiles.length == 0) Renderer.drawString("Nothing is here...", input.getX() + 10, topBound + 9, true);

            if (subDir != "") {
                backDir.render(x, y);
                Renderer.drawString("&7" + subDir.replace(/\\/g, "/").slice(0, -1), chestX / 2 - Renderer.getStringWidth("/" + subDir.replace(/\\/g, "/")) / 2, topBound - 10, true);
            }

            if (linesPerPage < filteredFiles.length) Renderer.drawString("&7" + page, input.getWidth() / 2 + input.getX(), input.getY() + 393, true);
            if ((page + 1) * linesPerPage < filteredFiles.length) forwardPage.render(x, y);
            if (page > 0) backwardPage.render(x, y);
            refreshFiles.render(x, y);
        }
    } catch (e) {console.log(e)}

    if (Settings.toggleFileExplorer) {
        toggleShow.setX(input.getX() - 15);
        toggleShow.setWidth(10);
        toggleShow.setY(input.getY());
        toggleShow.render(x, y);
    }
    input.render();
    importButton.render(x, y);
    exportButton.render(x, y);
}

register('guiRender', (x, y) => {
	if (Client.currentGui.getClassName() !== "GuiContainerCreative" || !Settings.renderGUIAbovePotionEffects) renderActionGUI(x, y);
});

register('postGuiRender', (x, y) => {
	if (Client.currentGui.getClassName() === "GuiContainerCreative" && Settings.renderGUIAbovePotionEffects) renderActionGUI(x, y);
});

register('guiKey', (char, keyCode, gui, event) => {
    if (!Player.getContainer() || !(Settings.guiAvaliableEverywhere ? isInItemGui() : isInActionGui()) || !inputEnabled) return;
    input.mcObject.func_146195_b(true);
    if (input.mcObject.func_146206_l()) {
        input.mcObject.func_146201_a(char, keyCode);
        readFiles(); 
        if (keyCode !== 1) cancel(event);
    }
});

let lastClick = 0;
let inputEnabled = false;

register('guiMouseClick', (x, y, mouseButton) => {
    if (!Player.getContainer() || !(Settings.guiAvaliableEverywhere ? isInItemGui() : isInActionGui()) || isImporting()) return;
    if (Settings.debounce > Date.now() - lastClick) return;
    lastClick = Date.now();

    input.mcObject.func_146192_a(x, y, mouseButton);
    if (x > input.getX() && x < input.getX() + input.getWidth() && y > input.getY() && y < input.getY() + input.getHeight()) {
        if (input.getText() === 'Enter File Name') {
            input.setText('');
            input.setCursorPosition(0);
        }
        input.setEnabled(true);
        inputEnabled = true;
    } else {
        input.setEnabled(false);
        inputEnabled = false;
    }

    if (isButtonHovered(refreshFiles, x, y)) { readFiles(); World.playSound('random.click', 0.5, 1); }
    if (subDir != "" && isButtonHovered(backDir, x, y)) {
        let tempDir = subDir.endsWith("/") ? subDir.slice(0, -1) : subDir;
        let lastIdx = tempDir.lastIndexOf("/");
        subDir = lastIdx !== -1 ? tempDir.slice(0, lastIdx + 1) : "";
        readFiles();
        World.playSound('random.click', 0.5, 1);
    }
    if ((page + 1) * linesPerPage < filteredFiles.length && isButtonHovered(forwardPage, x, y)) {
        page++;
        if (Keyboard.isKeyDown(42) || Keyboard.isKeyDown(54)) {
            page += 9;
            if (page * linesPerPage >= filteredFiles.length) page = Math.ceil(filteredFiles.length / linesPerPage) - 1;
        }
        World.playSound('random.click', 0.5, 1);
    }
    if (page > 0 && isButtonHovered(backwardPage, x, y)) {
        page--;
        if (Keyboard.isKeyDown(42) || Keyboard.isKeyDown(54)) {
            page -= 9;
            if (page < 0) page = 0;
        }
        World.playSound('random.click', 0.5, 1);
    }
    if (Settings.toggleFileExplorer && isButtonHovered(toggleShow, x, y)) {
        show = !show;
        World.playSound('random.click', 0.5, 1);
        toggleShow.setText(show ? '⇧' : '⇩');
        readFiles();
    }

    handleInputClick(importButton, compile, x, y);
    handleInputClick(exportButton, exportAction, x, y);

    let index = Math.floor((y - (input.getY() + 30)) / 20);
    if (x >= input.getX() && x <= input.getX() + input.getWidth() && index >= 0 && index < linesPerPage) {
        let fileIdx = index + (page * linesPerPage);
        if (filteredFiles[fileIdx]) {
            let selected = filteredFiles[fileIdx];
            if (selected.includes(".") && x < input.getX() + input.getWidth() - 8 && x > input.getX() + input.getWidth() - 24) {
                World.playSound('random.fizz', 0.1, 1);
				World.playSound('liquid.lavapop', 0.5, 0.5);
                FileLib.delete("BHTSL", `imports/${selected.replace(/\\/g, "/")}`);
                readFiles();
                return;
            }
            if (selected.endsWith('.htsl')) {
                if (Player.asPlayerMP().player.field_71075_bZ.field_75098_d === false) ChatLib.command("gmc");
                if (compile(selected.substring(0, selected.length - 5).replace(/\\/g, "/"))) World.playSound('random.click', 0.5, 1);
            } else if (selected.endsWith("/")) {
                subDir = selected;
                readFiles();
                World.playSound('random.click', 0.5, 1);
            } else {
                if (Player.asPlayerMP().player.field_71075_bZ.field_75098_d === false) {
                    World.playSound('mob.villager.no', 1, 1);
                    return ChatLib.chat(`&3[BHTSL] &cMust be in creative mode to import an item!`);
                }
                let content = FileLib.read('BHTSL', `/imports/${selected.replace(/\\/g, "/")}`);
                if (content) {
                    let item = getItemFromNBT(JSON.parse(content).item);
                    let slot = Player.getInventory().getItems().indexOf(null);
                    if (slot < 9 && slot !== -1) slot += 36;
                    if (slot !== -1) loadItemstack(item.getItemStack(), slot);
                    World.playSound('random.click', 0.5, 1);
                }
            }
        }
    }
});

function handleInputClick(button, action, x, y) {
    if (isButtonHovered(button, x, y)) {
        World.playSound('random.click', 0.5, 1);
        if (!isInActionGui()) return;
        let fileName = (input.getText() === "Enter File Name" || input.getText() === "") ? "default" : input.getText();
        if (Player.asPlayerMP().player.field_71075_bZ.field_75098_d === false) ChatLib.command("gmc");
        action(subDir + fileName);
        input.setSelectionEnd(0);
        input.setCursorPosition(0);
        input.setIsFocused(false);
        if (!Settings.saveFile || fileName == "default") input.setText('Enter File Name');
    }
}

function isButtonHovered(button, x, y) {
    return x > button.getX() && x < button.getX() + button.getWidth() && y > button.getY() && y < button.getY() + button.getHeight();
}

function readFiles() {
    page = 0;
    files = [];
    filteredFiles = [];
    renderItemIcons = [];
    if (Settings.toggleFileExplorer && !show) return;

    try {
        const clean = (str) => str.replace(/[&§][0-9a-fk-or]/gi, "").replace(/^\s+/, "").toLowerCase();
        const searchText = input.getText();
        const isSearching = searchText !== "Enter File Name" && searchText !== "";
        isGlobalSearching = Settings.globalSearch && isSearching;
        
        const searchPath = `./config/ChatTriggers/modules/BHTSL/imports/${isGlobalSearching ? "" : subDir.replace(/\\+/g, "/")}`;
        let rawFiles = readDir(searchPath, isGlobalSearching);

        files = rawFiles.map(name => isGlobalSearching ? name : subDir + name).filter(n => n.endsWith(".htsl") || n.endsWith(".json") || n.endsWith("/"));

        files.sort((a, b) => {
            let isDirA = a.endsWith('/'), isDirB = b.endsWith('/');
            if (isDirA && !isDirB) return -1;
            if (!isDirA && isDirB) return 1;
            return clean(a).localeCompare(clean(b));
        });

        filteredFiles = isSearching ? files.filter(n => n.toLowerCase().includes(searchText.toLowerCase())) : files;
    } catch (e) { console.error(e); }
}

function readDir(path, walk) {
    let folder = new java.io.File(path);
    let files = folder.listFiles();
    let fileNames = [];
    if (!files) return [];
    files.forEach(file => {
        let name = file.getName();
        if (file.isDirectory()) {
            if (walk) readDir(path + name + "/", true).forEach(f => fileNames.push(name + "/" + f));
            else fileNames.push(name + "/");
        } else fileNames.push(name);
    });
    return fileNames;
}

function isInItemGui() {
	if (Client.currentGui.getClassName() === "GuiContainerCreative") return true;
	if (Client.currentGui.getClassName() === "GuiEditSign") return false;
	if (Player.getContainer().getClassName() !== "ContainerChest") return false;
	if (Player.getContainer().getName().match(/Edit Actions|Actions: /)) return true;
	if (Player.asPlayerMP().player.field_71075_bZ.field_75098_d === false) return false;
	return true;
}

let wasInActionGui = false;
function isInActionGui() {
	if (Client.currentGui.getClassName() === "GuiEditSign") return false;
	if (Player.getContainer().getClassName() !== "ContainerChest") return false;
	if (Player.getContainer().getName().match(/Edit Actions|Actions: /)) return true;
	return false;
}

register('guiOpened', () => {
	if (!Player.getContainer()) return;
	// for some reason this event triggers before the gui actually loads?? so we have to wait
	setTimeout(() => {
		if (!isInActionGui()) return wasInActionGui = false;
		if (wasInActionGui) return;
		if (!wasInActionGui && isInActionGui()) wasInActionGui = true;

		if (!Settings.saveDirectory) subDir = "";
		readFiles();
	}, 50);
});

export function getSubDir() { return subDir; }
