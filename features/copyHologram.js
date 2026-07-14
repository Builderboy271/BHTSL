import Settings from '../utils/config';

// Copies the lines of a Hypixel Housing hologram and pastes them onto another one.
// Adds a client-side "Copy" book to slot 28 of the "Hologram Settings" GUI.
//  - Right click: copies the current hologram's lines (slots 10-14) into memory.
//                 the book turns into an enchanted book ("Paste").
//  - Left click (while holding a copy): pastes the stored lines onto the open
//                 hologram, creating missing lines via "Add Line" (slot 27).

const GUI_NAME = "Hologram Settings";
const ADD_LINE_SLOT = 27;
const COPY_SLOT = 28;
const MAX_LINES = 5;

// Chat message Hypixel sends once a line edit is awaiting input.
const LINE_INPUT_CRITERIA = /wish to set.->newLine<-/;

const C0EPacketClickWindow = Java.type("net.minecraft.network.play.client.C0EPacketClickWindow");
const C01PacketChatMessage = Java.type("net.minecraft.network.play.client.C01PacketChatMessage");

const guiTopField = net.minecraft.client.gui.inventory.GuiContainer.class.getDeclaredField("field_147009_r");
const guiLeftField = net.minecraft.client.gui.inventory.GuiContainer.class.getDeclaredField("field_147003_i");
guiTopField.setAccessible(true);
guiLeftField.setAccessible(true);

// stored hologram lines (in memory only, cleared on CT reload)
let clipboard = null;

// paste state machine.
// phases:
//   "idle"           - not pasting
//   "clicking"       - GUI open, ready to click Add Line / a line slot
//   "awaitingPrompt" - clicked a line, waiting for Hypixel's "wish to set" prompt
//   "awaitingGui"    - sent a line's text, waiting for the GUI to reopen
let phase = "idle";
let pasteLines = [];
let pasteIndex = 0;
let stepTimer = 0; // ticks waited on the current step (timeout guard)

const STEP_TIMEOUT = 100; // ticks (~5s) before a stuck paste step is aborted

function isHoloGui() {
    const container = Player.getContainer();
    if (!container) return false;
    if (container.getClassName() !== "ContainerChest") return false;
    return container.getName() === GUI_NAME;
}

function chat(msg) {
    ChatLib.chat("&3[BHTSL] " + msg);
}

// True if the item stack is a hologram line (a sign), matched by item id 323.
function isSign(item) {
    if (!item) return false;
    try { return item.getID() == 323; } catch (_) { return false; }
}

// Returns the chest slot indices that currently hold a hologram line (a sign),
// in slot order. Hypixel may place them on slots other than 10-14.
function getLineSlots() {
    const container = Player.getContainer();
    const chestSize = container.getSize() - 36; // exclude player inventory
    const slots = [];
    for (let i = 0; i < chestSize; i++) {
        if (isSign(container.getStackInSlot(i))) slots.push(i);
    }
    return slots;
}

