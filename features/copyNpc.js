import Settings from '../utils/config';
import exportAction from '../compiler/exportAction';
import { compile } from '../compiler/compile';
import { isWorking, cancelQueue } from '../gui/Queue';
import getItemFromNBT from '../utils/getItemFromNBT';
import loadItemstack from '../utils/loadItemstack';

// Copies a whole Hypixel Housing NPC and pastes it onto another one.
// Adds a client-side "Copy" book to slot 47 of the "Edit NPC - <name>" GUI.
//  - Right click: copies the full NPC (type, name, toggles, skin, equipment,
//                 left/right click actions incl. Left Click Redirect).
//                 Actions are exported like a normal HTSL export into imports/NPCS/.
//  - Left click (while holding a copy): pastes the stored NPC onto the open one.

const GUI_PREFIX = "Edit NPC - ";
const COPY_SLOT = 47;
const NPC_DIR = "NPCS";
const IMPORTS_PATH = "./config/ChatTriggers/modules/BHTSL/imports/";
const EQUIPMENT_SLOTS = ["Helmet", "Chestplate", "Hand", "Leggings", "Boots"];
// item ids of the placeholder buttons Hypixel shows while a slot is empty
const DEFAULT_EQUIP_IDS = { Helmet: 302, Chestplate: 303, Hand: 268, Leggings: 304, Boots: 305 };
// menu buttons of the Edit NPC GUI that are not copyable settings
const MENU_BUTTONS = [
    "Change NPC Type", "Rename NPC", "Left Click Actions", "Right Click Actions",
    "Change Skin", "Change Equipment", "Close", "Remove NPC", "Go Back"
];
const CYCLE_ARROW = "➠"; // arrow marking the selected option of a cycle setting
const SECTION = "§";     // Minecraft color code character

const C0EPacketClickWindow = Java.type("net.minecraft.network.play.client.C0EPacketClickWindow");
const C01PacketChatMessage = Java.type("net.minecraft.network.play.client.C01PacketChatMessage");
const S2FPacketSetSlot = Java.type("net.minecraft.network.play.server.S2FPacketSetSlot");
const JavaFile = Java.type("java.io.File");

const guiTopField = net.minecraft.client.gui.inventory.GuiContainer.class.getDeclaredField("field_147009_r");
const guiLeftField = net.minecraft.client.gui.inventory.GuiContainer.class.getDeclaredField("field_147003_i");
guiTopField.setAccessible(true);
guiLeftField.setAccessible(true);

// copied NPC (restored from the newest .npcdata file on load)
let clipboard = null;
let running = false;        // a copy/paste run is in progress
let savedCloseGUI = null;   // Settings.closeGUI value to restore after a run
let savedGuiTimeout = null; // Settings.guiTimeout value to restore after a run
let promptCallback = null;  // waiting for a "wish to set" chat prompt
let equipCapture = null;    // waiting for an equipment item to land in the inventory

function chat(msg) {
    ChatLib.chat("&3[BHTSL] " + msg);
}

function plain(text) {
    return ChatLib.removeFormatting(text ? text : "");
}

function containerTitle() {
    const container = Player.getContainer();
    if (!container) return null;
    try { return plain(container.getName()); } catch (_) { return null; }
}

function isNpcGui() {
    const container = Player.getContainer();
    if (!container) return false;
    if (container.getClassName() !== "ContainerChest") return false;
    const title = containerTitle();
    return title !== null && title.startsWith(GUI_PREFIX);
}

// Edit NPC GUI is open AND its items have arrived from the server
function npcGuiReady() {
    return isNpcGui() && findSlotByName("Rename NPC") !== -1;
}

// items of the chest part of the open container (player inventory excluded)
function chestItems() {
    const container = Player.getContainer();
    if (!container) return [];
    return container.getItems().splice(0, container.getSize() - 36);
}

function chestSize() {
    const container = Player.getContainer();
    return container ? container.getSize() - 36 : 0;
}

function findSlot(predicate) {
    const items = chestItems();
    for (let i = 0; i < items.length; i++) {
        if (items[i] && predicate(items[i], i)) return i;
    }
    return -1;
}

function findSlotByName(name) {
    return findSlot(item => plain(item.getName()) === name);
}

// tolerant comparison for option names ("Light_blue" matches "Light Blue")
function sameOption(a, b) {
    const norm = (s) => plain(s).toLowerCase().replace(/[_ ]+/g, " ").trim();
    return norm(a) === norm(b);
}

// Sends a real inventory click to the server for the given slot.
function clickSlot(slot, button) {
    Client.sendPacket(new C0EPacketClickWindow(
        Player.getContainer().getWindowId(),
        slot,
        button ? button : 0,
        0,
        null,
        0
    ));
}

function sendChatRaw(text) {
    // prefix a reset code so a value starting with "/" isn't run as a command
    if (text.startsWith("/")) text = "&r" + text;
    Client.sendPacket(new C01PacketChatMessage(text));
}

function isCreative() {
    try { return Player.asPlayerMP().player.field_71075_bZ.field_75098_d === true; } catch (_) { return false; }
}

// ---------- reading settings from GUI items ----------

// Reads the lore straight from the item NBT -- some items (e.g. the type
// skull/spawn egg) don't always yield their lore through the tooltip API.
function loreFromNbt(item) {
    try {
        const stack = item.itemStack ? item.itemStack : item.getItemStack();
        const tag = stack.func_77978_p(); // getTagCompound
        if (!tag) return [];
        const display = tag.func_74775_l("display"); // getCompoundTag
        const list = display.func_150295_c("Lore", 8); // getTagList(string)
        const out = [];
        for (let i = 0; i < list.func_74745_c(); i++) out.push(String(list.func_150307_f(i)));
        return out;
    } catch (_) { return []; }
}

function rawLoreLines(item) {
    // NBT first: tooltip mods (collapsed tooltips, "LSHIFT for more options",
    // item id lines, ...) make the tooltip API unreliable. The NBT lore is
    // exactly what Hypixel wrote and never changes between reads.
    const nbtLore = loreFromNbt(item);
    if (nbtLore.length > 0) return nbtLore;
    try {
        const lines = Object.values(item.getLore());
        if (lines && lines.length > 0) return lines;
    } catch (_) { }
    return [];
}

function tooltipLines(item) {
    return rawLoreLines(item).map(line => plain(String(line)).trim());
}

// Reads the value behind "Current Value:" in an item's lore (plain string).
function readCurrentValue(item) {
    const lore = tooltipLines(item);
    const start = lore.indexOf("Current Value:");
    if (start === -1) return null;
    for (let i = start + 1; i < lore.length; i++) {
        if (lore[i] === "") break;
        if (lore[i].length > 0) return lore[i];
    }
    return null;
}

