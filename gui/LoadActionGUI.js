import { Input, Button } from './GuiBuilder';
import { compile, isImporting } from '../compiler/compile';
import exportAction from '../compiler/exportAction';
import Settings from '../utils/config';
import getItemFromNBT from '../utils/getItemFromNBT';
import loadItemstack from '../utils/loadItemstack';
import codeWindow, { isCodeOpen } from '../gui/codeWindow';

const Desktop = Java.type("java.awt.Desktop");
const File = Java.type("java.io.File");

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
const editPen = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/pen.png`)));
const hoverEditPen = new Image(javax.imageio.ImageIO.read(new java.io.File(`./config/ChatTriggers/modules/BHTSL/assets/pen_hover.png`)));
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
let lastIsGlobalSearching = false;
let cachedFiles = null;
let cacheTimestamp = 0;
let CACHE_DURATION = 5000; // Cache for 5 seconds
let searchTimeout = null;
let lastSearchPath = null;

function renderActionGUI(x, y) {
    if (!Player.getContainer() || !(Settings.guiAvaliableEverywhere ? isInItemGui() : isInActionGui()) || isImporting() || isCodeOpen()) return;

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
                    
                    if (Settings.showEditButtonInImportMenu && currentFile.endsWith(".htsl")) {
                        let isHoveringPen = (x < xBound - 24 && x > xBound - 40);
                        Renderer.drawImage(isHoveringPen ? hoverEditPen : editPen, xBound - 40, topBound + 4 + 20 * (i - page * linesPerPage), 16, 16);
                    }
                    if (currentFile.endsWith(".htsl") || currentFile.endsWith(".json")) {
                        let isHoveringTrash = (x < xBound - 4 && x > xBound - 20);
                        Renderer.drawImage(isHoveringTrash ? openTrashBin : trashBin, xBound - 20, topBound + 4 + 20 * (i - page * linesPerPage), 16, 16);
                    }

                }

                let item = null;
                let pathKey = currentFile;
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
                    displayName = displayName.slice(0, -1) + "&8/&r";
                }
                let baseName = dotIndex !== -1 ? displayName.substring(0, dotIndex) : displayName;
                let extension = dotIndex !== -1 ? "&8." + displayName.substring(dotIndex + 1) : "";

				let currentWidth = Renderer.getStringWidth(displayName);

				if (currentWidth > maxTextWidth) {
					while (Renderer.getStringWidth("..." + baseName + (dotIndex !== -1 ? "." + displayName.substring(dotIndex + 1) : "")) > maxTextWidth && baseName.length > 0) {
						baseName = baseName.substring(1);
					}
					baseName = "&8...&f" + baseName;
				}

                let renderedName = baseName + extension;
				
				Renderer.drawString(renderedName, input.getX() + 21, topBound + 9 + 20 * (i - page * linesPerPage), true);
            }
            if (!hovered) hoveringIndex = -1;
            if (filteredFiles.length == 0) Renderer.drawString("Nothing is here...", input.getX() + 10, topBound + 9, true);

            if (subDir != "") {
                backDir.render(x, y);
                let displayDir = "&7" + subDir.replaceAll("/", "&8/&7");
                let dirWidth = Renderer.getStringWidth(displayDir);
                let maxDirWidth = input.getWidth() + 10;
                
                // Truncate from the left by character
                if (dirWidth > maxDirWidth) {
                    let truncatedDir = subDir;
                    
                    while (Renderer.getStringWidth("&8...&7" + truncatedDir.replaceAll("/", "&8/&7")) > maxDirWidth && truncatedDir.length > 1) {
                        truncatedDir = truncatedDir.substring(1);
                    }
                    
                    displayDir = "&8...&7" + truncatedDir.replaceAll("/", "&8/&7");
                }
                
                Renderer.drawString(displayDir, Math.ceil(chestX / 2 - Renderer.getStringWidth(displayDir) / 2), topBound - 9, false);
            }

            if (linesPerPage < filteredFiles.length) Renderer.drawString("&7" + (page + 1) + "&8/&7" + Math.ceil(filteredFiles.length / linesPerPage), input.getWidth() / 2 + input.getX(), input.getY() + 393, true);
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
        debouncedReadFiles(); 
        if (keyCode !== 1) cancel(event);
    }
});

let lastClick = 0;
let inputEnabled = false;

register('guiMouseClick', (x, y, mouseButton) => {
    if (!Player.getContainer() || !(Settings.guiAvaliableEverywhere ? isInItemGui() : isInActionGui()) || isImporting() || isCodeOpen()) return;
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

    if (isButtonHovered(refreshFiles, x, y)) { readFiles(true); World.playSound('random.click', 0.5, 1); }
    if (subDir != "" && isButtonHovered(backDir, x, y)) {
        let tempDir = subDir.endsWith("/") ? subDir.slice(0, -1) : subDir;
        let lastIdx = tempDir.lastIndexOf("/");
        subDir = lastIdx !== -1 ? tempDir.slice(0, lastIdx + 1) : "";
        readFiles(true);
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
        readFiles(true);
    }

    handleInputClick(importButton, compile, x, y);
    handleInputClick(exportButton, exportAction, x, y);

    let index = Math.floor((y - (input.getY() + 30)) / 20);
    if (x >= input.getX() && x <= input.getX() + input.getWidth() && index >= 0 && index < linesPerPage) {
        let fileIdx = index + (page * linesPerPage);
        if (filteredFiles[fileIdx]) {
            let selected = filteredFiles[fileIdx];
            if (Settings.showEditButtonInImportMenu && selected.endsWith('.htsl') && x < input.getX() + input.getWidth() - 24 && x > input.getX() + input.getWidth() - 40) {
                World.playSound('dig.cloth', 0.75, 1.5);
                World.playSound('dig.snow', 0.75, 1.5);
                if (Settings.useExternalEditor) {
                    let moduleBase = Config.modulesFolder + "/BHTSL/imports/"; 
                    let subDirPath = Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : "";

                    let fullPath = moduleBase + subDirPath + selected;
                    let file = new File(fullPath);

                    try {
                        if (file.exists()) {
                            if (Desktop.isDesktopSupported()) {
                                Desktop.getDesktop().open(file);
                            } else {
                                ChatLib.chat("&3[BHTSL] &cDesktop operations are not supported on this OS.");
                            }
                        } else {
                            ChatLib.chat("&3[BHTSL] &cCould not find file at: &7" + file.getAbsolutePath());
                        }
                    } catch (e) {
                        ChatLib.chat("&3[BHTSL] &cError opening file: &7" + e.message);
                    }
                } else {
                    codeWindow(`${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${selected.substring(0, selected.length - 5)}`);
                }
                return;
            }
            if (selected.includes(".") && x < input.getX() + input.getWidth() - 4 && x > input.getX() + input.getWidth() - 20) {
                World.playSound('random.fizz', 0.1, 1);
				World.playSound('liquid.lavapop', 0.5, 0.5);
                FileLib.delete("BHTSL", `imports/${selected}`);
                readFiles(true);
                return;
            }
            if (selected.endsWith('.htsl')) {
                if (!isInActionGui()) return;
                if (Player.asPlayerMP().player.field_71075_bZ.field_75098_d === false) ChatLib.command("gmc");
                if (compile(selected.substring(0, selected.length - 5))) World.playSound('random.click', 0.5, 1);
            } else if (selected.endsWith("/")) {
                subDir = selected;
                readFiles(true);
                World.playSound('random.click', 0.5, 1);
            } else {
                if (Player.asPlayerMP().player.field_71075_bZ.field_75098_d === false) {
                    World.playSound('mob.villager.no', 1, 1);
                    return ChatLib.chat(`&3[BHTSL] &cMust be in creative mode to import an item!`);
                }
                let content = FileLib.read('BHTSL', `/imports/${selected}`);
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
    }
}

function isButtonHovered(button, x, y) {
    return x > button.getX() && x < button.getX() + button.getWidth() && y > button.getY() && y < button.getY() + button.getHeight();
}

function readFiles(forceRefresh = false) {
    if (forceRefresh) {
        cachedFiles = null;
        lastSearchPath = null;
    }
    page = 0;
    renderItemIcons = [];
    if (Settings.toggleFileExplorer && !show) return;

    try {
        const clean = (str) => str.replace(/[&§][0-9a-fk-or]/gi, "").replace(/^\s+/, "").toLowerCase();
        const searchText = input.getText();
        const isSearching = searchText !== "Enter File Name" && searchText !== "";
        isGlobalSearching = Settings.globalSearch && isSearching;
        
        const searchPath = `./config/ChatTriggers/modules/BHTSL/imports/${isGlobalSearching ? "" : subDir}`;
        
        if (lastSearchPath !== searchPath || lastIsGlobalSearching !== isGlobalSearching) {
            files = [];
            // Use cached files
            let rawFiles;
            const now = Date.now();
            if (isGlobalSearching && cachedFiles && (now - cacheTimestamp) < CACHE_DURATION) {
                rawFiles = cachedFiles;
            } else {
                rawFiles = readDir(searchPath, isGlobalSearching);
                if (isGlobalSearching) {
                    cachedFiles = rawFiles;
                    cacheTimestamp = now;
                }
            }
            
            lastRawFiles = rawFiles;
            lastSearchPath = searchPath;
            lastIsGlobalSearching = isGlobalSearching;

            files = rawFiles.map(name => isGlobalSearching ? name : subDir + name).filter(n => n.endsWith(".htsl") || n.endsWith(".json") || n.endsWith("/"));

            files.sort((a, b) => {
                let isDirA = a.endsWith('/'), isDirB = b.endsWith('/');
                if (isDirA && !isDirB) return -1;
                if (!isDirA && isDirB) return 1;
                return clean(a).localeCompare(clean(b));
            });
        }

        // Only update filtered results
        const newFilteredFiles = isSearching ? files.filter(n => n.removeFormatting().toLowerCase().includes(searchText.toLowerCase())) : files;
        filteredFiles = newFilteredFiles;
    } catch (e) { console.error(e); }
}

function debouncedReadFiles() {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Set timeout to call readFiles after 150ms of inactivity
    searchTimeout = setTimeout(() => {
        readFiles();
    }, 150);
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
        } else {
            let lowerName = name.toLowerCase();
            if (lowerName.endsWith(".htsl") || lowerName.endsWith(".json")) {
                fileNames.push(name);
            }
        }
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

function isInActionGui() {
	if (Client.currentGui.getClassName() === "GuiEditSign") return false;
	if (Player.getContainer().getClassName() !== "ContainerChest") return false;
	if (Player.getContainer().getName().match(/Edit Actions|Actions: /)) return true;
	return false;
}

register('guiOpened', () => {
    if (Settings.refreshFileExplorerAutomatically) readFiles(true);
});

export function getSubDir() { return subDir; }