// Reads the current hologram's lines (sign display names, § -> & kept).
function readLines() {
    const container = Player.getContainer();
    const slots = getLineSlots();
    const lines = [];
    for (let i = 0; i < slots.length; i++) {
        lines.push(container.getStackInSlot(slots[i]).getName().replace(/§/g, "&"));
    }
    return lines;
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

function sendChat(text) {
    // prefix a reset code so a line starting with "/" isn't run as a command
    if (text.startsWith("/")) text = "&r" + text;
    Client.sendPacket(new C01PacketChatMessage(text));
}

function doCopy() {
    if (!isHoloGui()) return;
    const lines = readLines();
    if (lines.length === 0) {
        World.playSound("mob.villager.no", 1, 1);
        return chat("&cNo lines found to copy!");
    }
    clipboard = lines;
    World.playSound("random.orb", 1, 1);
    chat(`&aCopied &f${lines.length}&a hologram line${lines.length > 1 ? "s" : ""}! &7(left click to paste)`);
}

function doPaste() {
    if (!isHoloGui()) return;
    if (!clipboard || clipboard.length === 0) {
        World.playSound("mob.villager.no", 1, 1);
        return chat("&cNothing copied yet! &7(right click to copy first)");
    }
    if (phase !== "idle") return;

    pasteLines = clipboard.slice(0, MAX_LINES);

    // nothing to do if the hologram already matches the copy exactly
    const current = readLines();
    if (current.length === pasteLines.length && current.every((l, i) => l === pasteLines[i])) {
        World.playSound("random.orb", 1, 1);
        return chat("&aHologram already matches the copy &7(nothing to paste)");
    }

    pasteIndex = 0;
    stepTimer = 0;
    phase = "clicking";
    chat(`&ePasting &f${pasteLines.length}&e line${pasteLines.length > 1 ? "s" : ""}&e... &7(don't move/type)`);
}

function resetPaste() {
    phase = "idle";
    pasteLines = [];
    pasteIndex = 0;
    stepTimer = 0;
}

function abortPaste(reason) {
    resetPaste();
    World.playSound("mob.villager.no", 1, 1);
    chat("&cPaste aborted: " + reason);
}

function finishPaste() {
    resetPaste();
    World.playSound("random.levelup", 1, 1);
    chat("&aPaste finished!");
}

// Drives the paste. For each stored line we make exactly one click that opens
// the chat-input prompt:
//   - line slot already exists -> left click it (overwrites the text)
//   - line slot missing         -> click "Add Line" (creates it + opens input)
// Both immediately close the GUI and make Hypixel prompt for the new text, so we
// then wait for the prompt, send the text, and wait for the GUI to reopen.
register("tick", () => {
    if (phase === "idle") return;

    stepTimer++;
    if (stepTimer > STEP_TIMEOUT) return abortPaste("timed out");

    // While editing a line, the GUI is closed -- just keep waiting.
    if (phase === "awaitingPrompt" || phase === "awaitingGui") {
        if (phase === "awaitingGui" && isHoloGui()) {
            phase = "clicking";
            stepTimer = 0;
        }
        return;
    }

    // phase === "clicking": needs the GUI open to act.
    if (!isHoloGui()) return;

    if (pasteIndex >= pasteLines.length) return finishPaste();

    const current = readLines();

    // skip lines that already match the copy -- no need to re-type them
    if (pasteIndex < current.length && current[pasteIndex] === pasteLines[pasteIndex]) {
        pasteIndex++;
        stepTimer = 0;
        return;
    }

    const slots = getLineSlots();
    // overwrite an existing line if there is one at this position, else add a new one
    const targetSlot = pasteIndex < slots.length ? slots[pasteIndex] : ADD_LINE_SLOT;

    clickSlot(targetSlot); // opens the chat prompt for this line
    phase = "awaitingPrompt";
    stepTimer = 0;
}).setPriority(Priority.LOW);

function submitLine() {
    sendChat(pasteLines[pasteIndex]);
    pasteIndex++;
    phase = "awaitingGui";
    stepTimer = 0;
}

// Hypixel prompts for the new line text -> send it as the next chat message.
register("chat", (event) => {
    if (phase !== "awaitingPrompt") return;
    cancel(event);
    submitLine();
}).setCriteria(LINE_INPUT_CRITERIA);

// Fallback: if the GUI closed (chat input is open) but the prompt regex never
// matched, submit the line anyway after a couple ticks. This is the normal path
// when Hypixel's prompt wording differs from our regex, so keep the wait short.
register("tick", () => {
    if (phase !== "awaitingPrompt") return;
    if (isHoloGui()) return;        // GUI still open -> click hasn't registered yet
    if (stepTimer < 3) return;      // tiny grace period for the chat input to open
    submitLine();
}).setPriority(Priority.LOW);

// ---- client-side copy/paste book on slot 28 ----

function getCopyItem() {
    // book and quill = "Copy", enchanted book = "Paste" (when something is copied)
    const id = clipboard ? "minecraft:enchanted_book" : "minecraft:writable_book";
    const item = new Item(id);
    const lines = getTooltipLines();
    item.setName(ChatLib.addColor(lines[0]));
    item.setLore(lines.slice(1).map(line => ChatLib.addColor(line)));
    return item;
}

// Name + lore lines shown in the hover tooltip (also used to name the item).
function getTooltipLines() {
    if (clipboard) {
        return [
            "&d&lPaste Hologram",
            "",
            "&7Copied lines: &f" + clipboard.length,
            "",
            "&eLeft Click &7Paste here",
            "&eRight Click &7Replace copy"
        ];
    }
    return [
        "&b&lCopy Hologram",
        "",
        "&eRight Click &7Copy this hologram",
        "&7Open another hologram, then",
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
    if (!isHoloGui()) return;
    const mcSlot = Player.getContainer().container.func_75139_a(COPY_SLOT);
    mcSlot.func_75215_d(getCopyItem().itemStack);
}

// Put the book into the client-side slot before vanilla renders the container.
// Minecraft then draws the item and its lore tooltip as part of the normal GUI.
register(net.minecraftforge.client.event.GuiScreenEvent.DrawScreenEvent.Pre, setCopySlotItem);

// Intercept clicks on slot 28 so the server never sees them.
register("guiMouseClick", (mx, my, button, gui, event) => {
    if (Settings.disableBHTSLFeatures) return;
    if (!isHoloGui()) return;
    const pos = slotDisplayCoords(COPY_SLOT);
    if (mx < pos.x || mx >= pos.x + 16 || my < pos.y || my >= pos.y + 16) return;

    cancel(event);
    if (button === 1) doCopy();   // right click
    else doPaste();               // left click (or any other)
});

// Block the vanilla click packet for slot 28 so Hypixel doesn't act on it.
register("packetSent", (packet, event) => {
    if (Settings.disableBHTSLFeatures) return;
    if (!isHoloGui()) return;
    const slotIdField = packet.class.getDeclaredField("field_149552_b");
    slotIdField.setAccessible(true);
    if (slotIdField.get(packet) === COPY_SLOT) cancel(event);
}).setFilteredClass(C0EPacketClickWindow);