// "Saddled"-style setting: "Current Value:" is Enabled/Disabled (click toggles)
function readValueToggle(item) {
    const value = readCurrentValue(item);
    if (value === "Enabled") return true;
    if (value === "Disabled") return false;
    return null;
}

// "Age"-style setting: lore has "Options:" with the current one marked by an
// arrow and green color. Both are checked so one of them failing is fine.
function readCycle(item) {
    const rawLore = rawLoreLines(item);
    const lore = rawLore.map(line => plain(String(line)).trim());
    const start = lore.indexOf("Options:");
    if (start === -1) return null;
    let current = null;
    let count = 0;
    for (let i = start + 1; i < lore.length; i++) {
        if (lore[i] === "") break;
        count++;
        if (String(rawLore[i]).indexOf(SECTION + "a") !== -1 || lore[i].indexOf(CYCLE_ARROW) !== -1) {
            current = lore[i].replace(CYCLE_ARROW, "").trim();
        }
    }
    if (current === null) return null;
    return { current: current, count: count };
}

// "Look at Players: On" style names -> { label, value } (plain string ops)
function parseNameToggle(name) {
    const idx = String(name).lastIndexOf(": ");
    if (idx === -1) return null;
    const state = String(name).substring(idx + 2);
    if (state !== "On" && state !== "Off") return null;
    return { label: String(name).substring(0, idx), value: state === "On" };
}

// Collects every copyable setting of the open Edit NPC GUI.
// Handles all NPC types generically:
//  - "<label>: On/Off" name toggles (Look at Players, Hide Name Tag)
//  - "Current Value: Enabled/Disabled" toggles (Saddled, Sitting, Charged, ...)
//  - "Current Value: <text>" menu settings (Collar Color, Ocelot Type, Wool Color,
//    Rabbit Type, ...) whose click opens a "Select Option" submenu
//  - "Options:" cycle lists (Age, Profession, Size, ...)
function collectSettings(verbose) {
    const items = chestItems();
    const settings = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || i === COPY_SLOT) continue;
        let name = "";
        try { name = String(plain(item.getName())); } catch (e) {
            if (verbose) chat("&8#" + i + " &cgetName failed: " + e);
            continue;
        }
        const nameToggle = parseNameToggle(name);
        if (nameToggle) {
            settings.push({ kind: "nameToggle", label: nameToggle.label, value: nameToggle.value, slot: i });
            if (verbose) chat("&8#" + i + " &btoggle &f" + name);
            continue;
        }
        if (MENU_BUTTONS.includes(name)) {
            if (verbose) chat("&8#" + i + " &7button &f" + name);
            continue;
        }
        const cycle = readCycle(item);
        if (cycle) {
            settings.push({ kind: "cycle", label: name, value: cycle.current, slot: i });
            if (verbose) chat("&8#" + i + " &acycle &f" + name + " = " + cycle.current);
            continue;
        }
        const value = readCurrentValue(item);
        if (value === "Enabled" || value === "Disabled") {
            settings.push({ kind: "valueToggle", label: name, value: value === "Enabled", slot: i });
            if (verbose) chat("&8#" + i + " &btoggle &f" + name + " = " + value);
            continue;
        }
        if (value !== null) {
            settings.push({ kind: "menuSelect", label: name, value: value, slot: i });
            if (verbose) chat("&8#" + i + " &dmenu &f" + name + " = " + value);
            continue;
        }
        if (verbose) {
            let codes = "";
            for (let c = 0; c < name.length; c++) codes += name.charCodeAt(c) + " ";
            chat("&8#" + i + " &cunmatched &f" + name + " &8[" + tooltipLines(item).length + " lore] chars: " + codes);
        }
    }
    return settings;
}

function readSettings() {
    return collectSettings(false);
}

// Finds a copied setting in the currently open GUI. Returns { slot, value } or null.
function findSetting(setting) {
    const items = chestItems();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || i === COPY_SLOT) continue;
        const name = plain(item.getName());
        if (setting.kind === "nameToggle") {
            const toggle = parseNameToggle(name);
            if (toggle && toggle.label === setting.label) return { slot: i, value: toggle.value };
        } else if (name === setting.label) {
            if (setting.kind === "cycle") {
                const cycle = readCycle(item);
                if (cycle) return { slot: i, value: cycle.current };
            } else if (setting.kind === "menuSelect") {
                const value = readCurrentValue(item);
                if (value !== null) return { slot: i, value: value };
            } else {
                const toggle = readValueToggle(item);
                if (toggle !== null) return { slot: i, value: toggle };
            }
        }
    }
    return null;
}

// ---------- skin textures ----------

function getSkullTexture(item) {
    try {
        const nbt = item.getNBT().toString();
        const match = nbt.match(/Value:"([A-Za-z0-9+\/=]+)"/);
        return match ? match[1] : null;
    } catch (_) { return null; }
}

function textureUrl(value) {
    try {
        const decoded = "" + new java.lang.String(java.util.Base64.getDecoder().decode(value), "UTF-8");
        const match = decoded.match(/"url"\s*:\s*"([^"]+)"/);
        return match ? match[1] : null;
    } catch (_) { return null; }
}

// Base64 skin values contain timestamps, so compare the texture urls inside them.
function sameSkin(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const urlA = textureUrl(a);
    const urlB = textureUrl(b);
    return urlA !== null && urlA === urlB;
}

// ---------- misc helpers ----------

