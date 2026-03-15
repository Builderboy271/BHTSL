import syntax from "../actions/syntax";

let codeIsOpen = false;
let guiText = [];
let cursorLine = 0;
let cursorBlink = 0;
let cursorIndex = 0;
let fileNameSave = "";
let startIndex = 0;
let lineLimit = Math.floor((Renderer.screen.getHeight() - 7) / 20);

register(net.minecraftforge.client.event.GuiScreenEvent.DrawScreenEvent.Pre, (event) => {
    if (codeIsOpen) cancel(event);
});

register("guiMouseClick", (x, y, button, gui, event) => {
    if (codeIsOpen) cancel(event);
});

register("postGuiRender", () => {
    if (!codeIsOpen) return;
    
    // Draw Background
    Renderer.drawRect(Renderer.color(30, 30, 30, 200), Renderer.screen.getWidth() / 4, Renderer.screen.getHeight() / 4, Renderer.screen.getWidth() / 2, Renderer.screen.getHeight() / 2);
    
    lineLimit = Math.floor((Renderer.screen.getHeight() - 7) / 20);
    const digitCount = guiText.length.toString().length;

    for (let i = startIndex; i < lineLimit + startIndex && i < guiText.length; i++) {
        if (guiText[i] !== undefined) {
            let displayText = guiText[i].replace(/&([0-9a-fk-or])/gi, "&⛓$1");
            if (displayText.startsWith("//")) {
                displayText = displayText.replace(/&(\d+|[a-f])/g, '&&2$1');
            } else {
                displayText = displayText.replace(/"(.*?)"/g, '&2"$1&2"&f');
            }
            Renderer.drawString(`&7${("0".repeat(digitCount) + (i + 1)).slice(-digitCount)} ⏐ &f${syntaxHighlight(displayText)}`, Renderer.screen.getWidth() / 4 + 7, Renderer.screen.getHeight() / 4 + (i - startIndex) * 10 + 7, true);
        }
    }

    // Cursor Logic
    cursorBlink = (cursorBlink + 1) % 100;
    if (cursorBlink >= 50) {
        let currentLineText = guiText[cursorLine + startIndex] || "";
        let textBeforeCursor = currentLineText.substring(0, cursorIndex).replace(/&([0-9a-fk-or])/gi, "&⛓$1");
        let linePrefix = `${("0".repeat(digitCount) + (cursorLine + startIndex + 1)).slice(-digitCount)} ⏐ `;
        
        let x = Renderer.screen.getWidth() / 4 + 7 + Renderer.getStringWidth(linePrefix + textBeforeCursor);
        let y = Renderer.screen.getHeight() / 4 + (cursorLine) * 10 + 7;
        
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
        return;
    }

    // Tab Key
    if (keyCode === 15) {
        let spaces = "    ";
        guiText[startIndex + cursorLine] = line.substring(0, cursorIndex) + spaces + line.substring(cursorIndex);
        cursorIndex += spaces.length;
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
        return;
    }

    // Esc key
    if (keyCode === 1) {
        FileLib.write(`./config/ChatTriggers/modules/BHTSL/imports/${fileNameSave}.htsl`, guiText.join("\n"));
        ChatLib.chat(`&3[BHTSL] &fSaved text to ${fileNameSave}.htsl`);
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

    if (/[^\x20-\x7E]/.test(char)) return;

    // Normal Character Input
    if (keyCode > 1 && keyCode < 150 && keyCode !== 14 && keyCode !== 28 && keyCode !== 1) {
        guiText[startIndex + cursorLine] = line.substring(0, cursorIndex) + char + line.substring(cursorIndex);
        cursorIndex++;
    }
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