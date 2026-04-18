import syntax from "../actions/syntax";

let codeIsOpen = false;
let guiText = [];
let cursorLine = 0;
let cursorBlink = 0;
let cursorIndex = 0;
let fileNameSave = "";
let startIndex = 0;
let lineLimit = Math.ceil((Renderer.screen.getHeight() - 14) / 10);
let originalRepeat = false;

function wrapLine(line, maxW) {
    if (!line || line.length === 0) {
        return [{ escaped: "", origStart: 0, origEnd: 0 }];
    }
    let subs = [];
    let pos = 0;
    while (pos < line.length) {
        let startPos = pos;
        let goodPos = pos;
        for (let j = pos; j < line.length; j++) {
            let prefix = line.substring(startPos, j + 1);
            let esc = prefix.replace(/&([0-9a-fk-or])/gi, "&⛓$1");
            if (Renderer.getStringWidth(esc) <= maxW) {
                goodPos = j + 1;
            } else {
                break;
            }
        }
        if (goodPos === startPos) goodPos = startPos + 1; // force at least one char
        let prefixOrig = line.substring(startPos, goodPos);
        let escSub = prefixOrig.replace(/&([0-9a-fk-or])/gi, "&⛓$1");
        subs.push({ escaped: escSub, origStart: startPos, origEnd: goodPos });
        pos = goodPos;
    }
    return subs;
}

function getMaxTextWidth(digitCount) {
    const sample = ("0".repeat(digitCount) + " ⏐ ");
    return Renderer.screen.getWidth() * 0.8 - 14 - Renderer.getStringWidth(sample);
}

function getVisualLinesBefore(logical, startIdx, maxW) {
    let visual = 0;
    for (let l = startIdx; l < logical; l++) {
        visual += wrapLine(guiText[l] || "", maxW).length;
    }
    return visual;
}

function getCursorSubInfo(logicalIdx, maxW) {
    let currentLineText = guiText[logicalIdx] || "";
    let wrapped = wrapLine(currentLineText, maxW);
    let remaining = cursorIndex;
    let subIdx = 0;
    for (subIdx = 0; subIdx < wrapped.length; subIdx++) {
        let len = wrapped[subIdx].origEnd - wrapped[subIdx].origStart;
        if (remaining <= len) break;
        remaining -= len;
    }
    if (subIdx >= wrapped.length) subIdx = wrapped.length - 1;
    let subStart = wrapped[subIdx].origStart;
    let beforeLenInSub = remaining;
    let prefixOrig = currentLineText.substring(subStart, subStart + beforeLenInSub);
    let beforeEsc = prefixOrig.replace(/&([0-9a-fk-or])/gi, "&⛓$1");
    return { subIdx, beforeEsc };
}

function ensureCursorVisible() {
    if (!codeIsOpen) return;
    const digitCount = guiText.length.toString().length || 1;
    const maxW = getMaxTextWidth(digitCount);
    const lineLim = Math.ceil((Renderer.screen.getHeight() - 14) / 10);
    let logical = startIndex + cursorLine;
    if (logical >= guiText.length) logical = Math.max(0, guiText.length - 1);
    let visualBefore = getVisualLinesBefore(logical, startIndex, maxW);
    let subInfo = getCursorSubInfo(logical, maxW);
    let cursorVisual = visualBefore + subInfo.subIdx;

    // Scroll down (if cursor is below visible area)
    while (cursorVisual >= lineLim && startIndex < logical) {
        startIndex++;
        visualBefore = getVisualLinesBefore(logical, startIndex, maxW);
        cursorVisual = visualBefore + subInfo.subIdx;
    }
    cursorLine = logical - startIndex;

    // Scroll up (rare, but safe)
    while (cursorVisual < 0 && startIndex > 0) {
        startIndex--;
        visualBefore = getVisualLinesBefore(logical, startIndex, maxW);
        cursorVisual = visualBefore + subInfo.subIdx;
    }
    cursorLine = logical - startIndex;
}

register(net.minecraftforge.client.event.GuiScreenEvent.DrawScreenEvent.Pre, (event) => {
    if (codeIsOpen) cancel(event);
});

register("guiMouseClick", (x, y, button, gui, event) => {
    if (codeIsOpen) cancel(event);
});