function sanitizeFileName(name) {
    const stripped = plain(name.replace(/&([0-9a-fk-or])/gi, SECTION + "$1"));
    const clean = stripped.replace(/[\\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").replace(/^_+|_+$/g, "");
    return clean.length > 0 ? clean : "npc";
}

// relative base path ("NPCS/<name>/<name>") of a copied NPC's export files
function actionsBase(data) {
    return data.filePath ? data.filePath : NPC_DIR + "/" + data.fileBase;
}

// wipes the NPC's own folder so a fresh copy never mixes with stale exports
function cleanupOldExports(base) {
    try {
        const dir = new JavaFile(IMPORTS_PATH + NPC_DIR + "/" + base);
        if (!dir.exists()) { dir.mkdirs(); return; }
        const files = dir.listFiles();
        if (!files) return;
        for (let i = 0; i < files.length; i++) {
            const name = files[i].getName();
            if (name.endsWith(".json") || name === base + "_left.htsl" || name === base + "_right.htsl") {
                files[i].delete();
            }
        }
    } catch (_) { }
}

// polls check() every 50ms until true, then continues with next()
function waitFor(check, next, stepName, tries) {
    const max = tries ? tries : 100;
    let attempts = 0;
    const poll = () => {
        if (!running) return;
        let ok = false;
        try { ok = check(); } catch (_) { }
        if (ok) return setTimeout(next, 80);
        if (++attempts > max) return abort("timed out (" + stepName + ")");
        setTimeout(poll, 50);
    };
    poll();
}

// Some steps (like picking a skin) close the NPC menu entirely -- Hypixel does
// not reopen it. Ask the player to sneak + right click the NPC and keep waiting.
function waitForNpcReopen(done, stepName) {
    let prompted = false;
    let attempts = 0;
    const poll = () => {
        if (!running) return;
        if (npcGuiReady()) return setTimeout(done, 80);
        if (!prompted && attempts > 30) {
            prompted = true;
            World.playSound("random.orb", 1, 1);
            chat("&ePlease &fsneak + right click&e the NPC to continue!");
        }
        if (++attempts > 2400) return abort("timed out (" + stepName + ")");
        setTimeout(poll, 50);
    };
    poll();
}

function startRun() {
    running = true;
    savedCloseGUI = Settings.closeGUI;
    Settings.closeGUI = false; // GUIs must stay open between the phases of a run
    savedGuiTimeout = Settings.guiTimeout;
    // the default queue timeout (3s without a click) drops exports on laggy GUIs
    if (Settings.guiTimeout < 150) Settings.guiTimeout = 150;
}

function finishRun() {
    running = false;
    promptCallback = null;
    equipCapture = null;
    if (savedCloseGUI !== null) Settings.closeGUI = savedCloseGUI;
    savedCloseGUI = null;
    if (savedGuiTimeout !== null) Settings.guiTimeout = savedGuiTimeout;
    savedGuiTimeout = null;
}

function abort(reason) {
    if (!running) return;
    finishRun();
    if (isWorking()) cancelQueue(); // don't leave a stuck HTSL queue behind
    World.playSound("mob.villager.no", 1, 1);
    chat("&cNPC copy/paste aborted: " + reason);
}

function canStart() {
    if (Settings.disableBHTSLFeatures) return false;
    if (running) {
        chat("&cAlready working on an NPC, please wait!");
        return false;
    }
    if (isWorking()) {
        chat("&cHTSL is currently busy, please wait!");
        return false;
    }
    if (Settings.useSafeMode) {
        chat("&cNPC copy/paste is not available in Safe Mode!");
        return false;
    }
    if (!isNpcGui()) return false;
    return true;
}

// ---------- chat prompt (Rename NPC) ----------

// Extracts the value behind the [PREVIOUS] button of a "wish to set" prompt.
function extractPrevious(event) {
    try {
        const parts = new Message(event).getMessageParts();
        for (let i = 0; i < parts.length; i++) {
            const text = plain(parts[i].getText());
            if (text.indexOf("PREVIOUS") === -1) continue;
            try {
                const value = parts[i].getClickValue();
                if (value) return String(value);
            } catch (_) { }
        }
    } catch (_) { }
    try {
        const walk = (component) => {
            try {
                const style = component.func_150256_b(); // getChatStyle
                const click = style ? style.func_150235_h() : null; // getChatClickEvent
                const text = plain(component.func_150261_e()); // getUnformattedTextForChat
                if (click && text.indexOf("PREVIOUS") !== -1) return String(click.func_150668_b()); // getValue
            } catch (_) { }
            const siblings = component.func_150253_a(); // getSiblings
            for (let i = 0; i < siblings.size(); i++) {
                const result = walk(siblings.get(i));
                if (result) return result;
            }
            return null;
        };
        return walk(event.message);
    } catch (_) { }
    return null;
}

register("chat", (event) => {
    if (!promptCallback) return;
    const message = plain(ChatLib.getChatMessage(event, true));
    if (message.indexOf("wish to set") === -1) return;
    const callback = promptCallback;
    promptCallback = null;
    cancel(event);
    callback(extractPrevious(event));
});

// Clicks the "Rename NPC" anvil, waits for the chat prompt, hands the previous
// name to onPrompt (which must answer the prompt) and waits for the GUI again.
function openRenamePrompt(onPrompt, onTimeout) {
    const anvil = findSlotByName("Rename NPC");
    if (anvil === -1) return onTimeout("Rename NPC button not found");
    let fired = false;
    promptCallback = (previous) => {
        fired = true;
        onPrompt(previous);
    };
    clickSlot(anvil);
    setTimeout(() => {
        if (fired || !running) return;
        promptCallback = null;
        onTimeout("no name prompt received");
    }, 8000);
}

// ---------- equipment item capture (Select an Item GUI) ----------

register("packetReceived", (packet) => {
    if (!equipCapture) return;
    const container = Player.getContainer();
    if (!container) return;
    if (packet.func_149175_c() !== container.getWindowId()) return;
    const slot = packet.func_149173_d();
    const size = container.getSize() - 36;
    if (slot < size) return; // only the player inventory part holds the picked item
    const stack = packet.func_149174_e();
    if (!stack) return;
    const callback = equipCapture;
    equipCapture = null;
    let nbt = null;
    try { nbt = new Item(stack).getNBT().toString(); } catch (_) { }
    // remove the copy Hypixel placed in the inventory again (creative only)
    try { if (isCreative()) loadItemstack(null, slot - size + 9); } catch (_) { }
    callback(nbt);
}).setFilteredClass(S2FPacketSetSlot);

// waits until the "Select an Item" GUI is open and its items have arrived
function waitForSelectItemGui(next, stepName) {
    waitFor(
        () => containerTitle() === "Select an Item",
        () => {
            let tries = 0;
            const poll = () => {
                if (!running) return;
                const loaded = chestItems().filter(item => item).length > 0;
                if (loaded || ++tries > 40) return next();
                setTimeout(poll, 50);
            };
            poll();
        },
        stepName
    );
}

// ---------- paged GUIs (Change NPC Type / Change Skin) ----------

// Scans the open paged GUI for an item matching matchFn and clicks it,
// following "Left-click for next page!" arrows until found or out of pages.
function selectFromPagedGui(titleRegex, matchFn, stepName, onSelected, onNotFound) {
    let pages = 0;
    const attempt = () => {
        if (!running) return;
        const slot = findSlot((item, index) => {
            const name = plain(item.getName());
            if (name === "Go Back" || name.indexOf("click for") !== -1) return false;
            return matchFn(item, index);
        });
        if (slot !== -1) {
            // if the match is the selected entry already, just leave the menu
            const lore = tooltipLines(chestItems()[slot]).join(" ").toLowerCase();
            if (lore.indexOf("currently selected") !== -1 || lore.indexOf("already selected") !== -1) {
                const back = findSlotByName("Go Back");
                if (back !== -1) {
                    clickSlot(back);
                    return onSelected();
                }
            }
            clickSlot(slot);
            return onSelected();
        }
        const arrow = findSlotByName("Left-click for next page!");
        if (arrow === -1 || ++pages > 40) return onNotFound();
        const title = containerTitle();
        clickSlot(arrow);
        waitFor(
            () => {
                const now = containerTitle();
                if (now === null || now === title || !titleRegex.test(now)) return false;
                // the new page's items must have arrived before scanning it
                return findSlot(item => {
                    const name = plain(item.getName());
                    return name === "Go Back" || name.indexOf("click for") !== -1;
                }) !== -1;
            },
            attempt, stepName + " next page"
        );
    };
    attempt();
}

// =====================================================================
// COPY
// =====================================================================

// The menu items flicker while Hypixel (re)builds the GUI, so nothing is read
// at click time. Used by /npcdebug to report what the internal check sees.
function menuFullyLoaded() {
    return npcGuiReady() && readSettings().length >= 2;
}

function menuItemCount() {
    const items = chestItems();
    let count = 0;
    for (let i = 0; i < items.length; i++) {
        if (items[i] && i !== COPY_SLOT) count++;
    }
    return count;
}

// prints every named item of the open menu (used when a wait times out)
function dumpMenuItems() {
    const items = chestItems();
    for (let i = 0; i < items.length; i++) {
        if (!items[i] || i === COPY_SLOT) continue;
        try { chat("&8#" + i + " &7" + plain(items[i].getName())); } catch (_) { }
    }
}

// The menu counts as loaded once it holds at least 8 items (every Edit NPC
// menu has 8+) and the count stayed stable across consecutive checks. This is
// independent of any lore/name parsing, so it can't dead-lock the flow.
function waitForMenuStable(next, stepName) {
    let last = -1;
    let stable = 0;
    let tries = 0;
    const poll = () => {
        if (!running) return;
        if (++tries > 100) {
            chat("&cMenu never stabilized (" + stepName + "), items seen:");
            dumpMenuItems();
            return abort("timed out (" + stepName + ")");
        }
        if (!npcGuiReady()) {
            last = -1;
            stable = 0;
            return setTimeout(poll, 50);
        }
        const count = menuItemCount();
        if (count >= 8 && count === last) {
            if (++stable >= 2) return next();
        } else {
            stable = 0;
        }
        last = count;
        setTimeout(poll, 50);
    };
    poll();
}

function doCopy() {
    if (!canStart()) return;
    startRun();
    waitForMenuStable(beginCopy, "waiting for the NPC menu to load");
}

function beginCopy() {
    // the settings sometimes need one more refresh cycle -- retry briefly
    let tries = 0;
    const tryRead = () => {
        if (!running) return;
        if (readSettings().length === 0 && ++tries <= 20) return setTimeout(tryRead, 50);
        beginCopyNow();
    };
    tryRead();
}

function beginCopyNow() {
    const title = containerTitle();
    const fallbackName = title.substring(GUI_PREFIX.length);
    const base = sanitizeFileName(fallbackName);

    const data = {
        name: fallbackName,
        fallbackName: fallbackName,
        type: currentNpcType(),
        settings: readSettings(),
        skinTexture: null,
        equipment: null,
        leftClickRedirect: null,
        fileBase: base,
        filePath: NPC_DIR + "/" + base + "/" + base,
        hasLeftActions: false,
        hasRightActions: false,
        copiedAt: Date.now()
    };

    const skinSlot = findSlotByName("Change Skin");
    if (skinSlot !== -1) data.skinTexture = getSkullTexture(chestItems()[skinSlot]);

    const hasEquipment = findSlotByName("Change Equipment") !== -1;

    cleanupOldExports(data.fileBase);
    chat(`&eCopying NPC &f${fallbackName}&e... &7(don't move/type)`);
    if (!data.type) chat("&cCouldn't read the NPC type &7(it won't be changed on paste)");
    if (data.settings.length === 0) {
        // the first scan occasionally comes up empty -- one silent re-read
        data.settings = collectSettings(false);
    }

    copyEquipment(data, hasEquipment, () => {
        copyActions(data, "Left Click Actions", "_left", () => {
            copyActions(data, "Right Click Actions", "_right", () => {
                copyName(data, () => finishCopy(data));
            });
        });
    });
}

function copyEquipment(data, hasEquipment, done) {
    if (!hasEquipment) return done();
    if (!isCreative()) {
        chat("&cSkipping equipment copy: you must be in creative mode!");
        return done();
    }
    const button = findSlotByName("Change Equipment");
    clickSlot(button);
    waitFor(
        () => containerTitle() === "Change Equipment" && findSlotByName("Go Back") !== -1,
        () => {
            data.equipment = {};
            copyEquipmentSlot(data, EQUIPMENT_SLOTS.slice(), done);
        },
        "opening Change Equipment"
    );
}

function copyEquipmentSlot(data, remaining, done) {
    if (!running) return;
    if (remaining.length === 0) {
        const back = findSlotByName("Go Back");
        if (back === -1) return abort("Go Back button not found in Change Equipment");
        clickSlot(back);
        return waitFor(npcGuiReady, done, "returning from Change Equipment");
    }
    const label = remaining.shift();
    const slot = findSlotByName(label);
    if (slot === -1) {
        data.equipment[label] = null;
        return copyEquipmentSlot(data, remaining, done);
    }
    // slot still shows the default placeholder -> nothing equipped, skip it
    const button = chestItems()[slot];
    if (button && button.getID() === DEFAULT_EQUIP_IDS[label]) {
        data.equipment[label] = null;
        return copyEquipmentSlot(data, remaining, done);
    }
    clickSlot(slot);
    waitForSelectItemGui(
        () => {
            const goBack = () => {
                clickSlot(Player.getContainer().getSize() - 5 - 36);
                waitFor(
                    () => containerTitle() === "Change Equipment",
                    () => copyEquipmentSlot(data, remaining, done),
                    "returning to Change Equipment"
                );
            };
            const current = chestItems()[13];
            if (!current) {
                data.equipment[label] = null;
                return goBack();
            }
            // click slot 13 like an item export; the server hands us a full copy
            let captured = false;
            equipCapture = (nbt) => {
                captured = true;
                data.equipment[label] = nbt;
                goBack();
            };
            clickSlot(13);
            setTimeout(() => {
                if (captured || !running) return;
                equipCapture = null;
                data.equipment[label] = null;
                chat(`&cCouldn't read the &f${label}&c item, skipping it.`);
                goBack();
            }, 4000);
        },
        "opening " + label + " selection"
    );
}

// Reopening the NPC menu after the rename can't be forced, so a timeout here
// must not throw the whole copy away -- everything else is already gathered.
function waitForNpcGuiAfterRename(done) {
    let attempts = 0;
    const poll = () => {
        if (!running) return;
        if (npcGuiReady()) return setTimeout(done, 80);
        if (++attempts > 150) {
            chat("&cThe NPC menu didn't reopen after the rename, finishing anyway.");
            return done();
        }
        setTimeout(poll, 50);
    };
    poll();
}

function copyActions(data, trigger, suffix, done) {
    if (!running) return;
    const slot = findSlotByName(trigger);
    if (slot === -1) {
        chat(`&cCouldn't find &f${trigger}&c, skipping.`);
        return done();
    }
    clickSlot(slot);
    waitFor(
        () => {
            const title = containerTitle();
            return title !== null && /Edit Actions|Actions: /.test(title) && findSlotByName("Add Action") !== -1;
        },
        () => {
            // the left click actions GUI also holds the Left Click Redirect toggle
            const redirectSlot = findSlotByName("Left Click Redirect");
            if (redirectSlot !== -1) {
                const value = readValueToggle(chestItems()[redirectSlot]);
                if (value !== null) data.leftClickRedirect = value;
            }
            const fileBase = actionsBase(data) + suffix;
            const goBack = () => {
                const back = findSlotByName("Go Back");
                if (back === -1) return abort("Go Back button not found after export");
                clickSlot(back);
                waitFor(npcGuiReady, done, "returning from " + trigger);
            };
            const result = exportAction(fileBase);
            if (result === false) {
                // don't kill the whole copy over one unexportable container
                if (isWorking()) cancelQueue();
                chat(`&cCouldn't export ${trigger}&c, skipping it.`);
                return goBack();
            }
            waitFor(
                () => !isWorking(),
                () => {
                    // the queue can time out mid-export and silently drop the file write
                    if (FileLib.exists("BHTSL", `imports/${fileBase}.htsl`)) {
                        if (suffix === "_left") data.hasLeftActions = true;
                        else data.hasRightActions = true;
                    } else {
                        chat(`&cExport of ${trigger} produced no file, skipping it.`);
                    }
                    goBack();
                },
                "exporting " + trigger, 6000
            );
        },
        "opening " + trigger
    );
}

// Copies the exact (colored) name via the rename prompt's [PREVIOUS] button,
// then sends the name straight back so nothing changes.
function copyName(data, done) {
    if (!running) return;
    openRenamePrompt(
        (previous) => {
            if (previous) {
                data.name = previous;
                sendChatRaw(previous);
            } else {
                chat("&cCouldn't read the exact name, using the menu title instead.");
                sendChatRaw(data.fallbackName);
            }
            waitForNpcGuiAfterRename(done);
        },
        (reason) => {
            chat("&c" + reason + "&c, using the menu title as name.");
            done();
        }
    );
}

function finishCopy(data) {
    if (data.settings.length === 0) chat("&cNote: no settings were recognized on this NPC.");
    clipboard = data;
    try {
        FileLib.write("BHTSL", "imports/" + actionsBase(data) + ".npcdata", JSON.stringify(data), true);
    } catch (_) { }
    finishRun();
    World.playSound("random.levelup", 1, 1);
    chat(`&aCopied NPC &f${data.name}&a! &7(open another NPC, then left click to paste)`);
}

// =====================================================================
// PASTE
// =====================================================================

function doPaste() {
    if (!canStart()) return;
    if (!clipboard) {
        World.playSound("mob.villager.no", 1, 1);
        return chat("&cNothing copied yet! &7(right click to copy first)");
    }

    startRun();
    chat(`&ePasting NPC &f${clipboard.name}&e... &7(don't move/type)`);

    pasteType(() => {
        pasteName(() => {
            pasteSettings(() => {
                pasteSkin(() => {
                    pasteEquipment(() => {
                        pasteActions("Left Click Actions", "_left", clipboard.hasLeftActions, () => {
                            pasteActions("Right Click Actions", "_right", clipboard.hasRightActions, () => {
                                finishRun();
                                World.playSound("random.levelup", 1, 1);
                                chat(`&aPasted NPC &f${clipboard.name}&a!`);
                            });
                        });
                    });
                });
            });
        });
    });
}

function currentNpcType() {
    const slot = findSlotByName("Change NPC Type");
    if (slot === -1) return null;
    const item = chestItems()[slot];
    // the type button IS the type: a skull for players, a spawn egg whose
    // damage value encodes the mob, an armor stand item for armor stands
    try {
        const id = item.getID();
        if (id === 397) return "Player";
        if (id === 416) return "Armor Stand";
        if (id === 383) {
            const damage = item.getItemStack().func_77952_i(); // getMetadata
            if (SPAWN_EGG_TYPES[damage]) return SPAWN_EGG_TYPES[damage];
        }
    } catch (_) { }
    // fallback: parse "Currently Selected: <type>" from the lore
    const lore = tooltipLines(item);
    for (let i = 0; i < lore.length; i++) {
        const line = String(lore[i]);
        const idx = line.toLowerCase().indexOf("currently selected");
        if (idx === -1) continue;
        const value = line.substring(idx + "currently selected".length).replace(/^[:\s]+/, "").trim();
        if (value.length > 0) return value;
    }
    return null;
}

function pasteType(done) {
    if (!running) return;
    // wait out menu flicker so the current type is read reliably
    waitForMenuStable(() => pasteTypeReady(done), "reading the NPC menu");
}

function pasteTypeReady(done) {
    if (!running) return;
    if (!clipboard.type) {
        chat("&cNo NPC type stored in this copy, skipping the type change.");
        return done();
    }
    const current = currentNpcType();
    if (current !== null && current === clipboard.type) return done();
    // current type unreadable or different -> go through the type menu; if the
    // wanted type turns out to be selected already, it just goes back
    const button = findSlotByName("Change NPC Type");
    if (button === -1) return abort("Change NPC Type button not found");
    clickSlot(button);
    waitFor(
        () => {
            const title = containerTitle();
            return title !== null && /Change NPC Type/.test(title) && findSlotByName("Go Back") !== -1;
        },
        () => {
            selectFromPagedGui(
                /Change NPC Type/,
                (item) => plain(item.getName()) === clipboard.type,
                "Change NPC Type",
                () => waitForNpcReopen(done, "reopening the NPC after Change NPC Type"),
                () => abort("NPC type " + clipboard.type + " not found")
            );
        },
        "opening Change NPC Type"
    );
}

function pasteName(done) {
    if (!running) return;
    if (!Settings.npcRenameOnPaste) return done();
    openRenamePrompt(
        () => {
            sendChatRaw(clipboard.name);
            waitFor(npcGuiReady, done, "reopening the NPC menu after rename", 100);
        },
        (reason) => abort(reason)
    );
}

// Applies all copied toggles/cycles. Cycle settings are clicked until the
// wanted option is selected; settings missing on this NPC type are skipped.
function pasteSettings(done) {
    if (!running) return;
    // wait out menu flicker so settings aren't wrongly counted as missing
    waitForMenuStable(() => runPasteSettings(done), "reading the NPC menu settings");
}

function runPasteSettings(done) {
    if (!running) return;
    const pending = [];
    for (let i = 0; i < clipboard.settings.length; i++) {
        const s = clipboard.settings[i];
        pending.push({ kind: s.kind, label: s.label, value: s.value, clicks: 0, misses: 0 });
    }
    const skipped = [];
    let notReady = 0;

    const step = () => {
        if (!running) return;
        // the menu may refresh between clicks; don't scan a half-loaded GUI
        if (!npcGuiReady()) {
            if (++notReady > 160) return abort("NPC menu closed while applying settings");
            return setTimeout(step, 50);
        }
        notReady = 0;
        // one shared scan through the proven read path (same as the copy uses)
        const current = collectSettings(false);
        const lookup = (setting) => {
            for (let j = 0; j < current.length; j++) {
                if (current[j].kind === setting.kind && current[j].label === setting.label) return current[j];
            }
            return null;
        };
        let target = null;
        let found = null;
        let unresolved = false;
        for (let i = 0; i < pending.length; i++) {
            const setting = pending[i];
            const state = lookup(setting);
            if (!state) {
                // reads can fail transiently -- retry before calling it missing
                if (++setting.misses < 10) {
                    unresolved = true;
                    continue;
                }
                skipped.push(setting.label);
                pending.splice(i, 1); i--;
                continue;
            }
            setting.misses = 0;
            if (state.value === setting.value) {
                pending.splice(i, 1); i--;
                continue;
            }
            if (setting.clicks >= 20) {
                skipped.push(setting.label);
                pending.splice(i, 1); i--;
                continue;
            }
            target = setting;
            found = state;
            break;
        }
        if (!target) {
            if (pending.length > 0 && unresolved) return setTimeout(step, 100);
            if (skipped.length > 0) chat("&cSkipped settings: &f" + skipped.join(", "));
            return done();
        }
        // menu settings (Collar Color, Ocelot Type, ...) open a "Select Option" GUI
        if (target.kind === "menuSelect") {
            target.clicks += 10; // allow two attempts before it counts as skipped
            clickSlot(found.slot);
            waitFor(
                () => containerTitle() === "Select Option" && findSlotByName("Go Back") !== -1,
                () => {
                    const optionSlot = findSlot(item => sameOption(item.getName(), target.value));
                    if (optionSlot === -1) {
                        chat(`&cOption &f${target.value}&c not found for &f${target.label}&c, skipping.`);
                        target.clicks = 999;
                        clickSlot(findSlotByName("Go Back"));
                    } else {
                        clickSlot(optionSlot);
                    }
                    waitFor(npcGuiReady, step, "returning from Select Option");
                },
                "opening " + target.label + " selection"
            );
            return;
        }
        target.clicks++;
        clickSlot(found.slot);
        let waited = 0;
        const poll = () => {
            if (!running) return;
            const fresh = collectSettings(false);
            for (let j = 0; j < fresh.length; j++) {
                if (fresh[j].kind === target.kind && fresh[j].label === target.label && fresh[j].value !== found.value) {
                    return setTimeout(step, 50);
                }
            }
            if (++waited > 60) return step();
            setTimeout(poll, 50);
        };
        setTimeout(poll, 80);
    };
    step();
}

function pasteSkin(done) {
    if (!running) return;
    if (!clipboard.skinTexture) return done();
    const skinSlot = findSlotByName("Change Skin");
    if (skinSlot === -1) return done(); // this NPC type has no skin
    if (sameSkin(getSkullTexture(chestItems()[skinSlot]), clipboard.skinTexture)) return done();
    clickSlot(skinSlot);
    waitFor(
        () => {
            const title = containerTitle();
            return title !== null && /Change Skin/.test(title) && findSlotByName("Go Back") !== -1;
        },
        () => {
            selectFromPagedGui(
                /Change Skin/,
                (item) => item.getID() === 397 && sameSkin(getSkullTexture(item), clipboard.skinTexture),
                "Change Skin",
                () => waitForNpcReopen(done, "reopening the NPC after Change Skin"),
                () => {
                    chat("&cCouldn't find the copied skin, skipping it.");
                    const back = findSlotByName("Go Back");
                    if (back === -1) return abort("Go Back button not found in Change Skin");
                    clickSlot(back);
                    waitFor(npcGuiReady, done, "returning from Change Skin", 100);
                }
            );
        },
        "opening Change Skin"
    );
}

function pasteEquipment(done) {
    if (!running) return;
    if (!clipboard.equipment) return done();
    const button = findSlotByName("Change Equipment");
    if (button === -1) return done(); // this NPC type has no equipment
    let hasAny = false;
    for (let i = 0; i < EQUIPMENT_SLOTS.length; i++) {
        if (clipboard.equipment[EQUIPMENT_SLOTS[i]]) hasAny = true;
    }
    if (!hasAny) return done();
    if (!isCreative()) {
        chat("&cSkipping equipment paste: you must be in creative mode!");
        return done();
    }
    clickSlot(button);
    waitFor(
        () => containerTitle() === "Change Equipment" && findSlotByName("Go Back") !== -1,
        () => pasteEquipmentSlot(EQUIPMENT_SLOTS.slice(), done),
        "opening Change Equipment"
    );
}

function pasteEquipmentSlot(remaining, done) {
    if (!running) return;
    if (remaining.length === 0) {
        const back = findSlotByName("Go Back");
        if (back === -1) return abort("Go Back button not found in Change Equipment");
        clickSlot(back);
        return waitFor(npcGuiReady, done, "returning from Change Equipment");
    }
    const label = remaining.shift();
    const nbt = clipboard.equipment[label];
    if (!nbt) return pasteEquipmentSlot(remaining, done);
    const slot = findSlotByName(label);
    if (slot === -1) {
        chat(`&cCouldn't find the &f${label}&c slot, skipping it.`);
        return pasteEquipmentSlot(remaining, done);
    }
    clickSlot(slot);
    waitForSelectItemGui(
        () => {
            let stack = null;
            try { stack = getItemFromNBT(nbt).getItemStack(); } catch (_) { }
            if (!stack) {
                chat(`&cCouldn't load the &f${label}&c item, skipping it.`);
                clickSlot(Player.getContainer().getSize() - 5 - 36); // Go Back
                return waitFor(
                    () => containerTitle() === "Change Equipment",
                    () => pasteEquipmentSlot(remaining, done),
                    "returning to Change Equipment"
                );
            }
            // put the item into inventory slot 26 and click it in the GUI (like HTSL item imports)
            loadItemstack(stack, 26);
            setTimeout(() => {
                if (!running) return;
                clickSlot(chestSize() + 26 - 9);
                waitFor(
                    () => containerTitle() === "Change Equipment",
                    () => pasteEquipmentSlot(remaining, done),
                    "applying " + label
                );
            }, 120);
        },
        "opening " + label + " selection"
    );
}

// removes every existing action of the open Edit Actions GUI (right click deletes)
function deleteAllActions(done) {
    let clicks = 0;
    let notReady = 0;
    const step = () => {
        if (!running) return;
        // the GUI refreshes after every removal; wait until it is populated again
        if (findSlotByName("Add Action") === -1) {
            if (++notReady > 160) return abort("actions menu closed while removing old actions");
            return setTimeout(step, 50);
        }
        notReady = 0;
        if (++clicks > 150) return abort("timed out removing old actions");
        const slot = findSlot(item => {
            const lore = tooltipLines(item);
            return lore.includes("Right Click to remove!");
        });
        if (slot === -1) return done();
        clickSlot(slot, 1);
        setTimeout(step, 150);
    };
    step();
}

function pasteActions(trigger, suffix, hasActions, done) {
    if (!running) return;
    const fileBase = actionsBase(clipboard) + suffix;
    if (hasActions && !FileLib.exists("BHTSL", `imports/${fileBase}.htsl`)) {
        chat(`&cMissing &f${fileBase}.htsl&c, skipping ${trigger}.`);
        hasActions = false;
    }
    const needsRedirect = trigger === "Left Click Actions" && clipboard.leftClickRedirect !== null;
    if (!hasActions && !needsRedirect) return done();

    const slot = findSlotByName(trigger);
    if (slot === -1) {
        chat(`&cCouldn't find &f${trigger}&c, skipping.`);
        return done();
    }
    clickSlot(slot);
    waitFor(
        () => {
            const title = containerTitle();
            return title !== null && /Edit Actions|Actions: /.test(title) && findSlotByName("Add Action") !== -1;
        },
        () => setRedirect(needsRedirect, () => {
            const goBack = () => {
                const back = findSlotByName("Go Back");
                if (back === -1) return abort("Go Back button not found after import");
                clickSlot(back);
                waitFor(npcGuiReady, done, "returning from " + trigger);
            };
            if (!hasActions) return goBack();
            const doImport = () => {
                compile(fileBase, [], false); // compiles + loads into the open GUI
                if (!isWorking()) {
                    chat(`&cCouldn't import ${trigger}, skipping.`);
                    return goBack();
                }
                waitFor(() => !isWorking(), goBack, "importing " + trigger, 6000);
            };
            if (Settings.npcDeleteOldActions) deleteAllActions(doImport);
            else doImport();
        }),
        "opening " + trigger
    );
}

function setRedirect(needsRedirect, next) {
    if (!running) return;
    if (!needsRedirect) return next();
    const slot = findSlotByName("Left Click Redirect");
    if (slot === -1) {
        chat("&cLeft Click Redirect toggle not found, skipping it.");
        return next();
    }
    const current = readValueToggle(chestItems()[slot]);
    if (current === clipboard.leftClickRedirect) return next();
    if (current === null) {
        chat("&cLeft Click Redirect value not readable, skipping it.");
        return next();
    }
    clickSlot(slot);
    waitFor(
        () => {
            const redirect = findSlotByName("Left Click Redirect");
            return redirect !== -1 && readValueToggle(chestItems()[redirect]) === clipboard.leftClickRedirect;
        },
        next, "toggling Left Click Redirect"
    );
}

// Prints how every item of the open Edit NPC menu is classified.
function printNpcDebug() {
    chat("&e--- NPC menu analysis ---");
    chat("&7Loaded check: " + (menuFullyLoaded() ? "&apass" : "&cFAIL") + " &7(readSettings finds &f" + readSettings().length + "&7)");
    chat("&7Type: " + (currentNpcType() ? "&f" + currentNpcType() : "&cnot readable!"));
    if (!currentNpcType()) {
        // show what the type item actually looks like so the parser can be fixed
        const typeSlot = findSlotByName("Change NPC Type");
        if (typeSlot === -1) {
            chat("&8    | (no item named 'Change NPC Type' found)");
        } else {
            const lines = tooltipLines(chestItems()[typeSlot]);
            if (lines.length === 0) chat("&8    | (item found at #" + typeSlot + " but no lore readable!)");
            for (let i = 0; i < lines.length; i++) {
                if (lines[i]) chat("&8    | " + lines[i]);
            }
        }
    }
    const skinSlot = findSlotByName("Change Skin");
    if (skinSlot !== -1) chat("&7Skin texture: " + (getSkullTexture(chestItems()[skinSlot]) ? "&afound" : "&cnot readable!"));
    const items = chestItems();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || i === COPY_SLOT) continue;
        const name = plain(item.getName());
        if (MENU_BUTTONS.includes(name)) continue;
        const nameToggle = parseNameToggle(name);
        if (nameToggle) { chat(`&7#${i} &btoggle &f${nameToggle.label} = ${nameToggle.value ? "On" : "Off"}`); continue; }
        const cycle = readCycle(item);
        if (cycle) { chat(`&7#${i} &acycle &f${name} = ${cycle.current} &7(${cycle.count} options)`); continue; }
        const value = readCurrentValue(item);
        if (value === "Enabled" || value === "Disabled") { chat(`&7#${i} &btoggle &f${name} = ${value}`); continue; }
        if (value !== null) { chat(`&7#${i} &dmenu &f${name} = ${value}`); continue; }
        chat(`&7#${i} &cunrecognized &f${name}`);
        tooltipLines(item).forEach(line => { if (line) chat("&8    | " + line); });
    }
    chat("&e--- end ---");
}

