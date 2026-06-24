import Settings from '../utils/config';

const GUI_NAME = "Hologram Settings";
const ADD_LINE_SLOT = 27;
const COPY_SLOT = 28;
const MAX_LINES = 5;
const LINE_INPUT_CRITERIA = /wish to set.->newLine<-/;

const C0EPacketClickWindow = Java.type("net.minecraft.network.play.client.C0EPacketClickWindow");
const C01PacketChatMessage = Java.type("net.minecraft.network.play.client.C01PacketChatMessage");

const guiTopField = net.minecraft.client.gui.inventory.GuiContainer.class.getDeclaredField("field_147009_r");
const guiLeftField = net.minecraft.client.gui.inventory.GuiContainer.class.getDeclaredField("field_147003_i");
guiTopField.setAccessible(true);
guiLeftField.setAccessible(true);

let clipboard = null;
let phase = "idle";
let pasteLines = [];
let pasteIndex = 0;
let stepTimer = 0;

const STEP_TIMEOUT = 100;

function isHoloGui() {
    const container = Player.getContainer();
    if (!container) return false;
    if (container.getClassName() !== "ContainerChest") return false;
    return container.getName() === GUI_NAME;
}

function chat(msg) {
    ChatLib.chat("&3[BHTSL] " + msg);
}

function isSign(item) {
    if (!item) return false;
    try {
        return ("" + item.getRegistryName()).indexOf("sign") !== -1;
    } catch (_) {
        return false;
    }
}

function getLineSlots() {
    const container = Player.getContainer();
    const chestSize = container.getSize() - 36;
    const slots = [];
    for (let i = 0; i < chestSize; i++) {
        if (isSign(container.getStackInSlot(i))) slots.push(i);
    }
    return slots;
}

function readLines() {
    const container = Player.getContainer();
    const slots = getLineSlots();
    const lines = [];
    for (let i = 0; i < slots.length; i++) {
        lines.push(container.getStackInSlot(slots[i]).getName().replace(/§/g, "&"));
    }
    return lines;
}

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

register("tick", () => {
    if (phase === "idle") return;

    stepTimer++;
    if (stepTimer > STEP_TIMEOUT) return abortPaste("timed out");

    if (phase === "awaitingPrompt" || phase === "awaitingGui") {
        if (phase === "awaitingGui" && isHoloGui()) {
            phase = "clicking";
            stepTimer = 0;
        }
        return;
    }

    if (!isHoloGui()) return;
    if (pasteIndex >= pasteLines.length) return finishPaste();

    const current = readLines();

    if (pasteIndex < current.length && current[pasteIndex] === pasteLines[pasteIndex]) {
        pasteIndex++;
        stepTimer = 0;
        return;
    }

    const slots = getLineSlots();
    const targetSlot = pasteIndex < slots.length ? slots[pasteIndex] : ADD_LINE_SLOT;

    clickSlot(targetSlot);
    phase = "awaitingPrompt";
    stepTimer = 0;
}).setPriority(Priority.LOW);

function submitLine() {
    sendChat(pasteLines[pasteIndex]);
    pasteIndex++;
    phase = "awaitingGui";
    stepTimer = 0;
}

register("chat", (event) => {
    if (phase !== "awaitingPrompt") return;
    cancel(event);
    submitLine();
}).setCriteria(LINE_INPUT_CRITERIA);

register("tick", () => {
    if (phase !== "awaitingPrompt") return;
    if (isHoloGui()) return;
    if (stepTimer < 3) return;
    submitLine();
}).setPriority(Priority.LOW);

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

register(net.minecraftforge.client.event.GuiScreenEvent.DrawScreenEvent.Pre, setCopySlotItem);

register("guiMouseClick", (mx, my, button, gui, event) => {
    if (Settings.disableBHTSLFeatures) return;
    if (!isHoloGui()) return;
    const pos = slotDisplayCoords(COPY_SLOT);
    if (mx < pos.x || mx >= pos.x + 16 || my < pos.y || my >= pos.y + 16) return;

    cancel(event);
    if (button === 1) doCopy();
    else doPaste();
});

register("packetSent", (packet, event) => {
    if (Settings.disableBHTSLFeatures) return;
    if (!isHoloGui()) return;
    const slotIdField = packet.class.getDeclaredField("field_149552_b");
    slotIdField.setAccessible(true);
    if (slotIdField.get(packet) === COPY_SLOT) cancel(event);
}).setFilteredClass(C0EPacketClickWindow);