register("postGuiRender", () => {
    if (!codeIsOpen) return;

    const winW = Renderer.screen.getWidth() * 0.8;
    const winH = Renderer.screen.getHeight() * 0.8;
    const winX = (Renderer.screen.getWidth() - winW) / 2;
    const winY = (Renderer.screen.getHeight() - winH) / 2;

    // Draw Background
    Renderer.drawRect(Renderer.color(30, 30, 30, 220), winX, winY, winW, winH);

    lineLimit = Math.ceil((winH - 14) / 10);
    const digitCount = guiText.length.toString().length;

    const samplePrefix = "0".repeat(digitCount) + " ⏐ ";
    const prefixWidth = Renderer.getStringWidth(samplePrefix);
    const maxTextWidth = winW - 14 - prefixWidth;

    let visualIndex = 0;
    for (let i = startIndex; i < guiText.length && visualIndex < lineLimit; i++) {
        let lineText = guiText[i] || "";
        let wrapped = wrapLine(lineText, maxTextWidth);

        for (let subIdx = 0; subIdx < wrapped.length && visualIndex < lineLimit; subIdx++) {
            let subEsc = wrapped[subIdx].escaped;

            // Syntax Pre-processing
            let processed;
            if (lineText.startsWith("//")) {
                processed = subEsc.replace(/&(\d+|[a-f])/g, '&&2$1');
            } else {
                processed = subEsc.replace(/"(.*?)"/g, '&2"$1&2"&f');
            }

            let subDisplay = lineText.startsWith("//") ? "&2" + processed : syntaxHighlight(processed);
            let lineNumStr;
            if (subIdx === 0) {
                lineNumStr = `&7${("0".repeat(digitCount) + (i + 1)).slice(-digitCount)} &f⏐ &f`;
            } else {
                // This replaces " ".repeat(digitCount) which was causing the misalignment
                lineNumStr = `&8${"-".repeat(digitCount)} &f⏐ &f`;
            }

            Renderer.drawString(lineNumStr + subDisplay, winX + 7, winY + visualIndex * 10 + 7, true);
            visualIndex++;
        }
    }

    // Cursor Logic
    cursorBlink = (cursorBlink + 1) % 100;
    if (cursorBlink >= 50) {
        let logicalIdx = startIndex + cursorLine;
        let subInfo = getCursorSubInfo(logicalIdx, maxTextWidth);
        let cursorVisualRow = getVisualLinesBefore(logicalIdx, startIndex, maxTextWidth) + subInfo.subIdx;

        let x = winX + 7 + prefixWidth + Renderer.getStringWidth(subInfo.beforeEsc);
        let y = winY + cursorVisualRow * 10 + 7;

        Renderer.drawRect(Renderer.color(200, 200, 200, 256), x, y, 1, 8);
    }
});