// Commands can't be typed while a menu is open, so /npcdebug arms the analysis
// and it runs automatically on the next Edit NPC menu that gets opened.
let debugArmed = false;

register("command", () => {
    if (isNpcGui()) return printNpcDebug();
    debugArmed = !debugArmed;
    if (debugArmed) chat("&eNPC debug armed &7- open an Edit NPC menu now! &8(/npcdebug again to cancel)");
    else chat("&cNPC debug disarmed.");
}).setName("npcdebug");

register("tick", () => {
    if (!debugArmed) return;
    if (!npcGuiReady()) return;
    debugArmed = false;
    // wait until the menu is fully loaded (items flicker while it builds),
    // but print after 3s regardless so a broken menu still shows something
    let tries = 0;
    const poll = () => {
        if (menuFullyLoaded() || ++tries > 60) return printNpcDebug();
        setTimeout(poll, 50);
    };
    poll();
});

// =====================================================================
// client-side copy/paste book on slot 47
// =====================================================================

function getCopyItem() {
    const id = clipboard ? "minecraft:enchanted_book" : "minecraft:writable_book";
    const item = new Item(id);
    const lines = getTooltipLines();
    item.setName(ChatLib.addColor(lines[0]));
    item.setLore(lines.slice(1).map(line => ChatLib.addColor(line)));
    return item;
}