register("guiKey", (char, keyCode, gui, event) => {
    if (!codeIsOpen) return;
    cancel(event); // Stop character from typing

    cursorBlink = 50;
    let line = guiText[startIndex + cursorLine] || "";

    // Enter key
    if (keyCode === 28) {
        guiText.splice(cursorLine + startIndex + 1, 0, "");
        if (cursorLine + 1 >= lineLimit) {
            startIndex++;
        } else {
            cursorLine++;
        }
        cursorIndex = 0;
        ensureCursorVisible();
        return;
    }

    // Backspace
    if (keyCode === 14) {
        if (cursorIndex > 0) {
            guiText[startIndex + cursorLine] = line.substring(0, cursorIndex - 1) + line.substring(cursorIndex);
            cursorIndex--;
        } else if (cursorLine + startIndex > 0) {
            let prevLineIndex = startIndex + cursorLine - 1;
            cursorIndex = guiText[prevLineIndex].length;
            guiText[prevLineIndex] += line;
            guiText.splice(startIndex + cursorLine, 1);
            if (cursorLine > 0) cursorLine--;
            else if (startIndex > 0) startIndex--;
        }
        ensureCursorVisible();
        return;
    }

    // Tab Key
    if (keyCode === 15) {
        let spaces = "    ";
        guiText[startIndex + cursorLine] = line.substring(0, cursorIndex) + spaces + line.substring(cursorIndex);
        cursorIndex += spaces.length;
        ensureCursorVisible();
        return;
    }

    // Delete Key
    if (keyCode === 211) {
        if (cursorIndex < line.length) {
            guiText[startIndex + cursorLine] = line.substring(0, cursorIndex) + line.substring(cursorIndex + 1);
        } else if (startIndex + cursorLine + 1 < guiText.length) {
            let nextLineIndex = startIndex + cursorLine + 1;
            guiText[startIndex + cursorLine] += guiText[nextLineIndex];
            guiText.splice(nextLineIndex, 1);
        }
        ensureCursorVisible();
        return;
    }

    // Esc key
    if (keyCode === 1) {
        FileLib.write(`./config/ChatTriggers/modules/BHTSL/imports/${fileNameSave}.htsl`, guiText.join("\n"));
        ChatLib.chat(`&3[BHTSL] &fSaved text to ${fileNameSave}.htsl`);

        Keyboard.enableRepeatEvents(originalRepeat);

        codeIsOpen = false;
        return;
    }

    // Arrow Keys
    if (keyCode === 200) { // Up
        if (cursorLine + startIndex > 0) {
            if (cursorLine > 0) cursorLine--;
            else startIndex--;
        }
        cursorIndex = Math.min(cursorIndex, guiText[startIndex + cursorLine].length);
    }
    if (keyCode === 208) { // Down
        if (startIndex + cursorLine + 1 < guiText.length) {
            if (cursorLine < lineLimit - 1) cursorLine++;
            else startIndex++;
        }
        cursorIndex = Math.min(cursorIndex, guiText[startIndex + cursorLine].length);
    }
    if (keyCode === 203) { // Left
        if (cursorIndex > 0) cursorIndex--;
        else if (cursorLine + startIndex > 0) {
            if (cursorLine > 0) cursorLine--; else startIndex--;
            cursorIndex = guiText[startIndex + cursorLine].length;
        }
    }
    if (keyCode === 205) { // Right
        if (cursorIndex < line.length) cursorIndex++;
        else if (startIndex + cursorLine + 1 < guiText.length) {
            if (cursorLine < lineLimit - 1) cursorLine++; else startIndex++;
            cursorIndex = 0;
        }
    }

    if (/[^\x20-\x7E]/.test(char)) {
        ensureCursorVisible();
        return;
    }

    // Normal Character Input
    if (keyCode > 1 && keyCode < 150 && keyCode !== 14 && keyCode !== 28 && keyCode !== 1) {
        guiText[startIndex + cursorLine] = line.substring(0, cursorIndex) + char + line.substring(cursorIndex);
        cursorIndex++;
    }

    ensureCursorVisible();
});

export default (fileName) => {
    if (!fileName) fileName = "default";
    fileNameSave = fileName;

    let path = `./config/ChatTriggers/modules/BHTSL/imports/${fileName}`;
    let fullPath = FileLib.exists(path + ".htsl") ? path + ".htsl" : (FileLib.exists(path + ".txt") ? path + ".txt" : null);

    if (!fullPath) {
        ChatLib.chat(`&3[BHTSL] &fCreated new file "${fileName}.htsl"`);
        FileLib.write(path + ".htsl", "");
        guiText = [""];
    } else {
        ChatLib.chat(`&3[BHTSL] &fLoading ${fileName}.htsl`);
        guiText = FileLib.read(fullPath).split("\n");
    }

    cursorLine = 0;
    cursorIndex = 0;
    startIndex = 0;

    originalRepeat = Keyboard.areRepeatEventsEnabled();
    Keyboard.enableRepeatEvents(true);

    codeIsOpen = true;
}

export function isCodeOpen() {
    return codeIsOpen;
}

const keywords = Object.keys(syntax.actions);
const conditions = Object.keys(syntax.conditions);

function syntaxHighlight(line) {
    if (line.startsWith("//")) return "&2" + line;
    let ifmatch = line.match(/^if( *)?(and|or)?( *)?\((.*)\)( *)?{/);
    if (ifmatch) {
        let conditionLine = ifmatch[4].split(/,/);
        for (let i = 0; i < conditionLine.length; i++) {
            conditions.forEach(cond => {
                conditionLine[i] = conditionLine[i].replace(new RegExp(`^( *)${cond}(.*)`), `$1&3${cond}&f$2`);
            });
        }
        line = `if${ifmatch[1] || ""}${ifmatch[2] || ""}${ifmatch[3] || ""}(${conditionLine.join(",")})${ifmatch[5] || ""}{`;
    }
    keywords.forEach((keyword) => {
        line = line.replace(new RegExp(`^( *)${keyword}(.*)`), `$1&5${keyword}&f$2`);
    });
    return line;
}