function getTooltipLines() {
    if (clipboard) {
        return [
            "&d&lPaste NPC",
            "",
            "&7Copied: &f" + clipboard.name + " &7(" + (clipboard.type ? clipboard.type : "?") + ")",
            "",
            "&eLeft Click &7Paste here",
            "&eRight Click &7Replace copy"
        ];
    }
    return [
        "&b&lCopy NPC",
        "",
        "&eRight Click &7Copy this NPC",
        "&7Open another NPC, then",
        "&eLeft Click &7Paste the copy"
    ];
}

function slotDisplayCoords(slotId) {
    const mcSlot = Player.getContainer().container.func_75139_a(slotId);
    const slot = new Slot(mcSlot);
    const guiTop = guiTopField.get(Client.currentGui.get());
    const guiLeft = guiLeftField.get(Client.currentGui.get());
    return { x: slot.getDisplayX() + guiLeft, y: slot.getDisplayY() + guiTop };
}

function setCopySlotItem() {
    if (Settings.disableBHTSLFeatures) return;
    if (!isNpcGui()) return;
    if (chestSize() <= COPY_SLOT) return;
    const mcSlot = Player.getContainer().container.func_75139_a(COPY_SLOT);
    mcSlot.func_75215_d(getCopyItem().itemStack);
}

// Put the book into the client-side slot before vanilla renders the container.
register(net.minecraftforge.client.event.GuiScreenEvent.DrawScreenEvent.Pre, setCopySlotItem);

// Intercept clicks on slot 47 so the server never sees them.
register("guiMouseClick", (mx, my, button, gui, event) => {
    if (Settings.disableBHTSLFeatures) return;
    if (!isNpcGui()) return;
    if (chestSize() <= COPY_SLOT) return;
    const pos = slotDisplayCoords(COPY_SLOT);
    if (mx < pos.x || mx >= pos.x + 16 || my < pos.y || my >= pos.y + 16) return;

    cancel(event);
    if (button === 1) doCopy();   // right click
    else doPaste();               // left click (or any other)
});

// Block the vanilla click packet for slot 47 so Hypixel doesn't act on it.
register("packetSent", (packet, event) => {
    if (Settings.disableBHTSLFeatures) return;
    if (!isNpcGui()) return;
    const slotIdField = packet.class.getDeclaredField("field_149552_b");
    slotIdField.setAccessible(true);
    if (slotIdField.get(packet) === COPY_SLOT) cancel(event);
}).setFilteredClass(C0EPacketClickWindow);

// =====================================================================
// NPC library (used by the import GUI to list and select copied NPCs)
// =====================================================================

// spawn egg damage values per NPC type, for the icons of non-player NPCs
const SPAWN_EGG_IDS = {
    "Pig": 90, "Sheep": 91, "Cow": 92, "Mooshroom": 96, "Chicken": 93,
    "Squid": 94, "Wolf": 95, "Ocelot": 98, "Iron Golem": 99, "Rabbit": 101,
    "Villager": 120, "Creeper": 50, "Zombie": 54, "Skeleton": 51, "Blaze": 61,
    "Spider": 52, "Cave Spider": 59, "Slime": 55, "Ghast": 56, "Zombie Pigman": 57,
    "Enderman": 58, "Silverfish": 60, "Magma Cube": 62, "Witch": 66,
    "Endermite": 67, "Snow Golem": 97
};
// reverse lookup: spawn egg damage -> NPC type name
const SPAWN_EGG_TYPES = {};
for (let eggType in SPAWN_EGG_IDS) SPAWN_EGG_TYPES[SPAWN_EGG_IDS[eggType]] = eggType;

function readNpcData(relPath) {
    try {
        const content = FileLib.read("BHTSL", "imports/" + relPath);
        if (!content) return null;
        const data = JSON.parse(content);
        if (!data || !data.name || !data.fileBase) return null;
        return data;
    } catch (_) { return null; }
}

// Builds the display info for a .npcdata file: the NPC's head (or spawn egg)
// as an item icon plus its colored name. Returns null for unreadable files.
export function getNpcDisplay(relPath) {
    const data = readNpcData(relPath);
    if (!data) return null;
    let nbt;
    if (data.skinTexture) {
        const uuid = java.util.UUID.nameUUIDFromBytes(new java.lang.String(data.skinTexture).getBytes()).toString();
        nbt = `{id:"minecraft:skull",Count:1b,Damage:3s,tag:{SkullOwner:{Id:"${uuid}",Properties:{textures:[{Value:"${data.skinTexture}"}]}}}}`;
    } else if (data.type === "Armor Stand") {
        nbt = '{id:"minecraft:armor_stand",Count:1b,Damage:0s}';
    } else if (SPAWN_EGG_IDS[data.type]) {
        nbt = `{id:"minecraft:spawn_egg",Count:1b,Damage:${SPAWN_EGG_IDS[data.type]}s}`;
    } else {
        nbt = '{id:"minecraft:skull",Count:1b,Damage:3s}';
    }
    try {
        const item = getItemFromNBT(nbt);
        item.setName(ChatLib.addColor("&r" + data.name));
        item.setLore([
            ChatLib.addColor("&7Type: &f" + (data.type ? data.type : "?")),
            "",
            ChatLib.addColor("&eClick to select this NPC for pasting!")
        ]);
        return { item: item, name: data.name, type: data.type ? data.type : "?", fileBase: data.fileBase };
    } catch (_) { return null; }
}

// Makes the given .npcdata file the active paste clipboard.
export function selectNpcData(relPath) {
    if (running) {
        chat("&cAlready working on an NPC, please wait!");
        return false;
    }
    const data = readNpcData(relPath);
    if (!data) {
        World.playSound("mob.villager.no", 1, 1);
        chat("&cCouldn't read this NPC file!");
        return false;
    }
    clipboard = data;
    World.playSound("random.orb", 1, 1);
    chat(`&aSelected NPC &f${data.name}&a! &7(open an NPC, then left click the paste book)`);
    return true;
}

export function getSelectedNpcBase() {
    return clipboard ? clipboard.fileBase : null;
}

// restore the newest copied NPC after a ChatTriggers reload
(() => {
    try {
        const dir = new JavaFile(IMPORTS_PATH + NPC_DIR);
        if (!dir.exists()) { dir.mkdirs(); return; }
        const files = dir.listFiles();
        if (!files) return;
        let newest = null;
        let newestPath = null;
        const consider = (file, relPath) => {
            if (!newest || file.lastModified() > newest.lastModified()) {
                newest = file;
                newestPath = relPath;
            }
        };
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f.isDirectory()) {
                const subs = f.listFiles();
                if (!subs) continue;
                for (let j = 0; j < subs.length; j++) {
                    if (subs[j].getName().endsWith(".npcdata")) consider(subs[j], NPC_DIR + "/" + f.getName() + "/" + subs[j].getName());
                }
            } else if (f.getName().endsWith(".npcdata")) {
                consider(f, NPC_DIR + "/" + f.getName());
            }
        }
        if (!newest) return;
        const data = JSON.parse(FileLib.read("BHTSL", "imports/" + newestPath));
        if (data && data.name && data.fileBase) clipboard = data;
    } catch (_) { }
})();
